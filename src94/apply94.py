"""هيرو · نسخة 94: الشكل الجديد

اختيارات حر (18 تشرين الثاني 2026)، بعد ما شاف التصميم «هيرو — شكل جديد (قبل وبعد)»:
1) لون واحد للتطبيق: لابيس (#1D4EA3) + ذهبي للأزرار المهمة، بدل لون لكل تبويب.
2) خلفية بتدرّج ناعم من اللابيس بأعلى الصفحة (نفسه بكل التبويبات).
3) زر «ضيف الأكل» صار دائرة ذهبية بنص الشريط السفلي، ويشتغل من أي تبويب.
4) تبويب «السجل» اندمج: الأيام السابقة من سهم/تاريخ «اليوم» وبطاقة «سجل الأيام السابقة» بـ«ملفي»،
   والنسخة الاحتياطية بـ«ملفي»، و«مسح كل البيانات» بآخر «ملفي» بنص أحمر صغير.
5) «اليوم»: الوجبات قبل الماي، الماي أصغر وأكوابه تنضغط، وشاشة فاضية بيها هيرو وزرين (صوّر صحنك / ابحث).
6) «تمريني»: صورة المدرب (media/coach-m.webp و coach-f.webp، مأخوذة من المدرب ثلاثي الأبعاد نفسه) بصدر الصفحة.
7) جملة «بياناتك محفوظة…» بس بـ«ملفي». تاريخ الوزن: «اليوم» وينضغط للتغيير. تحية بالهيدر.
8) حركات خفيفة: الحلقة والخطوط تتعبى بنعومة، الكوب «ينط» من يتعبى، الأزرار تصغر من تنضغط.

الاستعمال:  python3 src94/apply94.py  ثم  python3 tools/release.py 94
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
def cut(start, end):
    """يقص من start لحد end (end داخل المقصوص) ويرجعه"""
    global s
    i = s.find(start); j = s.find(end, i)
    if i < 0 or j < 0 or s.count(start) != 1: sys.exit('✗ ما لكيت المقطع: ' + start[:80])
    j += len(end); part = s[i:j]; s = s[:i] + s[j:]; return part
if 'v94: شكل موحّد' in s: sys.exit('✗ نسخة 94 منطبقة من قبل')

# ---------- 1+2+8) CSS ----------
CSS = r"""
/* ============ v94: شكل موحّد (لابيس + ذهبي) ============ */
:root{--t-food:#1d4ea3; --t-train:#1d4ea3; --t-weight:#1d4ea3; --t-lib:#1d4ea3; --t-hist:#1d4ea3; --t-prof:#1d4ea3; --hero-gold:#c4952f; --hero-gold-ink:#1a1405;}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --t-food:#7fa6f2; --t-train:#7fa6f2; --t-weight:#7fa6f2; --t-lib:#7fa6f2; --t-hist:#7fa6f2; --t-prof:#7fa6f2; --hero-gold:#e2b659; } }
:root[data-theme="dark"]{ --t-food:#7fa6f2; --t-train:#7fa6f2; --t-weight:#7fa6f2; --t-lib:#7fa6f2; --t-hist:#7fa6f2; --t-prof:#7fa6f2; --hero-gold:#e2b659; }
.hero-food, .hero-train, .hero-weight, .hero-prof{--hero-a:#2759b8; --hero-b:#12306d; --hero-accent:#f0c14b;}
.hero-train button.primary, .card.hero button.primary{background:var(--hero-gold); color:var(--hero-gold-ink);}
.card.hero .ghost{background:transparent; color:#fff; border-color:rgba(255,255,255,.45);}
body{background:linear-gradient(180deg, color-mix(in srgb, var(--page-tone) 17%, var(--bg)) 0, var(--bg) 380px) no-repeat, var(--bg);}
/* زر «ضيف الأكل» الذهبي بنص الشريط */
.bottomnav-in{grid-template-columns:repeat(5,1fr);}
.nav-gap{pointer-events:none;}
#fab.fab{left:50%; right:auto; transform:translateX(-50%); bottom:calc(env(safe-area-inset-bottom,0px) + var(--nav-h) - 36px); width:64px; height:64px; padding:0; gap:0;
  border-radius:50%; justify-content:center; background:var(--hero-gold); color:var(--hero-gold-ink); border:5px solid var(--card);
  box-shadow:0 6px 18px rgba(20,26,43,.24); z-index:32; transition:transform .14s ease;}
#fab.fab > span:not(.fab-badge){display:none;}
#fab.fab svg{width:26px; height:26px; stroke-width:2.8;}
#fab.fab .fab-badge{position:absolute; top:-6px; right:-6px; background:#1d4ea3; color:#fff;}
#fab.fab:active{transform:translateX(-50%) scale(.9);}
#fab.fab[hidden], body.sheet-open #fab.fab{display:none;}
/* الهيدر يصير له خلفية من تنزل */
.appbar.scrolled{background:color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); box-shadow:0 1px 0 var(--line);}
#hist-card, #backup-card{scroll-margin-top:96px;}
/* جملة الحفظ بس بـ«ملفي» */
body:not([data-tab="profile"]) #cloud-status{display:none;}
/* «اليوم»: ماي أصغر */
#water-card{padding-top:14px; padding-bottom:12px;}
#water-card .cups{cursor:pointer; margin:6px 0 8px;}
#water-card .cups svg{width:20px; height:24px;}
#water-card .btn-row{gap:6px; margin-top:4px;}
#water-card .btn-row .ghost{padding:8px 10px; font-size:13px; min-height:40px;}
#water-card #water-note{margin-top:6px;}
@keyframes cupPop{0%{transform:scale(1)}45%{transform:scale(1.28)}100%{transform:scale(1)}}
.cups svg.pop{animation:cupPop .42s ease; transform-origin:50% 80%;}
.cups .cup-f{transition:fill .3s;}
/* شاشة الوجبات الفاضية */
.meal-empty{display:flex; align-items:center; gap:14px; background:color-mix(in srgb, var(--t-food) 7%, var(--card)); border-radius:16px; padding:12px 14px;}
.meal-empty img{width:64px; height:64px; border-radius:50%; object-fit:cover; object-position:50% 18%; background:#eef1f6; flex:0 0 auto;}
.meal-empty b{display:block; font-size:15px;}
.meal-empty span{font-size:13px; color:var(--sub);}
.me-btns{display:grid !important; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;}
.me-btns button{display:flex; align-items:center; justify-content:center; gap:7px; min-height:46px; font-weight:700;}
.me-btns svg{width:18px; height:18px; stroke:currentColor; stroke-width:2; fill:none; stroke-linecap:round; stroke-linejoin:round;}
.me-btns .gold{background:var(--hero-gold); color:var(--hero-gold-ink); border:none; border-radius:12px; font:inherit; font-weight:700;}
/* «تمريني»: المدرب بصدر الصفحة */
.tr-coach{margin:-4px -4px 6px; border-radius:16px; overflow:hidden; background:#eef1f6; aspect-ratio:540/410;}
.tr-coach img{display:block; width:100%; height:100%; object-fit:cover;}
.tr-hero.card.hero h3{color:#fff;}
/* «ملفي»: مسح البيانات */
.danger-card{background:transparent; box-shadow:none; border:1px dashed color-mix(in srgb, var(--bad) 40%, var(--line)); text-align:center;}
.link-danger{background:none; border:none; color:var(--bad); font:inherit; font-weight:700; font-size:14px; padding:8px 12px; cursor:pointer;}
/* تاريخ الوزن */
.wd-pick{height:46px; justify-content:flex-start; padding:0 12px; font-weight:600; box-shadow:none; border:1px solid var(--line); background:var(--card-2);}
/* حركات خفيفة */
.ring .prog{transition:stroke-dasharray .9s cubic-bezier(.2,.8,.2,1);}
.bar > div{transition:width .9s cubic-bezier(.2,.8,.2,1);}
button.primary, button.ghost, .me-btns button{transition:transform .12s ease, background .2s, opacity .2s;}
button.primary:active, button.ghost:active, .me-btns button:active{transform:scale(.96);}
@media (prefers-reduced-motion: reduce){ .ring .prog, .bar > div, .cups svg.pop{transition:none; animation:none;} }
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

# ---------- 3) الشريط والزر ----------
sub1('<button id="fab" class="fab" onclick="openSheet()" aria-label="ضيف الأكل">', '<button id="fab" class="fab" onclick="fabGo()" aria-label="ضيف الأكل">')
hist_btn = re.search(r'\n    <button class="tab" data-tab="history">.*?</button>', s).group(0)
s = s.replace(hist_btn, '')
sub1('<span>تمريني</span></button>\n', '<span>تمريني</span></button>\n    <span class="nav-gap" aria-hidden="true"></span>\n')
sub1("  document.getElementById('fab').hidden = name!=='today';\n",
     "  if(name==='history'){ name = 'profile'; setTimeout(()=>{ const c = document.getElementById('hist-card'); if(c) c.scrollIntoView({behavior:'smooth', block:'start'}); }, 80); }   // نسخة 94: «السجل» صار بـ«ملفي»\n  document.getElementById('fab').hidden = false;\n")
sub1("  if(name==='profile') fillProfileForm();", "  if(name==='profile'){ fillProfileForm(); renderHistory(); }")
sub1("function switchTab(name){", """addEventListener('scroll', ()=>{ const a = document.querySelector('.appbar'); if(a) a.classList.toggle('scrolled', scrollY > 6); }, {passive:true});
function fabGo(){
  const t = document.body.dataset.tab;
  if(t && t!=='today' && t!=='products') switchTab('today');
  openSheet();
}
function switchTab(name){""")

# ---------- 4) «السجل» ينتقل لـ«ملفي» ----------
hist = cut('  <!-- HISTORY TAB -->\n  <div id="tab-history" class="hidden">\n', '      <button class="ghost" onclick="resetAll()">مسح كل البيانات</button>\n    </div>\n  </div>\n')
s = s.replace('  <!-- PRODUCTS TAB (library) -->', '  <!-- HISTORY TAB: من نسخة 94 بطاقاته بـ«ملفي» -->\n  <div id="tab-history" class="hidden"></div>\n\n  <!-- PRODUCTS TAB (library) -->', 1)
cards = hist.split('    <div class="card">\n')
# cards[0] = رأس التبويب، [1] السجل، [2] النسخة الاحتياطية، [3] المسح
if len(cards) != 4: sys.exit('✗ شكل تبويب السجل تغيّر')
hist_card = '    <div class="card" id="hist-card">\n' + cards[1].rstrip() + '\n'
backup_card = '    <div class="card" id="backup-card">\n' + cards[2].rstrip() + '\n'
sub1('    <div class="card">\n      <h2>تنبيه صحي</h2>', hist_card + '\n' + backup_card + '\n    <div class="card">\n      <h2>تنبيه صحي</h2>')
sub1('''      </div>
    </details>
  </div>

  <!-- WEIGHT TAB -->''', '''      </div>
    </details>

    <div class="card danger-card">
      <button type="button" class="link-danger" onclick="resetAll()">مسح كل البيانات</button>
    </div>
  </div>

  <!-- WEIGHT TAB -->''')
sub1(""": 'بياناتك محفوظة بهذا الجهاز بس. نزّل نسخة احتياطية من "السجل".';""", """: 'بياناتك محفوظة بهذا الجهاز بس. نزّل نسخة احتياطية من «ملفي».';""")

# ---------- 5) «اليوم»: الوجبات قبل الماي ----------
water = cut('    <section class="card" id="water-card" aria-label="الماي">\n', '      <div class="goal-note" id="water-note"></div>\n    </section>\n')
sub1('    <section class="card" id="week-card" aria-label="آخر 7 أيام">', water + '\n    <section class="card" id="week-card" aria-label="آخر 7 أيام">')
sub1('<div class="cups" id="water-cups" aria-hidden="true"></div>', '<div class="cups" id="water-cups" aria-hidden="true" onclick="addWater(250)"></div>')
sub1("""  document.getElementById('water-cups').innerHTML = Array.from({length:n}, (_,i)=>
    `<svg viewBox="0 0 20 24" class="${i<full?'full':''}">""",
"""  const pop = renderWater.last && renderWater.last.k === k && full > renderWater.last.full ? full - 1 : -1;   // الكوب اللي هسه تعبى «ينط»
  renderWater.last = {k, full};
  document.getElementById('water-cups').innerHTML = Array.from({length:n}, (_,i)=>
    `<svg viewBox="0 0 20 24" class="${i<full?'full':''}${i===pop?' pop':''}">""")

# الشاشة الفاضية
sub1("""  if(!meals.length){ list.innerHTML = '<div class="empty">لا توجد وجبات بعد</div>'; return; }""",
"""  if(!meals.length){
    if(key !== todayKey()){ list.innerHTML = '<div class="empty">لا توجد وجبات بهذا اليوم</div>'; return; }
    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm';
    list.innerHTML = `<div class="meal-empty"><img src="media/coach-${sx}.webp" alt="" loading="lazy"><div><b>يلا نسجّل أول وجبة</b><span>صوّر صحنك أو دوّر على الأكلة باسمها.</span></div></div>
      <div class="btn-row me-btns"><button type="button" class="gold" onclick="SNAP.open()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>صوّر صحنك</span></button>
      <button type="button" class="ghost" onclick="openSheet()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><span>ابحث عن أكلة</span></button></div>`;
    return;
  }""")

# ---------- 6) «تمريني» ----------
sub1("""    root.innerHTML = `<div class="card tr-hero">
      <h3>تمريني</h3>""", """    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm';
    root.innerHTML = `<div class="card hero hero-train tr-hero">
      <div class="tr-coach"><img src="media/coach-${sx}.webp" alt="هيرو يسوي سكوات"></div>
      <h3>تمريني</h3>""")

# ---------- 7) تاريخ الوزن + التحية ----------
sub1('<div class="field"><label>التاريخ</label><input type="date" id="in-weight-date"></div>',
     '<div class="field"><label for="in-weight-date">التاريخ</label><label class="day-pick wd-pick"><span id="wd-label">اليوم</span><input type="date" id="in-weight-date" onchange="wdSync()" onclick="try{this.showPicker()}catch(e){}"></label></div>')
sub1("document.getElementById('in-weight-date').max = todayKey();",
     """document.getElementById('in-weight-date').max = todayKey();
function wdSync(){
  const el = document.getElementById('in-weight-date'), lb = document.getElementById('wd-label'); if(!el || !lb) return;
  const v = el.value, en = !!(window.I18N && I18N.en);
  if(!v || v === todayKey()){ lb.textContent = en ? 'Today' : 'اليوم'; return; }
  const [y, m, d] = v.split('-').map(Number);
  lb.textContent = new Date(y, m - 1, d).toLocaleDateString(en ? 'en-GB' : 'ar-IQ', {weekday:'short', day:'numeric', month:'long'});
}
wdSync();""")
# بعد تسجيل الوزن يرجع «اليوم»
s_add = s.find("  let d = document.getElementById('in-weight-date').value;")
if s_add < 0: sys.exit('✗ addWeight')

def greet_line(expr):
    return f"document.getElementById('hdr-sub').textContent = hdrLine({expr});"
sub1("  document.getElementById('hdr-sub').textContent = [p.name, GOALS[p.goal].label].filter(Boolean).join(' · ');", "  " + greet_line("p.name, GOALS[p.goal].label"))
sub1("  document.getElementById('hdr-sub').textContent = [p.name, GOALS.track.label].filter(Boolean).join(' · ');", "  " + greet_line("p.name, GOALS.track.label"))
sub1("function fabGo(){", """function hdrLine(name, goal){   // نسخة 94: تحية حسب الوقت
  const en = !!(window.I18N && I18N.en), h = new Date().getHours(), morning = h >= 4 && h < 12;
  const g = en ? (morning ? 'Good morning' : 'Good evening') : (morning ? 'صباح الخير' : 'مساء الخير');
  const hi = name ? (en ? `${g}, ${name}` : `${g} يا ${name}`) : g;
  const gl = goal ? (en && I18N.t ? I18N.t(goal) : goal) : '';
  return [hi, gl].filter(Boolean).join(' · ');
}
function fabGo(){""")

# ---------- الترجمة ----------
NEW = {'يلا نسجّل أول وجبة': "Let's log your first meal", 'صوّر صحنك أو دوّر على الأكلة باسمها.': 'Snap your plate or search for the food by name.',
       'ابحث عن أكلة': 'Search for a food', 'صوّر صحنك': 'Snap your plate', 'لا توجد وجبات بهذا اليوم': 'No meals on this day',
       'هيرو يسوي سكوات': 'Hero doing a squat', 'بياناتك محفوظة بهذا الجهاز بس. نزّل نسخة احتياطية من «ملفي».': 'Your data is saved on this device only. Download a backup from “Profile”.',
       'اليوم': 'Today'}
mD = re.search(r'const D = \{', s)
head = s[mD.end():mD.end()+600000]
add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False) + ':') not in head)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)

# صور المدرب تنحفظ للاستعمال بدون نت
w = open(SW, encoding='utf-8').read()
if 'media/coach-m.webp' not in w:
    w = w.replace('"privacy.html", "terms.html"]', '"privacy.html", "terms.html", "media/coach-m.webp", "media/coach-f.webp"]', 1)
    if 'media/coach-m.webp' not in w: sys.exit('✗ sw.js CORE')
    open(SW, 'w', encoding='utf-8').write(w)
print('✓ نسخة 94 انطبقت')
