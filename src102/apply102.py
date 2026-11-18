"""هيرو · نسخة 102: صور التقدّم + النوم + ملخص الأسبوع

- صور التقدّم بتبويب «وزني»: تنحفظ بموبايلك بس (IndexedDB)، ما تنرسل ولا تدخل بالنسخة الاحتياطية. قبل وبعد.
- النوم: بطاقة باليوم بعد الماي، ساعات بضغطة، معدل 7 أيام ونصيحة.
- ملخص الأسبوع: زر ببطاقة «آخر 7 أيام» + تنبيه بالجمعة والسبت.

الاستعمال:  python3 src102/apply102.py  ثم  python3 tools/release.py 102
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json'); PRIV = os.path.join(ROOT, 'privacy.html')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'id="sleep-card"' in s: sys.exit('✗ نسخة 102 منطبقة من قبل')

CSS = r"""
/* ============ v102: النوم + صور التقدّم + ملخص الأسبوع ============ */
.d-sleep{background:#7b6cf6;}
.sl-q{margin:8px 0 8px; font-size:13px; color:var(--muted);}
.sl-chips{display:flex; flex-wrap:wrap; gap:6px;}
.sl-chips button{flex:1 0 calc(20% - 6px); min-width:0; border:1px solid var(--line); background:var(--card-2); color:var(--ink); border-radius:12px; padding:9px 0; font-weight:700; font-size:14px; font-variant-numeric:tabular-nums; cursor:pointer;}
.sl-chips button.on{background:#7b6cf6; border-color:#7b6cf6; color:#fff;}
.sl-week{display:flex; align-items:flex-end; gap:6px; height:64px; margin-top:12px;}
.sl-week div{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:3px;}
.sl-week i{display:block; width:100%; max-width:26px; border-radius:6px 6px 3px 3px; background:color-mix(in srgb, #7b6cf6 70%, transparent);}
.sl-week i.lo{background:color-mix(in srgb, var(--hero-gold, #c4952f) 80%, transparent);}
.sl-week i.none{background:var(--line); height:3px !important;}
.sl-week small{font-size:10px; color:var(--muted);}
.sl-week div.cur small{color:var(--ink); font-weight:800;}
.wk-sumbtn{width:100%; margin-top:10px;}
.wk-banner{display:flex; align-items:center; gap:10px; background:linear-gradient(135deg, color-mix(in srgb, var(--t-1, #1d4ea3) 14%, var(--card)), var(--card)); border:1px solid color-mix(in srgb, var(--hero-gold, #c4952f) 45%, transparent); border-radius:18px; padding:10px 12px; margin:0 0 12px;}
.wk-banner img{width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--hero-gold, #c4952f); flex:0 0 auto; background:#e9eef8;}
.wk-banner div{flex:1; min-width:0;}
.wk-banner b{display:block; font-size:15px;}
.wk-banner span{font-size:12px; color:var(--muted);}
.wk-banner .x{background:none; border:none; color:var(--muted); font-size:18px; padding:4px 6px; cursor:pointer;}
.ws-head{display:flex; align-items:flex-end; gap:10px; margin-bottom:12px;}
.ws-head img{width:64px; height:64px; border-radius:50%; object-fit:cover; border:3px solid var(--hero-gold, #c4952f); background:#e9eef8; flex:0 0 auto;}
.ws-head .ob-bubble2{background:var(--tone-soft); border-radius:16px; padding:10px 12px; font-weight:700; font-size:14px; line-height:1.5;}
.ws-range{font-size:12px; color:var(--muted); margin:-4px 0 10px;}
.ws-grid{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
.ws-grid div{background:var(--card-2); border:1px solid var(--line); border-radius:14px; padding:10px 12px;}
.ws-grid span{display:block; font-size:12px; color:var(--muted);}
.ws-grid b{display:block; font-family:var(--f-display); font-size:20px; font-weight:800; line-height:1.3; font-variant-numeric:tabular-nums;}
.ws-grid em{display:block; font-style:normal; font-size:11.5px; margin-top:2px;}
.ws-grid em.ok{color:#1f9d6b;} .ws-grid em.lo{color:#c77d12;}
.ws-tip{margin-top:12px; background:color-mix(in srgb, var(--hero-gold, #c4952f) 14%, var(--card)); border-radius:14px; padding:12px; font-size:14px; line-height:1.6;}
.ws-tip b{display:block; margin-bottom:2px;}
.pp-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:10px 0;}
.pp-grid button{position:relative; padding:0; border:none; border-radius:12px; overflow:hidden; aspect-ratio:3/4; background:var(--card-2); cursor:pointer;}
.pp-grid img{width:100%; height:100%; object-fit:cover; display:block;}
.pp-grid span{position:absolute; inset-inline:0; bottom:0; background:linear-gradient(transparent, rgba(0,0,0,.65)); color:#fff; font-size:11px; padding:14px 6px 5px; text-align:center;}
.pp-big{width:100%; border-radius:14px; display:block; max-height:62vh; object-fit:contain; background:#000;}
.pp-meta{text-align:center; font-size:13px; color:var(--muted); margin:8px 0 12px;}
.pp-cmp{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
.pp-cmp figure{margin:0;}
.pp-cmp img{width:100%; aspect-ratio:3/4; object-fit:cover; border-radius:12px; display:block; background:#000;}
.pp-cmp figcaption{text-align:center; font-size:12px; color:var(--muted); margin-top:6px; line-height:1.5;}
.pp-cmp figcaption b{display:block; color:var(--ink); font-size:14px;}
.pp-sel{display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:8px;}
.pp-sel button{flex:0 0 auto; border:1px solid var(--line); background:var(--card-2); color:var(--ink); border-radius:999px; padding:6px 10px; font-size:12px; cursor:pointer;}
.pp-sel button.on{background:var(--t-1, #1d4ea3); border-color:transparent; color:#fff;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

# ---------- HTML: تنبيه الأسبوع بأعلى «اليوم» ----------
sub1("""    <div class="goal-note" id="day-label"></div>
""", """    <div class="goal-note" id="day-label"></div>
    <div class="wk-banner" id="wk-banner" hidden>
      <img src="media/hero-face.webp" alt="">
      <div><b>ملخص أسبوعك جاهز 📋</b><span>شوف شلون مشى أسبوعك، وشنو نركّز عليه الأسبوع الجاي.</span></div>
      <button class="primary" onclick="openWeekSummary()">شوفه</button>
      <button class="x" onclick="wkDismiss()" aria-label="إخفاء">✕</button>
    </div>
""")

# ---------- HTML: بطاقة النوم بعد الماي ----------
sub1("""      <div class="goal-note" id="water-note"></div>
    </section>
""", """      <div class="goal-note" id="water-note"></div>
    </section>

    <section class="card" id="sleep-card" aria-label="النوم">
      <div class="water-head">
        <h2 style="margin:0;"><i class="dot d-sleep"></i>النوم</h2>
        <span class="macro-val"><b id="sleep-now">—</b> <span class="macro-goal">ساعة</span></span>
      </div>
      <div class="sl-q" id="sleep-q">نمت كم ساعة البارحة؟</div>
      <div class="sl-chips" id="sleep-chips"></div>
      <div class="sl-week" id="sleep-week" aria-hidden="true"></div>
      <div class="goal-note" id="sleep-note"></div>
    </section>
""")

# ---------- HTML: زر ملخص الأسبوع ----------
sub1("""      <div id="week-chart"></div>
      <div class="goal-note" id="week-note"></div>
""", """      <div id="week-chart"></div>
      <div class="goal-note" id="week-note"></div>
      <button class="ghost wk-sumbtn" onclick="openWeekSummary()">📋 ملخص الأسبوع</button>
""")

# ---------- HTML: صور التقدّم بتبويب الوزن ----------
sub1("""    <div class="card">
      <h2>سجل الوزن</h2>
      <div id="weight-list">""", """    <div class="card" id="pp-card">
      <h2>صور التقدّم</h2>
      <div class="goal-note" style="margin-top:0;">صورة كل أسبوعين، بنفس المكان والضو والوقفة، تبيّن التغيير أوضح من الميزان.</div>
      <div class="pp-grid" id="pp-grid"></div>
      <div class="btn-row">
        <button class="primary" onclick="ppPick()">📸 ضيف صورة</button>
        <button class="ghost" id="pp-cmp-btn" onclick="ppCompare()" hidden>↔️ قبل وبعد</button>
      </div>
      <input type="file" accept="image/*" id="pp-input" hidden onchange="ppAdd(this)">
      <div class="goal-note" id="pp-note"></div>
      <div class="goal-note">🔒 الصور تبقى بموبايلك بس: ما تنرسل لأي مكان، وما تدخل بالنسخة الاحتياطية. إذا مسحت التطبيق أو بيانات المتصفح تنمسح.</div>
    </div>

    <div class="card">
      <h2>سجل الوزن</h2>
      <div id="weight-list">""")

# ---------- البيانات: النوم ----------
sub1("""  if(!data.workouts || typeof data.workouts!=='object' || Array.isArray(data.workouts)) data.workouts = {};
}
function saveLocal(){""", """  if(!data.workouts || typeof data.workouts!=='object' || Array.isArray(data.workouts)) data.workouts = {};
  if(!data.sleep || typeof data.sleep!=='object' || Array.isArray(data.sleep)) data.sleep = {};
}
function saveLocal(){""")
sub1("""  const lp = local.training && local.training.program, cp = cloud.training && cloud.training.program;""",
     """  out.sleep = {...(cloud.sleep||{}), ...(local.sleep||{})};
  const lp = local.training && local.training.program, cp = cloud.training && cloud.training.program;""")
sub1("""  out.workouts = cleanWorkouts(d.workouts);
  const trn""", """  out.workouts = cleanWorkouts(d.workouts);
  out.sleep = {};
  Object.keys(d.sleep||{}).forEach(k=>{ const h = num(d.sleep[k]); if(DATE_RE.test(k) && h>0 && h<=16) out.sleep[k] = Math.round(h*2)/2; });
  const trn""")
sub1("""    || Object.keys(data.workouts||{}).length || !!(data.training && data.training.program));""",
     """    || Object.keys(data.workouts||{}).length || Object.keys(data.sleep||{}).length || !!(data.training && data.training.program));""")
sub1("""  if(!data.workouts) data.workouts = {};
  if(firstSyncWithLocal){""", """  if(!data.workouts) data.workouts = {};
  if(!data.sleep) data.sleep = {};
  if(firstSyncWithLocal){""")
sub1("""  data = {meals:{}, weights:[], customFoods:[], savedMeals:[], recipes:[], water:{}, waist:[], workouts:{}, onboarded:Date.now()};
  save();""", """  data = {meals:{}, weights:[], customFoods:[], savedMeals:[], recipes:[], water:{}, waist:[], workouts:{}, sleep:{}, onboarded:Date.now()};
  save(); ppClearAll();""")

sub1("""  renderWeek();
  renderWater();
""", """  renderWeek();
  renderWater();
  renderSleep();
  wkBanner();
""")
sub1("""function renderWeight(){
  renderRealTdee(); renderWeightRate(); renderWeightChart(); renderWaist();""",
     """function renderWeight(){
  renderRealTdee(); renderWeightRate(); renderWeightChart(); renderWaist(); ppRender();""")

JS = r"""
// ================= v102: النوم =================
const SLEEP_OPTS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];
function fmtH(h){ return String(h).replace('.5', '½'); }
function sleepLast7(endK){
  const end = dateFromKey(endK), out = [];
  for(let i=6;i>=0;i--){ const d = new Date(end); d.setDate(d.getDate()-i); const k = keyFromDate(d); out.push({k, d, h:num((data.sleep||{})[k])}); }
  return out;
}
function setSleep(h){
  const k = curDay || todayKey();
  if(!data.sleep) data.sleep = {};
  if(num(data.sleep[k]) === h) delete data.sleep[k]; else data.sleep[k] = h;
  save(); renderSleep();
}
function renderSleep(){
  const card = document.getElementById('sleep-card'); if(!card) return;
  const k = curDay || todayKey(), cur = num((data.sleep||{})[k]);
  document.getElementById('sleep-now').textContent = cur ? fmtH(cur) : '—';
  document.getElementById('sleep-q').textContent = k===todayKey() ? 'نمت كم ساعة البارحة؟' : 'نمت كم ساعة ليلة ' + dayName(k) + '؟';
  document.getElementById('sleep-chips').innerHTML = SLEEP_OPTS.map(h=>`<button type="button" class="${cur===h?'on':''}" onclick="setSleep(${h})" aria-pressed="${cur===h}">${h===10?'10+':fmtH(h)}</button>`).join('');
  const days = sleepLast7(k);
  document.getElementById('sleep-week').innerHTML = days.map(x=>`<div class="${x.k===k?'cur':''}"><i class="${!x.h?'none':x.h<7?'lo':''}" style="height:${x.h?Math.min(100, x.h/10*100).toFixed(0):0}%"></i><small>${x.k===todayKey()?'اليوم':AR_DAYS[x.d.getDay()].replace('ال','').slice(0,3)}</small></div>`).join('');
  const got = days.filter(x=>x.h), note = document.getElementById('sleep-note');
  if(got.length < 3){ note.textContent = 'سجّل نومك كل يوم، وبعد 3 أيام يطلعلك المعدل.'; return; }
  const avg = got.reduce((a,x)=>a+x.h,0)/got.length, a1 = (+avg.toFixed(1)).toString();
  note.textContent = avg < 7
    ? `معدل نومك ${a1} ساعة. الكبار يحتاجون 7 ساعات أو أكثر بالليلة؛ النوم القليل يزيد الجوع ويبطّئ الاستشفاء من التمرين.`
    : `✅ معدل نومك ${a1} ساعة، ضمن الموصى (7 ساعات أو أكثر).`;
}

// ================= v102: ملخص الأسبوع =================
function weekStats(endK){
  const end = dateFromKey(endK), keys = [];
  for(let i=6;i>=0;i--){ const d = new Date(end); d.setDate(d.getDate()-i); keys.push(keyFromDate(d)); }
  const startK = keys[0];
  const logged = keys.filter(k=>(data.meals[k]||[]).length);
  const tot = logged.map(k=>(data.meals[k]||[]).reduce((a,m)=>{ const t = mealTotals(m); return {cal:a.cal+t.cal, pro:a.pro+t.pro}; }, {cal:0, pro:0}));
  const avgCal = tot.length ? tot.reduce((a,x)=>a+x.cal,0)/tot.length : 0, avgPro = tot.length ? tot.reduce((a,x)=>a+x.pro,0)/tot.length : 0;
  const workouts = keys.reduce((a,k)=>a+((data.workouts||{})[k]||[]).length, 0);
  const waterDays = keys.filter(k=>waterOf(k) >= waterTarget()).length;
  const sl = keys.map(k=>num((data.sleep||{})[k])).filter(Boolean), avgSleep = sl.length ? sl.reduce((a,b)=>a+b,0)/sl.length : 0;
  const ws = (data.weights||[]).filter(w=>w.date<=endK), inWin = ws.filter(w=>w.date>=startK), prev = ws.filter(w=>w.date<startK).pop();
  let dW = null;
  if(inWin.length && (prev || inWin.length>=2)) dW = inWin[inWin.length-1].w - (prev ? prev.w : inWin[0].w);
  return {keys, startK, endK, logged:logged.length, avgCal, avgPro, workouts, waterDays, avgSleep, sleepN:sl.length, dW};
}
function wkId(){ const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+2)%7)); return keyFromDate(d); }   // آخر جمعة
function wkSeen(){ try{ return localStorage.getItem('hero_wk_seen') === wkId(); }catch(e){ return false; } }
function wkMark(){ try{ localStorage.setItem('hero_wk_seen', wkId()); }catch(e){} }
function wkBanner(){
  const b = document.getElementById('wk-banner'); if(!b) return;
  const dow = new Date().getDay(), k = curDay || todayKey();
  b.hidden = !((dow===5 || dow===6) && k===todayKey() && !wkSeen() && weekStats(todayKey()).logged >= 3);
}
function wkDismiss(){ wkMark(); wkBanner(); }
function openWeekSummary(){
  wkMark(); wkBanner();
  const endK = curDay || todayKey(), S = weekStats(endK), p = data.profile, hasT = !!p && !TRACK;
  const a = dateFromKey(S.startK), b = dateFromKey(endK);
  const range = `${a.getDate()} ${AR_MONTHS[a.getMonth()]} - ${b.getDate()} ${AR_MONTHS[b.getMonth()]}`;
  const tile = (label, val, sub, cls)=>`<div><span>${label}</span><b>${val}</b>${sub?`<em class="${cls||''}">${sub}</em>`:''}</div>`;
  let calSub = '', calCls = '';
  if(hasT && S.logged){ const tgt = (CAL_MIN+CAL_MAX)/2, dd = Math.round(S.avgCal - tgt);
    if(Math.abs(dd) <= 100){ calSub = '✅ ضمن هدفك'; calCls = 'ok'; } else if(dd > 0){ calSub = `أعلى بـ ${dd}`; calCls = 'lo'; } else { calSub = `أقل بـ ${-dd}`; calCls = 'lo'; } }
  let proSub = '', proCls = '';
  if(hasT && S.logged){ if(S.avgPro >= PRO_MIN){ proSub = '✅ كافي'; proCls = 'ok'; } else { proSub = `الهدف ${Math.round(PRO_MIN)}غ`; proCls = 'lo'; } }
  const dW = S.dW===null ? '—' : (S.dW>0?'+':S.dW<0?'−':'') + Math.abs(S.dW).toFixed(1) + ' كغم';
  const grid = [
    tile('أيام سجلت أكلك', `${S.logged}/7`, S.logged>=5 ? '✅ التزام زين' : '', 'ok'),
    tile('معدل السعرات', S.logged ? Math.round(S.avgCal) : '—', calSub, calCls),
    tile('معدل البروتين', S.logged ? Math.round(S.avgPro)+'غ' : '—', proSub, proCls),
    tile('التمارين', S.workouts ? `${S.workouts} حصة` : '—', '', ''),
    tile('أيام وصلت هدف الماي', `${S.waterDays}/7`, '', ''),
    tile('تغير الوزن', dW, '', ''),
    tile('معدل النوم', S.sleepN ? `${(+S.avgSleep.toFixed(1))} ساعة` : '—', S.sleepN ? (S.avgSleep>=7 ? '✅ ضمن الموصى' : 'أقل من 7 ساعات') : '', S.avgSleep>=7 ? 'ok' : 'lo')
  ].join('');
  let tip;
  if(S.logged < 4) tip = 'سجّل أكلك 5 أيام على الأقل الأسبوع الجاي، حتى أكدر أحسبلك المعدل صح وأعرف وين نعدّل.';
  else if(hasT && S.avgPro < PRO_MIN) tip = 'البروتين أقل من هدفك. ضيف مصدر بروتين لكل وجبة: بيض، دجاج، لحم، سمك، لبن أو جبن.';
  else if(hasT && S.avgCal > CAL_MAX + 100) tip = 'السعرات أعلى من هدفك. ابدي بالأشياء السهلة: العصائر والحلويات والصوصات.';
  else if(S.workouts === 0 && data.training && data.training.program) tip = 'ما سجلنا ولا حصة تمرين هذا الأسبوع. خلي هدفك الأسبوع الجاي حصتين على الأقل.';
  else if(S.sleepN >= 3 && S.avgSleep < 7) tip = 'نومك أقل من 7 ساعات. حاول تنام أبكر بنص ساعة، وبطّل الموبايل قبل النوم.';
  else if(S.waterDays < 4) tip = 'اشرب ماي أكثر: خلي قنينة ماي جنبك ودوس «+ كوب» كل ما تشرب.';
  else tip = 'أسبوع ممتاز! كمّل بنفس الوتيرة، والاستمرار هو اللي يسوي الفرق 💪';
  const name = p && p.name ? p.name.split(' ')[0] : '';
  const hello = name ? `هذا ملخص أسبوعك يا ${esc(name)} 👇` : 'هذا ملخص أسبوعك 👇';
  trOpenSheet('ملخص الأسبوع', `<div class="ws-head"><img src="media/hero-face.webp" alt=""><div class="ob-bubble2">${hello}</div></div>
    <div class="ws-range">${range}</div>
    <div class="ws-grid">${grid}</div>
    <div class="ws-tip"><b>💡 نصيحتي للأسبوع الجاي</b>${tip}</div>`);
}

// ================= v102: صور التقدّم (بالجهاز بس: IndexedDB) =================
const PP = {db:null, list:[]};
function ppDB(){
  if(PP.db) return Promise.resolve(PP.db);
  return new Promise((res, rej)=>{
    if(!window.indexedDB) return rej(new Error('noidb'));
    const r = indexedDB.open('hero_photos', 1);
    r.onupgradeneeded = ()=>{ if(!r.result.objectStoreNames.contains('p')) r.result.createObjectStore('p', {keyPath:'id'}); };
    r.onsuccess = ()=>{ PP.db = r.result; res(PP.db); };
    r.onerror = ()=>rej(r.error);
  });
}
function ppTx(mode, fn){
  return ppDB().then(db=>new Promise((res, rej)=>{
    const tx = db.transaction('p', mode), st = tx.objectStore('p'); let out;
    const q = fn(st); if(q) q.onsuccess = ()=>{ out = q.result; };
    tx.oncomplete = ()=>res(out); tx.onerror = ()=>rej(tx.error); tx.onabort = ()=>rej(tx.error);
  }));
}
async function ppLoad(){
  try{ PP.list = (await ppTx('readonly', st=>st.getAll())) || []; }catch(e){ PP.list = []; }
  PP.list.sort((a,b)=>a.date.localeCompare(b.date) || a.t-b.t);
  return PP.list;
}
function ppDateTxt(k){ const d = dateFromKey(k); return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function ppWeightOn(k){
  const ws = data.weights||[]; let best = null, bd = 1e9;
  ws.forEach(w=>{ const dd = Math.abs(dateFromKey(w.date) - dateFromKey(k))/86400000; if(dd <= 3 && dd < bd){ bd = dd; best = w; } });
  return best ? best.w : null;
}
async function ppRender(){
  const grid = document.getElementById('pp-grid'); if(!grid) return;
  const list = await ppLoad(), note = document.getElementById('pp-note');
  grid.innerHTML = list.slice().reverse().map(x=>`<button type="button" onclick="ppView('${x.id}')" aria-label="${esc(ppDateTxt(x.date))}"><img src="${x.img}" alt=""><span>${esc(ppDateTxt(x.date))}</span></button>`).join('');
  grid.hidden = !list.length;
  document.getElementById('pp-cmp-btn').hidden = list.length < 2;
  if(!list.length){ note.textContent = 'ابدي بأول صورة اليوم، وبعد أسبوعين قارن.'; return; }
  const days = Math.round((dateFromKey(todayKey()) - dateFromKey(list[list.length-1].date))/86400000);
  note.textContent = days >= 14 ? `📸 صار ${days} يوم من آخر صورة. وقت صورة جديدة!` : days===0 ? 'آخر صورة: اليوم.' : `آخر صورة: قبل ${days} يوم.`;
}
function ppPick(){ document.getElementById('pp-input').click(); }
function ppShrink(file){
  return new Promise((res, rej)=>{
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = ()=>{
      const M = 1080, sc = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth*sc); c.height = Math.round(im.naturalHeight*sc);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}
async function ppAdd(input){
  const f = input.files && input.files[0]; input.value = '';
  if(!f) return;
  let img;
  try{ img = await ppShrink(f); }catch(e){ notify('ما كدرنا نفتح الصورة. جرب صورة ثانية.'); return; }
  const rec = {id: uid(), date: todayKey(), t: Date.now(), img};
  try{ await ppTx('readwrite', st=>st.put(rec)); }
  catch(e){ notify('⚠️ ما گدرنا نحفظ الصورة بهذا الجهاز. إذا فاتح بوضع التصفح الخاص، جرب بالوضع العادي.'); return; }
  notify('انحفظت الصورة بموبايلك ✅');
  ppRender();
}
function ppView(id){
  const x = PP.list.find(p=>p.id===id); if(!x) return;
  const w = ppWeightOn(x.date);
  trOpenSheet(ppDateTxt(x.date), `<img class="pp-big" src="${x.img}" alt="">
    <div class="pp-meta">${w ? `الوزن وقتها: ${fmtKg(w)} كغم` : ''}</div>
    <div class="btn-row">${PP.list.length>1 ? `<button class="ghost" onclick="ppCompare('${x.id}')">↔️ قارنها</button>` : ''}<button class="ghost danger" onclick="ppDel('${x.id}')">🗑️ احذف الصورة</button></div>`);
}
async function ppDel(id){
  if(!await askConfirm('تحذف هذي الصورة؟ ما تترجع.', 'احذفه', true)) return;
  try{ await ppTx('readwrite', st=>st.delete(id)); }catch(e){}
  trCloseSheet(); ppRender();
}
function ppCompare(bId){
  const L = PP.list; if(L.length < 2) return;
  let A = L[0], B = bId ? L.find(p=>p.id===bId) : L[L.length-1];
  if(B && B.id===A.id) B = L[L.length-1];
  ppCmpShow(A.id, B.id);
}
function ppCmpShow(aId, bId){
  const L = PP.list, A = L.find(p=>p.id===aId), B = L.find(p=>p.id===bId); if(!A || !B) return;
  const [x, y] = A.date <= B.date ? [A, B] : [B, A];
  const days = Math.round((dateFromKey(y.date) - dateFromKey(x.date))/86400000);
  const wx = ppWeightOn(x.date), wy = ppWeightOn(y.date);
  const dw = wx && wy ? wy - wx : null;
  const sel = (cur, side)=>`<div class="pp-sel">${L.map(p=>`<button type="button" class="${p.id===cur?'on':''}" onclick="ppCmpShow('${side==='a'?p.id:aId}','${side==='b'?p.id:bId}')">${esc(ppDateTxt(p.date))}</button>`).join('')}</div>`;
  const fig = (p, lab, w)=>`<figure><img src="${p.img}" alt=""><figcaption><b>${lab}</b>${esc(ppDateTxt(p.date))}${w ? `<br>${fmtKg(w)} كغم` : ''}</figcaption></figure>`;
  trOpenSheet('قبل وبعد', `<div class="pp-cmp">${fig(x, 'قبل', wx)}${fig(y, 'بعد', wy)}</div>
    <div class="pp-meta">${days ? `الفرق ${days} يوم` : ''}${dw!==null && Math.abs(dw)>=0.1 ? ` · ${dw>0?'+':'−'}${Math.abs(dw).toFixed(1)} كغم` : ''}</div>
    <div class="goal-note" style="margin:0 0 6px;">الصورة الأولى:</div>${sel(aId,'a')}
    <div class="goal-note" style="margin:0 0 6px;">الصورة الثانية:</div>${sel(bId,'b')}`);
}
async function ppClearAll(){ try{ await ppTx('readwrite', st=>st.clear()); }catch(e){} PP.list = []; }
"""
sub1("\n// ================= water =================\n", "\n" + JS + "\n// ================= water =================\n")

NEW = {
 'ملخص أسبوعك جاهز 📋': 'Your weekly summary is ready 📋',
 'شوف شلون مشى أسبوعك، وشنو نركّز عليه الأسبوع الجاي.': 'See how your week went and what to focus on next week.',
 'شوفه': 'View', 'إخفاء': 'Hide',
 'النوم': 'Sleep', 'ساعة': 'h', 'نمت كم ساعة البارحة؟': 'How many hours did you sleep last night?',
 'نمت كم ساعة ليلة {0}؟': 'How many hours did you sleep the night before {0}?',
 'سجّل نومك كل يوم، وبعد 3 أيام يطلعلك المعدل.': 'Log your sleep every day; after 3 days you’ll see your average.',
 'معدل نومك {0} ساعة. الكبار يحتاجون 7 ساعات أو أكثر بالليلة؛ النوم القليل يزيد الجوع ويبطّئ الاستشفاء من التمرين.': 'You average {0} h of sleep. Adults need 7 hours or more a night; too little sleep increases hunger and slows recovery from training.',
 '✅ معدل نومك {0} ساعة، ضمن الموصى (7 ساعات أو أكثر).': '✅ You average {0} h of sleep, within the recommendation (7 hours or more).',
 '📋 ملخص الأسبوع': '📋 Weekly summary', 'ملخص الأسبوع': 'Weekly summary',
 'صور التقدّم': 'Progress photos',
 'صورة كل أسبوعين، بنفس المكان والضو والوقفة، تبيّن التغيير أوضح من الميزان.': 'A photo every two weeks, in the same spot, light and pose, shows change more clearly than the scale.',
 '📸 ضيف صورة': '📸 Add photo', '↔️ قبل وبعد': '↔️ Before & after',
 '🔒 الصور تبقى بموبايلك بس: ما تنرسل لأي مكان، وما تدخل بالنسخة الاحتياطية. إذا مسحت التطبيق أو بيانات المتصفح تنمسح.': '🔒 Photos stay on your phone only: they’re never sent anywhere and aren’t included in backups. Deleting the app or browser data deletes them.',
 'أيام سجلت أكلك': 'Days you logged food', '✅ التزام زين': '✅ Good consistency', 'معدل السعرات': 'Average calories', 'معدل البروتين': 'Average protein',
 'التمارين': 'Workouts', '{0} حصة': '{0} sessions', 'أيام وصلت هدف الماي': 'Days you hit your water goal', 'تغير الوزن': 'Weight change',
 'معدل النوم': 'Average sleep', '{0} ساعة': '{0} h', '✅ ضمن الموصى': '✅ Within recommendation', 'أقل من 7 ساعات': 'Under 7 hours',
 '✅ ضمن هدفك': '✅ On target', 'أعلى بـ {0}': '{0} above', 'أقل بـ {0}': '{0} below', '✅ كافي': '✅ Enough', 'الهدف {0}غ': 'Target {0} g',
 '−{0} كغم': '−{0} kg', '+{0} كغم': '+{0} kg',
 'سجّل أكلك 5 أيام على الأقل الأسبوع الجاي، حتى أكدر أحسبلك المعدل صح وأعرف وين نعدّل.': 'Log your food at least 5 days next week so I can work out your average properly and see what to adjust.',
 'البروتين أقل من هدفك. ضيف مصدر بروتين لكل وجبة: بيض، دجاج، لحم، سمك، لبن أو جبن.': 'Protein is below your target. Add a protein source to every meal: eggs, chicken, meat, fish, yogurt or cheese.',
 'السعرات أعلى من هدفك. ابدي بالأشياء السهلة: العصائر والحلويات والصوصات.': 'Calories are above your target. Start with the easy wins: juices, sweets and sauces.',
 'ما سجلنا ولا حصة تمرين هذا الأسبوع. خلي هدفك الأسبوع الجاي حصتين على الأقل.': 'No workouts logged this week. Aim for at least two sessions next week.',
 'نومك أقل من 7 ساعات. حاول تنام أبكر بنص ساعة، وبطّل الموبايل قبل النوم.': 'You’re sleeping under 7 hours. Try going to bed 30 minutes earlier and putting the phone down before sleep.',
 'اشرب ماي أكثر: خلي قنينة ماي جنبك ودوس «+ كوب» كل ما تشرب.': 'Drink more water: keep a bottle next to you and tap “+ Cup” every time you drink.',
 'أسبوع ممتاز! كمّل بنفس الوتيرة، والاستمرار هو اللي يسوي الفرق 💪': 'Great week! Keep the same pace: consistency is what makes the difference 💪',
 'هذا ملخص أسبوعك يا {0} 👇': 'Here’s your week, {0} 👇', 'هذا ملخص أسبوعك 👇': 'Here’s your week 👇',
 '💡 نصيحتي للأسبوع الجاي': '💡 My tip for next week',
 'ابدي بأول صورة اليوم، وبعد أسبوعين قارن.': 'Take your first photo today, then compare in two weeks.',
 '📸 صار {0} يوم من آخر صورة. وقت صورة جديدة!': '📸 It’s been {0} days since your last photo. Time for a new one!',
 'آخر صورة: اليوم.': 'Last photo: today.', 'آخر صورة: قبل {0} يوم.': 'Last photo: {0} days ago.',
 'انحفظت الصورة بموبايلك ✅': 'Photo saved on your phone ✅',
 '⚠️ ما گدرنا نحفظ الصورة بهذا الجهاز. إذا فاتح بوضع التصفح الخاص، جرب بالوضع العادي.': '⚠️ We couldn’t save the photo on this device. If you’re in private browsing, try normal mode.',
 'الوزن وقتها: {0} كغم': 'Weight then: {0} kg', '↔️ قارنها': '↔️ Compare', '🗑️ احذف الصورة': '🗑️ Delete photo',
 'تحذف هذي الصورة؟ ما تترجع.': 'Delete this photo? It can’t be undone.',
 'قبل وبعد': 'Before & after', 'قبل': 'Before', 'بعد': 'After', 'الفرق {0} يوم': '{0} days apart',
 'الصورة الأولى:': 'First photo:', 'الصورة الثانية:': 'Second photo:',
}
mD = re.search(r'const D = \{', s); head = s[mD.end():mD.end()+900000]
s = s[:mD.end()] + ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in head) + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)

# ---------- سياسة الخصوصية ----------
p = open(PRIV, encoding='utf-8').read()
def psub(old, new):
    global p
    if p.count(old) != 1: sys.exit(f'✗ privacy ({p.count(old)}): {old[:80]}')
    p = p.replace(old, new)
psub('<li>سجل الأكل والماي، ومنتجاتك ووجباتك وطبخاتك المحفوظة.</li>', '<li>سجل الأكل والماي والنوم، ومنتجاتك ووجباتك وطبخاتك المحفوظة.</li>')
psub('<li>الوزن ومحيط الخصر (إذا سجلته).</li>', '<li>الوزن ومحيط الخصر (إذا سجلته).</li>\n      <li>صور التقدّم (إذا ضفتها): تنحفظ داخل ذاكرة التطبيق بموبايلك بس، ما تنرسل لأي مكان، وما تدخل بالنسخة الاحتياطية. تكدر تحذفها بأي وقت، وتنمسح إذا مسحت كل البيانات أو التطبيق.</li>')
psub('<li>Food and water log, plus your saved products, meals and dishes.</li>', '<li>Food, water and sleep log, plus your saved products, meals and dishes.</li>')
psub('<li>Weight and waist measurements (if you log them).</li>', '<li>Weight and waist measurements (if you log them).</li>\n      <li>Progress photos (if you add them): stored only in the app’s storage on your phone, never sent anywhere and not included in backups. You can delete them at any time, and they are erased if you delete all data or the app.</li>')
open(PRIV, 'w', encoding='utf-8').write(p)
print('✓ نسخة 102 انطبقت')
