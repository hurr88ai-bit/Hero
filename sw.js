// هيرو · service worker (يخلي التطبيق يشتغل بدون نت ويحدّث نفسه)
const CACHE = 'hero-75-4873347e';
const CORE = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "icons/icon-32.png", "vendor/three.module.min.js", "vendor/jsm/environments/RoomEnvironment.js", "coach-mh.js", "real.js", "anat.js", "body-meta.json", "body-shared.txt", "body-m.txt", "body-f.txt", "muscles-m.txt", "muscles-f.txt"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('hero-') && k !== 'hero-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {   // الصفحة: من النت أول حتى يوصل التحديث، وإذا ماكو نت من الذاكرة
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (url.origin === location.origin) { e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req))); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {   // الخطوط: من الذاكرة وتتحدث بالخلفية
    e.respondWith(caches.open('hero-fonts').then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
