"""(أرشيف · ما ينستعمل هسه) سكربت البناء الأصلي لنسخة 75 لحد 80.
كان يبني مجلد pwa/ من app/tracker.html (نسخة صفحة Claude) ومن ملفات بجلسة عمل قديمة
(brand/icon/hero_icon_1024.png و fig3d/node_modules/three). هذني الملفات مو موجودة بعد،
ومن نسخة 81 التعديلات تنسوى مباشرة على index.html. انسترجع من محادثة 30 أيلول 2026 حتى يبقى مرجع
لشلون ينبني الغلاف (head، manifest، service worker). للنشر هسه استعمل tools/release.py.

Build the HERO PWA from app/tracker.html into ./pwa (ready for GitHub Pages).
usage: python3 pwa_build.py <version>"""
import sys, os, shutil, json, hashlib
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
APP, OUT = os.path.join(ROOT, 'app'), os.path.join(ROOT, 'pwa')
VER = sys.argv[1] if len(sys.argv) > 1 else 'dev'

if os.path.exists(OUT):
    for n in os.listdir(OUT):
        if n == '.git': continue
        p = os.path.join(OUT, n); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
os.makedirs(OUT, exist_ok=True)

# --- 3D + vendor files (symlinks resolved) ---
ASSETS = ['coach-mh.js', 'real.js', 'anat.js', 'body-meta.json', 'body-shared.txt', 'body-m.txt', 'body-f.txt', 'muscles-m.txt', 'muscles-f.txt']
for a in ASSETS: shutil.copyfile(os.path.realpath(os.path.join(APP, a)), os.path.join(OUT, a))
T = os.path.join(ROOT, 'fig3d/node_modules/three')
os.makedirs(os.path.join(OUT, 'vendor/jsm/environments'), exist_ok=True)
shutil.copyfile(os.path.join(T, 'build/three.module.min.js'), os.path.join(OUT, 'vendor/three.module.min.js'))
shutil.copyfile(os.path.join(T, 'examples/jsm/environments/RoomEnvironment.js'), os.path.join(OUT, 'vendor/jsm/environments/RoomEnvironment.js'))

# --- icons ---
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
src = Image.open(os.path.join(ROOT, 'brand/icon/hero_icon_1024.png')).convert('RGB')
for n in (512, 192, 180, 32):
    src.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, 'icons', f'icon-{n}.png'), optimize=True)

# --- manifest ---
man = {
    "name": "هيرو · HERO", "short_name": "هيرو", "description": "تتبّع أكلك وتمرينك ووزنك بالعراقي. BE YOUR OWN HERO",
    "lang": "ar", "dir": "rtl", "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#13233f", "theme_color": "#13233f",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}
json.dump(man, open(os.path.join(OUT, 'manifest.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# --- index.html ---
s = open(os.path.join(APP, 'tracker.html'), encoding='utf-8').read()
s = s.replace('"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"',
              '"three":"./vendor/three.module.min.js","three/addons/":"./vendor/jsm/"')
assert './vendor/three.module.min.js' in s
s = s.replace("'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js'", "new URL('./vendor/three.module.min.js', location.href).href")
s = s.replace('&family=Reem+Kufi:wght@500;600;700', '')
i = s.index('<title>'); j = s.index('</title>', i) + len('</title>')
title = s[i:j]; s = s[:i] + s[j:]
fav_start = s.find('<link rel="icon"')
if fav_start >= 0:
    fav_end = s.index('>', fav_start) + 1; s = s[:fav_start] + s[fav_end:]
while '<link rel="apple-touch-icon"' in s:
    a = s.index('<link rel="apple-touch-icon"'); s = s[:a] + s[s.index('>', a) + 1:]
HEAD = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{title}
<meta name="description" content="هيرو: تتبّع أكلك وتمرينك ووزنك بالعراقي. BE YOUR OWN HERO">
<meta name="theme-color" content="#f2f4f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1220" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="هيرو">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<style>html{{background:#f2f4f9}}@media (prefers-color-scheme:dark){{html{{background:#0d1220}}}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
<script>window.HERO_PWA = true;</script>
'''
SW_REG = f'''
<script>
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){{
  window.addEventListener('load', ()=>{{
    navigator.serviceWorker.register('sw.js').then(reg=>{{
      reg.addEventListener('updatefound', ()=>{{ const w = reg.installing; if(!w) return;
        w.addEventListener('statechange', ()=>{{ if(w.state === 'installed' && navigator.serviceWorker.controller && typeof notify === 'function') notify('نزل تحديث جديد لهيرو ✨ سكّر التطبيق وافتحه حتى يشتغل'); }});
      }});
    }}).catch(()=>{{}});
  }});
}}
</script>
'''
s = HEAD + '</head>\n<body>\n' + s + SW_REG + '</body>\n</html>\n'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(s)

# --- service worker ---
files = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon-32.png',
         'vendor/three.module.min.js', 'vendor/jsm/environments/RoomEnvironment.js'] + ASSETS
h = hashlib.sha1()
for f in files[1:]: h.update(open(os.path.join(OUT, f), 'rb').read())
CACHE = f'hero-{VER}-{h.hexdigest()[:8]}'
SW = '''// هيرو · service worker (يخلي التطبيق يشتغل بدون نت ويحدّث نفسه)
const CACHE = '%s';
const CORE = %s;
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
  if (/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) {   // الخطوط: من الذاكرة وتتحدث بالخلفية
    e.respondWith(caches.open('hero-fonts').then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
''' % (CACHE, json.dumps(files))
open(os.path.join(OUT, 'sw.js'), 'w', encoding='utf-8').write(SW)
open(os.path.join(OUT, '.nojekyll'), 'w').write('')
open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8').write('# هيرو · HERO\n\nتطبيق تتبّع الأكل والتمرين والوزن بالعراقي.\n\n**BE YOUR OWN HERO**\n\nصُنع في العراق 🇮🇶 · حر العبدلي\n')
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs if '.git' not in dp)
print('built', OUT, CACHE, f'{tot/1e6:.1f} MB')
