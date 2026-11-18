"""هيرو · نسخة 92: 50 أكلة جديدة + زر «ما لگيت أكلتي؟»

طلب حر (18 تشرين الثاني 2026): أكلات ناقصة مثل مرق السبانغ.
1) 50 أكلة: مرگات، أكلات رئيسية، ريوگ، شوربات، أكل سريع، حلويات، مشروبات (القيم بـsrc92/foods92.json).
   الأكلات المطبوخة محسوبة من مكوناتها بقيم USDA (الوصفات بجدول المراجعة «هيرو — أكلات جديدة للمراجعة»)
   وتطلع «تقديرية»؛ اللي مأخوذة مباشرة من USDA تطلع USDA.
2) مرادفات بحث: سبانغ/سبانخ، مرگة، برگر، بيتزا، بروستد…
3) زر «📩 ما لگيت أكلتي؟» تحت نتائج البحث: يفتح «رأيك يهمنا» ومكتوب بيه اسم الأكلة، ويوصل لانستغرام.

الاستعمال:  python3 src92/apply92.py  ثم  python3 tools/release.py 92
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json')
FOODS = json.load(open(os.path.join(ROOT, 'src92', 'foods92.json'), encoding='utf-8'))
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:90]}')
    s = s.replace(old, new)
if 'function fbMissing' in s: sys.exit('✗ نسخة 92 منطبقة من قبل')

def js(x): return json.dumps(x, ensure_ascii=False)
def num(v): return ('%g' % v)

# 1) قاعدة الأكل
CATS = {'مرگات':'مرگات', 'أكلات رئيسية':'أكلات رئيسية', 'ريوگ':'ريوگ', 'شوربات':'شوربات', 'أكل سريع':'أكل سريع وصوصات', 'حلويات':'حلويات', 'مشروبات':'مشروبات'}
lines, cur = [], None
for f in FOODS:
    if f['name'] in s and js(f['name']) + ':' in s: sys.exit('✗ الأكلة موجودة: ' + f['name'])
    if f['cat'] != cur:
        cur = f['cat']; lines.append(f"\n  // نسخة 92 · {CATS[cur]}")
    extra = f", unit:'piece', avgWeight:{f['piece']}" if f['piece'] else ''
    lines.append(f"  {js(f['name'])}: {{cal:{num(f['cal'])}, pro:{num(f['pro'])}, carb:{num(f['carb'])}, fat:{num(f['fat'])}{extra}, src:'{f['src']}'}}")
m = re.search(r'("كليجة \(قطعة\)": \{[^}]*\})\n\};', s)
if not m: sys.exit('✗ ما لكيت نهاية قاعدة الأكل')
s = s[:m.start()] + m.group(1) + ',' + ',\n'.join(lines) + '\n};' + s[m.end():]

# 2) الوحدات المنزلية
ms = []
for f in FOODS:
    if not f['meas']: continue
    v = 'M_STEW' if f['meas'] == 'STEW' else 'M_RICE' if f['meas'] == 'RICE' else '[' + ', '.join(f"U({js(l)},{g},false)" for l, g in f['meas']) + ']'
    ms.append(f"  {js(f['name'])}: {v}")
sub1("  'عصير برتقال طبيعي': [U('كوب',248,true)], 'خس': [U('كوب مقطع',36,true)], 'بروكلي مسلوق': [U('كوب',156,true)]\n};",
     "  'عصير برتقال طبيعي': [U('كوب',248,true)], 'خس': [U('كوب مقطع',36,true)], 'بروكلي مسلوق': [U('كوب',156,true)],\n  // نسخة 92\n" + ',\n'.join(ms) + "\n};")

# 3) مرادفات البحث
SYN = {'سبانخ':['سبانغ','سبانج'], 'سبانغ':['سبانخ','سبانج'], 'مرق':['مرقه','مركه','مرك'], 'بركر':['برجر','همبركر','هامبركر','burger'],
  'بيتزا':['بيزا','pizza'], 'بروستد':['بروست','دجاج مقلي','كنتاكي'], 'مايونيز':['مايو','مايونيزه'], 'كاتشب':['كجب','كاتجب','كتشب'],
  'ثوميه':['صوص ثوم','ثوم'], 'محلبي':['مهلبيه','محلبيه','مهلبي'], 'كاستر':['كسترد','كاسترد'], 'عروك':['عروق'], 'قوزي':['غوزي','خروف'],
  'برياني':['بريان'], 'مقلوبه':['مقلوبة'], 'نومي بصره':['ليمون اسود','لومي','نومي'], 'مشروب طاقه':['ريد بول','ردبول','باور هورس','طاقه'],
  'سمبوسه':['سمبوسك','سنبوسه','سمبوسة'], 'فسنجون':['فسنجان'], 'بتيته':['بطاطا','بتيتا'], 'شيخ محشي':['باذنجان محشي','شيخ المحشي'],
  'مطبك':['مطبق'], 'عجه':['اومليت','عجة'], 'زنكر':['زنجر','zinger'], 'لفه':['رول','راب','wrap'], 'داطلي':['دطلي'],
  'قيمه':['قيمة'], 'تبسي':['طبسي'], 'مجدره':['مجدرة'], 'كاهي':['قيمر'], 'صمونه':['صمون','لفه']}
syn = s[s.index('const SYNONYMS = {'):s.index('const CTX = {')]
for k in SYN:
    if f"'{k}':[" in syn: sys.exit('✗ مرادف موجود من قبل: ' + k)
sub1("const SYNONYMS = {\n", "const SYNONYMS = {\n  " + ', '.join(f"'{k}':[{','.join(js(x).replace(chr(34), chr(39)) for x in v)}]" for k, v in SYN.items()) + ",   // نسخة 92\n")

# 4) زر «ما لگيت أكلتي؟» بالبحث
MISS = """<button type="button" class="miss-food" onmousedown="event.preventDefault()" onclick="fbMissing()">📩 <span>ما لگيت أكلتي؟</span></button>"""
sub1("""    box.innerHTML = q && !findFood(q) ? '<div class="goal-note" style="padding:8px 12px; margin:0;">ما لكيت شي. جرب كلمة ثانية' + (c==='db' ? '، أو استخدم الإضافة اليدوية.' : '.') + '</div>' : '';""",
     """    box.innerHTML = q && !findFood(q) ? '<div class="goal-note" style="padding:8px 12px; margin:0;">ما لكيت شي. جرب كلمة ثانية' + (c==='db' ? '، أو استخدم الإضافة اليدوية.' : '.') + '</div>' + (c==='db' ? '""" + MISS + """' : '') : '';""")
sub1("""      <span>${esc(x.name)}</span><span class="meta">${per} · ${tag}</span></button>`;
  }).join('');""", """      <span>${esc(x.name)}</span><span class="meta">${per} · ${tag}</span></button>`;
  }).join('') + (c==='db' ? '""" + MISS + """' : '');""")
sub1(".result .meta{", """.miss-food{display:block; width:100%; text-align:center; padding:10px 12px; background:none; border:none; color:var(--accent); font:inherit; font-size:13px; font-weight:700; cursor:pointer;}
.result .meta{""")

# 5) يفتح «رأيك يهمنا» ومكتوب بيه اسم الأكلة
sub1("function fbMsg(){", """function fbMissing(){
  const q = ((document.getElementById('db-food') || {}).value || '').trim();
  const en = !!(window.I18N && I18N.en);
  const msg = en ? `I couldn't find this food in Hero: ${q || '…'}\\n(What's in it or how you cook it, if you like:) `
                 : `ما لگيت هاي الأكلة بهيرو: ${q || '…'}\\n(شنو بيها أو شلون تنطبخ عدكم، إذا تحب:) `;
  try{ localStorage.setItem('hero_fb', msg); }catch(e){}
  fbOpen('idea');
  setTimeout(()=>{ const t = document.getElementById('fb-text'); if(t){ t.value = msg; t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 50);
}
function fbMsg(){""")

# 6) الترجمة
NEW = {f['name']: f['en'] for f in FOODS}
NEW.update({'ما لگيت أكلتي؟': "Can't find your food?", 'كاسة': 'Bowl', 'صحن صغير': 'Small plate', 'قوطية 250 مل': '250 ml can'})
mD = re.search(r'const D = \{', s)
add = ''.join(js(k) + ': ' + js(v) + ', ' for k, v in NEW.items() if (js(k) + ':') not in s[mD.end():mD.end()+400000])
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print(f'✓ نسخة 92 انطبقت · {len(FOODS)} أكلة جديدة')
