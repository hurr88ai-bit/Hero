"""هيرو · نسخة 97: الزخرفة المسمارية + «BE YOUR OWN HERO» بالمسماري

اختيار حر (18 تشرين الثاني 2026): بدل زخرفة عشتار، أسطر كتابة مسمارية مثل اللوح الطيني بأعلى الصفحات،
والأسطر هي جملة BE YOUR OWN HERO مكتوبة بالمقاطع المسمارية (نطق الجملة، مو ترجمة):
  𒁉 BI · 𒄿𒌨 I-UR · 𒌋𒌦 U-UN · 𒄭𒊒 ḪI-RU   (يونيكود: 12049 · 1213F 12328 · 1230B 12326 · 1212D 12292)
والجملة نفسها بشاشة البداية وبكارت «حول هيرو».
الخط: fonts/hero-cuneiform.woff2 = جزء من Noto Sans Cuneiform (SIL OFL 1.1، الرخصة: fonts/OFL-NotoSansCuneiform.txt)
مقصوص على الـ7 علامات بس (5 كيلوبايت):
  pyftsubset NotoSansCuneiform.woff2 --unicodes=U+12049,U+1213F,U+12328,U+1230B,U+12326,U+1212D,U+12292 --flavor=woff2

الاستعمال:  python3 src97/apply97.py  ثم  python3 tools/release.py 97
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json'); SW = os.path.join(ROOT, 'sw.js')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'HeroCun' in s: sys.exit('✗ نسخة 97 منطبقة من قبل')
PH = '\U00012049 \U0001213F\U00012328 \U0001230B\U00012326 \U0001212D\U00012292'

# الخط: preload حتى يلحك لشاشة البداية
sub1('<meta name="theme-color" content="#f2f4f9" media="(prefers-color-scheme: light)">',
     '<link rel="preload" href="fonts/hero-cuneiform.woff2" as="font" type="font/woff2" crossorigin>\n<meta name="theme-color" content="#f2f4f9" media="(prefers-color-scheme: light)">')

CSS = """
/* ============ v97: الزخرفة المسمارية ============ */
@font-face{font-family:'HeroCun'; src:url(fonts/hero-cuneiform.woff2) format('woff2'); font-display:block;}
:root{--cun-c:#1d4ea3; --cun-op:.18; --cun-line:.10;}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --cun-c:#e2b659; --cun-op:.22; --cun-line:.08; } }
:root[data-theme="dark"]{ --cun-c:#e2b659; --cun-op:.22; --cun-line:.08; }
#ishtar svg{direction:ltr;}
#ishtar .cw{font-family:'HeroCun'; fill:var(--cun-c); fill-opacity:var(--cun-op);}
#ishtar .cl{fill:none; stroke:var(--cun-c); stroke-opacity:var(--cun-line); stroke-width:1;}
.cun{font-family:'HeroCun'; direction:ltr; unicode-bidi:isolate; letter-spacing:2px; white-space:nowrap;}
#splash .sp-cun{font-size:22px; color:#ffb14a; opacity:.85; margin-top:-2px;}
.about-cun{font-size:22px; color:#f0c14b; opacity:.92; margin-top:8px; text-align:center;}
.about-cun-l{font-size:11.5px; opacity:.62; margin-top:2px; text-align:center;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

# أسطر اللوح بدل عشتار
rows = []
line = '  '.join([PH] * 8)
for r in range(8):
    y = 26 + r * 40
    rows.append(f' <text class="cw" x="{-60 if r % 2 else 0}" y="{y}" font-size="21">{line}</text><path class="cl" d="M0 {y + 13}H4000"/>')
m = re.search(r'<div id="ishtar" aria-hidden="true"><svg [^>]*>.*?</svg></div>', s, re.S)
if not m: sys.exit('✗ ما لكيت زخرفة عشتار')
s = s[:m.start()] + '<div id="ishtar" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">\n' + '\n'.join(rows) + '\n</svg></div>' + s[m.end():]

# شاشة البداية + حول هيرو
m = re.search(r'(<div class="sp-tl" dir="ltr">BE YOUR OWN HERO</div>)', s)
if not m or s.count(m.group(1)) != 1: sys.exit('✗ sp-tl')
s = s.replace(m.group(1), m.group(1) + f'<div class="sp-cun cun" aria-hidden="true">{PH}</div>')
sub1('      <div class="about-motto" dir="ltr">BE YOUR OWN HERO</div>',
     f'      <div class="about-motto" dir="ltr">BE YOUR OWN HERO</div>\n      <div class="about-cun cun" aria-hidden="true">{PH}</div>\n      <div class="about-cun-l">BE YOUR OWN HERO بالخط المسماري</div>')

NEW = {'BE YOUR OWN HERO بالخط المسماري': 'BE YOUR OWN HERO in cuneiform'}
mD = re.search(r'const D = \{', s)
s = s[:mD.end()] + ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items()) + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)

w = open(SW, encoding='utf-8').read()
if 'hero-cuneiform.woff2' not in w:
    w = w.replace('"media/coach-f.webp"]', '"media/coach-f.webp", "fonts/hero-cuneiform.woff2"]', 1)
    if 'hero-cuneiform.woff2' not in w: sys.exit('✗ sw.js')
    open(SW, 'w', encoding='utf-8').write(w)
print('✓ نسخة 97 انطبقت')
