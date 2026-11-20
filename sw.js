// هيرو · service worker (يخلي التطبيق يشتغل بدون نت ويحدّث نفسه)
const CACHE = 'hero-108-88cff5f3';
const CORE = ["./", "index.html", "app.css?v=108", "app-i18n.js?v=108", "app-main.js?v=108", "app-extra.js?v=108", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "icons/icon-32.png", "vendor/three.module.min.js", "vendor/jsm/environments/RoomEnvironment.js", "coach-mh.js", "real.js", "anat.js", "body-meta.json", "body-shared.txt", "body-m.txt", "body-f.txt", "muscles-m.txt", "muscles-f.txt", "fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-400-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-500-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-600-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-700-normal.woff2", "privacy.html", "terms.html", "media/coach-m.webp", "media/coach-f.webp", "fonts/hero-cuneiform.woff2", "media/hero-face.webp", "media/hero-full.webp"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('hero-') && k !== 'hero-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {   // الصفحة: من النت أول حتى يوصل التحديث، وإذا ماكو نت من الذاكرة
    e.respondWith(fetch(req).then(r => {
      // نخزّن الصفحة بس إذا ملفاتها المرقّمة (?v=) موجودة بهذي الذاكرة، حتى ما تنفتح صفحة جديدة بدون سكربتاتها لو انقطع النت قبل اكتمال التحديث
      const cp = r.clone();
      cp.text().then(t => caches.open(CACHE).then(c => {
        const refs = [...t.matchAll(/(?:src|href)="(app[\w-]*\.(?:js|css)\?v=\d+)"/g)].map(m => m[1]);
        return Promise.all(refs.map(u => c.match(u))).then(hits => { if (hits.every(Boolean)) c.put('index.html', new Response(t, {headers: {'content-type': 'text/html; charset=utf-8'}})); });
      })).catch(() => {});
      return r;
    })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (url.origin === location.origin && url.pathname.includes('/vendor/zxing/')) {   // قارئ الباركود: ينحفظ أول مرة ينستعمل
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
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
