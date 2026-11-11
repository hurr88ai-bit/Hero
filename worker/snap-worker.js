// هيرو · سيرفر «صوّر صحنك» (Cloudflare Worker) · © 2026 حُرّ العبدلي. الدليل: worker/README.md
const DEFAULT_MODEL = 'claude-haiku-5-5';   // يتغيّر من Cloudflare: متغيّر SNAP_MODEL
const ALLOWED_ORIGINS = [
  'https://hurr88ai-bit.github.io',
  'https://heroapp.iq', 'https://www.heroapp.iq',
  'http://localhost:8000', 'http://127.0.0.1:8000',
];
const MAX_IMAGE_B64 = 1_500_000;   // ~1.1 MB بعد فك الترميز؛ التطبيق يرسل عادة 100–250 KB
const MAX_NAMES = 800, MAX_NAME_LEN = 80;

const SYSTEM = `You are the food-recognition engine of HERO, an Arabic (Iraqi) nutrition tracker.
You get ONE photo and a numbered CATALOG of food names (mostly Arabic, Iraqi dialect).
Identify every distinct food/drink visible and estimate the edible weight in grams of each, as served (cooked weight for cooked food).

MATCHING:
- Return the CATALOG number of the best entry in "id" AND copy that entry's exact text into "catalog_name". Prefer the entry matching the cooking method you see (fried vs boiled vs grilled, Iraqi rice "تمن" with fat vs plain boiled rice).
- If the exact dish is not in the catalog, DO NOT use 0: pick the closest entry for its main ingredient (e.g. chicken with turmeric or chicken stew -> a grilled/cooked chicken entry; beef stew -> the closest cooked meat; fried potato cubes -> fried potatoes). Write the real dish name in "seen".
- Use id 0 only when nothing in the catalog is even the same kind of food.
- Split a composite plate into its parts when the catalog has the parts (rice + stew + salad), unless the catalog has the whole dish.
- Add a separate oil/ghee item only for clearly visible extra fat not already in the chosen entry.
- Iraqi/Levantine dishes are common: تمن ومرق، قيمة، دولمة، كبة، باچة، تشريب، قوزي، سمك مسكوف (مسگوف: مشقوق مشوي على الحطب، غير المقلي)، فلافل، كص، تبولة، فتوش، حمص، قيمر.

PORTION SIZE (most important - be accurate, not generous):
- Vision models systematically OVERESTIMATE food weight by 50-150%. Correct for this: after your first guess, choose the smaller realistic value. Never round up.
- First describe the size in "basis" (count x unit weight, or volume like "about 1/2 cup", "a mound the size of an egg"), then derive grams from it.
- Reference weights (cooked, edible part):
  * cooked rice: 1 cup = 160 g; a mound the size of a fist = 120 g; an egg-sized mound = 50 g; loose fluffy basmati covering 1/3 of a dinner plate (2-3 cm high) = 100 g.
  * potatoes: small diced cube (1-1.5 cm) = 3 g, so count the cubes; large chunk (3-4 cm) = 20-25 g; one small whole potato 80 g; a small fries portion 70 g.
  * chicken: drumstick 60 g meat; thigh 80 g; a palm-sized piece (no fingers) 90 g; half a small breast 80 g; shredded/pulled pieces look bigger than they weigh - a loose pile covering 1/4 of a plate = 90-110 g.
  * meat/kebab: one kebab skewer 60-80 g; a meatball 25 g.
  * stew/soup (مرق): one ladle 200 g; a small bowl 250 g.
  * bread: صمون 90 g; a quarter of a flat خبز 20 g.
  * salad: a side handful 50-80 g. Tomato/cucumber slice 10-15 g.
- Use visible cutlery for scale: a tablespoon bowl is about 4.5 cm long, a teaspoon bowl 3.5 cm, a fork 19 cm.
- Dinner plate is about 26 cm wide; side plates/bowls are smaller. Judge depth: food on a plate is usually only 1-3 cm thick.
- A normal home portion of rice is 100-200 g. Totals above 900 g for one person's plate are almost always wrong.

OTHER:
- confidence: 0.0-1.0 for the identification.
- If the photo shows no food (or is too dark/blurry), return items: [] and problem "no_food" or "unclear".
- Never invent foods you cannot see. Hidden ingredients (sugar in tea, oil inside stew) are covered by the catalog entry.
Always answer by calling the report_plate tool.`;

