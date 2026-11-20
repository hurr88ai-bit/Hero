// هيرو · service worker (يخلي التطبيق يشتغل بدون نت ويحدّث نفسه)
const CACHE = 'hero-111-bb8f1ede';
const DATA_CACHE = 'hero-data-2dac938b';   // ملفات المدرب 3D الثقيلة: كاش مستقل ودائم، اسمه يتغيّر بس إذا تغيّرت هي نفسها (release.py)
const CORE = ["./", "index.html", "app.css?v=111", "app-i18n.js?v=111", "app-main.js?v=111", "app-extra.js?v=111", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "icons/icon-32.png", "coach-mh.js", "real.js", "anat.js", "fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-400-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-500-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-600-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-700-normal.woff2", "privacy.html", "terms.html", "media/coach-m.webp", "media/coach-f.webp", "fonts/hero-cuneiform.woff2", "media/hero-face.webp", "media/hero-full.webp"];
const DATA = {"vendor/three.module.min.js": "2992ecd75d9d9774", "vendor/jsm/environments/RoomEnvironment.js": "597308a0499629db", "body-meta.json": "f94be097304a27db", "body-shared.txt": "b0a63f6d39502ddf", "body-m.txt": "9805e4a4275a0c14", "body-f.txt": "453d9e72a2bda285", "muscles-m.txt": "699f5477350c874a", "muscles-f.txt": "206d5b4829000391"};   // ملف ← بصمته (SHA-1 أول 16 حرف)؛ release.py يحدّثها. الترحيل من كاش قديم ينسخ بس الملف اللي بصمته تطابق
const DATA_FILES = Object.keys(DATA);
const DATA_URLS = new Set(DATA_FILES.map(f => new URL(f, self.location).pathname));
const OLD_RE = /^hero-\d+-/, OLD_DATA_RE = /^hero-data-/;
const timeout = ms => new Promise(r => setTimeout(r, ms));
async function sha16(res){   // بصمة محتوى الاستجابة (نفس صيغة release.py)
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', await res.clone().arrayBuffer()));
  return [...d.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const isOld = k => k !== CACHE && k !== DATA_CACHE && (OLD_RE.test(k) || OLD_DATA_RE.test(k));
// 1) ترحيل محلي (بدون شبكة): ينسخ من أي ذاكرة قديمة (نسخة أو بيانات) بس إذا بصمة الملف تطابق (ملف متغيّر ما ينسخ قديم)
async function migrateData(){
  const dc = await caches.open(DATA_CACHE), ks = (await caches.keys()).filter(isOld);
  for(const f of DATA_FILES){
    const u = new URL(f, self.location).href;
    if(await dc.match(u)) continue;
    for(const k of ks){
      try{
        const r = await (await caches.open(k)).match(u);
        if(r && await sha16(r) === DATA[f]){ await dc.put(u, r); break; }
      }catch(err){}
    }
  }
}
// 2) تنزيل الناقص بمهلة لكل ملف. فشل ملف ما يوقف الباقي ولا يفشّل التثبيت
async function downloadData(){
  const dc = await caches.open(DATA_CACHE);
  for(const f of DATA_FILES){
    const u = new URL(f, self.location).href;
    if(await dc.match(u)) continue;
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 30000) : 0;
    try{ const n = await fetch(u, ac ? {signal: ac.signal} : undefined); if(n.ok) await dc.put(u, n); }catch(err){ /* انقطع النت أو تأخر: نكمل بالمحاولة الجاية (رسالة الصفحة أو الاستعمال) */ }
    finally{ if(tm) clearTimeout(tm); }
  }
}
async function ensureData(){ await migrateData(); await downloadData(); }
let dataBusy = null, dataAgain = false;
// تشغيل واحد بنفس الوقت؛ وإذا وصل طلب ثاني أثناء الشغل نعيد دورة وحدة بعد ما ينتهي (حتى ما تضيع محاولة بعد زوال انقطاع/تعليق)
function ensureDataOnce(){
  if(dataBusy){ dataAgain = true; return dataBusy; }
  dataBusy = (async () => { do{ dataAgain = false; try{ await ensureData(); }catch(err){} }while(dataAgain); })().finally(() => { dataBusy = null; });
  return dataBusy;
}
self.addEventListener('install', e => {
  e.waitUntil((async () => { await (await caches.open(CACHE)).addAll(CORE); await Promise.race([ensureDataOnce(), timeout(90000)]); })());   // سقف 90 ثانية: تنزيل معلّق ما يوقف التثبيت
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await Promise.race([migrateData().catch(() => {}), timeout(60000)]);   // ترحيل محلي (أجزاء من الثانية عادةً، بدون شبكة)؛ سقف 60 ثانية مبالغ فيه عمداً حتى ما يعلّق التفعيل لو صار خلل، وإذا انتهى نحتفظ بالكاش القديم بحذر
    const ks = await caches.keys(), dc = await caches.open(DATA_CACHE), missing = [];
    for(const f of DATA_FILES){ const u = new URL(f, self.location).href; if(!(await dc.match(u))) missing.push(u); }
    const del = [];
    for(const k of ks){
      if(k === CACHE || k === DATA_CACHE || !k.startsWith('hero-') || k === 'hero-fonts' || k === 'hero-prefs') continue;
      let only = false;   // ذاكرة قديمة فيها النسخة الوحيدة لملف بيانات ما انرحّل: نخليها
      if((OLD_RE.test(k) || OLD_DATA_RE.test(k)) && missing.length){ try{ const oc = await caches.open(k); for(const u of missing){ if(await oc.match(u)){ only = true; break; } } }catch(err){ only = true; } }
      if(!only) del.push(k);
    }
    await Promise.all(del.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if(e.data && e.data.type === 'prefetch-data') e.waitUntil(ensureDataOnce()); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {   // الصفحة: من النت أول حتى يوصل التحديث، وإذا ماكو نت من الذاكرة
    e.respondWith(fetch(req).then(r => {
      // نخزّن الصفحة بس إذا ملفاتها المرقّمة (?v=) موجودة بهذي الذاكرة، حتى ما تنفتح صفحة جديدة بدون سكربتاتها لو انقطع النت قبل اكتمال التحديث
      const cp = r.clone();
      e.waitUntil(cp.text().then(t => caches.open(CACHE).then(c => {
        const refs = [...t.matchAll(/(?:src|href)="(app[\w-]*\.(?:js|css)\?v=\d+)"/g)].map(m => m[1]);
        return Promise.all(refs.map(u => c.match(u))).then(hits => { if (hits.every(Boolean)) c.put('index.html', new Response(t, {headers: {'content-type': 'text/html; charset=utf-8'}})); });
      })).catch(() => {}));
      return r;
    })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (url.origin === location.origin && (url.pathname.includes('/vendor/zxing/') || DATA_URLS.has(url.pathname))) {   // قارئ الباركود وملفات المدرب الثقيلة: من الكاش الدائم، وإذا ماكو تنحفظ أول مرة تنستعمل
    e.respondWith(caches.open(DATA_CACHE).then(c => c.match(req, {ignoreSearch: true}).then(r => r || fetch(req).then(res => { if (res.ok) e.waitUntil(c.put(req, res.clone())); return res; }))));
    return;
  }
  if (url.origin === location.origin) {   // ملفات التطبيق المرقّمة (?v=) تنطابق حرفياً: صفحة جديدة ما تاخذ سكربت قديم من الذاكرة
    const exact = url.searchParams.has('v');
    e.respondWith(caches.match(req, exact ? {} : {ignoreSearch: true}).then(r => r || fetch(req))); return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {   // الخطوط: من الذاكرة وتتحدث بالخلفية
    e.respondWith(caches.open('hero-fonts').then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});

// ===== v110: تذكيرات الإشعارات (Web Push بدون حمولة: النص يختاره الجهاز) =====
const REMIND = {
  ar: {morning: ['صباح الخير ☀️', 'سجّلت فطورك؟ دقيقة وحدة وتخلص.'], noon: ['وقت الغدا 🍽️', 'لا تنسى تسجّل غداك بهيرو.'], evening: ['مساء الخير 🌙', 'سجّل عشاك وشوف شلون كان يومك.']},
  en: {morning: ['Good morning ☀️', 'Did you log your breakfast? It takes a minute.'], noon: ['Lunch time 🍽️', "Don't forget to log your lunch in HERO."], evening: ['Good evening 🌙', 'Log your dinner and see how your day went.']},
};
async function heroPrefs(){ try{ const r = await (await caches.open('hero-prefs')).match('prefs'); return r ? await r.json() : {}; }catch(e){ return {}; } }
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const p = await heroPrefs(), lang = p.lang === 'en' ? 'en' : 'ar', L = REMIND[lang], d = new Date(), now = d.getHours() * 60 + d.getMinutes();
    // نختار اسم الوجبة اللي وقتها أقرب وقت مضى (لحد 20 دقيقة)؛ الأسماء من الجهاز، السيرفر ما يعرفها
    let hit = null;
    for(const it of (Array.isArray(p.items) ? p.items : [])){
      const m = Number(it && it.m), n = String(it && it.n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
      if(!isFinite(m) || !n) continue;
      const diff = ((now - m + 1440 + 720) % 1440) - 720;   // فرق موقّع بالدقايق (يغطي عبور منتصف الليل)
      if(diff >= -5 && diff <= 20 && (!hit || Math.abs(diff) < Math.abs(hit.diff))) hit = {diff, n};   // -5: السيرفر يقرّب آخر دقايق اليوم لـ23:55
    }
    const h = d.getHours();
    const m = hit ? (lang === 'en' ? ['Time for ' + hit.n + ' 🍽️', 'Log it in HERO, it takes a minute.'] : ['وقت ' + hit.n + ' 🍽️', 'سجّلها بهيرو، تاخذ دقيقة.'])
      : h < 11 ? L.morning : h < 17 ? L.noon : L.evening;
    await self.registration.showNotification(m[0], {body: m[1], icon: 'icons/icon-192.png', badge: 'icons/icon-32.png', tag: 'hero-reminder', renotify: true, data: {url: './'}});
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for(const c of cs){ if('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
