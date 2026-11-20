// هيرو · سيرفر «التذكيرات» (Cloudflare Worker + D1 + Cron) · © 2026 حُرّ العبدلي. الدليل: worker/PUSH-README.md
// يحفظ بس: عنوان إشعارات الجهاز، المنطقة الزمنية، اللغة، وأوقات التذكير. ما يستلم أي أكل أو وزن أو اسم.
// الإشعار يوصل بدون محتوى (Web Push بدون حمولة)، والـservice worker بالجهاز يختار النص.
const ALLOWED_ORIGINS = [
  'https://hurr88ai-bit.github.io',
  'https://heroapp.iq', 'https://www.heroapp.iq',
  'http://localhost:8000', 'http://127.0.0.1:8000',
];
// السيرفر يرسل لعناوين خدمات الإشعارات المعروفة بس (حتى ما يتحول لأداة طلبات لأي رابط)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const MAX_BODY = 4096, MAX_ENDPOINT = 1000, MAX_REMINDERS = 5, MAX_ROWS = 20000;
const SUBS_PER_IP_HOUR = 100;       // حد تسجيل لكل IP بالساعة (IP مشترك بالشبكات الموبايلية، فالحد واسع)
const STALE_DAYS = 60;              // الاشتراك اللي ما تجدّد (التطبيق يجدّده كل يوم يفتحه) ينمسح بعد 60 يوم
const PAGE = 500;
const SLOT_MIN = 5;            // الـCron كل 5 دقايق
const CATCHUP_MIN = 10;        // إذا تأخر الـCron، نلحق التذكير لحد 10 دقايق
const MAX_SENDS_PER_RUN = 40;  // حد الخطة المجانية: 50 طلب خارجي لكل تشغيل

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

