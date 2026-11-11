"""هيرو · نسخة 89: «صوّر صحنك» أذكى

- إذا الأكلة ما إلها تطابق بالقاعدة (مثل «دجاج بالكركم»)، التطبيق يدوّر على أقرب أكلة لمكونها الرئيسي (دجاج)
  ويختارها تلقائياً، ويكتب «أقرب شي بالقاعدة» ويا زر «🔍 غيّرها»
- السيرفر (worker/snap-worker.js) صار يقدّر الكميات بمراجع أوزان حقيقية ويصحّح المبالغة

الاستعمال:  python3 src89/apply89.py  ثم  python3 tools/release.py 89
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
if 'function guess(' in s: sys.exit('✗ نسخة 89 منطبقة من قبل')

# 1) تخمين أقرب أكلة
sub1("""  function calc(it){ return it.f ? makeItem(it.name, it.f, it.grams, G) : null; }""",
"""  // أكلة ما إلها تطابق: نجرب الاسم كامل، وبعدين كل كلمة (أطول كلمة أول، لأنها غالباً المكون الرئيسي)
  const SKIP = ['مع','على','او','أو','في','من','صحن','طبق','قطعة','قطع','مطبوخ','مطبوخة','مقلي','مشوي','with','and','of','plate','piece','cooked','fried','grilled'];
  function guess(seen){
    const q = String(seen||'').trim(); if(!q) return null;
    const ok = x => x && x.kind !== 'recipe';
    let h = searchFoods(q).find(ok); if(h) return h.name;
    // كل الكلمات (حتى طريقة الطبخ) للتقييم، بس المكونات بس للبحث
    const all = normAr(q).split(' ').map(w=>w.replace(/^(بال|ال|ب|و)(?=...)/, '')).filter(w=>w.length >= 3);
    const words = all.filter(w=>!SKIP.map(normAr).includes(w));
    const raw = /نيء|نيئ|raw/.test(normAr(q));
    let best = null, bestS = -1;
    words.forEach((w, wi)=>searchFoods(w).filter(ok).forEach((x, xi)=>{
      let sc = all.filter(t=>x.hay.includes(t)).length * 10 - wi - xi * 0.5;
      if(!raw && /نيء|نيئ/.test(x.key)) sc -= 8;   // الصحن مطبوخ عادةً
      if(sc > bestS){ bestS = sc; best = x.name; }
    }));
    return best;
  }
  function calc(it){ return it.f ? makeItem(it.name, it.f, it.grams, G) : null; }""")
sub1("""      const name = it.name ? exactName(it.name) : null, f = name ? findFood(name) : null;
      return {name: f ? name : null, f, seen: it.seen, grams: Math.max(1, Math.round(it.grams)), conf: it.confidence};""",
"""      let name = it.name ? exactName(it.name) : null, f = name ? findFood(name) : null, g = false;
      if(!f){ const n2 = guess(it.seen); if(n2){ name = n2; f = findFood(n2); g = !!f; } }
      return {name: f ? name : null, f, seen: it.seen, grams: Math.max(1, Math.round(it.grams)), conf: it.confidence, guess: g};""")
sub1("    items = body.items.map(it=>{", "    items = body.items.filter(it=>it.grams >= 5).map(it=>{   // تحت 5 غم = بقايا تخمين، مو أكلة")
# 2) عرض التخمين
sub1("""        ${it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}""",
"""        ${it.guess ? `<div class="snap-sub">🔄 أقرب شي بالقاعدة لـ: <span data-no-tr>${esc(it.seen)}</span></div><div class="snap-acts"><button type="button" class="ghost" onclick="SNAP.find(${i})">🔍 غيّرها</button></div>`
          : it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}""")
sub1(""".snap-row.low{border-color""", """.snap-row .snap-acts + .snap-bot{margin-top:6px;}
.snap-row.low{border-color""")

NEW = {'🔄 أقرب شي بالقاعدة لـ:': '🔄 Closest match in the database for:', '🔍 غيّرها': '🔍 Change it'}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); en.update(NEW); json.dump(en, open(EN,'w',encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX,'w',encoding='utf-8').write(s)
print('✓ نسخة 89 انطبقت')
