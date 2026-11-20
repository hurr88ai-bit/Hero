"""هيرو · نسخة 108: يركّب الأكلات الجديدة (src108/foods108.json) بالتطبيق

1) قاعدة الأكل (FOOD_DB) بـapp-main.js   2) الوحدات المنزلية (FOOD_MEASURES)   3) مرادفات البحث (SYNONYMS)
4) الأسماء الإنگليزية بـi18n/en.json وبالقاموس المضمّن بـapp-i18n.js   5) سطر بدليل المصدر

الاستعمال (من جذر المستودع):  python3 src108/recipes108.py  ثم  python3 src108/apply108.py  ثم  python3 tools/release.py 108
يرفض يشتغل مرتين (إذا الأكلات مركّبة من قبل).
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
FOODS = json.load(open(P('src108', 'foods108.json'), encoding='utf-8'))

def rw(path, fn):
    raw = open(path, 'rb').read().decode('utf-8'); crlf = '\r\n' in raw
    s = fn(raw.replace('\r\n', '\n'))
    open(path, 'wb').write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def sub1(s, old, new):
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:90]}')
    return s.replace(old, new)

js = lambda x: json.dumps(x, ensure_ascii=False)
num = lambda v: '%g' % v

def main_js(s):
    if '// نسخة 108' in s: sys.exit('✗ نسخة 108 منطبقة من قبل')
    # 1) قاعدة الأكل
    lines, cur = [], None
    for f in FOODS:
        if js(f['name']) + ':' in s: sys.exit('✗ الأكلة موجودة: ' + f['name'])
        if f['cat'] != cur:
            cur = f['cat']; lines.append(f"\n  // نسخة 108 · {cur}")
        extra = f", unit:'piece', avgWeight:{num(f['piece'])}" if f['piece'] else ''
        lines.append(f"  {js(f['name'])}: {{cal:{num(f['cal'])}, pro:{num(f['pro'])}, carb:{num(f['carb'])}, fat:{num(f['fat'])}{extra}, src:'{f['src']}'}}")
    last = '  "عصير فواكه كوكتيل (محلات)": {cal:60, pro:0.6, carb:14, fat:0.3, src:\'E\'}\n};\n'
    s = sub1(s, last, last[:-4] + ',' + ',\n'.join(lines) + '\n};\n')
    # 2) الوحدات المنزلية
    ms = []
    for f in FOODS:
        m = f['meas']
        if not m: continue
        v = 'M_STEW' if m == 'STEW' else 'M_RICE' if m == 'RICE' else '[' + ', '.join(f'U({js(l)},{g},false)' for l, g in m) + ']'
        ms.append(f"  {js(f['name'])}: {v}")
    lastm = '  "عصير فواكه كوكتيل (محلات)": [U("كوب",300,false)]\n};\n'
    s = sub1(s, lastm, lastm[:-4] + ',\n  // نسخة 108\n' + ',\n'.join(ms) + '\n};\n')
    # 3) مرادفات البحث
    i = s.index('const SYNONYMS = {'); j = s.index('\n};', i)
    block = s[i:j]; add = {}
    for f in FOODS:
        for k, v in (f['syn'] or {}).items():
            if k in add: add[k] = sorted(set(add[k]) | set(v))
            else: add[k] = list(v)
    keep = {}
    for k, v in add.items():
        if re.search(r"(^|[\s,{])'" + re.escape(k) + r"':", block): print('! مرادف موجود، تخطيته:', k); continue
        keep[k] = v
    syn = ', '.join(f"{js(k).replace(chr(34), chr(39))}:[{','.join(js(x).replace(chr(34), chr(39)) for x in v)}]" for k, v in keep.items())
    s = sub1(s, 'const SYNONYMS = {\n', 'const SYNONYMS = {\n  ' + syn + ',   // نسخة 108\n')
    return s
rw(P('app-main.js'), main_js)

# 4) الترجمة
EN = {}
for f in FOODS: EN[f['name']] = f['en']
labels = {l for f in FOODS if isinstance(f['meas'], list) for l, g in f['meas']}
exist = json.load(open(P('i18n', 'en.json'), encoding='utf-8'))
for l, e in {'حفنة': 'Handful', 'شريحة': 'Slice', 'ملعقة أكل': 'Tablespoon', 'صحن صغير': 'Small plate', 'كاسة': 'Glass', 'كوب': 'Cup', 'ماعون': 'Plate'}.items():
    if l in labels and l not in exist: EN[l] = e
EN = {k: v for k, v in EN.items() if k not in exist}
if not EN: sys.exit('✗ ماكو ترجمات جديدة؟')
entries = ', '.join(f'{js(k)}: {js(v)}' for k, v in EN.items())
def en_json(s):
    anchor = '"ضيفهن": "Add them",\n'
    return sub1(s, anchor, anchor + '\n'.join(f'{js(k)}: {js(v)},' for k, v in EN.items()) + '\n')
rw(P('i18n', 'en.json'), en_json)
json.load(open(P('i18n', 'en.json'), encoding='utf-8'))
rw(P('app-i18n.js'), lambda s: sub1(s, '"ضيفهن": "Add them",', '"ضيفهن": "Add them", ' + entries + ','))

# 5) دليل المصدر
def doc(s):
    row = '| `src104/` |'
    k = s.index(row); e = s.index('\n', k)
    return s[:e] + '\n| `src108/` | نسخة 108: ' + str(len(FOODS)) + ' أكلة ومادة جديدة (مرگات، مقبلات، حلويات، مشروبات، مواد غذائية). `recipes108.py` يحسب القيم من وصفات (التفاصيل بـ`RECIPES108.md` للمراجعة) و`apply108.py` يركّبها |' + s[e:]
rw(P('docs', 'SOURCE.md'), doc)
print('✓ ركّبت', len(FOODS), 'أكلة؛ ترجمات جديدة:', len(EN))