function endpointOk(u){
  try{
    const x = new URL(u);
    return x.protocol === 'https:' && !x.username && !x.password && !x.port && u.length <= MAX_ENDPOINT && PUSH_HOSTS.some(r => r.test(x.hostname));
  }catch(e){ return false; }
}
function cleanReminders(a){
  if(!Array.isArray(a) || a.length > MAX_REMINDERS) return null;
  const out = [];
  for(const r of a){
    if(!r || !Number.isInteger(r.h) || !Number.isInteger(r.m) || r.h < 0 || r.h > 23 || r.m < 0 || r.m > 59) return null;
    out.push({h: r.h, m: r.m});
  }
  return out;
}
function tzOk(tz){
  if(typeof tz !== 'string' || tz.length > 64) return false;
  try{ new Intl.DateTimeFormat('en-GB', {timeZone: tz}); return true; }catch(e){ return false; }
}
// الوقت المحلي عند المستخدم: {min: دقائق من بداية اليوم، day: 'YYYYMMDD'}
const FMT = new Map();   // إنشاء Intl.DateTimeFormat غالي، نخزّنه لكل منطقة زمنية
function localNow(tz, date){
  let f = FMT.get(tz);
  if(!f){ f = new Intl.DateTimeFormat('en-GB', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}); if(FMT.size < 500) FMT.set(tz, f); }
  const p = {}; f.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  return {min: +p.hour * 60 + +p.minute, day: p.year + p.month + p.day};
}
// التذكيرات المستحقة هسه. last = آخر وقت انرسل بي (YYYYMMDDHHMM محلي). يرجّع مفتاح الوقت اللي لازم ننرسل عنه، أو null
function dueSlot(reminders, tz, last, date){
  const now = localNow(tz, date);
  let best = null;
  for(const r of reminders){
    const rmin = Math.min(1440 - SLOT_MIN, Math.ceil((r.h * 60 + r.m) / SLOT_MIN) * SLOT_MIN);   // نقرّب للأعلى: التذكير يوصل بعد الوقت اللي اخترته مو قبله
    const diff = now.min - rmin;
    if(diff < 0 || diff > CATCHUP_MIN) continue;
    const key = now.day + String(Math.floor(rmin / 60)).padStart(2, '0') + String(rmin % 60).padStart(2, '0');
    if(last && last >= key) continue;
    if(!best || key > best) best = key;
  }
  return best;
}
async function vapid(env){
  const jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey('jwk', {kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d}, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const pub = new Uint8Array(65); pub[0] = 4; pub.set(unb64u(jwk.x), 1); pub.set(unb64u(jwk.y), 33);
  return {key, pub: b64u(pub)};
}
async function authHeader(v, endpoint, now){
  const aud = new URL(endpoint).origin, exp = Math.floor(now / 1000) + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'}))), body = b64u(enc.encode(JSON.stringify({aud, exp, sub: 'https://hurr88ai-bit.github.io/Hero/'})));
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, v.key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
async function sendPush(v, endpoint){
  const r = await fetch(endpoint, {method: 'POST', headers: {TTL: '3600', Urgency: 'normal', Authorization: await authHeader(v, endpoint, Date.now())}});
  return r.status;
}
async function idOf(endpoint){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function cors(req){
  const o = req.headers.get('Origin');
  const h = {'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin'};
  if(o && ALLOWED_ORIGINS.includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}
const json = (req, obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {'Content-Type': 'application/json', ...cors(req)}});

async function readBody(req){
  const t = await req.text();
  if(t.length > MAX_BODY) return null;
  try{ const j = JSON.parse(t); return j && typeof j === 'object' ? j : null; }catch(e){ return null; }
}

async function handle(req, env){
  const url = new URL(req.url), origin = req.headers.get('Origin');
  if(req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if(url.pathname === '/health') return json(req, {ok: true});
  if(origin && !ALLOWED_ORIGINS.includes(origin)) return json(req, {error: 'origin'}, 403);
  if(url.pathname === '/key' && req.method === 'GET'){ const v = await vapid(env); return json(req, {key: v.pub}); }
  if(req.method !== 'POST') return json(req, {error: 'method'}, 405);
  const b = await readBody(req);
  if(!b || !endpointOk(b.endpoint)) return json(req, {error: 'bad_request'}, 400);
  const id = await idOf(b.endpoint);
  if(url.pathname === '/subscribe'){
    const rem = cleanReminders(b.reminders);
    if(!rem || !tzOk(b.tz) || (b.lang !== 'ar' && b.lang !== 'en')) return json(req, {error: 'bad_request'}, 400);
    const hr = Math.floor(Date.now() / 3600000), ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await env.DB.prepare('INSERT INTO rl (k, n, win) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n').bind(await idOf(ip + ':' + hr), hr).first();
    if(rl && rl.n > SUBS_PER_IP_HOUR) return json(req, {error: 'slow_down'}, 429);
    const res = await env.DB.prepare('INSERT INTO subs (id, endpoint, tz, lang, reminders, last_slot, last_test, seen) SELECT ?1, ?2, ?3, ?4, ?5, ?8, 0, ?6 WHERE (SELECT COUNT(*) FROM subs) < ?7 OR EXISTS (SELECT 1 FROM subs WHERE id = ?1) ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, tz = excluded.tz, lang = excluded.lang, reminders = excluded.reminders, seen = excluded.seen')
      .bind(id, b.endpoint, b.tz, b.lang, JSON.stringify(rem), Date.now(), MAX_ROWS, '').run();
    if(!res.meta || res.meta.changes < 1) return json(req, {error: 'full'}, 503);
    return json(req, {ok: true});
  }
  if(url.pathname === '/unsubscribe'){
    await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run();
    return json(req, {ok: true});
  }
  if(url.pathname === '/test'){
    const row = await env.DB.prepare('SELECT last_test FROM subs WHERE id = ?').bind(id).first();
    if(!row) return json(req, {error: 'not_found'}, 404);
    if(Date.now() - row.last_test < 30000) return json(req, {error: 'slow_down'}, 429);
    await env.DB.prepare('UPDATE subs SET last_test = ? WHERE id = ?').bind(Date.now(), id).run();
    const st = await sendPush(await vapid(env), b.endpoint);
    if(st === 404 || st === 410) await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run();
    return json(req, {ok: st >= 200 && st < 300, status: st});
  }
  return json(req, {error: 'not_found'}, 404);
}

async function cron(env){
  const v = await vapid(env), now = new Date();
  const nowMs = now.getTime();
  await env.DB.prepare('DELETE FROM rl WHERE win < ?').bind(Math.floor(nowMs / 3600000) - 2).run();
  await env.DB.prepare('DELETE FROM subs WHERE seen < ?').bind(nowMs - STALE_DAYS * 86400000).run();
  let sent = 0, after = '';
  while(sent < MAX_SENDS_PER_RUN){
    const {results} = await env.DB.prepare('SELECT id, endpoint, tz, reminders, last_slot FROM subs WHERE id > ? ORDER BY id LIMIT ?').bind(after, PAGE).all();
    if(!results || !results.length) break;
    for(const r of results){
      after = r.id;
      if(sent >= MAX_SENDS_PER_RUN) break;   // الباقي ينلحق بالتشغيل الجاي (CATCHUP)
      let rem; try{ rem = JSON.parse(r.reminders); }catch(e){ continue; }
      let slot; try{ slot = dueSlot(rem, r.tz, r.last_slot, now); }catch(e){ continue; }
      if(!slot) continue;
      // حجز ذري: ينجح بس إذا لسه الصف ما انحجز من تشغيل ثاني
      const claim = await env.DB.prepare('UPDATE subs SET last_slot = ? WHERE id = ? AND last_slot = ?').bind(slot, r.id, r.last_slot).run();
      if(!claim.meta || claim.meta.changes !== 1) continue;
      sent++;
      let st = 0; try{ st = await sendPush(v, r.endpoint); }catch(e){}
      if(st === 404 || st === 410) await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(r.id).run();
      else if(!(st >= 200 && st < 300)) await env.DB.prepare('UPDATE subs SET last_slot = ? WHERE id = ? AND last_slot = ?').bind(r.last_slot, r.id, slot).run();   // فشل مؤقت: نرجّعه يتعاد بالتشغيل الجاي
    }
    if(results.length < PAGE) break;
  }
}

export default {
  async fetch(req, env){ try{ return await handle(req, env); }catch(e){ return json(req, {error: 'server'}, 500); } },
  async scheduled(event, env, ctx){ ctx.waitUntil(cron(env)); },
  __t: {endpointOk, cleanReminders, tzOk, localNow, dueSlot, authHeader, handle, cron},   // للاختبار بس
};
