"""هيرو · نسخة 95: زخرفة بوابة عشتار بأعلى الصفحة

حر اختار نقشة عشتار (18 تشرين الثاني 2026)، ويستعمل الوضع الليلي دائماً.
طابوق أزرق خفيف + صف ورود ذهبية بأعلى كل صفحة، تختفي تدريجياً من تنزل (فوگ التدرّج اللابيسي).
بالوضع الليلي الطابوق أزرق فاتح والورود ذهبية، والشفافية أقل حتى ما تتعب العين.

الاستعمال:  python3 src95/apply95.py  ثم  python3 tools/release.py 95
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'id="ishtar"' in s: sys.exit('✗ نسخة 95 منطبقة من قبل')

CSS = r"""
/* ============ v95: زخرفة بوابة عشتار ============ */
:root{--ish-brick:#1d4ea3; --ish-brick-op:.13; --ish-ros:#c4952f; --ish-ros-op:.5;}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --ish-brick:#8fb2ff; --ish-brick-op:.11; --ish-ros:#e2b659; --ish-ros-op:.42; } }
:root[data-theme="dark"]{ --ish-brick:#8fb2ff; --ish-brick-op:.11; --ish-ros:#e2b659; --ish-ros-op:.42; }
#ishtar{position:absolute; top:0; left:0; right:0; height:300px; z-index:-1; pointer-events:none; overflow:hidden;
  -webkit-mask-image:linear-gradient(180deg, #000 0, rgba(0,0,0,.75) 45%, transparent 100%); mask-image:linear-gradient(180deg, #000 0, rgba(0,0,0,.75) 45%, transparent 100%);}
#ishtar svg{display:block; width:100%; height:100%;}
#ishtar .ib{fill:none; stroke:var(--ish-brick); stroke-opacity:var(--ish-brick-op); stroke-width:1;}
#ishtar .ir{fill:none; stroke:var(--ish-ros); stroke-opacity:var(--ish-ros-op); stroke-width:1.4;}
#ishtar .ic{fill:var(--ish-ros); fill-opacity:var(--ish-ros-op);}
#ishtar .il{fill:none; stroke:var(--ish-ros); stroke-opacity:calc(var(--ish-ros-op) * .7); stroke-width:1;}
body{position:relative; isolation:isolate;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

SVG = """<div id="ishtar" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
 <defs>
  <pattern id="ish-brick" width="40" height="20" patternUnits="userSpaceOnUse" y="46"><path class="ib" d="M0 .5H40M0 10.5H40M20 .5V10.5M.5 10.5V20M39.5 10.5V20"/></pattern>
  <pattern id="ish-ros" width="46" height="46" patternUnits="userSpaceOnUse" x="0" y="0">
   <circle class="ir" cx="23" cy="23" r="8"/><circle class="ic" cx="23" cy="23" r="2.6"/>
   <path class="ir" d="M23 12.5v-3.5M23 33.5v3.5M12.5 23h-3.5M33.5 23h3.5M15.6 15.6l-2.4-2.4M30.4 30.4l2.4 2.4M30.4 15.6l2.4-2.4M15.6 30.4l-2.4 2.4"/>
  </pattern>
 </defs>
 <rect width="100%" height="100%" y="46" fill="url(#ish-brick)"/>
 <rect width="100%" height="46" fill="url(#ish-ros)"/>
 <path class="il" d="M0 45.5H4000"/>
</svg></div>
"""
sub1("<body>\n", "<body>\n" + SVG)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 95 انطبقت')
