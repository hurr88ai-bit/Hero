"""هيرو · نسخة 99: «هيرو» الشخصية (أنمي) بدل صور المدرب ثلاثي الأبعاد — تجربة

حر اختار (18 تشرين الثاني 2026) شخصية أنمي تشبهه كوجه لهيرو. الصورة مولّدة بالذكاء الاصطناعي من صوره،
والخلفية انشالت محلياً (rembg isnet-general-use):
  media/hero-full.webp  (الجسم كامل، شفاف)   media/hero-face.webp (الوجه، للدواير الصغيرة)
وين ينحط:
  شاشة البداية (دائرة الوجه) · «تمريني» (بدل صورة المدرب) · وجبات اليوم الفاضية · نافذة الكأس («هيرو يكلك») · بطاقة المشاركة
صور المدرب ثلاثي الأبعاد (coach-m/f.webp) باقية بالمستودع بس ما تنستعمل.

الاستعمال:  python3 src99/apply99.py  ثم  python3 tools/release.py 99
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); SW = os.path.join(ROOT, 'sw.js')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'hero-face.webp' in s: sys.exit('✗ نسخة 99 منطبقة من قبل')

CSS = """
/* ============ v99: هيرو الشخصية ============ */
#splash .sp-hero{width:118px; height:118px; border-radius:50%; object-fit:cover; background:#e9eef8; border:4px solid #ffcf4a; box-shadow:0 10px 30px rgba(0,0,0,.35); margin-bottom:6px; animation:spIn .6s cubic-bezier(.2,1.3,.4,1);}
.tr-coach{aspect-ratio:auto; height:290px; background:radial-gradient(70% 80% at 50% 30%, #3a6fd0 0, #1b3a78 70%); display:flex; justify-content:center; align-items:flex-start;}
.tr-coach img{width:auto; height:auto; max-width:none; min-height:118%; object-fit:contain; object-position:50% 0; margin-top:10px; filter:drop-shadow(0 8px 18px rgba(0,0,0,.35));}
.meal-empty img{object-position:50% 50%; background:#e9eef8; border:2px solid var(--hero-gold);}
.hero-say{display:flex; align-items:center; gap:10px; text-align:start;}
.hero-say img{width:44px; height:44px; border-radius:50%; object-fit:cover; background:#e9eef8; border:2px solid #ffcf4a; flex:0 0 auto;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

sub1('<div id="splash" aria-hidden="true"><div class="sp-nm sp-big">هيرو</div>',
     '<div id="splash" aria-hidden="true"><img class="sp-hero" src="media/hero-face.webp" alt=""><div class="sp-nm sp-big">هيرو</div>')
# تمريني
sub1("""      <div class="tr-coach"><img src="media/coach-${sx}.webp" alt="هيرو يسوي سكوات"></div>""",
     """      <div class="tr-coach"><img src="media/hero-full.webp" alt="هيرو"></div>""")
# وجبات اليوم الفاضية
sub1("""<div class="meal-empty"><img src="media/coach-${sx}.webp" alt="" loading="lazy">""",
     """<div class="meal-empty"><img src="media/hero-face.webp" alt="" loading="lazy">""")
# نافذة الكأس
sub1("""<div class="hero-say">هيرو يكلك: ${achHero()}</div>""",
     """<div class="hero-say"><img src="media/hero-face.webp" alt=""><span>هيرو يكلك: ${achHero()}</span></div>""")
# بطاقة المشاركة: هيرو من الراس للخصر
sub1("""    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm', img = new Image(); img.src = `media/coach-${sx}.webp`;
    await img.decode();
    const cw = 420, ch = Math.round(cw * img.height / img.width), cx = W/2 - cw/2, cy = 1340;
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(cx, cy, cw, ch, 36) : x.rect(cx, cy, cw, ch); x.clip(); x.drawImage(img, cx, cy, cw, ch); x.restore();""",
"""    const img = new Image(); img.src = 'media/hero-full.webp';
    await img.decode();
    const sh = Math.round(img.height * .52), dh = 390, dw = Math.round(img.width * dh / sh), cx = W/2 - dw/2, cy = 1316;
    x.save(); x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(W/2, cy + dh*.52, 200, 0, Math.PI*2); x.fill(); x.restore();
    x.drawImage(img, 0, 0, img.width, sh, cx, cy, dw, dh);""")
open(IDX, 'w', encoding='utf-8').write(s)

w = open(SW, encoding='utf-8').read()
if 'hero-face.webp' not in w:
    w = w.replace('"fonts/hero-cuneiform.woff2"]', '"fonts/hero-cuneiform.woff2", "media/hero-face.webp", "media/hero-full.webp"]', 1)
    if 'hero-face.webp' not in w: sys.exit('✗ sw.js')
    open(SW, 'w', encoding='utf-8').write(w)
print('✓ نسخة 99 انطبقت')
