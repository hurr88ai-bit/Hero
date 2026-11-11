"""هيرو · نسخة 90: «صوّر صحنك» يتعلّم من تصحيحاتك

التجارب الحقيقية (صحن حر: رز 100، بطاطا 50، دجاج 100) بيّنت إنه النموذج يبالغ بالرز والبطاطا (نشويات منفوشة)
حتى بـSonnet، بس يقدّر اللحوم صح تقريباً. فـ:
1) تصحيح أولي للنشويات (رز/تمن/بطاطا/معكرونة/برغل/شعرية/خبز): ×0.7
2) تعلّم شخصي: لمن المستخدم يغيّر الغرامات قبل ما يضيف، نحفظ النسبة (اللي كتبها ÷ تقدير السيرفر) لكل أكلة،
   ونطبّقها بالمرات الجاية (متوسط متحرك، بين 0.3 و2). محفوظ بالجهاز بس (localStorage: hero_snap_cal)
3) شارة صغيرة «⚖️ معدّل حسب تصحيحاتك» على الأكلة اللي تعدّلت

الاستعمال:  python3 src90/apply90.py  ثم  python3 tools/release.py 90
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
if 'hero_snap_cal' in s: sys.exit('✗ نسخة 90 منطبقة من قبل')

sub1("""      return {name: f ? name : null, f, seen: it.seen, grams: Math.max(1, Math.round(it.grams)), conf: it.confidence, guess: g};
    });""",
"""      const k = f ? factor(name) : {x:1, mine:false};
      const grams = Math.max(1, Math.round(it.grams * k.x));
      return {name: f ? name : null, f, seen: it.seen, grams, est: grams, raw: it.grams, mine: k.mine, conf: it.confidence, guess: g};
    });""")

sub1("""  // أكلة ما إلها تطابق: نجرب الاسم كامل""",
"""  // ===== معايرة الكميات =====
  // النشويات المنفوشة (رز، بطاطا مكعبات...) النموذج يبالغ بيها بالتجربة، فنصغّرها بالبداية
  const STARCH = /رز|تمن|بطاط|معكرون|برغل|شعري|خبز|صمون|كسكس|rice|potato|pasta|bread/;
  const CAL_K = 'hero_snap_cal';
  function calMap(){ try{ return JSON.parse(localStorage.getItem(CAL_K) || '{}'); }catch(e){ return {}; } }
  function factor(name){
    const m = calMap()[name];
    if(m && m.n) return {x: m.r, mine: true};          // تعلّمناها من تصحيحات المستخدم
    return {x: STARCH.test(normAr(name)) ? 0.7 : 1, mine: false};
  }
  // لمن المستخدم يغيّر الغرامات، نتعلّم النسبة لهذي الأكلة (بالنسبة لتقدير السيرفر الخام)
  function learn(list){
    const m = calMap(); let changed = false;
    list.forEach(it=>{
      if(!it.raw || it.grams === it.est) return;
      const r = Math.min(2, Math.max(0.3, it.grams / it.raw)), o = m[it.name];
      m[it.name] = o && o.n ? {r: +(o.r * 0.5 + r * 0.5).toFixed(3), n: o.n + 1} : {r: +r.toFixed(3), n: 1};
      changed = true;
    });
    if(changed){ const keys = Object.keys(m); if(keys.length > 300) delete m[keys[0]]; try{ localStorage.setItem(CAL_K, JSON.stringify(m)); }catch(e){} }
  }
  // أكلة ما إلها تطابق: نجرب الاسم كامل""")

sub1("""  function toDraft(){
    const ok = items.filter(it=>it.f);""",
"""  function toDraft(){
    const ok = items.filter(it=>it.f);
    learn(ok);""")

# الشارة
sub1("""        <div class="snap-top"><div class="snap-name">${esc(dn(it.name))}${it.f.src === 'E' ? ' <small>(تقديري)</small>' : ''}</div>""",
"""        <div class="snap-top"><div class="snap-name">${esc(dn(it.name))}${it.f.src === 'E' ? ' <small>(تقديري)</small>' : ''}${it.mine ? '<div class="snap-sub">⚖️ معدّل حسب تصحيحاتك</div>' : ''}</div>""")

NEW = {'⚖️ معدّل حسب تصحيحاتك': '⚖️ Adjusted to your corrections'}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); en.update(NEW); json.dump(en, open(EN,'w',encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX,'w',encoding='utf-8').write(s)
print('✓ نسخة 90 انطبقت · المعايرة')
