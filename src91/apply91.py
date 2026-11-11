"""هيرو · نسخة 91: تبديل سريع للحوم + تصحيح نشويات أقوى

تجربة حر الثانية: قطعة سمك (139 غم) انقرت «دجاج فخذ» (150 غم)، ورز 50 غم انقرا 90.
1) جنب أي لحم/دجاج/سمك: «مو هذا؟ 🐔 دجاج · 🐟 سمك · 🥩 لحم» يبدّل الأكلة بضغطة ويحافظ على الغرامات
   (يختار نفس طريقة الطبخ إذا موجودة: مقلي/مشوي)، و«🔍 نوع ثاني» يفتح البحث
2) تصحيح النشويات من ×0.7 إلى ×0.55 (معدل التجارب الثلاث: 0.67، 0.56، 0.38)

الاستعمال:  python3 src91/apply91.py  ثم  python3 tools/release.py 91
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:90]}')
    s = s.replace(old, new)
if 'const FAM = ' in s: sys.exit('✗ نسخة 91 منطبقة من قبل')

sub1("return {x: STARCH.test(normAr(name)) ? 0.7 : 1, mine: false};", "return {x: STARCH.test(normAr(name)) ? 0.55 : 1, mine: false};")

sub1("""  // أكلة ما إلها تطابق: نجرب الاسم كامل""",
"""  // ===== تبديل سريع بين الدجاج والسمك واللحم (أكثر غلط يصير بالصور) =====
  const FAM = [
    {id:'chicken', ico:'🐔', label:'دجاج', re:/دجاج|chicken/, grill:'دجاج فخذ مشوي (بدون جلد)', fry:'دجاج فخذ مشوي (بدون جلد)'},
    {id:'fish',    ico:'🐟', label:'سمك',  re:/سمك|سلمون|تونه|تونة|هامور|زبيدي|fish/, grill:'سمك كارب مشوي (موزون مطبوخ)', fry:'سمك مقلي'},
    {id:'meat',    ico:'🥩', label:'لحم',  re:/لحم|كباب|beef|lamb/, grill:'لحم أحمر مشوي (عام)', fry:'لحم أحمر مشوي (عام)'},
  ];
  const famOf = name => FAM.find(x=>x.re.test(normAr(name)));
  function swapTo(i, famId){
    const it = items[i], fam = FAM.find(x=>x.id === famId); if(!it || !fam) return;
    const fried = /مقلي|fried/.test(normAr(it.name || '') + ' ' + normAr(it.seen || ''));
    const name = fried ? fam.fry : fam.grill, f = findFood(name); if(!f) return;
    Object.assign(it, {name, f, guess:false, mine:false, conf:1});
    render();
  }
  function famChips(it, i){
    const cur = it.f && famOf(it.name); if(!cur) return '';
    return `<div class="snap-fam"><span>مو هذا؟</span>${FAM.filter(x=>x !== cur).map(x=>`<button type="button" class="chip" onclick="SNAP.swapTo(${i},'${x.id}')">${x.ico} <span>${x.label}</span></button>`).join('')}<button type="button" class="chip" onclick="SNAP.find(${i})">🔍 نوع ثاني</button></div>`;
  }
  // أكلة ما إلها تطابق: نجرب الاسم كامل""")

# نعرض الشرائح تحت كل صف لحم (إذا ما عنده أزرار التخمين)
sub1("""          : it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}""",
"""          : it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}
        ${it.guess ? '' : famChips(it, i)}""")
sub1("return {open, close, photo, grams, del, oil, add, find, again};", "return {open, close, photo, grams, del, oil, add, find, again, swapTo};")
sub1(""".snap-oil{width:100%;""", """.snap-fam{display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; font-size:12.5px; color:var(--sub);}
.snap-fam .chip{padding:5px 10px; font-size:13px; border-radius:999px; border:1px solid var(--line); background:transparent; color:inherit; cursor:pointer;}
.snap-oil{width:100%;""")

NEW = {'مو هذا؟': 'Not this?', '🔍 نوع ثاني': '🔍 Other type', 'دجاج': 'Chicken', 'سمك': 'Fish', 'لحم': 'Meat'}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]; json.dump(en, open(EN,'w',encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX,'w',encoding='utf-8').write(s)
print('✓ نسخة 91 انطبقت')
