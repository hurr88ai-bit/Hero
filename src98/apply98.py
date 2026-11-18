"""هيرو · نسخة 98: بطاقة المشاركة + وجباتي (المفضلة) بضغطة

طلب حر (18 تشرين الثاني 2026):
1) «شارك إنجازك»: صورة ستوري 1080×1920 (لابيس + زخرفة مسمارية + هيرو + المدرب + @heroapp.iq)
   لـ: كأس جديد (نافذة الكأس)، السلسلة والمستوى (طريق البطل)، والوزن (تبويب الوزن).
   تنعرض أول بمعاينة، وزر «شارك» يفتح مشاركة الموبايل (انستغرام، واتساب…) أو ينزّل الصورة.
2) وجباتي بضغطة: صف «⭐ وجباتي» بأول ورقة «ضيف أكل» وبشاشة اليوم الفاضية، الضغطة تسجّل الوجبة مباشرة.
   و«حفظ كجاهزة» صار «⭐ احفظها بوجباتي».

الاستعمال:  python3 src98/apply98.py  ثم  python3 tools/release.py 98
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
if 'function shareOpen' in s: sys.exit('✗ نسخة 98 منطبقة من قبل')

CSS = """
/* ============ v98: المشاركة + وجباتي ============ */
.share-prev{display:block; width:100%; max-width:300px; margin:0 auto 14px; border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,.3); aspect-ratio:9/16; background:#13233f; object-fit:cover;}
.share-btns{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
.share-btns button{min-height:48px; font-weight:700;}
.share-btns .gold{background:var(--hero-gold); color:var(--hero-gold-ink); border:none; border-radius:12px; font:inherit; font-weight:700;}
.share-mini{display:inline-flex; align-items:center; gap:6px; margin-top:10px; background:rgba(255,255,255,.14); color:#fff; border:none; border-radius:999px; padding:8px 14px; font:700 13px var(--f-body); cursor:pointer;}
.share-mini svg, .share-btns svg{width:16px; height:16px; stroke:currentColor; stroke-width:2.2; fill:none; stroke-linecap:round; stroke-linejoin:round;}
.fav-row{margin:2px 0 12px;}
.fav-h{font-size:13px; font-weight:700; color:var(--sub); margin-bottom:6px;}
.fav-chips{display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none;}
.fav-chips::-webkit-scrollbar{display:none;}
.fav-chip{flex:0 0 auto; display:flex; flex-direction:column; align-items:flex-start; gap:1px; border:1px solid var(--line); background:var(--card-2); color:var(--ink); border-radius:14px; padding:8px 12px; font:600 14px var(--f-body); cursor:pointer; transition:transform .12s;}
.fav-chip:active{transform:scale(.95);}
.fav-chip small{font-size:11.5px; color:var(--sub); font-weight:600;}
.meal-empty-fav{margin-top:12px;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'

JS = r"""
// ================= v98: بطاقة المشاركة =================
const SHARE = {blob:null, url:null, name:'hero.png', text:''};
function shareEn(){ return !!(window.I18N && I18N.en); }
function shareData(kind, extra){
  const en = shareEn(), f = achFem(), st = achStats(), lv = achLevel(st.xp);
  if(kind === 'trophy'){
    const a = achItem(extra); if(!a) return null;
    return {ic:a.ic, big:'', title: en ? 'New trophy!' : (f ? 'كسبت كأس جديد!' : 'كسبت كأس جديد!'), name: en && I18N.t ? I18N.t(a.n) : a.n, sub: en && I18N.t ? I18N.t(a.d) : a.d};
  }
  if(kind === 'weight'){
    const W = data.weights || []; if(W.length < 2) return null;
    const d = +(W[W.length-1].w - W[0].w).toFixed(1), down = d < 0;
    return {ic:'⚖️', big: String(Math.abs(d)),
      title: en ? (down ? 'kg down' : 'kg up') : (down ? 'كغم نزّلتها' : 'كغم زوّدتها'),
      name: en ? `since ${W[0].date.split('-').reverse().slice(0,2).join('/')}` : `من ${dayName(W[0].date)}`,
      sub: en ? `Now ${W[W.length-1].w} kg` : `هسه ${W[W.length-1].w} كغم`};
  }
  // السلسلة والمستوى
  return {ic:'🔥', big: String(st.streak || st.bestStreak || 0), title: en ? 'days in a row' : 'يوم ورا بعض',
    name: en && I18N.t ? I18N.t(lv.name) : lv.name, sub: en ? `Level ${lv.i+1} · ${st.xp} pts` : `المستوى ${lv.i+1} · ${st.xp} نقطة`};
}
async function shareDraw(d){
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), en = shareEn();
  try{ await Promise.all(['40px HeroCun', '40px Lalezar', '700 40px "IBM Plex Sans Arabic"', '500 40px "IBM Plex Sans Arabic"'].map(f=>document.fonts.load(f, f.includes('HeroCun') ? '\u{12049}' : 'هيرو'))); }catch(e){}
  const g = x.createRadialGradient(W/2, H*.36, 60, W/2, H*.36, H*.8); g.addColorStop(0, '#244273'); g.addColorStop(1, '#0f1c34');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // أسطر اللوح المسماري
  const PH = '\u{12049} \u{1213F}\u{12328} \u{1230B}\u{12326} \u{1212D}\u{12292}';
  x.save(); x.direction = 'ltr'; x.textAlign = 'left'; x.font = '44px HeroCun';
  for(let r = 0; r < 9; r++){
    const y = 90 + r * 84, a = Math.max(0, .26 - r * .028);
    x.fillStyle = `rgba(226,182,89,${a})`; x.fillText((PH + '  ').repeat(6), r % 2 ? -140 : -20, y);
    x.fillStyle = `rgba(226,182,89,${a * .45})`; x.fillRect(0, y + 26, W, 2);
  }
  x.restore();
  x.textAlign = 'center'; x.direction = 'rtl';
  // الشعار
  x.fillStyle = '#ffc94d'; x.font = '150px Lalezar'; x.fillText('هيرو', W/2, 330);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.font = '700 40px "IBM Plex Sans Arabic"'; x.save(); x.direction = 'ltr'; x.letterSpacing = '14px'; x.fillText('HERO', W/2 + 7, 400); x.restore();
  // الإنجاز
  const name = data.profile && data.profile.name ? data.profile.name : '';
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '500 46px "IBM Plex Sans Arabic"';
  if(name) x.fillText(name, W/2, 560);
  x.font = '160px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(d.ic, W/2, d.big ? 760 : 820);
  if(d.big){ x.fillStyle = '#ffffff'; let fs = 210; x.font = `700 ${fs}px "IBM Plex Sans Arabic"`; while(x.measureText(d.big).width > 900 && fs > 90){ fs -= 10; x.font = `700 ${fs}px "IBM Plex Sans Arabic"`; } x.save(); x.direction = 'ltr'; x.fillText(d.big, W/2, 1000); x.restore();
    x.fillStyle = '#ffc94d'; x.font = '700 64px "IBM Plex Sans Arabic"'; x.fillText(d.title, W/2, 1100); }
  else { x.fillStyle = '#ffc94d'; x.font = '700 64px "IBM Plex Sans Arabic"'; x.fillText(d.title, W/2, 990); }
  x.fillStyle = '#ffffff'; x.font = '700 58px "IBM Plex Sans Arabic"'; x.fillText(d.name, W/2, d.big ? 1200 : 1090);
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '500 42px "IBM Plex Sans Arabic"'; x.fillText(d.sub, W/2, d.big ? 1270 : 1160);
  // المدرب
  try{
    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm', img = new Image(); img.src = `media/coach-${sx}.webp`;
    await img.decode();
    const cw = 420, ch = Math.round(cw * img.height / img.width), cx = W/2 - cw/2, cy = 1340;
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(cx, cy, cw, ch, 36) : x.rect(cx, cy, cw, ch); x.clip(); x.drawImage(img, cx, cy, cw, ch); x.restore();
  }catch(e){}
  // التوقيع
  x.fillStyle = '#ffb14a'; x.save(); x.direction = 'ltr'; x.font = '800 44px Poppins, "IBM Plex Sans Arabic", sans-serif'; x.letterSpacing = '8px'; x.fillText('BE YOUR OWN HERO', W/2 + 4, 1740); x.restore();
  x.fillStyle = 'rgba(255,177,74,.85)'; x.save(); x.direction = 'ltr'; x.font = '48px HeroCun'; x.fillText(PH, W/2, 1810); x.restore();
  x.fillStyle = 'rgba(255,255,255,.8)'; x.save(); x.direction = 'ltr'; x.font = '700 40px "IBM Plex Sans Arabic"'; x.fillText('@heroapp.iq', W/2, 1880); x.restore();
  return await new Promise(r=>c.toBlob(r, 'image/png'));
}
async function shareOpen(kind, extra){
  const d = shareData(kind, extra);
  if(!d){ notify(kind==='weight' ? 'سجّل وزنك مرتين على الأقل حتى نسوي بطاقة' : 'ما لكينا شي نشاركه بعد'); return; }
  trOpenSheet('شارك إنجازك', `<img class="share-prev" id="share-prev" alt="بطاقة الإنجاز"><div class="share-btns">
    <button type="button" class="gold" id="share-go" onclick="shareGo()" disabled>${'""" + SHARE_ICON.replace("'", "\\'") + r"""'}<span>شارك</span></button>
    <button type="button" class="ghost" onclick="shareSave()">نزّل الصورة</button></div>
    <div class="goal-note" style="text-align:center;">حطها ستوري وتاگ <b dir="ltr">@heroapp.iq</b> 💛</div>`, true);
  SHARE.blob = await shareDraw(d); if(SHARE.url) URL.revokeObjectURL(SHARE.url);
  SHARE.url = URL.createObjectURL(SHARE.blob); SHARE.name = `hero-${kind}.png`;
  SHARE.text = shareEn() ? 'BE YOUR OWN HERO 💪 @heroapp.iq' : 'BE YOUR OWN HERO 💪 تابعوا @heroapp.iq';
  const im = document.getElementById('share-prev'); if(im) im.src = SHARE.url;
  const b = document.getElementById('share-go'); if(b) b.disabled = false;
}
async function shareGo(){
  if(!SHARE.blob) return;
  const file = new File([SHARE.blob], SHARE.name, {type:'image/png'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], text:SHARE.text}); return; }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  shareSave();
}
function shareSave(){
  if(!SHARE.url) return;
  const a = document.createElement('a'); a.href = SHARE.url; a.download = SHARE.name; document.body.appendChild(a); a.click(); a.remove();
  notify('انحفظت الصورة. إذا ما نزلت، اضغط مطوّل على الصورة واختار «حفظ»');
}
// ================= v98: وجباتي بضغطة =================
function favChips(){
  const sm = data.savedMeals || []; if(!sm.length) return '';
  return sm.slice().reverse().slice(0, 12).map(m=>`<button type="button" class="fav-chip" onclick="favLog('${m.id}')"><span>${esc(m.name)}</span><small>${Math.round(sumItems(m.items).cal)} سعرة</small></button>`).join('');
}
function renderFavRow(){
  const row = document.getElementById('fav-row'); if(!row) return;
  const h = favChips(); row.hidden = !h; document.getElementById('fav-chips').innerHTML = h;
}
function favLog(id){ closeSheet(); quickLog(id); }
"""
sub1("// ================= saved meals =================", JS + "\n// ================= saved meals =================")

# أزرار المشاركة
sub1("""    <div class="btns"><button class="ghost" onclick="achPopClose()">تمام</button><button class="primary" onclick="achPopClose(); achOpen();">شوف طريقي</button></div></div>`;""",
     """    <div class="btns"><button class="ghost" onclick="achPopClose()">تمام</button><button class="primary" onclick="achPopClose(); achOpen();">شوف طريقي</button></div>
    ${one ? `<button type="button" class="ghost" style="width:100%; margin-top:8px;" onclick="achPopClose(); shareOpen('trophy','${one.id}')">📤 <span>شارك الكأس</span></button>` : ''}</div>`;""")
sub1("""    <div class="ach-lv"><div class="k">المستوى ${lv.i+1} من ${ACH_LEVELS.length}</div><div class="nm">${esc(lv.name)}</div>""",
     """    <div class="ach-lv"><div class="k">المستوى ${lv.i+1} من ${ACH_LEVELS.length}</div><div class="nm">${esc(lv.name)}</div>
      <button type="button" class="share-mini" onclick="shareOpen('streak')">""" + SHARE_ICON + """<span>شارك طريقي</span></button>""")
sub1("""      <div class="goal-note" id="weight-rate"></div>
    </div>""", """      <div class="goal-note" id="weight-rate"></div>
      <button type="button" class="share-mini" id="weight-share" hidden onclick="shareOpen('weight')">""" + SHARE_ICON + """<span>شارك تقدّمك</span></button>
    </div>""")
sub1("""  document.getElementById('weight-change').textContent = (diff>0?'+':'')+diff+' كغم';""",
     """  document.getElementById('weight-change').textContent = (diff>0?'+':'')+diff+' كغم';
  document.getElementById('weight-share').hidden = data.weights.length < 2;""")

# وجباتي بالورقة
sub1("""    <button type="button" class="snap-btn" onclick="SNAP.open()">📸 صوّر صحنك <small>وهيرو يحسب السعرات</small></button>""",
     """    <button type="button" class="snap-btn" onclick="SNAP.open()">📸 صوّر صحنك <small>وهيرو يحسب السعرات</small></button>
    <div class="fav-row" id="fav-row" hidden><div class="fav-h">⭐ وجباتي · ضغطة وحدة وتنسجل</div><div class="fav-chips" id="fav-chips"></div></div>""")
sub1("""  document.getElementById('sheet').hidden = false;
  document.getElementById('sheet-backdrop').hidden = false;""", """  renderFavRow();
  document.getElementById('sheet').hidden = false;
  document.getElementById('sheet-backdrop').hidden = false;""")
sub1("""      <button type="button" class="ghost" onclick="openSheet()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><span>ابحث عن أكلة</span></button></div>`;""",
     """      <button type="button" class="ghost" onclick="openSheet()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><span>ابحث عن أكلة</span></button></div>
      ${favChips() ? `<div class="fav-row meal-empty-fav"><div class="fav-h">⭐ وجباتي · ضغطة وحدة وتنسجل</div><div class="fav-chips">${favChips()}</div></div>` : ''}`;""")
sub1("""<button class="ghost" onclick="saveLoggedAsSaved('${key}', ${i})">حفظ كجاهزة</button>""",
     """<button class="ghost" onclick="saveLoggedAsSaved('${key}', ${i})">⭐ احفظها بوجباتي</button>""")
sub1("""  save(); renderSavedMeals(); renderQuick();
  notify(`"${name}" صارت وجبة جاهزة ✅ تلگاها بـ«وجباتي»`);""", """  save(); renderSavedMeals(); renderQuick(); renderFavRow(); if(typeof renderToday==='function') renderToday();
  notify(`"${name}" انحفظت بـ«وجباتي» ⭐ تلگاها بأول «ضيف أكل»`);""")

NEW = {'شارك إنجازك':'Share your win','شارك':'Share','نزّل الصورة':'Save image','شارك الكأس':'Share trophy','شارك طريقي':'Share my journey','شارك تقدّمك':'Share progress',
  'بطاقة الإنجاز':'Achievement card','⭐ وجباتي · ضغطة وحدة وتنسجل':'⭐ My meals · one tap to log','⭐ احفظها بوجباتي':'⭐ Save to My meals',
  'كسبت كأس جديد!':'New trophy!','يوم ورا بعض':'days in a row','كغم نزّلتها':'kg down','كغم زوّدتها':'kg up',
  'انحفظت الصورة. إذا ما نزلت، اضغط مطوّل على الصورة واختار «حفظ»':'Image saved. If it didn’t download, long-press the image and choose “Save”.',
  'سجّل وزنك مرتين على الأقل حتى نسوي بطاقة':'Log your weight at least twice to make a card','ما لكينا شي نشاركه بعد':'Nothing to share yet'}
mD = re.search(r'const D = \{', s); head = s[mD.end():mD.end()+800000]
s = s[:mD.end()] + ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in head) + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 98 انطبقت')