const TOOL = {
  name: 'report_plate',
  description: 'Report the foods detected in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'CATALOG number, or 0 if no match' },
            catalog_name: { type: 'string', description: 'Exact text of the chosen CATALOG entry (empty if id is 0)' },
            seen: { type: 'string', description: 'Short name of the dish you see (language as requested)' },
            basis: { type: 'string', description: 'How you sized it: count x unit weight or volume comparison, in English, max 12 words' },
            grams: { type: 'number', description: 'Edible grams derived from basis, after correcting for overestimation' },
            confidence: { type: 'number' },
          },
          required: ['id', 'catalog_name', 'seen', 'basis', 'grams', 'confidence'],
        },
      },
      problem: { type: 'string', enum: ['none', 'no_food', 'unclear'] },
    },
    required: ['items', 'problem'],
  },
};

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) } });
}
function baghdadDay() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/health') return json({ ok: true }, 200, origin);
    if (url.pathname !== '/analyze' || request.method !== 'POST') return json({ error: 'not_found' }, 404, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden' }, 403, origin);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400, origin); }
    const image = String(body.image || '');
    const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.type) ? body.type : 'image/jpeg';
    const device = String(body.device || '').slice(0, 64);
    const lang = body.lang === 'en' ? 'en' : 'ar';
    const names = Array.isArray(body.names) ? body.names.slice(0, MAX_NAMES).map(n => String(n).slice(0, MAX_NAME_LEN)) : [];
    if (!image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return json({ error: 'bad_image' }, 400, origin);
    if (!names.length || !/^[a-z0-9-]{8,64}$/.test(device)) return json({ error: 'bad_request' }, 400, origin);

    const limit = Math.max(1, parseInt(env.DAILY_LIMIT || '5', 10));
    const ipLimit = limit * 6;
    const day = baghdadDay();
    let used = 0, kDev = '', kIp = '', ipUsed = 0;
    if (env.SNAP_KV) {
      const ip = request.headers.get('CF-Connecting-IP') || 'x';
      kDev = `d:${day}:${await sha(device)}`; kIp = `i:${day}:${await sha(ip)}`;
      [used, ipUsed] = (await Promise.all([env.SNAP_KV.get(kDev), env.SNAP_KV.get(kIp)])).map(v => parseInt(v || '0', 10));
      if (used >= limit || ipUsed >= ipLimit) return json({ error: 'limit', limit, left: 0 }, 429, origin);
    }

    const catalog = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
    const req = {
      model: env.SNAP_MODEL || DEFAULT_MODEL,
      max_tokens: 1200,
      system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: 'CATALOG:\n' + catalog, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Identify the foods on this plate and estimate grams.' + (lang === 'en' ? ' Write "seen" in English.' : ' Write "seen" in Arabic.') },
      ] }],
    };

    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(req),
      });
    } catch { return json({ error: 'upstream' }, 502, origin); }
    if (!r.ok) {
      console.log('anthropic error', r.status, (await r.text()).slice(0, 300));
      return json({ error: r.status === 429 || r.status === 529 ? 'busy' : 'upstream' }, 502, origin);
    }
    const out = await r.json();
    const call = (out.content || []).find(c => c.type === 'tool_use');
    if (!call || !call.input) return json({ error: 'upstream' }, 502, origin);

    const items = (Array.isArray(call.input.items) ? call.input.items : []).slice(0, 12).map(it => {
      const id = Math.round(Number(it.id) || 0), cn = String(it.catalog_name || '').trim();
      let name = id >= 1 && id <= names.length ? names[id - 1] : null;
      if (cn && name !== cn && names.includes(cn)) name = cn;
      return {
        name,
        seen: String(it.seen || '').slice(0, 80),
        grams: Math.min(1500, Math.max(1, Math.round(Number(it.grams) || 0))),
        confidence: Math.min(1, Math.max(0, Number(it.confidence) || 0)),
      };
    }).filter(it => it.grams > 0 && (it.name || it.seen));
    const problem = ['no_food', 'unclear'].includes(call.input.problem) && !items.length ? call.input.problem : 'none';

    let left = null;
    if (env.SNAP_KV) {
      const ttl = { expirationTtl: 60 * 60 * 30 };
      await Promise.all([env.SNAP_KV.put(kDev, String(used + 1), ttl), env.SNAP_KV.put(kIp, String(ipUsed + 1), ttl)]);
      left = Math.max(0, limit - used - 1);
    }
    return json({ items, problem, left, limit }, 200, origin);
  },
};
