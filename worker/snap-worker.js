// هيرو · سيرفر «صوّر صحنك» (Cloudflare Worker) · © 2026 حُرّ العبدلي. الدليل: worker/README.md
const MODEL = 'claude-haiku-5-5';
const ALLOWED_ORIGINS = [
  'https://hurr88ai-bit.github.io',
  'https://heroapp.iq', 'https://www.heroapp.iq',
  'http://localhost:8000', 'http://127.0.0.1:8000',
];
const MAX_IMAGE_B64 = 1_500_000;   // ~1.1 MB بعد فك الترميز؛ التطبيق يرسل عادة 100–250 KB
const MAX_NAMES = 800, MAX_NAME_LEN = 80;

const SYSTEM = `You are the food-recognition engine of HERO, an Arabic (Iraqi) nutrition tracker.
You get ONE photo and a numbered CATALOG of food names (mostly Arabic, Iraqi dialect).
Your job: identify every distinct food/drink visible and estimate the edible weight in grams of each, as served on the plate (cooked weight for cooked food).

Rules:
- Map each food to the single best CATALOG entry and return its number in "id". Prefer the entry that matches the cooking method you can see (fried vs boiled, with oil vs without, Iraqi rice "تمن" cooked with fat vs plain boiled rice).
- If nothing in the catalog is a reasonable match, use id 0 and describe the food in Arabic in "seen".
- Iraqi/Levantine dishes are common: تمن ومرق، قيمة، دولمة، كبة، باچة، تشريب، قوزي، سمك مسكوف (مسگوف: سمك مشقوق مشوي على الحطب، غير المقلي)، فلافل، كص، تبولة، فتوش، حمص، قيمر، كاهي، etc. Split a composite dish into its parts when the catalog has the parts (e.g. rice + stew), unless the catalog has the whole dish.
- If you can clearly see added fat (oil pooling, fried coating, ghee on rice) that is NOT already included in the chosen entry, add a separate item for the oil/ghee with a small realistic gram amount.
- Estimate grams using visual cues: plate diameter (~26 cm dinner plate), spoons, hands, bread size, cup size. Iraqi bread "صمون" ~ 90 g, flat "خبز" ~ 60-90 g.
- confidence: 0.0-1.0 for the identification.
- If the photo shows no food (or is too dark/blurry to tell), return items: [] and set "problem" to one of: "no_food", "unclear".
- Be honest: never invent foods you cannot see. Hidden ingredients (sugar in tea, oil inside stew) are covered by the catalog entry; don't add them separately unless visible.
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
            seen: { type: 'string', description: 'Short description of what you see (language as requested)' },
            grams: { type: 'number', description: 'Estimated edible grams on the plate' },
            confidence: { type: 'number' },
          },
          required: ['id', 'seen', 'grams', 'confidence'],
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
      model: MODEL,
      max_tokens: 900,
      system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: 'CATALOG:\n' + catalog, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_plate' },
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
      const id = Math.round(Number(it.id) || 0);
      return {
        name: id >= 1 && id <= names.length ? names[id - 1] : null,
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
