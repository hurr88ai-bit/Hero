"""هيرو · نسخة 96: اختيار الشكل (تلقائي / فاتح / ليلي) بـ«ملفي»

طلب حر (18 تشرين الثاني 2026). الاختيار ينحفظ بالجهاز (hero_theme) وينطبق قبل ما تنرسم الصفحة حتى ما «يرمش».
تلقائي = حسب إعداد الموبايل (مثل قبل).

الاستعمال:  python3 src96/apply96.py  ثم  python3 tools/release.py 96
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'hero_theme' in s: sys.exit('✗ نسخة 96 منطبقة من قبل')

# يطبق الاختيار بأول الصفحة
sub1('<meta name="theme-color" content="#f2f4f9" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0d1220" media="(prefers-color-scheme: dark)">',
'''<meta name="theme-color" content="#f2f4f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1220" media="(prefers-color-scheme: dark)">
<script>/* v96: الشكل (تلقائي/فاتح/ليلي) */
(function(){
  function apply(t){
    var r = document.documentElement;
    if(t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){ m.setAttribute('content', dark ? '#0d1220' : '#f2f4f9'); if(t === 'light' || t === 'dark') m.removeAttribute('media'); });
  }
  var t = 'auto'; try{ t = localStorage.getItem('hero_theme') || 'auto'; }catch(e){}
  apply(t);
  window.heroTheme = function(v){
    try{ localStorage.setItem('hero_theme', v); }catch(e){}
    apply(v);
    document.querySelectorAll('.theme-pick button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.t === v)); });
  };
  window.heroThemeNow = function(){ var v = 'auto'; try{ v = localStorage.getItem('hero_theme') || 'auto'; }catch(e){} return v; };
})();
</script>''')

CSS = """
/* ============ v96: اختيار الشكل ============ */
.theme-pick{display:grid; grid-template-columns:repeat(3,1fr); gap:4px; background:var(--card-2); border-radius:14px; padding:4px; margin-top:6px;}
.theme-pick button{border:0; background:none; border-radius:11px; padding:10px 6px; font:700 14px var(--f-body); color:var(--sub); display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; min-height:44px;}
.theme-pick button svg{width:18px; height:18px; stroke:currentColor; stroke-width:2; fill:none; stroke-linecap:round; stroke-linejoin:round;}
.theme-pick button[aria-pressed="true"]{background:var(--t-food); color:#fff;}
:root[data-theme="dark"] .theme-pick button[aria-pressed="true"]{color:#0b1020;}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .theme-pick button[aria-pressed="true"]{color:#0b1020;} }
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

CARD = '''    <div class="card theme-card">
      <h2>الشكل</h2>
      <div class="theme-pick" role="group" aria-label="الشكل">
        <button type="button" data-t="auto" aria-pressed="false" onclick="heroTheme('auto')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg><span>تلقائي</span></button>
        <button type="button" data-t="light" aria-pressed="false" onclick="heroTheme('light')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span>فاتح</span></button>
        <button type="button" data-t="dark" aria-pressed="false" onclick="heroTheme('dark')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><span>ليلي</span></button>
      </div>
      <div class="goal-note">تلقائي: يمشي ويا إعداد موبايلك.</div>
    </div>

'''
sub1('    <div class="card lang-card">', CARD + '    <div class="card lang-card">')
sub1("  if(name==='profile'){ fillProfileForm(); renderHistory(); }",
     "  if(name==='profile'){ fillProfileForm(); renderHistory(); if(window.heroTheme) heroTheme(heroThemeNow()); }")

NEW = {'الشكل': 'Appearance', 'تلقائي': 'Auto', 'فاتح': 'Light', 'ليلي': 'Dark', 'تلقائي: يمشي ويا إعداد موبايلك.': 'Auto follows your phone’s setting.'}
mD = re.search(r'const D = \{', s); head = s[mD.end():mD.end()+700000]
add = ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in head)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 96 انطبقت')
