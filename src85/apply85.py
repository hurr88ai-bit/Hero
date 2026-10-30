"""هيرو · نسخة 85: الجاهزية القانونية للمتاجر

1) صفحات privacy.html و terms.html (عربي/إنگليزي) — ملفات مستقلة بجذر المستودع
2) بطاقة «الخصوصية والشروط» بملفي، فوك بطاقة «حول هيرو»
3) الترحيب: مربع التنبيه الصحي صار موافقة على الشروط والخصوصية، ويا رابطين
4) قارئ الباركود: نسبة البيانات «© مساهمو Open Food Facts» (شرط رخصة ODbL)
5) خط IBM Plex Sans Arabic صار محلي (fonts/) بدل Google Fonts: ماكو أي اتصال بطرف ثالث
   غير Open Food Facts، ويشتغل بدون نت من أول مرة
6) القاموس الإنگليزي (D داخل index.html و i18n/en.json)

الاستعمال (من جذر المستودع):  python3 src85/apply85.py  ثم  python3 tools/release.py 85
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')
EN = os.path.join(ROOT, 'i18n', 'en.json')
FONT_SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/fnt/package/files'

s = open(IDX, encoding='utf-8').read()


def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit(f'✗ لازم يطلع مرة وحدة بالضبط ({n}): {old[:70]}')
    s = s.replace(old, new)


# ---------- 5) الخط المحلي ----------
os.makedirs(os.path.join(ROOT, 'fonts'), exist_ok=True)
ranges = {
    'arabic': 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC',
    'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
}
faces, font_files = [], []
for sub in ('arabic', 'latin'):
    for w in (400, 500, 600, 700):
        fn = f'ibm-plex-sans-arabic-{sub}-{w}-normal.woff2'
        if os.path.exists(FONT_SRC):
            shutil.copy(os.path.join(FONT_SRC, fn), os.path.join(ROOT, 'fonts', fn))
        assert os.path.exists(os.path.join(ROOT, 'fonts', fn)), fn
        font_files.append('fonts/' + fn)
        faces.append(f"@font-face{{font-family:'IBM Plex Sans Arabic';font-style:normal;font-weight:{w};font-display:swap;"
                     f"src:url(fonts/{fn}) format('woff2');unicode-range:{ranges[sub]}}}")
sub1('<link rel="preconnect" href="https://fonts.googleapis.com">', '')
sub1('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '')
sub1('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">',
     '<style>/* IBM Plex Sans Arabic (SIL OFL 1.1) محلي */' + ''.join(faces) + '</style>')

sw = open(SW, encoding='utf-8').read()
m = re.search(r'const CORE = (\[.*?\]);', sw)
core = json.loads(m.group(1))
for f in font_files + ['privacy.html', 'terms.html']:
    if f not in core:
        core.append(f)
sw = sw.replace(m.group(0), 'const CORE = ' + json.dumps(core, ensure_ascii=False) + ';')
open(SW, 'w', encoding='utf-8').write(sw)

# ---------- 2) بطاقة الخصوصية والشروط ----------
CARD = '''<div class="card legal-card">
      <h2>الخصوصية والشروط</h2>
      <div class="goal-note" style="margin-top:0;">بياناتك تنحفظ بموبايلك بس. ما عدنا سيرفر، وما نبيع أو نشارك أي شي.</div>
      <div class="btn-row"><a class="ghost legal-btn" href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a><a class="ghost legal-btn" href="terms.html" target="_blank" rel="noopener">الشروط والأحكام</a></div>
    </div>

    <div class="card about-card">'''
sub1('<div class="card about-card">', CARD)
sub1('footer{text-align:center; color:var(--sub); font-size:11.5px; padding:6px 0 0;}',
     'footer{text-align:center; color:var(--sub); font-size:11.5px; padding:6px 0 0;}\n'
     '.legal-btn{display:inline-flex; align-items:center; justify-content:center; text-decoration:none; flex:1;}\n'
     '.ob-legal{display:flex; gap:14px; justify-content:center; margin-top:10px; font-size:14px;}\n'
     '.ob-legal a{color:var(--gold); font-weight:600;}')

# ---------- 3) الترحيب ----------
sub1('<label class="ob-check"><input type="checkbox" id="ob-ack" onchange="obSync()"> قريت التنبيه وفهمته</label>',
     '<label class="ob-check"><input type="checkbox" id="ob-ack" onchange="obSync()"> قريت التنبيه، وأوافق على الشروط وسياسة الخصوصية</label>\n'
     '        <div class="ob-legal"><a href="terms.html" target="_blank" rel="noopener">الشروط والأحكام</a><a href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a></div>')

# ---------- 4) نسبة Open Food Facts ----------
sub1('<div class="goal-note bc-src">المعلومات من Open Food Facts (قاعدة بيانات مفتوحة يكتبها الناس)، فتأكد منها مرة وحدة. بعدها كل ما تمسحه يطلعلك فوراً حتى بدون نت.</div>',
     '<div class="goal-note bc-src">المعلومات من Open Food Facts (قاعدة بيانات مفتوحة يكتبها الناس)، فتأكد منها مرة وحدة. بعدها كل ما تمسحه يطلعلك فوراً حتى بدون نت.</div>'
     '<div class="goal-note bc-src" data-no-tr dir="ltr" style="margin-top:4px;"><a href="https://world.openfoodfacts.org/product/${esc(code)}" target="_blank" rel="noopener">© Open Food Facts contributors</a> · ODbL</div>')

# ---------- 6) القاموس ----------
NEW = {
    "الخصوصية والشروط": "Privacy & terms",
    "بياناتك تنحفظ بموبايلك بس. ما عدنا سيرفر، وما نبيع أو نشارك أي شي.": "Your data is saved only on your phone. We have no server, and we never sell or share anything.",
    "سياسة الخصوصية": "Privacy Policy",
    "الشروط والأحكام": "Terms of Use",
    "قريت التنبيه، وأوافق على الشروط وسياسة الخصوصية": "I've read the notice and agree to the Terms and Privacy Policy",
}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ', ' for k, v in NEW.items()
              if json.dumps(k, ensure_ascii=False) + ':' not in s[mD.end():mD.end() + 400000])
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8'))
en.update(NEW)
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 85 انطبقت · الخط محلي (%d ملف) · صفحات الخصوصية والشروط بالـservice worker' % len(font_files))
