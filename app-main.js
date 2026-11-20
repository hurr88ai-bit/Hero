
let TRACK=false;
let CAL_MIN=2000, CAL_MAX=2300, PRO_MIN=145, PRO_MAX=175, CARB_T=0, FAT_T=0;
let data = {meals: {}, weights: []};

// ---- safety: every user-provided string goes through esc() before innerHTML ----
function esc(s){
  return String(s==null?'':s).replace(/[&<>"'`]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function num(v){ const n = Number(v); return isFinite(n) ? n : 0; }

// ---- day navigation ----
let curDay = null; // 'YYYY-MM-DD' being viewed/logged on the Today tab
function keyFromDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dateFromKey(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); }
const AR_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function dayName(k){
  const t = todayKey();
  if(k===t) return 'اليوم';
  const y = new Date(); y.setDate(y.getDate()-1);
  if(k===keyFromDate(y)) return 'أمس';
  const d = dateFromKey(k); return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}
const AR_MONTHS = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
function setDay(k){
  if(!DATE_RE.test(k||'')) k = todayKey();
  if(k > todayKey()) k = todayKey(); // no logging into the future
  if(k !== curDay) openMeal = null;
  curDay = k;
  document.getElementById('day-picker').value = k;
  document.getElementById('day-picker').max = todayKey();
  document.getElementById('next-day').disabled = (k >= todayKey());
  document.getElementById('next-day').style.opacity = (k >= todayKey()) ? '0.4' : '1';
  const isToday = k===todayKey();
  { const d = dateFromKey(k), AM = AR_MONTHS, full = `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AM[d.getMonth()]}`;
    document.getElementById('day-title').innerHTML = isToday ? `اليوم <span class="dp-sub">· ${full}</span>` : full; }
  document.getElementById('day-label').innerHTML = isToday ? ''
    : `⚠️ تسجل على يوم <b>${esc(dayName(k))}</b> — <a href="#" onclick="setDay(todayKey()); return false;">رجوع لليوم</a>`;
  renderToday();
}
function shiftDay(n){ const d = dateFromKey(curDay); d.setDate(d.getDate()+n); setDay(keyFromDate(d)); }
function openDay(k){ setDay(k); switchTab('today'); window.scrollTo(0,0); }

// cut: rate of loss as % bodyweight/week (Helms 2014: 0.5-1%; Garthe 2011; Roberts 2020: <=0.5% preferred)
// bulk: surplus as % of maintenance (Iraki 2019: 10-20% above maintenance, ~0.25-0.5% BW/week)
// protein g/kg: Morton 2018 (1.6, CI to 2.2), ISSN 2017 (1.4-2.0; 2-3x RDA in deficit), Roberts 2020 (1.8-2.7 in prep)
const GOALS = {
  cut:      {label:'تنشيف',              lossPct:{slow:0.5, fast:1.0}, pro:[1.8,2.4]},
  recomp:   {label:'إعادة تشكيل الجسم',  lossPct:{slow:0.25, fast:0.25}, pro:[1.8,2.4]},
  maintain: {label:'حفاظ على الوزن',      pro:[1.6,2.2]},
  track:    {label:'تتبع فقط', track:true, pro:[1.6,2.2]},
  custom:   {label:'أهداف مخصصة', custom:true, pro:[1.6,2.2]},
  bulk:     {label:'تضخيم نظيف',          surplus:{slow:0.10, fast:0.20}, pro:[1.6,2.2]}
};
const KCAL_PER_KG = 7700; // approximate energy per kg of body-weight change (Hall 2008 notes it varies)

function ageFromDob(dob){
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear()-d.getFullYear();
  const m = n.getMonth()-d.getMonth();
  if(m<0 || (m===0 && n.getDate()<d.getDate())) a--;
  return a;
}

function computeTargets(p){
  const age = ageFromDob(p.dob);
  const bmr = 10*p.weight + 6.25*p.height - 5*age + (p.sex==='f' ? -161 : 5);
  const exDaily = (!p.tdeeOverride && data.training && data.training.link && typeof trDailyKcal==='function') ? trDailyKcal(p.weight) : 0;
  const estTdee = bmr*p.activity + exDaily;
  const measured = !!p.tdeeOverride;
  const tdee = measured ? p.tdeeOverride : estTdee;
  const g = GOALS[p.goal];
  const pace = p.pace||'slow';
  const water = p.sex==='f' ? 2.0 : 2.5; // EFSA 2010 adequate intake, total water (~20% from food)
  const bmi = p.weight/((p.height/100)**2);
  if(g.custom){
    const c = p.custom || {};
    const cal = num(c.cal) || tdee;
    const given = {pro:num(c.pro)>0, carb:num(c.carb)>0, fat:num(c.fat)>0};
    const proMin = given.pro ? num(c.pro) : g.pro[0]*p.weight, proMax = given.pro ? num(c.pro) : g.pro[1]*p.weight;
    const pro = (proMin+proMax)/2;
    const fat = given.fat ? num(c.fat) : Math.max(0.5*p.weight, cal*0.25/9);
    const carb = given.carb ? num(c.carb) : Math.max(0, (cal - pro*4 - fat*9)/4);
    return {age, bmr, tdee, estTdee, exDaily, measured, cal, pro, proMin, proMax, fat, carb, water, floored:false, bmi,
      custom:{given, macroKcal: pro*4 + carb*4 + fat*9, belowBmr: cal < bmr}};
  }
  let cal = tdee;
  if(g.lossPct) cal = tdee - (p.weight*g.lossPct[pace]/100*KCAL_PER_KG)/7;
  if(g.surplus) cal = tdee*(1+g.surplus[pace]);
  let floored = false;
  if(cal < bmr){ cal = bmr; floored = true; }
  const proMin = g.pro[0]*p.weight, proMax = g.pro[1]*p.weight;
  const pro = (proMin+proMax)/2;
  // fat 25% of energy (IOM AMDR 20-35%; Helms 15-30%), at least 0.5 g/kg (Iraki 2019)
  const fat = Math.max(0.5*p.weight, cal*0.25/9);
  const carb = Math.max(0, (cal - pro*4 - fat*9)/4);
  return {age, bmr, tdee, estTdee, exDaily, measured, cal, pro, proMin, proMax, fat, carb, water, floored, bmi};
}

function applyTargets(){
  const p = data.profile;
  if(!p){
    TRACK = false; document.getElementById('row-cal').hidden = false;
    ['lbl-cal','lbl-pro','lbl-carb','lbl-fat'].forEach(id=>document.getElementById(id).textContent='');
    return;
  }
  const t = computeTargets(p);
  TRACK = !!GOALS[p.goal].track;
  document.getElementById('row-cal').hidden = TRACK;
  if(TRACK){ applyTrackTargets(p, t); return; }
  CAL_MIN = t.cal-100; CAL_MAX = t.cal+100;
  PRO_MIN = t.proMin; PRO_MAX = t.proMax;
  CARB_T = t.carb; FAT_T = t.fat;
  document.getElementById('lbl-cal').textContent = `/ ${Math.round(CAL_MIN)}-${Math.round(CAL_MAX)}`;
  document.getElementById('lbl-pro').textContent = PRO_MIN===PRO_MAX ? `/ ${Math.round(PRO_MIN)} غم` : `/ ${Math.round(PRO_MIN)}-${Math.round(PRO_MAX)} غم`;
  document.getElementById('lbl-carb').textContent = `/ ~${Math.round(CARB_T)} غم`;
  document.getElementById('lbl-fat').textContent = `/ ~${Math.round(FAT_T)} غم`;
  document.getElementById('hdr-sub').textContent = hdrLine(p.name, GOALS[p.goal].label);

  document.getElementById('targets-empty').style.display='none';
  document.getElementById('targets-wrap').style.display='block';
  document.getElementById('t-cal').textContent = Math.round(t.cal);
  document.getElementById('t-pro').textContent = t.proMin===t.proMax ? Math.round(t.proMin) : `${Math.round(t.proMin)}-${Math.round(t.proMax)}`;
  document.getElementById('t-carb').textContent = Math.round(t.carb);
  document.getElementById('t-fat').textContent = Math.round(t.fat);
  document.getElementById('t-bmr').textContent = Math.round(t.bmr);
  document.getElementById('t-tdee').textContent = Math.round(t.tdee);
  document.getElementById('t-tdee-lbl').textContent = t.measured ? 'حرقك اليومي (محسوب من سجلك)' : 'حرقك اليومي الكلي TDEE (تقدير)';
  document.getElementById('t-water').textContent = t.water.toFixed(1);
  const dd = Math.round(t.cal - t.tdee);
  document.getElementById('t-diff').textContent = (dd>0?'+':'') + dd;
  document.getElementById('t-diff-lbl').textContent = dd<0 ? 'العجز اليومي (سعرة)' : dd>0 ? 'الفائض اليومي (سعرة)' : 'بدون عجز أو فائض';
  document.getElementById('t-meta').textContent = `العمر ${t.age} سنة · الطول ${p.height} سم · الوزن ${p.weight} كغم · مؤشر كتلة الجسم ${t.bmi.toFixed(1)}`;

  const diff = Math.round(t.cal - t.tdee);
  let note = t.measured ? 'الحرق اليومي محسوب من سجلك الفعلي (وزن + أكل). ' : 'الحرق اليومي تقدير من معادلة Mifflin-St Jeor × معامل النشاط. ';
  if(t.exDaily) note += `ويشمل ~${Math.round(t.exDaily)} سعرة باليوم معدل حرق برنامج تمرينك. `;
  note += diff<0 ? `عجز ${-diff} سعرة يومياً. ` : diff>0 ? `فائض ${diff} سعرة يومياً. ` : 'نفس حرقك اليومي. ';
  if(t.floored) note += '⚠️ الهدف انرفع للأيض الأساسي (حد أمان وضعناه، مو رقم من دراسة). ';
  if(p.goal==='cut') note += `المعدل المستهدف: ${GOALS.cut.lossPct[p.pace||'slow']}% من وزنك بالأسبوع (≈${(p.weight*GOALS.cut.lossPct[p.pace||'slow']/100).toFixed(2)} كغم). `;
  if(p.goal==='bulk') note += 'الزيادة الصحية 0.25-0.5% من وزنك بالأسبوع. ';
  if(t.bmi>=30) note += '⚠️ مؤشر كتلة الجسم 30 أو أكثر: البروتين المحسوب على الوزن الكلي أعلى من الحاجة، والحد الأدنى يكفي. ';
  if(t.custom){
    const auto = [['pro','البروتين'],['carb','الكارب'],['fat','الدهون']].filter(([k])=>!t.custom.given[k]).map(([,n])=>n);
    note = `أهدافك المخصصة. للمقارنة، حرقك اليومي التقريبي ${Math.round(t.tdee)} سعرة، يعني هدفك ${diff<0 ? 'أقل منه بـ '+(-diff) : diff>0 ? 'أعلى منه بـ '+diff : 'مساوي إله'}. `;
    if(auto.length) note += `${auto.join(' و')} محسوب تلقائياً لأنك ما كتبته. `;
    if(t.custom.belowBmr) note += '⚠️ هدفك أقل من أيضك الأساسي. إذا هذا من طبيب فهو تحت إشرافه، وإذا لا فراجع الرقم. ';
    if(!auto.length && Math.abs(t.custom.macroKcal - t.cal) > t.cal*0.1) note += `⚠️ مجموع البروتين والكارب والدهون يساوي ${Math.round(t.custom.macroKcal)} سعرة، وهذا يختلف عن السعرات اللي كتبتها (${Math.round(t.cal)}). راجع الأرقام. `;
  } else if(!t.measured) note += 'بعد أسبوعين من التسجيل، استخدم "حرقك الحقيقي" بتبويب الوزن لرقم أدق.';
  document.getElementById('targets-note').textContent = note;
}

// tracking only: no calorie target, no over/under warnings; burn shown for reference
function applyTrackTargets(p, t){
  ['lbl-cal','lbl-pro','lbl-carb','lbl-fat'].forEach(id=>document.getElementById(id).textContent='');
  document.getElementById('hdr-sub').textContent = hdrLine(p.name, GOALS.track.label);
  document.getElementById('targets-empty').style.display='none';
  document.getElementById('targets-wrap').style.display='block';
  ['t-cal','t-pro','t-carb','t-fat','t-diff'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('t-diff-lbl').textContent = 'بدون هدف';
  document.getElementById('t-bmr').textContent = Math.round(t.bmr);
  document.getElementById('t-tdee').textContent = Math.round(t.tdee);
  document.getElementById('t-tdee-lbl').textContent = t.measured ? 'حرقك اليومي (محسوب من سجلك)' : 'حرقك اليومي الكلي TDEE (تقدير)';
  document.getElementById('t-water').textContent = t.water.toFixed(1);
  document.getElementById('t-meta').textContent = `العمر ${t.age} سنة · الطول ${p.height} سم · الوزن ${p.weight} كغم · مؤشر كتلة الجسم ${t.bmi.toFixed(1)}`;
  document.getElementById('targets-note').textContent = `اخترت "تتبع فقط": نسجل أكلك ونوريك توزيعه، بدون هدف أو تنبيهات. للمعلومية، حرقك اليومي التقريبي ${Math.round(t.tdee)} سعرة. تكدر تغير الهدف بأي وقت.`;
}

function togglePace(){
  const g = document.getElementById('pf-goal').value;
  document.getElementById('pace-row').style.display = (g==='cut' || g==='bulk') ? 'flex' : 'none';
  document.getElementById('custom-row').style.display = g==='custom' ? 'block' : 'none';
  if(g==='cut'){
    document.getElementById('pace-slow').textContent = 'هادئة — نزول 0.5% من وزنك بالأسبوع (الأفضل للحفاظ على العضل)';
    document.getElementById('pace-fast').textContent = 'أسرع — نزول 1% بالأسبوع (الحد الأعلى الموصى به)';
  } else if(g==='bulk'){
    document.getElementById('pace-slow').textContent = 'هادئة — فائض 10% فوق حرقك (أقل دهون)';
    document.getElementById('pace-fast').textContent = 'أسرع — فائض 20% فوق حرقك';
  }
}

function syncActivityLabel(){
  const el = document.getElementById('pf-activity-lbl'); if(!el) return;
  el.textContent = (data.training && data.training.link) ? 'مستوى النشاط (حياتك اليومية بدون التمرين، لأن تمرينك محسوب من برنامجك)' : 'مستوى النشاط (يشمل التمرين والحركة اليومية)';
}
function pfSetOpen(open){ document.getElementById('pf-body').hidden = !open; document.getElementById('pf-card').classList.toggle('closed', !open); document.getElementById('pf-head').setAttribute('aria-expanded', open ? 'true' : 'false'); }
function pfToggle(){ if(!data.profile) return; pfSetOpen(document.getElementById('pf-body').hidden); }
function pfSummary(){ const p = data.profile; if(!p) return ''; const g = GOALS[p.goal];
  return [p.name, p.dob ? ageFromDob(p.dob)+' سنة' : '', p.height ? p.height+' سم' : '', p.weight ? p.weight+' كغم' : '', g ? g.label : ''].filter(Boolean).join(' · '); }
function fillProfileForm(){
  syncActivityLabel();
  const p = data.profile;
  document.getElementById('pf-sum').textContent = pfSummary();
  pfSetOpen(!p);   // المعلومات مسكّرة إذا مكتملة، وتنفتح بالسهم للتعديل
  if(!p){ togglePace(); return; }
  document.getElementById('pf-name').value = p.name||'';
  document.getElementById('pf-sex').value = p.sex;
  document.getElementById('pf-dob').value = p.dob;
  document.getElementById('pf-height').value = p.height;
  document.getElementById('pf-weight').value = p.weight;
  document.getElementById('pf-activity').value = String(p.activity);
  document.getElementById('pf-goal').value = p.goal;
  document.getElementById('pf-pace').value = p.pace||'slow';
  const c = p.custom || {};
  [['cal','pf-c-cal'],['pro','pf-c-pro'],['carb','pf-c-carb'],['fat','pf-c-fat']].forEach(([k,id])=>document.getElementById(id).value = num(c[k])>0 ? c[k] : '');
  togglePace();
}

function saveProfile(){
  const p = {
    name: document.getElementById('pf-name').value.trim(),
    sex: document.getElementById('pf-sex').value,
    dob: document.getElementById('pf-dob').value,
    height: parseFloat(document.getElementById('pf-height').value),
    weight: parseFloat(document.getElementById('pf-weight').value),
    activity: parseFloat(document.getElementById('pf-activity').value),
    goal: document.getElementById('pf-goal').value,
    pace: document.getElementById('pf-pace').value
  };
  if(!p.dob || !p.height || !p.weight){ notify('اكتب تاريخ الميلاد والطول والوزن'); return; }
  const age = ageFromDob(p.dob);
  if(age<18){ notify('هذي الحسبة مخصصة للبالغين (18 سنة وفوق). للأعمار الأصغر راجع طبيب أو مختص تغذية.'); return; }
  if(p.goal==='custom'){
    const v = id=>Math.max(0, num(document.getElementById(id).value));
    p.custom = {cal:v('pf-c-cal'), pro:v('pf-c-pro'), carb:v('pf-c-carb'), fat:v('pf-c-fat')};
    if(p.custom.cal<800 || p.custom.cal>6000){ notify('اكتب السعرات اليومية (بين 800 و6000)'); document.getElementById('pf-c-cal').focus(); return; }
    if(p.custom.pro>400 || p.custom.carb>900 || p.custom.fat>300){ notify('أحد الأرقام كبير كلش، راجعه'); return; }
  }
  if(data.profile && data.profile.tdeeOverride) p.tdeeOverride = data.profile.tdeeOverride;
  data.profile = p;
  save();
  applyTargets();
  renderToday();
  document.getElementById('pf-sum').textContent = pfSummary(); pfSetOpen(false); window.scrollTo({top:0, behavior:'smooth'});
  notify('انحفظت معلوماتك ✅');
}

// Nutrition per 100 g (edible portion).
// src 'U' = USDA FoodData Central (SR Legacy / FNDDS). src 'E' = تقدير (no USDA entry; varies by recipe).
// Cooked items = weigh AFTER cooking. avgWeight = USDA typical edible weight of one piece where available.
const FOOD_DB = {
  // نشويات وحبوب
  "رز أبيض مسلوق (موزون مطبوخ)": {cal:130, pro:2.7, carb:28.2, fat:0.3, src:'U'},
  "رز أبيض نيء (موزون قبل الطبخ)": {cal:365, pro:7.1, carb:80, fat:0.7, src:'U'},
  "رز بسمتي مسلوق": {cal:121, pro:3.5, carb:25.2, fat:0.4, src:'E'},
  "تمن عراقي مطبوخ (بالدهن)": {cal:170, pro:2.7, carb:28.5, fat:5, src:'E'},
  "رز بالشعرية مطبوخ": {cal:150, pro:3, carb:30, fat:2.5, src:'E'},
  "شوفان جاف": {cal:379, pro:13.2, carb:67.7, fat:6.5, src:'U'},
  "برغل مطبوخ": {cal:83, pro:3.1, carb:18.6, fat:0.2, src:'U'},
  "معكرونة مسلوقة": {cal:158, pro:5.8, carb:30.9, fat:0.9, src:'U'},
  "بطاطا مسلوقة": {cal:87, pro:1.9, carb:20.1, fat:0.1, src:'U'},
  "بطاطا حلوة مسلوقة": {cal:76, pro:1.4, carb:17.7, fat:0.1, src:'U'},
  "بطاطا مقلية (فرايز)": {cal:312, pro:3.4, carb:41.4, fat:14.7, src:'U'},
  "ذرة مسلوقة": {cal:96, pro:3.4, carb:21, fat:1.5, src:'U'},
  "عدس مطبوخ": {cal:116, pro:9, carb:20.1, fat:0.4, src:'U'},
  "حمص مطبوخ": {cal:164, pro:8.9, carb:27.4, fat:2.6, src:'U'},
  "فاصوليا بيضاء مطبوخة": {cal:139, pro:9.7, carb:25.1, fat:0.4, src:'U'},

  // مكونات نيئة وجافة (للطبخ وحاسبة الطبخة) — USDA
  "لحم غنم مفروم نيء": {cal:282, pro:16.6, carb:0, fat:23.4, src:'U'},
  "لحم بقر مفروم 85% نيء": {cal:215, pro:18.6, carb:0, fat:15, src:'U'},
  "دجاج فخذ نيء (بدون جلد)": {cal:121, pro:19.7, carb:0, fat:4.1, src:'U'},
  "برغل جاف": {cal:342, pro:12.3, carb:75.9, fat:1.3, src:'U'},
  "معكرونة/شعرية جافة": {cal:371, pro:13, carb:74.7, fat:1.5, src:'U'},
  "عدس جاف": {cal:352, pro:24.6, carb:63.4, fat:1.1, src:'U'},
  "حمص جاف": {cal:378, pro:20.5, carb:63, fat:6, src:'U'},
  "فاصوليا بيضاء جافة": {cal:333, pro:23.4, carb:60.3, fat:0.9, src:'U'},
  "بامية نيئة": {cal:33, pro:1.9, carb:7.5, fat:0.2, src:'U'},
  "بزاليا نيئة": {cal:81, pro:5.4, carb:14.5, fat:0.4, src:'U'},
  "باذنجان نيء": {cal:25, pro:1, carb:5.9, fat:0.2, src:'U'},
  "كوسا نيئة": {cal:17, pro:1.2, carb:3.1, fat:0.3, src:'U'},
  "بطاطا نيئة": {cal:77, pro:2.1, carb:17.5, fat:0.1, src:'U'},
  "معجون طماطة": {cal:82, pro:4.3, carb:18.9, fat:0.5, src:'U'},
  "طحين أبيض": {cal:364, pro:10.3, carb:76.3, fat:1, src:'U'},
  "سكر": {cal:387, pro:0, carb:100, fat:0, src:'U'},
  "سكر أسمر": {cal:380, pro:0.1, carb:98.1, fat:0, src:'U'},
  "زبدة": {cal:717, pro:0.9, carb:0.1, fat:81.1, src:'U'},

  // خبز
  "خبز أبيض (شريحة)": {cal:270, pro:9.4, carb:49, fat:3.6, unit:'piece', avgWeight:28, src:'U'},
  "خبز أسمر (شريحة)": {cal:247, pro:13, carb:41.3, fat:3.4, unit:'piece', avgWeight:32, src:'U'},
  "خبز عربي/بيتا (رغيف)": {cal:275, pro:9.1, carb:55.7, fat:1.2, unit:'piece', avgWeight:60, src:'U'},
  "خبز صمون (قطعة)": {cal:270, pro:9, carb:54, fat:1.5, unit:'piece', avgWeight:100, src:'E'},
  "خبز تنور (رغيف)": {cal:275, pro:9, carb:55, fat:1.5, unit:'piece', avgWeight:120, src:'E'},
  "توست أبيض (شريحة)": {cal:266, pro:7.6, carb:50.6, fat:3.3, unit:'piece', avgWeight:28, src:'U'},
  "توست أسمر (شريحة)": {cal:252, pro:12.4, carb:42.7, fat:3.5, unit:'piece', avgWeight:32, src:'U'},
  "توست بالبطاطا (شريحة)": {cal:266, pro:12.5, carb:47.1, fat:3.1, unit:'piece', avgWeight:32, src:'U'},
  "خبز تورتيلا أبيض (رغيف)": {cal:304, pro:8.2, carb:50.4, fat:7.7, unit:'piece', avgWeight:45, src:'E'},
  "خبز تورتيلا أسمر (رغيف)": {cal:290, pro:9.5, carb:46, fat:7.5, unit:'piece', avgWeight:45, src:'E'},

  // بيض
  "بيضة مقلية بالزيت": {cal:216, pro:12.6, carb:0.7, fat:17.5, unit:'piece', avgWeight:50, src:'E'},
  "بيضة مقلية بالزبدة": {cal:202, pro:12.7, carb:0.7, fat:15.3, unit:'piece', avgWeight:50, src:'E'},
  "بيضة مقلية بدهن الحر": {cal:216, pro:12.6, carb:0.7, fat:17.5, unit:'piece', avgWeight:50, src:'E'},
  "بيضة مسلوقة": {cal:155, pro:12.6, carb:1.1, fat:10.6, unit:'piece', avgWeight:50, src:'U'},
  "بيضة كاملة": {cal:143, pro:12.6, carb:0.7, fat:9.5, unit:'piece', avgWeight:50, src:'U'},
  "بياض بيضة": {cal:52, pro:10.9, carb:0.7, fat:0.2, unit:'piece', avgWeight:33, src:'U'},

  // دجاج ولحوم
  "دجاج صدر مشوي": {cal:165, pro:31, carb:0, fat:3.6, src:'U'},
  "دجاج فخذ مشوي (بدون جلد)": {cal:209, pro:26, carb:0, fat:10.9, src:'U'},
  "ديك رومي صدر مشوي": {cal:147, pro:30, carb:0, fat:2.1, src:'E'},
  "لحم غنم مطبوخ": {cal:294, pro:24.5, carb:0, fat:20.9, src:'U'},
  "لحم مفروم بقر 85% مطبوخ": {cal:250, pro:25.9, carb:0, fat:15.4, src:'U'},
  "لحم بقر قليل الدهن مطبوخ": {cal:217, pro:26, carb:0, fat:12, src:'E'},
  "لحم أحمر مشوي (عام)": {cal:250, pro:26, carb:0, fat:15, src:'E'},
  "كبدة بقر مطبوخة": {cal:175, pro:26.5, carb:5.2, fat:4.7, src:'U'},
  "كباب مشوي": {cal:280, pro:18, carb:4, fat:21, src:'E'},
  "تكة لحم مشوية": {cal:230, pro:26, carb:1, fat:13, src:'E'},
  "تكة دجاج مشوية": {cal:170, pro:28, carb:2, fat:5.5, src:'E'},

  // أسماك ومأكولات بحرية
  "سمك كارب مشوي (موزون مطبوخ)": {cal:162, pro:22.9, carb:0, fat:7.2, src:'U'},
  "سمك كارب نيء (موزون قبل الطبخ)": {cal:127, pro:17.8, carb:0, fat:5.6, src:'U'},
  "سلمون مزارع مشوي": {cal:206, pro:22.1, carb:0, fat:12.4, src:'U'},
  "سلمون بري مشوي": {cal:182, pro:25.4, carb:0, fat:8.1, src:'U'},
  "تونة طازجة مشوية": {cal:184, pro:29.9, carb:0, fat:6.3, src:'U'},
  "تونة معلبة بالماء (مصفاة)": {cal:116, pro:25.5, carb:0, fat:0.8, src:'U'},
  "تونة معلبة بالزيت (مصفاة)": {cal:198, pro:29.1, carb:0, fat:8.2, src:'U'},
  "سردين معلب بالزيت (مصفى)": {cal:208, pro:24.6, carb:0, fat:11.5, src:'U'},
  "قريدس (روبيان) مطبوخ": {cal:99, pro:24, carb:0.2, fat:0.3, src:'U'},
  "سمك هامور مشوي": {cal:118, pro:24.8, carb:0, fat:1.3, src:'U'},
  "سمك بني مشوي": {cal:120, pro:21, carb:0, fat:3.5, src:'E'},
  "سمك زبيدي مشوي": {cal:140, pro:20, carb:0, fat:6.5, src:'E'},
  "سمك مسكوف": {cal:180, pro:21, carb:0, fat:10.5, src:'E'},
  "سمك مقلي": {cal:230, pro:18, carb:8, fat:14, src:'E'},

  // ألبان وأجبان
  "جبن موزريلا عادي": {cal:300, pro:22.2, carb:2.2, fat:22.4, src:'U'},
  "جبن موزريلا لايت (قليل الدسم)": {cal:254, pro:24.3, carb:2.8, fat:15.9, src:'U'},
  "لبن (زبادي) كامل الدسم": {cal:61, pro:3.5, carb:4.7, fat:3.3, src:'U'},
  "لبن (زبادي) قليل الدسم": {cal:63, pro:5.3, carb:7, fat:1.6, src:'U'},
  "حليب كامل الدسم": {cal:61, pro:3.2, carb:4.8, fat:3.3, src:'U'},
  "حليب قليل الدسم 1%": {cal:42, pro:3.4, carb:5, fat:1, src:'U'},
  "حليب نص دسم 2%": {cal:50, pro:3.3, carb:4.8, fat:2, src:'U'},
  "حليب خالي الدسم": {cal:34, pro:3.4, carb:5, fat:0.1, src:'U'},
  "حليب صويا بدون سكر (نباتي)": {cal:33, pro:2.9, carb:1.7, fat:1.6, src:'U'},
  "حليب صويا محلى (نباتي)": {cal:54, pro:3.3, carb:6.3, fat:1.8, src:'E'},
  "حليب لوز بدون سكر (نباتي)": {cal:15, pro:0.6, carb:0.3, fat:1.2, src:'U'},
  "حليب لوز محلى (نباتي)": {cal:38, pro:0.4, carb:6.6, fat:1.1, src:'E'},
  "حليب شوفان (نباتي)": {cal:46, pro:1, carb:6.5, fat:1.5, src:'E'},
  "حليب جوز هند للشرب بدون سكر (نباتي)": {cal:20, pro:0.2, carb:1, fat:1.9, src:'E'},
  "حليب جوز هند للطبخ (علبة)": {cal:197, pro:2, carb:2.8, fat:21.3, src:'U'},
  "شنينة (لبن مخيض)": {cal:40, pro:3.3, carb:4.8, fat:0.9, src:'U'},
  "جبن قريش": {cal:98, pro:11.1, carb:3.4, fat:4.3, src:'U'},
  "جبن أبيض (عرب/فيتا)": {cal:264, pro:14.2, carb:4.1, fat:21.3, src:'U'},
  "جبن شيدر": {cal:403, pro:24.9, carb:1.3, fat:33.1, src:'U'},
  "لبنة": {cal:180, pro:6, carb:4, fat:16, src:'E'},
  "قيمر": {cal:560, pro:2.5, carb:3, fat:60, src:'E'},

  // خضار
  "خس": {cal:15, pro:1.4, carb:2.9, fat:0.2, src:'U'},
  "طماطة": {cal:18, pro:0.9, carb:3.9, fat:0.2, unit:'piece', avgWeight:123, src:'U'},
  "خيارة": {cal:15, pro:0.7, carb:3.6, fat:0.1, unit:'piece', avgWeight:100, src:'U'},
  "جزر": {cal:41, pro:0.9, carb:9.6, fat:0.2, unit:'piece', avgWeight:61, src:'U'},
  "فلفل رومي أحمر": {cal:31, pro:1, carb:6, fat:0.3, unit:'piece', avgWeight:119, src:'U'},
  "فلفل رومي أخضر": {cal:20, pro:0.9, carb:4.6, fat:0.2, unit:'piece', avgWeight:119, src:'U'},
  "بصل": {cal:40, pro:1.1, carb:9.3, fat:0.1, unit:'piece', avgWeight:110, src:'U'},
  "باذنجان مسلوق": {cal:35, pro:0.8, carb:8.7, fat:0.2, src:'U'},
  "كوسا مسلوقة": {cal:15, pro:1.2, carb:2.7, fat:0.4, src:'U'},
  "بامية مسلوقة": {cal:22, pro:1.9, carb:4.5, fat:0.2, src:'U'},
  "بزاليا مسلوقة": {cal:84, pro:5.4, carb:15.6, fat:0.2, src:'U'},
  "سبانخ": {cal:23, pro:2.9, carb:3.6, fat:0.4, src:'U'},
  "بروكلي مسلوق": {cal:35, pro:2.4, carb:7.2, fat:0.4, src:'U'},
  "فطر": {cal:22, pro:3.1, carb:3.3, fat:0.3, src:'U'},
  "قرنابيط نيء": {cal:25, pro:1.9, carb:5, fat:0.3, src:'U'},
  "قرنابيط مسلوق": {cal:23, pro:1.8, carb:4.1, fat:0.5, src:'U'},
  "قرنابيط مقلي": {cal:150, pro:2.4, carb:8, fat:12, src:'E'},
  "لهانة (ملفوف) نيئة": {cal:25, pro:1.3, carb:5.8, fat:0.1, src:'U'},
  "لهانة (ملفوف) مسلوقة": {cal:23, pro:1.3, carb:5.5, fat:0.1, src:'U'},
  "لهانة حمراء نيئة": {cal:31, pro:1.4, carb:7.4, fat:0.2, src:'U'},
  "شلغم مسلوق": {cal:22, pro:0.7, carb:5.1, fat:0.1, src:'U'},
  "شوندر مسلوق": {cal:44, pro:1.7, carb:10, fat:0.2, src:'U'},
  "فجل": {cal:16, pro:0.7, carb:3.4, fat:0.1, src:'U'},
  "كرفس": {cal:14, pro:0.7, carb:3, fat:0.2, src:'U'},
  "بقدونس": {cal:36, pro:3, carb:6.3, fat:0.8, src:'U'},
  "كزبرة خضراء": {cal:23, pro:2.1, carb:3.7, fat:0.5, src:'U'},
  "رشاد (جرجير)": {cal:25, pro:2.6, carb:3.7, fat:0.7, src:'U'},
  "نعناع": {cal:70, pro:3.8, carb:14.9, fat:0.9, src:'U'},
  "ريحان": {cal:23, pro:3.2, carb:2.7, fat:0.6, src:'U'},
  "بصل أخضر (بصل ورق)": {cal:32, pro:1.8, carb:7.3, fat:0.2, src:'U'},
  "كراث": {cal:61, pro:1.5, carb:14.2, fat:0.3, src:'U'},
  "ثوم": {cal:149, pro:6.4, carb:33, fat:0.5, unit:'piece', avgWeight:3, src:'U'},
  "ليمون حامض": {cal:29, pro:1.1, carb:9.3, fat:0.3, unit:'piece', avgWeight:84, src:'U'},
  "عصير ليمون": {cal:22, pro:0.4, carb:6.9, fat:0.2, src:'U'},
  "فلفل حار أخضر": {cal:40, pro:2, carb:9.5, fat:0.2, unit:'piece', avgWeight:45, src:'U'},
  "فلفل رومي أصفر": {cal:27, pro:1, carb:6.3, fat:0.2, unit:'piece', avgWeight:186, src:'U'},
  "طماطة كرزية": {cal:18, pro:0.9, carb:3.9, fat:0.2, unit:'piece', avgWeight:17, src:'U'},
  "فاصوليا خضراء مسلوقة": {cal:35, pro:1.9, carb:7.9, fat:0.3, src:'U'},
  "باقلاء خضراء مسلوقة": {cal:62, pro:4.8, carb:10.1, fat:0.5, src:'U'},
  "باقلاء يابسة مطبوخة": {cal:110, pro:7.6, carb:19.7, fat:0.4, src:'U'},
  "جزر مسلوق": {cal:35, pro:0.8, carb:8.2, fat:0.2, src:'U'},
  "بطاطا مشوية بالقشر": {cal:93, pro:2.5, carb:21.2, fat:0.1, unit:'piece', avgWeight:173, src:'U'},
  "باذنجان مشوي": {cal:35, pro:0.8, carb:8.7, fat:0.2, src:'U'},
  "باذنجان مقلي": {cal:200, pro:1.5, carb:10, fat:17, src:'E'},
  "سلق مسلوق": {cal:20, pro:1.9, carb:4.1, fat:0.1, src:'U'},
  "قرع (شجر أصفر) مسلوق": {cal:20, pro:0.7, carb:4.9, fat:0.1, src:'U'},
  "زيتون أخضر": {cal:145, pro:1, carb:3.8, fat:15.3, src:'U'},
  "زيتون أسود": {cal:115, pro:0.8, carb:6.3, fat:10.7, src:'U'},
  "طرشي مشكل": {cal:20, pro:0.7, carb:4, fat:0.2, src:'E'},
  "سلطة خضراء بدون زيت": {cal:17, pro:0.9, carb:3.5, fat:0.2, src:'E'},
  "سلطة خضراء بزيت الزيتون": {cal:70, pro:1, carb:4, fat:5.5, src:'E'},
  "تبولة": {cal:120, pro:2.5, carb:14, fat:6, src:'E'},
  "خيار مخلل": {cal:12, pro:0.3, carb:2.3, fat:0.2, src:'U'},

  // فواكه
  "موزة": {cal:89, pro:1.1, carb:22.8, fat:0.3, unit:'piece', avgWeight:118, src:'U'},
  "تفاحة": {cal:52, pro:0.3, carb:13.8, fat:0.2, unit:'piece', avgWeight:182, src:'U'},
  "برتقالة": {cal:47, pro:0.9, carb:11.8, fat:0.1, unit:'piece', avgWeight:131, src:'U'},
  "كيوي": {cal:61, pro:1.1, carb:14.7, fat:0.5, unit:'piece', avgWeight:69, src:'U'},
  "مشمش": {cal:48, pro:1.4, carb:11.1, fat:0.4, unit:'piece', avgWeight:35, src:'U'},
  "تمر (حبة)": {cal:282, pro:2.5, carb:75, fat:0.4, unit:'piece', avgWeight:7, src:'U'},
  "أفوكادو (حبة)": {cal:160, pro:2, carb:8.5, fat:14.7, unit:'piece', avgWeight:150, src:'U'},
  "عنب": {cal:69, pro:0.7, carb:18.1, fat:0.2, src:'U'},
  "رقي": {cal:30, pro:0.6, carb:7.6, fat:0.2, src:'U'},
  "بطيخ (شمام)": {cal:34, pro:0.8, carb:8.2, fat:0.2, src:'U'},
  "مانجو": {cal:60, pro:0.8, carb:15, fat:0.4, src:'U'},
  "فراولة": {cal:32, pro:0.7, carb:7.7, fat:0.3, src:'U'},
  "أناناس": {cal:50, pro:0.5, carb:13.1, fat:0.1, src:'U'},
  "رمان": {cal:83, pro:1.7, carb:18.7, fat:1.2, src:'U'},
  "عرموط (كمثرى)": {cal:57, pro:0.4, carb:15.2, fat:0.1, unit:'piece', avgWeight:178, src:'U'},
  "خوخ": {cal:39, pro:0.9, carb:9.5, fat:0.3, unit:'piece', avgWeight:150, src:'U'},
  "عنجاص (برقوق)": {cal:46, pro:0.7, carb:11.4, fat:0.3, unit:'piece', avgWeight:66, src:'U'},
  "تين": {cal:74, pro:0.8, carb:19.2, fat:0.3, unit:'piece', avgWeight:50, src:'U'},
  "لالنگي (يوسفي)": {cal:53, pro:0.8, carb:13.3, fat:0.3, unit:'piece', avgWeight:88, src:'U'},
  "گريب فروت": {cal:42, pro:0.8, carb:10.7, fat:0.1, unit:'piece', avgWeight:246, src:'U'},
  "جوافة": {cal:68, pro:2.6, carb:14.3, fat:1, unit:'piece', avgWeight:55, src:'U'},
  "خرما (كاكا)": {cal:70, pro:0.6, carb:18.6, fat:0.2, unit:'piece', avgWeight:168, src:'U'},
  "كرز": {cal:63, pro:1.1, carb:16, fat:0.2, src:'U'},
  "توت": {cal:43, pro:1.4, carb:9.8, fat:0.4, src:'U'},
  "توت أزرق (بلوبيري)": {cal:57, pro:0.7, carb:14.5, fat:0.3, src:'U'},
  "نبق (سدر)": {cal:79, pro:1.2, carb:20.2, fat:0.2, src:'U'},
  "زبيب": {cal:299, pro:3.1, carb:79.2, fat:0.5, src:'U'},
  "تين مجفف": {cal:249, pro:3.3, carb:63.9, fat:0.9, src:'U'},
  "مشمش مجفف (قمر الدين/مقدد)": {cal:241, pro:3.4, carb:62.6, fat:0.5, src:'U'},

  // دهون ومكسرات وإضافات
  "زيت زيتون": {cal:884, pro:0, carb:0, fat:100, src:'U'},
  "زيت نباتي": {cal:884, pro:0, carb:0, fat:100, src:'U'},
  "لوز": {cal:579, pro:21.2, carb:21.6, fat:49.9, src:'U'},
  "جوز": {cal:654, pro:15.2, carb:13.7, fat:65.2, src:'U'},
  "فستق حلبي": {cal:560, pro:20.2, carb:27.2, fat:45.3, src:'U'},
  "زبدة فول سوداني": {cal:588, pro:25.1, carb:19.6, fat:50.4, src:'U'},
  "كاكاو باودر سادة (بدون سكر)": {cal:228, pro:19.6, carb:57.9, fat:13.7, src:'U'},
  "طحينة": {cal:595, pro:17, carb:21.2, fat:53.8, src:'U'},
  "سمسم": {cal:573, pro:17.7, carb:23.4, fat:49.7, src:'U'},
  "بذور شيا": {cal:486, pro:16.5, carb:42.1, fat:30.7, src:'U'},
  "بذور كتان": {cal:534, pro:18.3, carb:28.9, fat:42.2, src:'U'},
  "حب شمسي مقشر (بذور دوار الشمس)": {cal:584, pro:20.8, carb:20, fat:51.5, src:'U'},
  "حب ركي (بذور بطيخ) مقشر": {cal:557, pro:28.3, carb:15.3, fat:47.4, src:'U'},
  "كاجو": {cal:553, pro:18.2, carb:30.2, fat:43.8, src:'U'},
  "فول سوداني محمص": {cal:585, pro:23.7, carb:21.5, fat:49.7, src:'U'},
  "مكسرات مشكلة محمصة": {cal:594, pro:17.3, carb:25.4, fat:51.5, src:'U'},
  "بروتين باودر (واي)": {cal:400, pro:78, carb:8, fat:6, src:'E'},
  "بروتين باودر نباتي": {cal:390, pro:75, carb:9, fat:7, src:'E'},
  "دهن حر (سمن حيواني)": {cal:876, pro:0.3, carb:0, fat:99.5, src:'U'},
  "مكعب ماجي (مرق دجاج)": {cal:267, pro:16.7, carb:18, fat:13.9, unit:'piece', avgWeight:10, src:'U'},
  "عسل": {cal:304, pro:0.3, carb:82.4, fat:0, src:'U'},
  "دبس تمر": {cal:290, pro:1.5, carb:72, fat:0.2, src:'E'},

  // حلويات
  "شوكولاتة بالحليب": {cal:535, pro:7.7, carb:59.4, fat:29.7, src:'U'},
  "شوكولاتة داكنة 70-85%": {cal:598, pro:7.8, carb:45.9, fat:42.6, src:'U'},
  "آيس كريم فانيلا": {cal:207, pro:3.5, carb:23.6, fat:11, src:'U'},
  "آيس كريم شوكولاتة": {cal:216, pro:3.8, carb:28.2, fat:11, src:'U'},
  "كيك شوكولاتة بالكريمة (قطعة)": {cal:367, pro:4.1, carb:54.6, fat:16.4, unit:'piece', avgWeight:64, src:'U'},
  "نوتيلا": {cal:539, pro:6.3, carb:57.5, fat:30.9, src:'C'},
  "بسكويت بالشوكولاتة (حبة)": {cal:488, pro:5.4, carb:64.3, fat:24.2, unit:'piece', avgWeight:10, src:'E'},
  "بقلاوة (قطعة)": {cal:430, pro:6.5, carb:38, fat:29, unit:'piece', avgWeight:30, src:'E'},
  "كنافة": {cal:400, pro:7, carb:45, fat:21, src:'E'},
  "حلاوة طحينية": {cal:516, pro:12, carb:60, fat:26, src:'E'},
  "زلابية (قطعة)": {cal:390, pro:3, carb:55, fat:18, unit:'piece', avgWeight:25, src:'E'},

  // مشروبات
  "كولا عادية": {cal:41, pro:0, carb:10.6, fat:0, src:'U'},
  "كولا زيرو / دايت": {cal:0.4, pro:0.1, carb:0, fat:0, src:'U'},
  "عصير برتقال طبيعي": {cal:45, pro:0.7, carb:10.4, fat:0.2, src:'U'},
  "شاي بسكر (استكان)": {cal:40, pro:0, carb:10, fat:0, unit:'piece', avgWeight:100, src:'E'},
  "شاي بدون سكر (استكان)": {cal:1, pro:0, carb:0.3, fat:0, unit:'piece', avgWeight:100, src:'U'},
  "قهوة سادة بدون سكر (كوب)": {cal:1, pro:0.1, carb:0, fat:0, unit:'piece', avgWeight:240, src:'U'},
  "قهوة عربية/تركية بدون سكر (فنجان)": {cal:2, pro:0.1, carb:0.3, fat:0, unit:'piece', avgWeight:60, src:'E'},
  "نسكافيه 3×1 (ظرف بكوب)": {cal:37.5, pro:0.5, carb:6.5, fat:1.2, unit:'piece', avgWeight:200, src:'E'},

  // أكلات عراقية وجاهزة (تقديرية — تختلف حسب الطبخ والدهن)
  "حمص بطحينة": {cal:166, pro:7.9, carb:14.3, fat:9.6, src:'U'},
  "فلافل (حبة)": {cal:333, pro:13.3, carb:31.8, fat:17.8, unit:'piece', avgWeight:17, src:'U'},
  "مرق فاصوليا بيضاء باللحم": {cal:110, pro:7, carb:11, fat:4, src:'E'},
  "مرق باميا باللحم": {cal:95, pro:6, carb:7, fat:5, src:'E'},
  "مرق بزاليا باللحم": {cal:105, pro:7, carb:9, fat:4.5, src:'E'},
  "تشريب (بدون خبز)": {cal:90, pro:8, carb:3, fat:5, src:'E'},
  "دولمة": {cal:180, pro:5, carb:22, fat:8, src:'E'},
  "كبة برغل مقلية (حبة)": {cal:250, pro:10, carb:24, fat:13, unit:'piece', avgWeight:70, src:'E'},
  "كبة حلب (حبة)": {cal:190, pro:8, carb:22, fat:8, unit:'piece', avgWeight:100, src:'E'},
  "شاورما دجاج (بدون خبز)": {cal:190, pro:22, carb:3, fat:10, src:'E'},
  "شاورما لحم (بدون خبز)": {cal:240, pro:20, carb:3, fat:16, src:'E'},
  "باجة": {cal:200, pro:15, carb:2, fat:15, src:'E'},
  "شوربة عدس": {cal:70, pro:4, carb:11, fat:1.3, src:'E'},
  "لبلبي": {cal:140, pro:7.5, carb:22, fat:2.5, src:'E'},
  "كاهي (قطعة)": {cal:400, pro:6, carb:40, fat:24, unit:'piece', avgWeight:100, src:'E'},
  "كليجة (قطعة)": {cal:440, pro:6, carb:62, fat:18, unit:'piece', avgWeight:35, src:'E'},
  // نسخة 92 · مرگات,
  "مرق سبانغ باللحم": {cal:110, pro:6.8, carb:3.3, fat:8.1, src:'E'},
  "مرق فاصوليا خضراء باللحم": {cal:100, pro:5.5, carb:5.7, fat:6.5, src:'E'},
  "مرق قيمة": {cal:157, pro:8.2, carb:11.3, fat:8.9, src:'E'},
  "مرق شجر (كوسا) باللحم": {cal:93, pro:5.3, carb:3.8, fat:6.6, src:'E'},
  "مرق بطاطا باللحم": {cal:121, pro:5.5, carb:11.5, fat:6.1, src:'E'},
  "مرق لوبيا باللحم": {cal:138, pro:8.6, carb:13.6, fat:5.7, src:'E'},
  "مرق كرفس باللحم": {cal:94, pro:5.1, carb:2.8, fat:6.9, src:'E'},
  "مرق دجاج بالخضار": {cal:87, pro:7.1, carb:7.2, fat:3.3, src:'E'},
  "فسنجون بالدجاج": {cal:228, pro:13.2, carb:11.4, fat:15.1, src:'E'},
  "تبسي باذنجان": {cal:189, pro:6.8, carb:8.6, fat:14.6, src:'E'},

  // نسخة 92 · أكلات رئيسية,
  "قوزي على تمن": {cal:218, pro:8.4, carb:22.2, fat:10.4, src:'E'},
  "برياني عراقي بالدجاج": {cal:192, pro:7.8, carb:23.7, fat:7.2, src:'E'},
  "مقلوبة (باذنجان ودجاج)": {cal:172, pro:6.4, carb:19.1, fat:7.7, src:'E'},
  "تمن أحمر": {cal:181, pro:2.9, carb:31, fat:4.7, src:'E'},
  "تمن وماش": {cal:172, pro:4.9, carb:28.7, fat:4.1, src:'E'},
  "مجدرة (عدس ورز)": {cal:194, pro:6.1, carb:28.6, fat:6.3, src:'E'},
  "كبة موصلية (حبة)": {cal:239, pro:12.4, carb:24.8, fat:10.7, unit:'piece', avgWeight:200, src:'E'},
  "كبة حامض (شلغم وشوندر)": {cal:96, pro:3.5, carb:14.1, fat:2.8, src:'E'},
  "كبة بتيتة (حبة)": {cal:216, pro:7.7, carb:17.6, fat:12.9, unit:'piece', avgWeight:80, src:'E'},
  "شيخ محشي": {cal:165, pro:7.1, carb:5.4, fat:13.2, src:'E'},
  "باقلاء بالدهن (بدون خبز)": {cal:160, pro:9.1, carb:17.6, fat:6.4, src:'E'},
  "سمك مطبگ (سمك وتمن)": {cal:185, pro:11, carb:17.8, fat:7.3, src:'E'},

  // نسخة 92 · ريوگ,
  "مخلمة": {cal:147, pro:9.6, carb:3.1, fat:10.6, src:'E'},
  "عجة (قطعة)": {cal:205, pro:9.7, carb:5.9, fat:15.8, unit:'piece', avgWeight:55, src:'E'},
  "طماطة ببيض": {cal:103, pro:4.7, carb:4.6, fat:7.6, src:'E'},
  "كاهي وقيمر بالدبس (صحن)": {cal:417, pro:4.7, carb:36.9, fat:28, unit:'piece', avgWeight:150, src:'E'},
  "صمونة فلافل": {cal:271, pro:9.8, carb:35, fat:10.7, unit:'piece', avgWeight:230, src:'E'},
  "عروگ (حبة)": {cal:295, pro:11.7, carb:19.3, fat:18.9, unit:'piece', avgWeight:50, src:'E'},
  "سمبوسة لحم مقلية (حبة)": {cal:290, pro:8, carb:28, fat:16, unit:'piece', avgWeight:40, src:'E'},

  // نسخة 92 · شوربات,
  "شوربة دجاج": {cal:44, pro:3.6, carb:4.5, fat:1.2, src:'E'},
  "شوربة خضار": {cal:32, pro:0.8, carb:5.2, fat:1.1, src:'E'},
  "هريسة": {cal:95, pro:7.1, carb:10, fat:3, src:'E'},
  "شوربة ماش": {cal:70, pro:3.6, carb:11.4, fat:1.3, src:'E'},

  // نسخة 92 · أكل سريع وصوصات,
  "برگر لحم (سندويچ)": {cal:250, pro:12.5, carb:30, fat:9, unit:'piece', avgWeight:180, src:'E'},
  "سندويچ زنگر / دجاج مقلي": {cal:250, pro:13, carb:25, fat:11, unit:'piece', avgWeight:220, src:'E'},
  "بيتزا جبن (قطعة)": {cal:266, pro:11.4, carb:33.3, fat:9.7, unit:'piece', avgWeight:107, src:'U'},
  "دجاج بروستد (مقلي بالعجينة)": {cal:289, pro:22.5, carb:9.4, fat:17.4, src:'U'},
  "لفة دجاج بالصاج مع صوص": {cal:220, pro:12, carb:22, fat:9, unit:'piece', avgWeight:250, src:'E'},
  "مايونيز": {cal:680, pro:1, carb:0.6, fat:75, src:'U'},
  "كاتشب": {cal:101, pro:1, carb:27, fat:0.1, src:'U'},
  "ثومية (صوص ثوم)": {cal:600, pro:1, carb:4, fat:65, src:'E'},

  // نسخة 92 · حلويات,
  "محلبي": {cal:110, pro:2.8, carb:18.4, fat:2.9, src:'E'},
  "كاستر": {cal:109, pro:3.3, carb:16.9, fat:3.3, src:'E'},
  "حلاوة جزر": {cal:272, pro:1.7, carb:44.7, fat:10.7, src:'E'},
  "داطلي (قطعة)": {cal:340, pro:5, carb:60, fat:10, unit:'piece', avgWeight:60, src:'E'},

  // نسخة 92 · مشروبات,
  "شاي حامض (نومي بصرة) بسكر (استكان)": {cal:35, pro:0, carb:9, fat:0, unit:'piece', avgWeight:100, src:'E'},
  "مشروب طاقة": {cal:45, pro:0.5, carb:11, fat:0, src:'U'},
  "عصير ليمون بالنعناع (محلات)": {cal:60, pro:0.1, carb:15, fat:0.1, src:'E'},
  "عصير موز بالحليب": {cal:90, pro:2.3, carb:16.8, fat:2, src:'E'},
  "عصير فواكه كوكتيل (محلات)": {cal:60, pro:0.6, carb:14, fat:0.3, src:'E'}
};

// ================= dialogs (in-page; browser confirm/alert can be blocked inside frames) =================
function notify(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(notify._h); notify._h = setTimeout(()=>t.classList.remove('show'), 3200);
}
function askConfirm(msg, okLabel, danger){
  return new Promise(resolve=>{
    const m = document.getElementById('modal');
    document.getElementById('modal-msg').textContent = msg;
    const ok = document.getElementById('modal-ok'), no = document.getElementById('modal-cancel');
    ok.textContent = okLabel || 'تأكيد';
    ok.classList.toggle('btn-danger', !!danger);
    m.classList.remove('hidden');
    const done = v=>{ m.classList.add('hidden'); ok.onclick = no.onclick = null; resolve(v); };
    ok.onclick = ()=>done(true); no.onclick = ()=>done(false);
    ok.focus();
  });
}
function uid(){ return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
const ID_RE = /^[a-z0-9]{1,24}$/i;
function r1(x){ return Math.round(x*10)/10; }

// ================= household measures =================
// ok:true = weight per unit from USDA household measures; ok:false = typical Iraqi kitchen estimate
const U = (label, grams, ok)=>({label, grams, ok});
const M_RICE = [U('چفچير رز',70,false), U('كوب',158,true), U('ماعون (صحن)',250,false)];
const M_STEW = [U('چفچير مرق',120,false), U('ماعون مرق',300,false)];
const M_MEAT = [U('كف يد',100,false)];
const M_NUTS = [U('حفنة',28,false)];
const M_OIL  = [U('ملعقة أكل',13.5,true), U('ملعقة شاي',4.5,true)];
const FOOD_MEASURES = {
  'رز أبيض مسلوق (موزون مطبوخ)': M_RICE,
  'رز بسمتي مسلوق': [U('چفچير رز',70,false), U('كوب',158,false), U('ماعون (صحن)',250,false)],
  'رز بالشعرية مطبوخ': [U('چفچير رز',70,false), U('ماعون (صحن)',250,false)],
  'رز أبيض نيء (موزون قبل الطبخ)': [U('كوب',185,true), U('ملعقة أكل',12,false)],
  'شوفان جاف': [U('كوب',81,true), U('نص كوب',40.5,true), U('ملعقة أكل',5,false)],
  'برغل مطبوخ': [U('كوب',182,true), U('چفچير',70,false), U('ماعون (صحن)',250,false)],
  'برغل جاف': [U('كوب',140,true)],
  'معكرونة مسلوقة': [U('كوب',140,true), U('ماعون (صحن)',250,false)],
  'عدس مطبوخ': [U('كوب',198,true)], 'حمص مطبوخ': [U('كوب',164,true)], 'فاصوليا بيضاء مطبوخة': [U('كوب',179,true)],
  'عدس جاف': [U('كوب',192,true)], 'حمص جاف': [U('كوب',200,true)], 'فاصوليا بيضاء جافة': [U('كوب',202,true)],
  'بزاليا مسلوقة': [U('كوب',160,true)], 'بزاليا نيئة': [U('كوب',145,true)],
  'مرق فاصوليا بيضاء باللحم': M_STEW, 'مرق باميا باللحم': M_STEW, 'مرق بزاليا باللحم': M_STEW,
  'تشريب (بدون خبز)': M_STEW, 'شوربة عدس': M_STEW, 'لبلبي': [U('ماعون',250,false)], 'دولمة': [U('ماعون (صحن)',250,false)],
  'حليب كامل الدسم': [U('كوب',244,true), U('استكان',100,false)], 'حليب قليل الدسم 1%': [U('كوب',244,true), U('استكان',100,false)],
  'لبن (زبادي) كامل الدسم': [U('كوب',245,true), U('ملعقة أكل',15,true)], 'لبن (زبادي) قليل الدسم': [U('كوب',245,true), U('ملعقة أكل',15,true)],
  'شنينة (لبن مخيض)': [U('كوب',245,true), U('استكان',100,false)],
  'جبن قريش': [U('كوب',210,true), U('ملعقة أكل',15,false)], 'جبن أبيض (عرب/فيتا)': [U('قطعة',28,true)], 'جبن شيدر': [U('شريحة',28,true)],
  'لبنة': [U('ملعقة أكل',15,false)], 'قيمر': [U('ملعقة أكل',15,false)],
  'زيت زيتون': M_OIL, 'زيت نباتي': M_OIL, 'دهن حر (سمن حيواني)': [U('ملعقة أكل',13,true), U('ملعقة شاي',4.3,true)],
  'تمن عراقي مطبوخ (بالدهن)': M_RICE,
  'سمسم': [U('ملعقة أكل',9,true), U('ملعقة شاي',3,false)], 'بذور شيا': [U('ملعقة أكل',12,true)], 'بذور كتان': [U('ملعقة أكل',10,true)],
  'حب شمسي مقشر (بذور دوار الشمس)': M_NUTS.concat([U('ملعقة أكل',9,false)]), 'حب ركي (بذور بطيخ) مقشر': M_NUTS.concat([U('ملعقة أكل',9,false)]), 'كاجو': M_NUTS, 'فول سوداني محمص': M_NUTS, 'مكسرات مشكلة محمصة': M_NUTS,
  'بروتين باودر (واي)': [U('سكوب',30,false), U('نص سكوب',15,false)], 'بروتين باودر نباتي': [U('سكوب',33,false), U('نص سكوب',16.5,false)],
  'عسل': [U('ملعقة أكل',21,true), U('ملعقة شاي',7,true)], 'طحينة': [U('ملعقة أكل',15,true)],
  'زبدة فول سوداني': [U('ملعقة أكل',16,true)], 'دبس تمر': [U('ملعقة أكل',20,false)], 'حمص بطحينة': [U('ملعقة أكل',15,true)],
  'معجون طماطة': [U('ملعقة أكل',16,true)], 'طحين أبيض': [U('كوب',125,true), U('ملعقة أكل',7.8,true)],
  'حليب نص دسم 2%': [U('كوب',244,true), U('استكان',100,false)], 'حليب خالي الدسم': [U('كوب',244,true), U('استكان',100,false)], 'حليب صويا بدون سكر (نباتي)': [U('كوب',240,true), U('استكان',100,false)], 'حليب صويا محلى (نباتي)': [U('كوب',240,true), U('استكان',100,false)], 'حليب لوز بدون سكر (نباتي)': [U('كوب',240,true), U('استكان',100,false)], 'حليب لوز محلى (نباتي)': [U('كوب',240,true), U('استكان',100,false)],
  'حليب شوفان (نباتي)': [U('كوب',240,true), U('استكان',100,false)], 'حليب جوز هند للشرب بدون سكر (نباتي)': [U('كوب',240,true), U('استكان',100,false)], 'حليب جوز هند للطبخ (علبة)': [U('كوب',240,true), U('ملعقة أكل',15,true)],
  'كاكاو باودر سادة (بدون سكر)': [U('ملعقة أكل',5.4,true), U('ملعقة شاي',1.8,false)],
  'زبيب': [U('حفنة صغيرة',28,false), U('ملعقة أكل',9,false)], 'كرز': [U('كوب',138,true), U('حبة',8,true)], 'توت': [U('كوب',140,true)], 'توت أزرق (بلوبيري)': [U('كوب',148,true)], 'نبق (سدر)': [U('حبة',15,false)],
  'تين مجفف': [U('حبة',8.4,true)], 'مشمش مجفف (قمر الدين/مقدد)': [U('حبة',7,false)],
  'سكر': [U('ملعقة أكل',12.5,true), U('ملعقة شاي',4.2,true)], 'سكر أسمر': [U('ملعقة أكل',13.8,true), U('ملعقة شاي',4.6,true)],
  'جبن موزريلا عادي': [U('شريحة',28,true), U('كوب مبشور',112,true), U('ملعقة أكل مبشور',7,false)], 'جبن موزريلا لايت (قليل الدسم)': [U('شريحة',28,true), U('كوب مبشور',112,true), U('ملعقة أكل مبشور',7,false)], 'زبدة': [U('ملعقة أكل',14.2,true)], 'معكرونة/شعرية جافة': [U('كوب',100,false)],
  'لوز': M_NUTS, 'جوز': M_NUTS, 'فستق حلبي': M_NUTS,
  'عنب': [U('كوب',151,true)], 'فراولة': [U('كوب',152,true)], 'رقي': [U('كوب مكعبات',152,true)], 'بطيخ (شمام)': [U('كوب مكعبات',160,true)],
  'أناناس': [U('كوب',165,true)], 'مانجو': [U('كوب',165,true)], 'رمان': [U('كوب حبوب',174,true)],
  'سبانخ': [U('كوب',30,true)],
  'شوكولاتة بالحليب': [U('لوح صغير',44,true), U('مربع',7,false)], 'شوكولاتة داكنة 70-85%': [U('قطعة',28,true), U('مربع',10,false)],
  'آيس كريم فانيلا': [U('سكوب (نص كوب)',66,true), U('كوب',132,true)], 'آيس كريم شوكولاتة': [U('سكوب (نص كوب)',66,true), U('كوب',132,true)],
  'نوتيلا': [U('ملعقة أكل',18.5,true)], 'كنافة': [U('قطعة',120,false)], 'حلاوة طحينية': [U('قطعة',30,false)],
  'كولا عادية': [U('قوطية 330 مل',340,true), U('قنينة 250 مل',257,true)], 'كولا زيرو / دايت': [U('قوطية 330 مل',335,true)],
  'قرنابيط نيء': [U('كوب مقطع',107,true)], 'قرنابيط مسلوق': [U('كوب',124,true)], 'قرنابيط مقلي': [U('كوب',120,true)],
  'لهانة (ملفوف) نيئة': [U('كوب مقطع',89,true)], 'لهانة (ملفوف) مسلوقة': [U('كوب',150,true)], 'لهانة حمراء نيئة': [U('كوب مقطع',89,true)],
  'شلغم مسلوق': [U('كوب',156,true)], 'شوندر مسلوق': [U('كوب شرائح',170,true)], 'فجل': [U('حبة',4.5,false), U('كوب شرائح',116,true)],
  'كرفس': [U('عود',40,false), U('كوب مقطع',101,true)], 'بقدونس': [U('كوب مفروم',60,true), U('ملعقة أكل',3.8,true)], 'كزبرة خضراء': [U('كوب',16,true)],
  'رشاد (جرجير)': [U('كوب',20,true)], 'نعناع': [U('ملعقة أكل',3.2,true)], 'ريحان': [U('كوب',24,true)], 'بصل أخضر (بصل ورق)': [U('عود',15,false), U('كوب مقطع',100,true)],
  'عصير ليمون': [U('ملعقة أكل',15,true)], 'فاصوليا خضراء مسلوقة': [U('كوب',125,true)], 'باقلاء خضراء مسلوقة': [U('كوب',170,true)], 'باقلاء يابسة مطبوخة': [U('كوب',170,true)],
  'جزر مسلوق': [U('كوب شرائح',156,true)], 'باذنجان مشوي': [U('كوب',99,true)], 'باذنجان مقلي': [U('شريحة',40,false), U('كوب',100,true)], 'سلق مسلوق': [U('كوب',175,true)],
  'قرع (شجر أصفر) مسلوق': [U('كوب',245,true)], 'زيتون أخضر': [U('حبة',4,false), U('ملعقة أكل',8.4,true)], 'زيتون أسود': [U('حبة',4.4,false)],
  'طرشي مشكل': [U('كوب',150,true)], 'سلطة خضراء بدون زيت': [U('ماعون',150,false), U('كوب',70,true)], 'سلطة خضراء بزيت الزيتون': [U('ماعون',150,false), U('كوب',75,true)],
  'تبولة': [U('ماعون',150,false), U('كوب',160,true)], 'خيار مخلل': [U('حبة',35,false)],
  'عصير برتقال طبيعي': [U('كوب',248,true)], 'خس': [U('كوب مقطع',36,true)], 'بروكلي مسلوق': [U('كوب',156,true)],
  // نسخة 92
  "مرق سبانغ باللحم": M_STEW,
  "مرق فاصوليا خضراء باللحم": M_STEW,
  "مرق قيمة": M_STEW,
  "مرق شجر (كوسا) باللحم": M_STEW,
  "مرق بطاطا باللحم": M_STEW,
  "مرق لوبيا باللحم": M_STEW,
  "مرق كرفس باللحم": M_STEW,
  "مرق دجاج بالخضار": M_STEW,
  "فسنجون بالدجاج": M_STEW,
  "تبسي باذنجان": [U("ماعون",300,false)],
  "قوزي على تمن": M_RICE,
  "برياني عراقي بالدجاج": M_RICE,
  "مقلوبة (باذنجان ودجاج)": M_RICE,
  "تمن أحمر": M_RICE,
  "تمن وماش": M_RICE,
  "مجدرة (عدس ورز)": M_RICE,
  "كبة حامض (شلغم وشوندر)": M_STEW,
  "شيخ محشي": [U("ماعون",300,false)],
  "باقلاء بالدهن (بدون خبز)": [U("ماعون",300,false)],
  "سمك مطبگ (سمك وتمن)": M_RICE,
  "مخلمة": [U("ماعون",300,false)],
  "طماطة ببيض": [U("ماعون",330,false)],
  "شوربة دجاج": [U("ماعون",300,false)],
  "شوربة خضار": [U("ماعون",300,false)],
  "هريسة": [U("ماعون",300,false)],
  "شوربة ماش": [U("ماعون",300,false)],
  "دجاج بروستد (مقلي بالعجينة)": [U("كف يد",100,false)],
  "مايونيز": [U("ملعقة أكل",14,false)],
  "كاتشب": [U("ملعقة أكل",17,false)],
  "ثومية (صوص ثوم)": [U("ملعقة أكل",15,false)],
  "محلبي": [U("كاسة",150,false)],
  "كاستر": [U("كاسة",150,false)],
  "حلاوة جزر": [U("ملعقة أكل",20,false), U("صحن صغير",100,false)],
  "مشروب طاقة": [U("قوطية 250 مل",255,false)],
  "عصير ليمون بالنعناع (محلات)": [U("كوب",250,false)],
  "عصير موز بالحليب": [U("كوب",340,false)],
  "عصير فواكه كوكتيل (محلات)": [U("كوب",300,false)]
};
const RECIPE_MEASURES = [U('چفچير مرق',120,false), U('ماعون مرق',300,false), U('چفچير رز',70,false), U('ماعون (صحن)',250,false)];
// meat, chicken, fish: palm-size estimate
Object.keys(FOOD_DB).forEach(n=>{
  if(!FOOD_MEASURES[n] && /(دجاج|لحم|سمك|سلمون|تونة طازجة|هامور|كبدة|تكة|كباب|شاورما|ديك رومي)/.test(n) && FOOD_DB[n].unit!=='piece') FOOD_MEASURES[n] = M_MEAT;
});

function unitsFor(name, f){
  if(f.src==='R'){
    // recipes: log by portion or whole pot; grams and kitchen measures only when the cooked weight is known
    const L = [], known = !!f.cookedKnown;
    if(f.servings>0) L.push({key:'serv', label:'حصة', grams:f.base/f.servings, ok:true, hide:!known, note:`1 من ${f.servings}`});
    L.push({key:'whole', label:'الطبخة كاملة', grams:f.base, ok:true, hide:!known});
    if(known){
      L.push({key:'g', label:'غم', grams:1, ok:true});
      RECIPE_MEASURES.forEach((m,i)=>L.push({key:'m'+i, label:m.label, grams:m.grams, ok:m.ok}));
    }
    return L;
  }
  const list = [];
  if(f.unit==='piece') list.push({key:'piece', label:'حبة', grams:f.avgWeight, ok:f.src==='U'});
  list.push({key:'g', label:'غم', grams:1, ok:true});
  if(f.servingSize) list.push({key:'serv', label:'حصة العلبة', grams:num(f.servingSize), ok:true});
  const ms = FOOD_MEASURES[name] || [];
  ms.forEach((m,i)=>list.push({key:'m'+i, label:m.label, grams:m.grams, ok:m.ok}));
  return list;
}
function unitOptionText(u){
  if(u.key==='g') return 'غم';
  if(u.hide) return u.note ? `${u.label} (${u.note})` : u.label;
  return `${u.label} (${u.ok?'':'~'}${r1(u.grams)} غم${u.ok?'':'، تقريبي'})`;
}
function fmtAmt(a){ return String(r1(a)); }

// ================= search (shared by the meal builder "db" and the recipe builder "rc") =================
function normAr(s){
  return String(s||'').toLowerCase()
    .replace(/[ً-ْٰـ]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
    .replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[پ]/g,'ب').replace(/[گ]/g,'ك').replace(/[چ]/g,'ج')
    .replace(/[()\/%,.:\-]/g,' ').replace(/\s+/g,' ').trim();
}
const SYNONYMS = {
  'سبانخ':['سبانغ','سبانج'], 'سبانغ':['سبانخ','سبانج'], 'مرق':['مرقه','مركه','مرك'], 'بركر':['برجر','همبركر','هامبركر','burger'], 'بيتزا':['بيزا','pizza'], 'بروستد':['بروست','دجاج مقلي','كنتاكي'], 'مايونيز':['مايو','مايونيزه'], 'كاتشب':['كجب','كاتجب','كتشب'], 'ثوميه':['صوص ثوم','ثوم'], 'محلبي':['مهلبيه','محلبيه','مهلبي'], 'كاستر':['كسترد','كاسترد'], 'عروك':['عروق'], 'قوزي':['غوزي','خروف'], 'برياني':['بريان'], 'مقلوبه':['مقلوبة'], 'نومي بصره':['ليمون اسود','لومي','نومي'], 'مشروب طاقه':['ريد بول','ردبول','باور هورس','طاقه'], 'سمبوسه':['سمبوسك','سنبوسه','سمبوسة'], 'فسنجون':['فسنجان'], 'بتيته':['بطاطا','بتيتا'], 'شيخ محشي':['باذنجان محشي','شيخ المحشي'], 'مطبك':['مطبق'], 'عجه':['اومليت','عجة'], 'زنكر':['زنجر','zinger'], 'لفه':['رول','راب','wrap'], 'داطلي':['دطلي'], 'قيمه':['قيمة'], 'تبسي':['طبسي'], 'مجدره':['مجدرة'], 'كاهي':['قيمر'], 'صمونه':['صمون','لفه'],   // نسخة 92
  'قرنابيط':['زهره','قرنبيط','قرنبيت'], 'لهانه':['ملفوف','كرنب','لهانه'], 'شلغم':['لفت'], 'شوندر':['شمندر','بنجر','شونذر'],
  'رشاد':['جرجير'], 'بقدونس':['معدنوس','بقدنوس'], 'كزبره':['كزبره'], 'بصل اخضر':['بصل ورق','بصل اخضر'], 'ليمون':['حامض','نومي حامض','ليمونه'],
  'فاصوليا خضراء':['لوبيا خضراء','فاصوليا خضره'], 'باقلاء':['باقلا','فول'], 'سلق':['سلك'], 'قرع':['يقطين','شجر اصفر'], 'زيتون':['زيتونه'], 'طرشي':['مخلل','مخللات'], 'سلطه':['زلاطه','سلطه','صلطه'],
  'رز':['تمن','ارز'], 'تمن':['رز','ارز'], 'طحينه':['راشي','رشي','طحينيه'], 'سمسم':['سمسم','جلجلان'], 'بروتين باودر':['بروتين','واي','whey','سكوب','بودره'],
  'مكعب ماجي':['ماجي','مرقه','مرق مكعب','ماكي'], 'مقليه':['مقلي','قلي'], 'دهن حر':['سمن','دهن حيواني','دهن الحر'], 'زبده':['زبد'], 'حب شمسي':['حب','بذور','كرزات'], 'حب ركي':['حب','كرزات'], 'بذور':['حبوب','بزور'],
  'مكسرات':['كرزات','نقل'], 'فول سوداني':['فستق عبيد','فستق','فول'], 'سمك':['سمج'], 'قريدس':['روبيان','جمبري'], 'دجاج':['جاج','فراخ','دياي'],
  'بيضه':['بيض'], 'خالي الدسم':['سكم','skim','صفر دسم','0%'], 'نباتي':['حليب نباتي','نباتي'], 'جوز هند':['كوكونت','نارجيل','جوز الهند'], 'توست':['خبز توست','صمون توست'], 'بطاطا':['بتيته'],
  'كاكاو':['كاكو','cocoa','كوكو'], 'عرموط':['كمثرى','اجاص','انجاص'], 'خوخ':['دراق'], 'عنجاص':['برقوق','خوخ احمر'], 'لالنكي':['يوسفي','مندرين','لالنگي'], 'كريب فروت':['جريب فروت','ليمون هندي','سندي'], 'خرما':['كاكا','كاكي','خرمه'], 'نبق':['سدر','نبك'], 'زبيب':['كشمش'], 'جوافه':['كوافه'], 'تورتيلا':['تورتلا','تورتيا','تورتيله','رول','راب'], 'موزريلا':['موتزاريلا','موزاريلا','موزرلا','موزريللا','موزوريلا','بيتزا'],
  'قهوه':['كوفي','كافي','قهوه سوداء','اسبريسو','امريكانو'], 'نسكافيه':['قهوه','نسكافي','كوفي ميكس'], 'شاي':['جاي','چاي'], 'سكر':['شكر'], 'اسمر':['بني','براون'], 'مسلوقه':['مسلوق','مغلي','مكمور'], 'بطاطا':['بتيته','بطاطس'], 'طماطه':['طماطم'], 'باذنجان':['بيتنجان','بتنجان'],
  'كوسا':['شجر','كوسه'], 'خياره':['خيار'], 'موزه':['موز'], 'تفاحه':['تفاح'], 'برتقاله':['برتقال'],
  'بزاليا':['بازلاء','بسله','بزاليه'], 'فاصوليا':['فاصوليه','لوبيا'], 'لحم':['لحمه','ذبيحه'], 'غنم':['غنمي','خروف'],
  'بقر':['عجل'], 'خبز':['خبزه'], 'لبن':['زبادي','روب'], 'شوفان':['اوتس','oats'],
  'رقي':['بطيخ احمر'], 'شمام':['بطيخ اصفر'], 'مسلوق':['مطبوخ'], 'مشوي':['شوي'], 'زيت':['دهن'],
  'تمر':['تمره'], 'جبن':['جبنه'], 'شوكولاته':['جوكليت','شوكلاته','شوكلت','شوكولا'], 'ايس كريم':['دوندرمه','ايسكريم','بوظه','جيلاتي'],
  'كولا':['بيبسي','كوكا','ببسي','غازي'], 'كيك':['كيكه','جاتوه'], 'بسكويت':['بسكت','كوكيز'], 'عصير':['جوس'], 'فلفل':['فلفله'], 'معجون':['صلصه','معجون طماطم'], 'طبختي':['طبخه','طبخاتي']
};
const CTX = {
  db: {input:'db-food', results:'db-results', amount:'db-amount', unit:'db-unit', preview:'db-preview', hits:[], hl:0, food:null, idle:'اختر أكلة من نتائج البحث، وبعدين الكمية والوحدة.'},
  rc: {input:'rc-food', results:'rc-results', amount:'rc-amount', unit:'rc-unit', preview:'rc-preview', hits:[], hl:0, food:null, idle:''}
};
let SEARCH_INDEX = [];
function recipeBase(r){ return num(r.base) || num(r.cooked) || (r.items||[]).reduce((a,it)=>a+itemGrams(it),0); }
function recipeFood(r){ return {cal:r.per.cal, pro:r.per.pro, carb:r.per.carb, fat:r.per.fat, src:'R', recipeId:r.id,
  base:recipeBase(r), servings:num(r.servings), cookedKnown:num(r.cooked)>0}; }
function recipeName(r){ return 'طبختي: ' + r.name; }
function populateFoodList(){
  const all = Object.keys(FOOD_DB).map(n=>({name:n, f:FOOD_DB[n], kind:'db'}))
    .concat((data.customFoods||[]).map(f=>({name:f.name, f, kind:'custom'})))
    .concat((data.recipes||[]).map(r=>({name:recipeName(r), f:recipeFood(r), kind:'recipe'})));
  SEARCH_INDEX = all.map(x=>{
    const base = normAr(x.name);
    let extra = [];
    const words = base.split(' '), hasW = k => k.includes(' ') ? base.includes(k) : words.some(x=>['','ال','بال','ب','و','ول'].some(pf=>x.startsWith(pf + k)));   // الكلمة لازم تبدي بيها (حتى «رز» ما يطلع بـ«كرزية»)
    Object.keys(SYNONYMS).forEach(w=>{ if(hasW(normAr(w))) extra = extra.concat(SYNONYMS[w].map(normAr)); });
    const en = (window.I18N && I18N.en) ? (I18N.food(x.name) || (x.kind === 'recipe' ? I18N.t(x.name) : '')) : '';
    const ek = en && en !== x.name ? normAr(en) : '';
    return {...x, key: base, ek, hay: base + ' ' + extra.join(' ') + (ek ? ' ' + ek : '')};
  });
}
const VEG_START = 'خس', VEG_END = 'خيار مخلل';   // كل الأسماء بين هذني بقاعدة الأكل = خضار
const VEG_NAMES = (()=>{ const k = Object.keys(FOOD_DB), a = k.indexOf(VEG_START), b = k.indexOf(VEG_END); return a >= 0 && b > a ? k.slice(a, b + 1) : []; })()
  .concat(['باذنجان نيء','بامية نيئة','كوسا نيئة','بزاليا نيئة','بطاطا نيئة','بطاطا مسلوقة','ذرة مسلوقة'].filter(n=>FOOD_DB[n]));
const FRUIT_NAMES = (()=>{ const k = Object.keys(FOOD_DB), a = k.indexOf('موزة'), b = k.indexOf('مشمش مجفف (قمر الدين/مقدد)'); return a >= 0 && b > a ? k.slice(a, b + 1) : []; })();
function searchFoods(q){
  const nq = normAr(q);
  if(!nq) return [];
  if(['خضار','خضروات','خضره','خضرة','خضراوات','vegetables','vegetable','veggies','veg'].map(normAr).includes(nq)) return VEG_NAMES.map(n=>SEARCH_INDEX.find(x=>x.name===n)).filter(Boolean);   // كلمة "خضار" تطلع كل الخضار
  if(['فواكه','فواكة','فاكهة','فاكهه','فواكهه','ميوه','fruit','fruits'].map(normAr).includes(nq)) return FRUIT_NAMES.map(n=>SEARCH_INDEX.find(x=>x.name===n)).filter(Boolean);   // وكلمة "فواكه" تطلع كل الفواكه
  const toks = nq.split(' ');
  const hits = [];
  SEARCH_INDEX.forEach(x=>{
    if(!toks.every(t=>x.hay.includes(t) && (' ' + x.hay).match(new RegExp(' (ال|بال|ب|و|ول)?' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))) return;
    const K = x.ek && /[a-z]/.test(nq) ? x.ek : x.key;
    let score = 0;
    if(K===nq) score += 100;
    if(K.startsWith(nq)) score += 50;
    if(K.split(' ').some(w=>w.startsWith(toks[0]))) score += 20;
    if(K.includes(nq)) score += 10;
    if(x.kind!=='db') score += 15;
    score -= x.key.length/100;
    hits.push({x, score});
  });
  return hits.sort((a,b)=>b.score-a.score).slice(0,8).map(h=>h.x);
}
function findFood(name){
  name = String(name||'').trim();
  if(!name) return null;
  if(FOOD_DB[name]) return FOOD_DB[name];
  const custom = (data.customFoods||[]).find(f=>f.name===name);
  if(custom) return custom;
  const rec = (data.recipes||[]).find(r=>recipeName(r)===name);
  if(rec) return recipeFood(rec);
  const n = normAr(name);
  const hit = SEARCH_INDEX.find(x=>x.key===n) || SEARCH_INDEX.find(x=>x.ek && x.ek===n);
  return hit ? hit.f : null;
}
function exactName(name){
  name = String(name||'').trim();
  if(FOOD_DB[name] || (data.customFoods||[]).some(f=>f.name===name) || (data.recipes||[]).some(r=>recipeName(r)===name)) return name;
  const nn = normAr(name), hit = SEARCH_INDEX.find(x=>x.key===nn) || SEARCH_INDEX.find(x=>x.ek && x.ek===nn);
  return hit ? hit.name : name;
}
// most recent distinct foods from the log, with the amount/unit used last time
function recentFoods(limit){
  const seen = new Set(), out = [];
  const keys = Object.keys(data.meals).filter(k=>DATE_RE.test(k)).sort().reverse();
  for(const k of keys){
    const meals = data.meals[k].slice().reverse();
    for(const m of meals){
      for(const it of (m.items||[]).slice().reverse()){
        if(!it.ref || it.ref.src==='R' && !findFood(it.ref.name)) continue;
        if(seen.has(it.ref.name)) continue;
        seen.add(it.ref.name); out.push(it);
        if(out.length>=limit) return out;
      }
    }
  }
  return out;
}
let recentList = [];
function addRecent(i){
  const it = recentList[i]; if(!it) return;
  const copy = cloneItems([it])[0]; recalcItem(copy);
  draft.push(copy); renderDraft();
  notify('انضافت. تكدر تعدل الكمية من قائمة الوجبة');
}
function renderSearch(c){
  const s = CTX[c], box = document.getElementById(s.results);
  const q0 = document.getElementById(s.input).value.trim();
  if(c==='db' && !q0){
    box.innerHTML = '';   // قائمة "آخر الأكلات" انشالت (طلب حر 29 أيلول)
    return;
  }
  if(!s.hits.length){
    const q = document.getElementById(s.input).value.trim();
    box.innerHTML = q && !findFood(q) ? '<div class="goal-note" style="padding:8px 12px; margin:0;">ما لكيت شي. جرب كلمة ثانية' + (c==='db' ? '، أو استخدم الإضافة اليدوية.' : '.') + '</div>' + (c==='db' ? '<button type="button" class="miss-food" onmousedown="event.preventDefault()" onclick="fbMissing()">📩 <span>ما لگيت أكلتي؟</span></button>' : '') : '';
    return;
  }
  box.innerHTML = s.hits.map((x,i)=>{
    const f = x.f;
    const tag = x.kind==='custom' ? 'منتجي' : x.kind==='recipe' ? 'طبختي' : f.src==='E' ? 'تقديري' : 'USDA';
    const per = f.src==='R' ? (f.servings>0 ? `${Math.round(f.cal*f.base/100/f.servings)} سعرة/حصة` : `${Math.round(f.cal*f.base/100)} سعرة/الطبخة`)
      : f.unit==='piece' ? `${Math.round(f.cal*f.avgWeight/100)} سعرة/حبة` : `${Math.round(f.cal)} سعرة/100غم`;
    return `<button type="button" class="result${i===s.hl?' hl':''}" onmousedown="event.preventDefault()" onclick="pickFood('${c}',${i})">
      <span>${esc(x.name)}</span><span class="meta">${per} · ${tag}</span></button>`;
  }).join('') + (c==='db' ? '<button type="button" class="miss-food" onmousedown="event.preventDefault()" onclick="fbMissing()">📩 <span>ما لگيت أكلتي؟</span></button>' : '');
}
function onFoodSearch(c){
  const s = CTX[c], q = document.getElementById(s.input).value;
  s.hits = searchFoods(q); if(findFood(q) && s.hits.length <= 1) s.hits = [];   // اسم مطابق: نبين القائمة إذا اكو أكلات ثانية تشبهه (مثل سكر وسكر أسمر)
  s.hl = 0;
  renderSearch(c);
  syncUnits(c); showFoodInfo(c);
}
function onFoodKey(e, c){
  const s = CTX[c];
  if(!s.hits.length) return;
  if(e.key==='ArrowDown'){ s.hl = (s.hl+1)%s.hits.length; renderSearch(c); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ s.hl = (s.hl-1+s.hits.length)%s.hits.length; renderSearch(c); e.preventDefault(); }
  else if(e.key==='Enter'){ pickFood(c, s.hl); e.preventDefault(); }
}
function pickFood(c, i){
  const s = CTX[c], x = s.hits[i]; if(!x) return;
  document.getElementById(s.input).value = (x.ek && window.I18N && I18N.en) ? (I18N.food(x.name) || I18N.t(x.name)) : x.name;
  s.hits = []; renderSearch(c);
  syncUnits(c); showFoodInfo(c);
  document.getElementById(s.amount).focus();
}
// rebuild the unit dropdown only when the chosen food changes, so the user's pick is kept
function syncUnits(c){
  const s = CTX[c], name = exactName(document.getElementById(s.input).value), f = findFood(name);
  const sel = document.getElementById(s.unit);
  const sig = f ? name : '';
  if(s.food === sig) return;
  s.food = sig;
  const units = f ? unitsFor(name, f) : [{key:'g', label:'غم', grams:1, ok:true}];
  sel.innerHTML = units.map(u=>`<option value="${u.key}">${esc(unitOptionText(u))}</option>`).join('');
  sel.value = units[0].key;
  onUnitChange(c, true);
}
function onUnitChange(c, silent){
  const s = CTX[c], sel = document.getElementById(s.unit), amt = document.getElementById(s.amount);
  amt.placeholder = sel.value==='g' ? '100' : '1';
  if(!silent) showFoodInfo(c);
}
function currentUnit(c){
  const s = CTX[c], name = exactName(document.getElementById(s.input).value), f = findFood(name);
  if(!f) return null;
  return unitsFor(name, f).find(u=>u.key===document.getElementById(s.unit).value) || unitsFor(name,f)[0];
}
function computeCtx(c){
  const s = CTX[c], name = exactName(document.getElementById(s.input).value), f = findFood(name);
  const amount = parseFloat(document.getElementById(s.amount).value);
  if(!f || !amount || amount<=0) return null;
  const u = currentUnit(c);
  return makeItem(name, f, amount, u);
}
function srcNote(src){ return src==='U' ? 'المصدر: USDA' : src==='E' ? '⚠️ قيمة تقديرية (تختلف حسب الطبخ)' : src==='C' ? 'من ملصق المنتج' : src==='R' ? 'من طبختك' : ''; }
function dbPickVis(){
  const v = document.getElementById('db-food').value, name = exactName(v), f = v.trim() ? findFood(name) : null, box = document.getElementById('db-pick');
  if(!box) return;
  if(f){ box.removeAttribute('data-off'); document.getElementById('db-picked').textContent = name; } else box.setAttribute('data-off', '');
  const h = document.getElementById('db-hint'); if(h) h.hidden = !!f || !!(CTX.db.hits||[]).length;
}
function showFoodInfo(c){
  if(c==='db') dbPickVis();
  const s = CTX[c], el = document.getElementById(s.preview);
  const it = computeCtx(c);
  if(!it){ el.textContent = s.idle; return; }
  const u = currentUnit(c);
  el.textContent = `${Math.round(it.cal)} سعرة · بروتين ${it.pro.toFixed(1)}غم · كارب ${it.carb.toFixed(1)}غم · دهون ${it.fat.toFixed(1)}غم` +
    (u.key!=='g' && !u.hide ? ` · = ${Math.round(it.ref.amount*u.grams)} غم${u.ok?'':' تقريباً'}` : '') + ' — ' + srcNote(it.ref.src);
}
function clearCtx(c){
  const s = CTX[c];
  document.getElementById(s.input).value=''; document.getElementById(s.amount).value='';
  s.hits = []; s.food = null; renderSearch(c); syncUnits(c);
  document.getElementById(s.preview).textContent = s.idle;
  if(c==='db') dbPickVis();
}

// ================= items (snapshot values + a "ref" so amounts stay editable) =================
function makeItem(name, f, amount, u){
  const src = f.src || (f.servingSize ? 'C' : '');
  const it = {ref:{name, per:{cal:num(f.cal), pro:num(f.pro), carb:num(f.carb), fat:num(f.fat)}, amount:num(amount),
    unitLabel:u.label, unitGrams:num(u.grams), approx:!u.ok, hideGrams:!!u.hide, src}};
  recalcItem(it);
  return it;
}
function recalcItem(it){
  const r = it.ref, g = r.amount*r.unitGrams;
  it.cal = r.per.cal*g/100; it.pro = r.per.pro*g/100; it.carb = r.per.carb*g/100; it.fat = r.per.fat*g/100;
  it.note = `${r.name} — ${fmtAmt(r.amount)} ${r.unitLabel}` + (r.unitLabel!=='غم' && !r.hideGrams ? ` (${Math.round(g)} غم${r.approx?' تقريباً':''})` : '') + (r.src==='E' ? ' (تقديري)' : '');
}
function itemGrams(it){ return it.ref ? it.ref.amount*it.ref.unitGrams : 0; }
function cloneItems(items){ return JSON.parse(JSON.stringify(items||[])); }
function sumItems(items){ return (items||[]).reduce((a,it)=>({cal:a.cal+num(it.cal), pro:a.pro+num(it.pro), carb:a.carb+num(it.carb), fat:a.fat+num(it.fat)}), {cal:0,pro:0,carb:0,fat:0}); }
function renderItemList(items, containerId, which, emptyText){
  const el = document.getElementById(containerId);
  if(!items.length){ el.innerHTML = `<div class="empty">${emptyText}</div>`; return; }
  el.innerHTML = items.map((it,i)=>{
    const r = it.ref;
    const title = r ? r.name + (r.src==='E' ? ' (تقديري)' : '') : it.note;
    const amt = r ? `<input type="number" class="amt" inputmode="decimal" min="0" step="any" value="${esc(fmtAmt(r.amount))}" aria-label="الكمية" onchange="setItemAmount('${which}',${i},this.value)">
        <span>${esc(r.unitLabel)}${r.unitLabel!=='غم' && !r.hideGrams ? ` · ${Math.round(itemGrams(it))} غم` : ''}</span>` : '<span>كمية ثابتة</span>';
    return `<div class="item">
      <div class="item-top"><span>${esc(title)}</span><button class="del" aria-label="حذف" onclick="removeItem('${which}',${i})">✕</button></div>
      <div class="item-bot">${amt}<span class="pill">${Math.round(num(it.cal))} سعرة</span><span>ب${num(it.pro).toFixed(1)} · ك${num(it.carb).toFixed(1)} · د${num(it.fat).toFixed(1)}</span></div>
    </div>`;
  }).join('');
}
function listOf(which){ return which==='rc' ? rcItems : draft; }
function setItemAmount(which, i, v){
  const it = listOf(which)[i]; v = num(v);
  if(!it || !it.ref) return;
  if(v<=0){ notify('الكمية لازم تكون أكثر من صفر'); which==='rc' ? renderRc() : renderDraft(); return; }
  it.ref.amount = v; recalcItem(it);
  which==='rc' ? renderRc() : renderDraft();
}
function removeItem(which, i){ listOf(which).splice(i,1); which==='rc' ? renderRc() : renderDraft(); }

// ================= current meal (draft) =================
let draft = [];
let mode = null; // null | {type:'meal', key, idx} | {type:'saved', id}

function renderDraft(){
  renderItemList(draft, 'draft-items', 'draft', 'لم تضف أي مقدار بعد');
  const wrap = document.getElementById('draft-totals-wrap');
  if(!draft.length){ wrap.style.display='none'; }
  else {
    const t = sumItems(draft);
    document.getElementById('draft-cal').textContent = Math.round(t.cal);
    document.getElementById('draft-pro').textContent = Math.round(t.pro);
    document.getElementById('draft-carb').textContent = Math.round(t.carb);
    document.getElementById('draft-fat').textContent = Math.round(t.fat);
    wrap.style.display='grid';
  }
  setEditUI();
}
function setEditUI(){
  const card = document.getElementById('draft-card');
  card.classList.toggle('editing', !!mode);
  let title = 'ضيف أكل', save = 'حفظ الوجبة';
  if(mode && mode.type==='meal'){ title = `تعديل وجبة <span class="pill">${esc(dayName(mode.key))}</span>`; save = 'حفظ التعديل'; }
  if(mode && mode.type==='saved'){ title = 'تعديل وجبة جاهزة'; save = 'حفظ الوجبة الجاهزة'; }
  document.getElementById('draft-title').innerHTML = title;
  document.getElementById('draft-save-btn').textContent = save;
  document.getElementById('draft-saveas-btn').style.display = (mode && mode.type==='saved') ? 'none' : '';
  const cancel = document.getElementById('draft-cancel-btn');
  cancel.style.display = (mode || draft.length) ? '' : 'none';
  cancel.textContent = mode ? 'إلغاء التعديل' : 'تفريغ';
  const b = document.getElementById('fab-badge'); b.hidden = !draft.length; b.textContent = draft.length;
}
function addDraftFromDB(){
  const it = computeCtx('db');
  if(!it){ notify('اختر أكلة من نتائج البحث واكتب الكمية'); return; }
  draft.push(it);
  clearCtx('db'); renderDraft();
}
function addDraftManual(){
  const cal = num(document.getElementById('in-cal').value), pro = num(document.getElementById('in-pro').value);
  const carb = num(document.getElementById('in-carb').value), fat = num(document.getElementById('in-fat').value);
  const note = document.getElementById('in-note').value.trim() || 'مقدار';
  if(cal<=0 && pro<=0 && carb<=0 && fat<=0){ notify('اكتب قيمة غذائية وحدة على الأقل'); return; }
  draft.push({cal,pro,carb,fat,note});
  ['in-cal','in-pro','in-carb','in-fat','in-note'].forEach(id=>document.getElementById(id).value='');
  renderDraft();
}
async function confirmDiscardDraft(){
  if(!draft.length) return true;
  return askConfirm('عندك مقادير بالوجبة الحالية ما محفوظة. تريد تستبدلها؟', 'استبدال');
}
async function editMeal(key, idx){
  const m = (data.meals[key]||[])[idx]; if(!m) return;
  if(!await confirmDiscardDraft()) return;
  draft = cloneItems(m.items);
  document.getElementById('draft-label').value = m.label || '';
  mode = {type:'meal', key, idx};
  renderDraft(); scrollToDraft();
}
async function cancelEdit(){
  if(!mode && draft.length && !await askConfirm('تفريغ كل مقادير الوجبة الحالية؟', 'تفريغ', true)) return;
  mode = null; draft = [];
  document.getElementById('draft-label').value='';
  closeSheet(); renderDraft(); renderToday();
}
function setMealName(n){ document.getElementById('draft-label').value = n; }
function mealNameByTime(){ const hr = new Date().getHours(); return hr<11 ? 'فطور' : hr<16 ? 'غداء' : hr<19 ? 'سناك' : 'عشاء'; }
function openSheet(){
  if(!document.getElementById('db-food').value.trim()) renderSearch('db');
  renderFavRow();
  document.getElementById('sheet').hidden = false;
  document.getElementById('sheet-backdrop').hidden = false;
  document.body.classList.add('sheet-open');
}
function closeSheet(){
  document.getElementById('sheet').hidden = true;
  document.getElementById('sheet-backdrop').hidden = true;
  document.body.classList.remove('sheet-open');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !document.getElementById('snap').hidden){ SNAP.close(); return; } if(e.key==='Escape' && !document.getElementById('sheet').hidden && document.getElementById('modal').classList.contains('hidden')) closeSheet(); });
function scrollToDraft(){ openSheet(); }

async function saveDraftMeal(){
  if(!draft.length){ notify(mode && mode.type==='meal' ? 'الوجبة فارغة — إذا تريد تحذفها استخدم ✕ بقائمة الوجبات' : 'أضف مقادير الوجبة أولاً'); return; }
  const typed = document.getElementById('draft-label').value.trim();
  const label = typed || (mode && mode.type==='saved' ? '' : ((curDay||todayKey())===todayKey() ? mealNameByTime() : 'وجبة'));
  if(mode && mode.type==='saved'){
    const sm = data.savedMeals.find(x=>x.id===mode.id);
    if(sm){ sm.name = label || sm.name; sm.items = cloneItems(draft); }
    notify('انحفظت الوجبة الجاهزة ✅');
  } else if(mode && mode.type==='meal' && data.meals[mode.key] && data.meals[mode.key][mode.idx]){
    const old = data.meals[mode.key][mode.idx];
    data.meals[mode.key][mode.idx] = {label: label || 'وجبة', items: cloneItems(draft), t: old.t || Date.now(), edited: Date.now()};
    notify('انحفظ التعديل ✅');
  } else {
    const key = curDay || todayKey();
    if(!data.meals[key]) data.meals[key] = [];
    data.meals[key].push({label: label || 'وجبة', items: cloneItems(draft), t: Date.now()});
    notify('انحفظت الوجبة ✅');
  }
  save();
  mode = null; draft = [];
  document.getElementById('draft-label').value='';
  closeSheet();
  renderDraft(); renderToday(); renderSavedMeals();
}


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
    const img = new Image(); img.src = 'media/hero-full.webp';
    await img.decode();
    const sh = Math.round(img.height * .52), dh = 390, dw = Math.round(img.width * dh / sh), cx = W/2 - dw/2, cy = 1316;
    x.save(); x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(W/2, cy + dh*.52, 200, 0, Math.PI*2); x.fill(); x.restore();
    x.drawImage(img, 0, 0, img.width, sh, cx, cy, dw, dh);
  }catch(e){}
  // التوقيع
  x.fillStyle = '#ffb14a'; x.save(); x.direction = 'ltr'; x.font = '800 44px Poppins, "IBM Plex Sans Arabic", sans-serif'; x.letterSpacing = '8px'; x.fillText('BE YOUR OWN HERO', W/2 + 4, 1740); x.restore();
  x.fillStyle = 'rgba(255,177,74,.85)'; x.save(); x.direction = 'ltr'; x.font = '48px HeroCun'; x.fillText(PH, W/2, 1810); x.restore();
  x.fillStyle = 'rgba(255,255,255,.8)'; x.save(); x.direction = 'ltr'; x.font = '700 40px "IBM Plex Sans Arabic"'; x.fillText('@heroapp.iq', W/2, 1880); x.restore();
  return await new Promise(r=>c.toBlob(r, 'image/png'));
}
let WEEK_END = null;
function weekShareData(){
  const S = weekStats(WEEK_END || todayKey());
  return {S, sc: weekScore(S), streak: achStats().streak || 0};
}
async function shareDrawWeek(d){
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), en = shareEn(), S = d.S;
  try{ await Promise.all(['40px HeroCun', '40px Lalezar', '700 40px "IBM Plex Sans Arabic"', '500 40px "IBM Plex Sans Arabic"'].map(f=>document.fonts.load(f, f.includes('HeroCun') ? '\u{12049}' : 'هيرو'))); }catch(e){}
  const g = x.createRadialGradient(W/2, H*.4, 60, W/2, H*.4, H*.8); g.addColorStop(0, '#244273'); g.addColorStop(1, '#0f1c34');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const PH = '\u{12049} \u{1213F}\u{12328} \u{1230B}\u{12326} \u{1212D}\u{12292}';
  x.save(); x.direction = 'ltr'; x.textAlign = 'left'; x.font = '44px HeroCun';
  for(let r = 0; r < 6; r++){
    const y = 80 + r * 84, a = Math.max(0, .22 - r * .032);
    x.fillStyle = `rgba(226,182,89,${a})`; x.fillText((PH + '  ').repeat(6), r % 2 ? -140 : -20, y);
    x.fillStyle = `rgba(226,182,89,${a * .45})`; x.fillRect(0, y + 26, W, 2);
  }
  x.restore();
  x.textAlign = 'center'; x.direction = en ? 'ltr' : 'rtl';
  x.fillStyle = '#ffc94d'; x.font = '130px Lalezar'; x.fillText('هيرو', W/2, 250);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.font = '700 36px "IBM Plex Sans Arabic"'; x.save(); x.direction = 'ltr'; x.letterSpacing = '14px'; x.fillText('HERO', W/2 + 7, 312); x.restore();
  // وجه هيرو
  try{
    const im = new Image(); im.src = 'media/hero-face.webp'; await im.decode();
    x.save(); x.beginPath(); x.arc(W/2, 430, 72, 0, Math.PI*2); x.closePath(); x.fillStyle = '#e9eef8'; x.fill(); x.clip();
    const s0 = Math.min(im.width, im.height); x.drawImage(im, (im.width-s0)/2, (im.height-s0)/2, s0, s0, W/2-72, 358, 144, 144); x.restore();
    x.strokeStyle = '#ffc94d'; x.lineWidth = 6; x.beginPath(); x.arc(W/2, 430, 74, 0, Math.PI*2); x.stroke();
  }catch(e){}
  const name = data.profile && data.profile.name ? data.profile.name.split(' ')[0] : '';
  const a = dateFromKey(S.startK), b = dateFromKey(S.endK);
  const MON_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const range = en ? `${a.getDate()} ${MON_EN[a.getMonth()]} – ${b.getDate()} ${MON_EN[b.getMonth()]}` : `${a.getDate()} ${AR_MONTHS[a.getMonth()]} - ${b.getDate()} ${AR_MONTHS[b.getMonth()]}`;
  x.fillStyle = '#ffffff'; x.font = '700 50px "IBM Plex Sans Arabic"';
  x.fillText(en ? (name ? `${name}'s week` : 'My week') : (name ? `أسبوع ${name}` : 'أسبوعي'), W/2, 570);
  x.fillStyle = 'rgba(255,255,255,.65)'; x.font = '500 36px "IBM Plex Sans Arabic"'; x.fillText(range, W/2, 625);
  // حلقة النقاط
  const cy = 830, R = 150;
  x.lineCap = 'round'; x.lineWidth = 28;
  x.strokeStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.arc(W/2, cy, R, 0, Math.PI*2); x.stroke();
  if(d.sc > 0){ x.strokeStyle = '#ffc94d'; x.beginPath(); x.arc(W/2, cy, R, -Math.PI/2, -Math.PI/2 + Math.PI*2*d.sc/100); x.stroke(); }
  x.save(); x.direction = 'ltr'; x.fillStyle = '#ffffff'; x.font = '700 130px "IBM Plex Sans Arabic"'; x.fillText(String(d.sc), W/2, cy + 30);
  x.restore(); x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 34px "IBM Plex Sans Arabic"'; x.fillText(en ? '/ 100' : 'من 100', W/2, cy + 82);
  x.fillStyle = '#ffc94d'; x.font = '700 54px "IBM Plex Sans Arabic"';
  const msg = weekScoreMsg(d.sc); x.fillText(en && I18N.t ? I18N.t(msg) : msg, W/2, 1065);
  // المربعات
  const tiles = [
    ['📝', `${S.logged}/7`, en ? 'days logged' : 'أيام سجلت أكلي'],
    S.hasT ? ['🎯', `${S.calDays}/7`, en ? 'days on target' : 'أيام ضمن هدفي'] : ['🔥', String(d.streak), en ? 'day streak' : 'يوم ورا بعض'],
    ['🏋️', `${S.workouts}`, en ? 'workouts' : 'حصص تمرين'],
    ['💧', `${S.waterDays}/7`, en ? 'water goal days' : 'أيام هدف الماي'],
    ['😴', `${S.sleepGood}/7`, en ? 'nights slept 7h+' : 'ليالي نوم كافي'],
    ['🔥', String(d.streak), en ? 'day streak' : 'يوم ورا بعض'],
  ];
  if(!S.hasT) tiles[5] = ['⭐', String(achStats().xp || 0), en ? 'total points' : 'مجموع نقاطي'];
  const tw = 450, th = 150, gx = 40, x0 = (W - tw*2 - gx)/2;
  tiles.forEach((t, i)=>{
    const col = en ? i % 2 : 1 - i % 2, row = Math.floor(i/2), tx = x0 + col*(tw+gx), ty = 1120 + row*(th+26);
    x.fillStyle = 'rgba(255,255,255,.08)';
    x.beginPath(); if(x.roundRect) x.roundRect(tx, ty, tw, th, 28); else x.rect(tx, ty, tw, th); x.fill();
    const icx = en ? tx + 70 : tx + tw - 70;
    x.textAlign = 'center'; x.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillStyle = '#fff'; x.fillText(t[0], icx, ty + 98);
    x.textAlign = en ? 'left' : 'right'; const tx2 = en ? tx + 140 : tx + tw - 140;
    x.save(); x.direction = 'ltr'; x.textAlign = en ? 'left' : 'right'; x.fillStyle = '#ffffff'; x.font = '700 60px "IBM Plex Sans Arabic"'; x.fillText(t[1], tx2, ty + 72); x.restore();
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '500 32px "IBM Plex Sans Arabic"'; x.fillText(t[2], tx2, ty + 120);
  });
  x.textAlign = 'center';
  x.fillStyle = '#ffc94d'; x.font = '700 48px "IBM Plex Sans Arabic"'; x.fillText(en ? '#HeroChallenge' : '#تحدي_هيرو', W/2, 1680);
  x.fillStyle = '#ffb14a'; x.save(); x.direction = 'ltr'; x.font = '800 40px Poppins, "IBM Plex Sans Arabic", sans-serif'; x.letterSpacing = '8px'; x.fillText('BE YOUR OWN HERO', W/2 + 4, 1752); x.restore();
  x.fillStyle = 'rgba(255,177,74,.85)'; x.save(); x.direction = 'ltr'; x.font = '44px HeroCun'; x.fillText(PH, W/2, 1814); x.restore();
  x.fillStyle = 'rgba(255,255,255,.8)'; x.save(); x.direction = 'ltr'; x.font = '700 40px "IBM Plex Sans Arabic"'; x.fillText('@heroapp.iq', W/2, 1878); x.restore();
  return await new Promise(r=>c.toBlob(r, 'image/png'));
}
async function shareOpen(kind, extra){
  const d = kind === 'week' ? weekShareData() : shareData(kind, extra);
  if(!d){ notify(kind==='weight' ? 'سجّل وزنك مرتين على الأقل حتى نسوي بطاقة' : 'ما لكينا شي نشاركه بعد'); return; }
  trOpenSheet('شارك إنجازك', `<img class="share-prev" id="share-prev" alt="بطاقة الإنجاز"><div class="share-btns">
    <button type="button" class="gold" id="share-go" onclick="shareGo()" disabled>${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'}<span>شارك</span></button>
    <button type="button" class="ghost" onclick="shareSave()">نزّل الصورة</button></div>
    <div class="goal-note" style="text-align:center;">حطها ستوري وتاگ <b dir="ltr">@heroapp.iq</b> 💛</div>`, true);
  SHARE.blob = await (kind === 'week' ? shareDrawWeek(d) : shareDraw(d)); if(SHARE.url) URL.revokeObjectURL(SHARE.url);
  SHARE.url = URL.createObjectURL(SHARE.blob); SHARE.name = `hero-${kind}.png`;
  SHARE.text = kind === 'week' ? (shareEn() ? 'My HERO week 💪 #HeroChallenge @heroapp.iq' : 'أسبوعي ويا هيرو 💪 #تحدي_هيرو @heroapp.iq')
    : shareEn() ? 'BE YOUR OWN HERO 💪 @heroapp.iq' : 'BE YOUR OWN HERO 💪 تابعوا @heroapp.iq';
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

// ================= saved meals =================
async function saveItemsAsSaved(name, items){
  name = String(name||'').trim();
  if(!name){ notify('اكتب اسم الوجبة أولاً (بخانة "اسم الوجبة")'); return false; }
  if(!items.length){ notify('الوجبة فارغة'); return false; }
  const existing = data.savedMeals.find(x=>x.name===name);
  if(existing){
    if(!await askConfirm(`عندك وجبة جاهزة اسمها "${name}". تستبدلها بهذي؟`, 'استبدال')) return false;
    existing.items = cloneItems(items);
  } else {
    data.savedMeals.push({id:uid(), name, items:cloneItems(items)});
  }
  save(); renderSavedMeals(); renderQuick(); renderFavRow(); if(typeof renderToday==='function') renderToday();
  notify(`"${name}" انحفظت بـ«وجباتي» ⭐ تلگاها بأول «ضيف أكل»`);
  return true;
}
function saveDraftAsSaved(){ return saveItemsAsSaved(document.getElementById('draft-label').value, draft); }
function saveLoggedAsSaved(key, idx){ const m = (data.meals[key]||[])[idx]; if(m) saveItemsAsSaved(m.label, m.items); }
function quickAdd(id){
  const sm = data.savedMeals.find(x=>x.id===id); if(!sm) return;
  draft = draft.concat(cloneItems(sm.items));
  const lbl = document.getElementById('draft-label');
  if(!lbl.value.trim()) lbl.value = sm.name;
  renderDraft(); scrollToDraft();
  notify('انضافت للوجبة الحالية. عدّل الكميات إذا تريد، وبعدين اضغط حفظ');
}
async function quickLog(id){
  const sm = data.savedMeals.find(x=>x.id===id); if(!sm) return;
  const key = curDay || todayKey();
  if(!data.meals[key]) data.meals[key] = [];
  data.meals[key].push({label: sm.name, items: cloneItems(sm.items), t: Date.now()});
  save(); renderToday();
  notify(`انسجلت "${sm.name}" على ${dayName(key)} ✅`);
}
async function editSaved(id){
  const sm = data.savedMeals.find(x=>x.id===id); if(!sm) return;
  if(!await confirmDiscardDraft()) return;
  draft = cloneItems(sm.items);
  document.getElementById('draft-label').value = sm.name;
  mode = {type:'saved', id};
  switchTab('today'); renderDraft(); scrollToDraft();
}
async function deleteSaved(id){
  const sm = data.savedMeals.find(x=>x.id===id); if(!sm) return;
  if(!await askConfirm(`حذف الوجبة الجاهزة "${sm.name}"؟ الوجبات المسجلة سابقاً ما تتأثر.`, 'حذف', true)) return;
  data.savedMeals = data.savedMeals.filter(x=>x.id!==id);
  if(mode && mode.type==='saved' && mode.id===id){ mode = null; }
  save(); renderSavedMeals(); renderQuick(); setEditUI();
}
function renderSavedMeals(){
  const el = document.getElementById('saved-meals-list');
  if(!data.savedMeals.length){ el.innerHTML = '<div class="empty">ما عندك وجبات جاهزة بعد</div>'; return; }
  el.innerHTML = data.savedMeals.map(sm=>{
    const t = sumItems(sm.items);
    return `<div class="item">
      <div class="item-top"><b>${esc(sm.name)}</b><span class="pill">${Math.round(t.cal)} سعرة</span></div>
      <div class="item-bot"><span>بروتين ${Math.round(t.pro)}غم · كارب ${Math.round(t.carb)}غم · دهون ${Math.round(t.fat)}غم · ${sm.items.length} مقادير</span></div>
      <div class="btn-row">
        <button class="ghost" onclick="quickLog('${sm.id}')">سجلها على اليوم</button>
        <button class="ghost" onclick="editSaved('${sm.id}')">تعديل</button>
        <button class="ghost" onclick="deleteSaved('${sm.id}')">حذف</button>
      </div>
    </div>`;
  }).join('');
}
const AR_SHORT = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
function renderWeek(){
  const el = document.getElementById('week-chart'), note = document.getElementById('week-note');
  if(!el) return;
  const curK = curDay || todayKey(), end = dateFromKey(curK);
  const days = [];
  for(let i=0;i<7;i++){   // الأحدث فوك
    const d = new Date(end); d.setDate(d.getDate()-i);
    const k = keyFromDate(d), ms = data.meals[k] || [];
    const t = ms.reduce((a,m)=>{ const x = mealTotals(m); return {cal:a.cal+x.cal, pro:a.pro+x.pro}; }, {cal:0, pro:0});
    days.push({k, d, logged: ms.length>0, cal:t.cal, pro:t.pro});
  }
  const logged = days.filter(x=>x.logged);
  const hasTarget = !!data.profile && !TRACK;
  const lo = hasTarget ? CAL_MIN : 0, hi = hasTarget ? CAL_MAX : 0, tgt = hasTarget ? (lo+hi)/2 : 0;
  const max = Math.max(hi*1.25, ...days.map(x=>x.cal), 500), pct = v=>Math.min(100, v/max*100);
  const avg = logged.length ? logged.reduce((a,x)=>a+x.cal,0)/logged.length : 0, avgPro = logged.length ? logged.reduce((a,x)=>a+x.pro,0)/logged.length : 0;
  const sum = `<div class="wk-sum">
      <div><b>${logged.length ? Math.round(avg) : '—'}</b><span>معدل السعرات</span></div>
      <div><b>${logged.length ? Math.round(avgPro)+'غ' : '—'}</b><span>معدل البروتين</span></div>
      <div><b>${logged.length}/7</b><span>أيام مسجلة</span></div></div>`;
  const rows = days.map(x=>{
    const isCur = x.k===curK, d = x.d, nm = x.k===todayKey() ? 'اليوم' : AR_DAYS[d.getDay()];
    const st = !hasTarget ? 'lo' : x.cal > hi ? 'hi' : x.cal >= lo*0.9 ? 'ok' : 'lo';
    const band = hasTarget ? `<span class="tgb" style="inset-inline-start:${pct(lo).toFixed(1)}%; width:${(pct(hi)-pct(lo)).toFixed(1)}%"></span><span class="tg" style="inset-inline-start:${pct(tgt).toFixed(1)}%"></span>` : '';
    return `<button type="button" class="wk-row${isCur?' cur':''}" onclick="openDay('${x.k}')" aria-label="${esc(dayName(x.k))}: ${x.logged ? Math.round(x.cal)+' سعرة' : 'ما مسجل'}">
      <span class="wk-day">${nm}<small>${d.getDate()} ${AR_MONTHS[d.getMonth()]}</small></span>
      <span class="wk-bar">${band}${x.logged ? `<i class="${st}" style="width:${pct(x.cal).toFixed(1)}%"></i>` : ''}</span>
      <span class="wk-val${x.logged?'':' none'}">${x.logged ? Math.round(x.cal) : 'ما مسجل'}</span>
    </button>`;
  }).join('');
  const key = hasTarget ? `<div class="wk-key"><span><i style="background:#1f9d6b"></i>ضمن الهدف (${Math.round(lo)}-${Math.round(hi)})</span><span><i style="background:color-mix(in srgb, var(--tone) 55%, var(--card))"></i>أقل</span><span><i style="background:#e9a21f"></i>أكثر</span></div>` : '';
  el.innerHTML = sum + `<div class="wk-rows">${rows}</div>` + key;
  if(!logged.length){ note.textContent = 'سجل أكلك كم يوم حتى يطلعلك معدل الأسبوع.'; return; }
  let msg = '';
  if(hasTarget){
    if(logged.length < 3) msg = 'نقارن بهدفك بعد 3 أيام مسجلة.';
    else {
      const dd = Math.round(avg - tgt);
      if(Math.abs(dd) <= 100) msg = '✅ معدل الأسبوع ضمن هدفك.';
      else if(dd > 100) msg = `🔸 أعلى من هدفك بـ ${dd} سعرة باليوم. رجّع أيامك الجاية للهدف بدون تجويع.`;
      else if(dd < -300) msg = '⚠️ أقل من هدفك بكثير. الأكل القليل جداً يضر العضل ويصعّب الاستمرار، زيد أكلك شوية.';
      else msg = `🔸 أقل من هدفك بـ ${-dd} سعرة باليوم.`;
    }
  }
  note.textContent = msg;
}
function prevKey(k){ const d = dateFromKey(k); d.setDate(d.getDate()-1); return keyFromDate(d); }
function renderQuick(){ const qc = document.getElementById('quick-card'); if(qc && qc.dataset.off){ qc.style.display='none'; return; }
  const card = document.getElementById('quick-card'); if(!card) return;
  const chips = document.getElementById('quick-meals');
  chips.innerHTML = data.savedMeals.map(sm=>`<button class="chip" onclick="quickAdd('${sm.id}')">${esc(sm.name)} <span class="meta">${Math.round(sumItems(sm.items).cal)} سعرة</span></button>`).join('');
  const pk = prevKey(curDay || todayKey());
  const prev = data.meals[pk] || [];
  const row = document.getElementById('repeat-row');
  if(prev.length){
    row.style.display = '';
    document.getElementById('repeat-btn').textContent = `كرر وجبات ${dayName(pk)} (${prev.length} وجبة، ${Math.round(prev.reduce((a,m)=>a+mealTotals(m).cal,0))} سعرة)`;
  } else row.style.display = 'none';
  card.style.display = (data.savedMeals.length || prev.length) ? '' : 'none';
}

// ================= repeat / copy =================
async function repeatPrevDay(){
  const key = curDay || todayKey(), pk = prevKey(key), prev = data.meals[pk] || [];
  if(!prev.length) return;
  const cur = data.meals[key] || [];
  const msg = cur.length ? `راح تنضاف ${prev.length} وجبة من ${dayName(pk)} فوق وجباتك الحالية (${cur.length}). تكمل؟`
                         : `نسخ ${prev.length} وجبة من ${dayName(pk)} على ${dayName(key)}؟`;
  if(!await askConfirm(msg, 'نسخ')) return;
  data.meals[key] = cur.concat(prev.map(m=>({label:m.label, items:cloneItems(m.items), t:Date.now()})));
  save(); renderToday();
  notify('انسخت الوجبات ✅ تكدر تعدل أي وحدة منها');
}
function copyMealToToday(key, idx){
  const m = (data.meals[key]||[])[idx]; if(!m) return;
  const t = todayKey();
  if(!data.meals[t]) data.meals[t] = [];
  data.meals[t].push({label:m.label, items:cloneItems(m.items), t:Date.now()});
  save(); renderToday();
  notify('انسخت الوجبة على اليوم ✅');
}

// ================= recipes =================
let rcItems = [], rcEditId = null;
function addRcIngredient(){
  const it = computeCtx('rc');
  if(!it){ notify('اختر مكون من نتائج البحث واكتب الكمية'); return; }
  if(it.ref.src==='R'){ notify('ما ينفع تحط طبخة داخل طبخة'); return; }
  rcItems.push(it); clearCtx('rc'); renderRc();
}
function rcPer(){
  const t = sumItems(rcItems);
  const raw = rcItems.reduce((a,it)=>a+itemGrams(it),0);
  const cooked = num(document.getElementById('rc-cooked').value);
  const servings = Math.max(0, Math.floor(num(document.getElementById('rc-servings').value)));
  const base = cooked>0 ? cooked : raw;
  const per = base ? {cal:t.cal/base*100, pro:t.pro/base*100, carb:t.carb/base*100, fat:t.fat/base*100} : null;
  return {t, raw, cooked, servings, base, per};
}
function macroLine(v){ return `${Math.round(v.cal)} سعرة · بروتين ${v.pro.toFixed(1)} · كارب ${v.carb.toFixed(1)} · دهون ${v.fat.toFixed(1)}`; }
function divMacros(t, n){ return {cal:t.cal/n, pro:t.pro/n, carb:t.carb/n, fat:t.fat/n}; }
function renderRc(){
  renderItemList(rcItems, 'rc-items', 'rc', 'ما أضفت مكونات بعد');
  const p = rcPer();
  const sumWrap = document.getElementById('rc-sum-wrap'), servNote = document.getElementById('rc-serv-note'), per100 = document.getElementById('rc-per100');
  if(!rcItems.length){ sumWrap.style.display='none'; servNote.textContent=''; per100.textContent=''; }
  else {
    sumWrap.style.display='';
    document.getElementById('rc-raw').textContent = p.raw ? `(${Math.round(p.raw)} غم مكونات)` : '';
    document.getElementById('rc-cal').textContent = Math.round(p.t.cal);
    document.getElementById('rc-pro').textContent = Math.round(p.t.pro);
    document.getElementById('rc-carb').textContent = Math.round(p.t.carb);
    document.getElementById('rc-fat').textContent = Math.round(p.t.fat);
    servNote.innerHTML = p.servings>0 ? `<b>الحصة الوحدة:</b> ${esc(macroLine(divMacros(p.t, p.servings)))}` : 'اكتب عدد الحصص حتى تكدر تسجلها بالحصة (مثلاً 1 ماعون).';
    per100.textContent = p.cooked>0 && p.per ? `كل 100 غم مطبوخ: ${macroLine(p.per)}` : '';
  }
  document.getElementById('rc-title').textContent = rcEditId ? 'تعديل طبخة' : 'حاسبة الطبخة';
  document.getElementById('rc-save-btn').textContent = rcEditId ? 'حفظ التعديل' : 'حفظ الطبخة';
  document.getElementById('rc-cancel-btn').style.display = (rcEditId || rcItems.length) ? '' : 'none';
  document.getElementById('rc-cancel-btn').textContent = rcEditId ? 'إلغاء التعديل' : 'تفريغ';
}
function resetRc(){
  rcItems = []; rcEditId = null;
  ['rc-name','rc-cooked','rc-servings'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('rc-adv').open = false;
  clearCtx('rc'); renderRc();
}
async function saveRecipe(){
  const name = document.getElementById('rc-name').value.trim();
  if(!name){ notify('اكتب اسم الطبخة'); return; }
  if(!rcItems.length){ notify('أضف مكونات الطبخة'); return; }
  const p = rcPer();
  if(!(p.servings>0) && !(p.cooked>0)){ notify('اكتب الطبخة تكفي كم حصة'); document.getElementById('rc-servings').focus(); return; }
  if(!p.base || !p.per){ notify('اكتب كميات المكونات'); return; }
  const other = data.recipes.find(r=>r.name===name && r.id!==rcEditId);
  if(other && !await askConfirm(`عندك طبخة اسمها "${name}". تستبدلها؟`, 'استبدال')) return;
  if(other) data.recipes = data.recipes.filter(r=>r!==other);
  const rec = {id: rcEditId || uid(), name, items: cloneItems(rcItems), cooked: p.cooked>0 ? p.cooked : 0, servings: p.servings, raw: p.raw, base: p.base, per: p.per};
  const i = data.recipes.findIndex(r=>r.id===rec.id);
  if(i>=0) data.recipes[i] = rec; else data.recipes.push(rec);
  save(); populateFoodList(); renderRecipes(); resetRc();
  notify(`انحفظت "${name}" ✅ ابحث عنها بالوجبات باسم "طبختي"`);
}
function editRecipe(id){
  const r = data.recipes.find(x=>x.id===id); if(!r) return;
  rcEditId = id; rcItems = cloneItems(r.items);
  document.getElementById('rc-name').value = r.name;
  document.getElementById('rc-cooked').value = r.cooked || '';
  document.getElementById('rc-servings').value = r.servings || '';
  document.getElementById('rc-adv').open = r.cooked>0;
  renderRc();
  const card = document.getElementById('rc-card'); if(card.scrollIntoView) card.scrollIntoView({behavior:'smooth'});
}
async function deleteRecipe(id){
  const r = data.recipes.find(x=>x.id===id); if(!r) return;
  if(!await askConfirm(`حذف الطبخة "${r.name}"؟ الوجبات المسجلة سابقاً ما تتأثر.`, 'حذف', true)) return;
  data.recipes = data.recipes.filter(x=>x.id!==id);
  if(rcEditId===id) resetRc();
  save(); populateFoodList(); renderRecipes();
}
function renderRecipes(){
  const el = document.getElementById('recipes-list');
  if(!data.recipes.length){ el.innerHTML = '<div class="empty">ما عندك طبخات محفوظة بعد</div>'; return; }
  el.innerHTML = data.recipes.map(r=>{
    const total = {cal:r.per.cal*r.base/100, pro:r.per.pro*r.base/100, carb:r.per.carb*r.base/100, fat:r.per.fat*r.base/100};
    const serv = r.servings>0 ? divMacros(total, r.servings) : null;
    return `<div class="item">
      <div class="item-top"><b>${esc(r.name)}</b><span class="pill">${serv ? Math.round(serv.cal)+' سعرة/حصة' : Math.round(total.cal)+' سعرة/الطبخة'}</span></div>
      <div class="item-bot"><span>الطبخة كاملة: ${esc(macroLine(total))}</span></div>
      ${serv ? `<div class="item-bot"><span>الحصة (1 من ${r.servings}): ${esc(macroLine(serv))}</span></div>` : ''}
      ${r.cooked ? `<div class="item-bot"><span>كل 100 غم مطبوخ: ${esc(macroLine(r.per))}</span></div>` : ''}
      <div class="btn-row"><button class="ghost" onclick="editRecipe('${r.id}')">تعديل</button><button class="ghost" onclick="deleteRecipe('${r.id}')">حذف</button></div>
    </div>`;
  }).join('');
}

// ================= library tabs =================
function libTab(name){
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.lib===name));
  ['meals','recipes','products'].forEach(n=>document.getElementById('lib-'+n).classList.toggle('hidden', n!==name));
  if(name==='meals') renderSavedMeals();
  if(name==='recipes'){ renderRc(); renderRecipes(); }
  if(name==='products') renderCustomFoods();
}

// ================= storage =================
function todayKey(){ return keyFromDate(new Date()); }
function load(){
  try{
    const raw = localStorage.getItem('hurr_tracker_v1');
    if(raw){
      const parsed = JSON.parse(raw);
      try{ data = cleanImported(parsed); } catch(e){ data = parsed; }
    }
  }catch(e){ console.error('load failed', e); }
  ['meals'].forEach(k=>{ if(!data[k] || typeof data[k]!=='object') data[k] = {}; });
  ['weights','customFoods','savedMeals','recipes','waist'].forEach(k=>{ if(!Array.isArray(data[k])) data[k] = []; });
  if(!data.water || typeof data.water!=='object' || Array.isArray(data.water)) data.water = {};
  if(!data.workouts || typeof data.workouts!=='object' || Array.isArray(data.workouts)) data.workouts = {};
  if(!data.sleep || typeof data.sleep!=='object' || Array.isArray(data.sleep)) data.sleep = {};
}
function saveLocal(){
  try{ localStorage.setItem('hurr_tracker_v1', JSON.stringify(data)); }
  catch(e){ console.error('local save failed', e); if(!CLOUD.ready) notify('⚠️ ما گدرنا نحفظ بهذا الجهاز'); }
}
function save(){ data.updatedAt = Date.now(); saveLocal(); queuePush(); achSoon(); }

// ================= account storage (db capability, private per user) =================
// Layout under the viewer's private subtree:
//   data/users/<uid>/state                 -> {json, updatedAt}: everything except meals & water
//   data/users/<uid>/state/months/<YYYY-MM> -> {json}: that month's meals + water (keeps each doc far below 256 KiB)
const CLOUD = {db:null, uid:null, ready:false, status:'checking', pushed:{main:null, months:{}}, known:new Set(), timer:null, chain:Promise.resolve()};
function setCloudStatus(s){
  CLOUD.status = s;
  const txt = s==='cloud' ? '☁️ بياناتك محفوظة بحسابك، وتطلع بأي جهاز تفتح منه.'
    : s==='syncing' ? 'دا نحفظ بحسابك...'
    : s==='error' ? '⚠️ ما گدرنا نحفظ بحسابك هسه. محفوظة بهذا الجهاز، ونعيد المحاولة.'
    : s==='checking' ? 'دا نتأكد من مكان الحفظ...'
    : 'بياناتك محفوظة بهذا الجهاز بس. نزّل نسخة احتياطية من «ملفي».';
  ['cloud-status','cloud-status-2'].forEach(id=>{ const el = document.getElementById(id); if(el) el.textContent = txt; });
}
function hasContent(){
  return !!(data.profile || Object.keys(data.meals||{}).length || (data.weights||[]).length || (data.customFoods||[]).length
    || (data.savedMeals||[]).length || (data.recipes||[]).length || Object.keys(data.water||{}).length || (data.waist||[]).length
    || Object.keys(data.workouts||{}).length || Object.keys(data.sleep||{}).length || !!(data.training && data.training.program));
}
function splitData(){
  const main = {...data}; delete main.meals; delete main.water; delete main.workouts;
  const months = {};
  const bucket = m=>(months[m] = months[m] || {meals:{}, water:{}, workouts:{}});
  Object.keys(data.meals||{}).forEach(k=>{ bucket(k.slice(0,7)).meals[k] = data.meals[k]; });
  Object.keys(data.water||{}).forEach(k=>{ bucket(k.slice(0,7)).water[k] = data.water[k]; });
  Object.keys(data.workouts||{}).forEach(k=>{ bucket(k.slice(0,7)).workouts[k] = data.workouts[k]; });
  return {main, months};
}
function mainRef(){ return CLOUD.db.doc('data/users/' + CLOUD.uid + '/state'); }
function monthsCol(){ return mainRef().collection('months'); }
function rememberPushed(){
  const sp = splitData();
  CLOUD.pushed.main = JSON.stringify(sp.main);
  CLOUD.pushed.months = {};
  Object.keys(sp.months).forEach(m=>{ CLOUD.pushed.months[m] = JSON.stringify(sp.months[m]); });
}
async function initCloud(){
  try{
    if(!(window.claude && window.claude.use)){ setCloudStatus('local'); return; }
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const uid = user ? await user.id() : null;
    if(!db || !uid){ setCloudStatus('local'); return; }
    CLOUD.db = db; CLOUD.uid = uid;
    await pullCloud(true);
    CLOUD.ready = true;
  }catch(e){ console.error('cloud init failed', e); setCloudStatus('error'); }
}
async function pullCloud(initial){
  const snap = await mainRef().get();
  const ms = await monthsCol().get();
  CLOUD.known = new Set(ms.docs.filter(d=>d.exists).map(d=>d.id));
  if(!snap.exists){
    if(hasContent()){
      if(!data.updatedAt) data.updatedAt = Date.now();
      data.syncedWith = CLOUD.uid; saveLocal();
      CLOUD.ready = true;
      await pushCloud();
      notify('بياناتك صارت محفوظة بحسابك ✅');
    } else setCloudStatus('cloud');
    return;
  }
  const body = snap.data() || {};
  const cloudAt = num(body.updatedAt), localAt = num(data.updatedAt);
  if(localAt > cloudAt && data.syncedWith === CLOUD.uid){ CLOUD.ready = true; await pushCloud(); return; }   // this device has newer changes
  if(localAt === cloudAt && CLOUD.pushed.main !== null){ setCloudStatus('cloud'); return; }
  // adopt the account copy
  let main = {};
  try{ main = JSON.parse(body.json || '{}'); }catch(e){}
  const merged = {...main, meals:{}, water:{}, workouts:{}};
  ms.docs.forEach(d=>{
    if(!d.exists) return;
    let x = {}; try{ x = JSON.parse((d.data()||{}).json || '{}'); }catch(e){}
    Object.assign(merged.meals, x.meals || {}); Object.assign(merged.water, x.water || {}); Object.assign(merged.workouts, x.workouts || {});
  });
  const firstSyncWithLocal = initial && hasContent() && data.syncedWith !== CLOUD.uid;
  const clean = cleanImported(firstSyncWithLocal ? mergeUnion(merged, data) : merged);
  clean.updatedAt = firstSyncWithLocal ? Date.now() : cloudAt;
  clean.syncedWith = CLOUD.uid;
  data = clean;
  ['weights','customFoods','savedMeals','recipes','waist'].forEach(k=>{ if(!Array.isArray(data[k])) data[k] = []; });
  if(!data.water) data.water = {};
  if(!data.workouts) data.workouts = {};
  if(!data.sleep) data.sleep = {};
  if(firstSyncWithLocal){
    saveLocal(); refreshAll(); CLOUD.ready = true; await pushCloud();
    notify('دمجنا بيانات هذا الجهاز ويا حسابك ✅');
    return;
  }
  saveLocal(); rememberPushed(); refreshAll();
  setCloudStatus('cloud');
}
function mergeUnion(cloud, local){
  const out = {...cloud};
  out.profile = local.profile || cloud.profile;
  out.onboarded = Math.max(num(cloud.onboarded), num(local.onboarded)) || undefined;
  { const cc = cloud.consent, lc = local.consent; out.consent = (lc && (!cc || num(lc.v) >= num(cc.v))) ? lc : cc; if(!out.consent) delete out.consent; }
  out.lastBackup = Math.max(num(cloud.lastBackup), num(local.lastBackup)) || undefined;
  if(Array.isArray(cloud.achSeen) || Array.isArray(local.achSeen)) out.achSeen = [...new Set([...(cloud.achSeen||[]), ...(local.achSeen||[])])];
  const mealKey = m=>`${num(m.t)}|${m.label||''}|${Math.round(mealTotals(m).cal)}`;
  out.meals = {...(cloud.meals||{})};
  Object.keys(local.meals||{}).forEach(k=>{
    const have = new Set((out.meals[k]||[]).map(mealKey));
    out.meals[k] = (out.meals[k]||[]).concat((local.meals[k]||[]).filter(m=>!have.has(mealKey(m))));
  });
  out.water = {...(cloud.water||{})};
  Object.keys(local.water||{}).forEach(k=>{
    const have = new Set((out.water[k]||[]).map(x=>num(x.t)+'|'+num(x.ml)));
    out.water[k] = (out.water[k]||[]).concat((local.water[k]||[]).filter(x=>!have.has(num(x.t)+'|'+num(x.ml))));
  });
  const byKey = (a, b, key)=>{ const m = new Map(); (a||[]).forEach(x=>m.set(key(x), x)); (b||[]).forEach(x=>m.set(key(x), x)); return [...m.values()]; };
  out.weights = byKey(cloud.weights, local.weights, x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));
  out.waist = byKey(cloud.waist, local.waist, x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));
  out.customFoods = byKey(cloud.customFoods, local.customFoods, x=>x.name);
  out.savedMeals = byKey(cloud.savedMeals, local.savedMeals, x=>x.id);
  out.recipes = byKey(cloud.recipes, local.recipes, x=>x.id);
  out.workouts = {...(cloud.workouts||{})};
  Object.keys(local.workouts||{}).forEach(k=>{
    const have = new Set((out.workouts[k]||[]).map(x=>num(x.t)));
    out.workouts[k] = (out.workouts[k]||[]).concat((local.workouts[k]||[]).filter(x=>!have.has(num(x.t))));
  });
  out.sleep = {...(cloud.sleep||{}), ...(local.sleep||{})};
  const lp = local.training && local.training.program, cp = cloud.training && cloud.training.program;
  out.training = (lp && (!cp || num(lp.created) >= num(cp.created))) ? local.training : (cloud.training || local.training);
  return out;
}
function queuePush(){
  if(!CLOUD.ready) return;
  clearTimeout(CLOUD.timer);
  CLOUD.timer = setTimeout(()=>{ pushCloud(); }, 1200);
}
function pushCloud(){
  CLOUD.chain = CLOUD.chain.then(async ()=>{
    if(!CLOUD.db) return;
    setCloudStatus('syncing');
    try{
      const sp = splitData();
      for(const m of Object.keys(sp.months)){            // months first; the main doc's updatedAt marks a complete state
        const j = JSON.stringify(sp.months[m]);
        if(CLOUD.pushed.months[m] !== j){ await monthsCol().doc(m).set({json:j}); CLOUD.pushed.months[m] = j; CLOUD.known.add(m); }
      }
      for(const m of [...CLOUD.known]){
        if(!sp.months[m]){ await monthsCol().doc(m).delete(); CLOUD.known.delete(m); delete CLOUD.pushed.months[m]; }
      }
      const mj = JSON.stringify(sp.main);
      if(CLOUD.pushed.main !== mj){ await mainRef().set({json:mj, updatedAt:num(data.updatedAt)}); CLOUD.pushed.main = mj; }
      setCloudStatus('cloud');
    }catch(e){
      console.error('cloud save failed', e);
      setCloudStatus('error');
      if(e && e.code==='quota_exceeded') notify('⚠️ مساحة الحفظ بحسابك امتلت. نزّل نسخة احتياطية.');
      else if(e && (e.code==='unavailable' || e.code==='resource_exhausted')) setTimeout(queuePush, 15000);
    }
  });
  return CLOUD.chain;
}
function refreshAll(){
  populateFoodList(); applyTargets(); setDay(curDay || todayKey());
  renderWeight(); renderDraft(); renderHistory();
  renderSavedMeals(); renderCustomFoods(); renderRecipes(); renderTrain(); syncActivityLabel(); achSoon();
  if(data.onboarded && hasConsent() && !obConsentOnly && !document.getElementById('onboard').hidden){ document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open'); }
  if(data.profile && !document.getElementById('tab-profile').classList.contains('hidden') && window.__startedWithoutProfile){ window.__startedWithoutProfile = false; switchTab('today'); }
}
// coming back to the app (e.g. after logging on another device): pick up the newest copy
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && CLOUD.ready) CLOUD.chain = CLOUD.chain.then(()=>pullCloud(false)).catch(e=>console.error(e));
});

function openLib(name){ closeSheet(); switchTab('products'); libTab(name); window.scrollTo(0,0); }
addEventListener('scroll', ()=>{ const a = document.querySelector('.appbar'); if(a) a.classList.toggle('scrolled', scrollY > 6); }, {passive:true});
function hdrLine(name, goal){   // نسخة 94: تحية حسب الوقت
  const en = !!(window.I18N && I18N.en), h = new Date().getHours(), morning = h >= 4 && h < 12;
  const g = en ? (morning ? 'Good morning' : 'Good evening') : (morning ? 'صباح الخير' : 'مساء الخير');
  const hi = name ? (en ? `${g}, ${name}` : `${g} يا ${name}`) : g;
  const gl = goal ? (en && I18N.t ? I18N.t(goal) : goal) : '';
  return [hi, gl].filter(Boolean).join(' · ');
}
function fabGo(){
  const t = document.body.dataset.tab;
  if(t && t!=='today' && t!=='products') switchTab('today');
  openSheet();
}
function switchTab(name){
  closeSheet();
  if(name==='history'){ name = 'profile'; setTimeout(()=>{ const c = document.getElementById('hist-card'); if(c) c.scrollIntoView({behavior:'smooth', block:'start'}); }, 80); }   // نسخة 94: «السجل» صار بـ«ملفي»
  document.getElementById('fab').hidden = false;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name || (name==='products' && t.dataset.tab==='today'))); document.body.dataset.tab = name;
  document.querySelectorAll('[id^="tab-"]').forEach(el=>el.classList.add('hidden'));
  document.getElementById('tab-'+name).classList.remove('hidden');
  if(name==='history') renderHistory();
  if(name==='products') libTab(document.querySelector('.seg-btn.active').dataset.lib);
  if(name==='profile'){ fillProfileForm(); renderHistory(); if(window.heroTheme) heroTheme(heroThemeNow()); }
  if(name==='weight') renderWeight();
  if(name==='train') renderTrain();
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>switchTab(t.dataset.tab)));

// ================= logged meals =================
function mealTotals(m){ return m.items ? sumItems(m.items) : {cal:num(m.cal), pro:num(m.pro), carb:num(m.carb), fat:num(m.fat)}; }
async function deleteMeal(key, idx){
  const m = (data.meals[key]||[])[idx]; if(!m) return;
  if(!await askConfirm(`حذف "${m.label||'وجبة'}"؟`, 'حذف', true)) return;
  data.meals[key].splice(idx,1);
  if(!data.meals[key].length) delete data.meals[key];
  if(mode && mode.type==='meal' && mode.key===key){
    if(mode.idx===idx){ mode = null; draft = []; document.getElementById('draft-label').value=''; renderDraft(); }
    else if(mode.idx>idx){ mode.idx--; }
  }
  openMeal = null;
  save(); renderToday();
}
let openMeal = null;
function toggleMeal(idx){ openMeal = (openMeal===idx) ? null : idx; renderToday(); }

function renderToday(){
  const key = curDay || todayKey();
  const isToday = key===todayKey();
  document.getElementById('sum-title').textContent = isToday ? 'ملخص اليوم' : 'ملخص ' + dayName(key);
  document.getElementById('meals-title').textContent = isToday ? 'وجبات اليوم' : 'وجبات ' + dayName(key);
  const meals = data.meals[key] || [];
  let sc=0,sp=0,scb=0,sf=0;
  meals.forEach(m=>{ const t=mealTotals(m); sc+=t.cal; sp+=t.pro; scb+=t.carb; sf+=t.fat; });
  document.getElementById('sum-cal').textContent = Math.round(sc);
  document.getElementById('sum-pro').textContent = Math.round(sp);
  document.getElementById('sum-carb').textContent = Math.round(scb);
  document.getElementById('sum-fat').textContent = Math.round(sf);
  document.getElementById('bar-cal').style.width = Math.min(100, sc/CAL_MAX*100)+'%';
  document.getElementById('bar-pro').style.width = Math.min(100, sp/PRO_MAX*100)+'%';
  document.getElementById('bar-carb').style.width = CARB_T ? Math.min(100, scb/CARB_T*100)+'%' : '0%';
  document.getElementById('bar-fat').style.width = FAT_T ? Math.min(100, sf/FAT_T*100)+'%' : '0%';
  const C = 2*Math.PI*54, ring = document.getElementById('ring');
  if(TRACK){
    const kc = sp*4 + scb*4 + sf*9;
    const share = g=>kc ? Math.round(g/kc*100) : 0;
    const sPro = share(sp*4), sCarb = share(scb*4), sFat = share(sf*9);
    document.getElementById('bar-pro').style.width = sPro+'%';
    document.getElementById('bar-carb').style.width = sCarb+'%';
    document.getElementById('bar-fat').style.width = sFat+'%';
    document.getElementById('lbl-pro').textContent = `غم · ${sPro}%`;
    document.getElementById('lbl-carb').textContent = `غم · ${sCarb}%`;
    document.getElementById('lbl-fat').textContent = `غم · ${sFat}%`;
    document.getElementById('ring-prog').setAttribute('stroke-dasharray', `${sc>0 ? C.toFixed(1) : 0} ${C.toFixed(1)}`);
    ring.classList.remove('over');
    document.getElementById('ring-num').textContent = Math.round(sc);
    document.getElementById('ring-lbl').textContent = isToday ? 'سعرة اليوم' : 'سعرة';
    document.getElementById('today-note').textContent = sc===0 ? (isToday ? 'ما بعد سجلت وجبات اليوم.' : 'ما مسجل أكل بهذا اليوم.')
      : `النسب من سعراتك: بروتين ${sPro}% · كارب ${sCarb}% · دهون ${sFat}%.`;
  } else if(data.profile){
    const tgt = (CAL_MIN+CAL_MAX)/2, rem = Math.round(tgt-sc);
    document.getElementById('ring-prog').setAttribute('stroke-dasharray', `${(Math.min(1, sc/tgt)*C).toFixed(1)} ${C.toFixed(1)}`);
    ring.classList.toggle('over', sc > CAL_MAX);
    document.getElementById('ring-num').textContent = Math.abs(rem);
    document.getElementById('ring-lbl').textContent = rem>=0 ? 'سعرة باقية' : 'سعرة زيادة';
  } else {
    document.getElementById('ring-prog').setAttribute('stroke-dasharray', `0 ${C.toFixed(1)}`);
    ring.classList.remove('over');
    document.getElementById('ring-num').textContent = Math.round(sc);
    document.getElementById('ring-lbl').textContent = 'سعرة';
  }

  let note = '';
  if(TRACK){ /* note already set */ }
  else if(sc===0){ note = isToday ? 'ما بعد سجلت وجبات اليوم.' : 'ما مسجل أكل بهذا اليوم.'; }
  else if(sc < CAL_MIN) note += '⚠️ السعرات تحت الهدف. ';
  else if(sc > CAL_MAX) note += '🔸 فوق هدف اليوم، عادي. المهم معدل الأسبوع. ';
  else note += '✅ السعرات ضمن الهدف. ';
  if(sc>0){
    if(sp < PRO_MIN) note += '⚠️ البروتين قليل — زوده لحماية العضل.';
    else note += '✅ البروتين كافي.';
  }
  if(!TRACK) document.getElementById('today-note').textContent = note;
  renderQuick();
  renderWeek();
  renderWater();
  renderSleep();
  wkBanner();

  const list = document.getElementById('today-meals');
  if(!meals.length){
    if(key !== todayKey()){ list.innerHTML = '<div class="empty">لا توجد وجبات بهذا اليوم</div>'; return; }
    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm';
    list.innerHTML = `<div class="meal-empty"><img src="media/hero-face.webp" alt="" loading="lazy"><div><b>يلا نسجّل أول وجبة</b><span>صوّر صحنك أو دوّر على الأكلة باسمها.</span></div></div>
      <div class="btn-row me-btns"><button type="button" class="gold" onclick="SNAP.open()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>صوّر صحنك</span></button>
      <button type="button" class="ghost" onclick="openSheet()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><span>ابحث عن أكلة</span></button></div>
      ${favChips() ? `<div class="fav-row meal-empty-fav"><div class="fav-h">⭐ وجباتي · ضغطة وحدة وتنسجل</div><div class="fav-chips">${favChips()}</div></div>` : ''}`;
    return;
  }
  list.innerHTML = meals.map((m,i)=>{
    const t = mealTotals(m);
    const isEditing = mode && mode.type==='meal' && mode.key===key && mode.idx===i;
    let details = '';
    if(openMeal===i){
      details = `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--line); width:100%;">` +
        (m.items||[]).map(it=>`
          <div class="list-item" style="padding:6px 0;">
            <div>${esc(it.note)}</div>
            <div class="meta">${Math.round(num(it.cal))} سعرة · ب${num(it.pro).toFixed(1)} · ك${num(it.carb).toFixed(1)} · د${num(it.fat).toFixed(1)}</div>
          </div>`).join('') +
        `<div class="btn-row">
          <button class="ghost" onclick="editMeal('${key}', ${i})">تعديل</button>
          <button class="ghost" onclick="saveLoggedAsSaved('${key}', ${i})">⭐ احفظها بوجباتي</button>
          ${isToday ? '' : `<button class="ghost" onclick="copyMealToToday('${key}', ${i})">نسخ لليوم</button>`}
        </div></div>`;
    }
    return `
      <div class="list-item" style="align-items:flex-start; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; cursor:pointer;" onclick="toggleMeal(${i})">
          <div>
            <div>${esc(m.label || 'وجبة')} <span class="pill">${Math.round(t.cal)} سعرة</span> <span class="pill">${openMeal===i?'إخفاء ▲':'تفاصيل ▼'}</span>${isEditing?' <span class="pill warn-text">قيد التعديل</span>':''}</div>
            <div class="meta">بروتين ${Math.round(t.pro)}غم · كارب ${Math.round(t.carb)}غم · دهون ${Math.round(t.fat)}غم</div>
          </div>
          <button class="del" aria-label="حذف" onclick="event.stopPropagation(); deleteMeal('${key}', ${i})">✕</button>
        </div>
        ${details}
      </div>`;
  }).join('');
}

// ================= v84: قارئ الباركود =================
// الكاميرا تقرا الباركود (BarcodeDetector بأندرويد، ومكتبة zxing محلية بالآيفون)،
// وبعدين ندور: منتجاتي أول ← Open Food Facts ← نفتح «منتج من الملصق» والباركود مكتوب.
const BC = (()=>{
  const $ = id => document.getElementById(id);
  const FORMATS_NATIVE = ['ean_13','ean_8','upc_a','upc_e','code_128'];
  const FORMATS_ZX = ['EAN13','EAN8','UPCA','UPCE','Code128'];
  let stream = null, timer = 0, busy = false, ctx = 'food', detector = null, zx = null, zxLoading = null, found = false, offData = null, torchOn = false;
  const canvas = document.createElement('canvas');

  const norm = c => String(c||'').replace(/\D/g,'').replace(/^0+/, '');
  const mine = code => { const n = norm(code); return n ? (data.customFoods||[]).find(f=>norm(f.barcode)===n) : null; };

  function loadZX(){
    if(zx) return Promise.resolve(zx);
    if(zxLoading) return zxLoading;
    zxLoading = new Promise((ok, bad)=>{
      const s = document.createElement('script'); s.src = 'vendor/zxing/zxing-reader.js';
      s.onload = ()=>{ try{
        ZXingWASM.prepareZXingModule({overrides:{locateFile:(p, pre)=> p.endsWith('.wasm') ? new URL('vendor/zxing/zxing_reader.wasm', location.href).href : pre + p}, fireImmediately:true})
          .then(()=>{ zx = ZXingWASM; ok(zx); }, bad);
      }catch(e){ bad(e); } };
      s.onerror = bad; document.head.appendChild(s);
    }).catch(e=>{ zxLoading = null; throw e; });
    return zxLoading;
  }
  async function getDetector(){
    if(detector !== null) return detector;
    detector = false;
    try{
      if('BarcodeDetector' in window){
        const sup = await BarcodeDetector.getSupportedFormats();
        const f = FORMATS_NATIVE.filter(x=>sup.includes(x));
        if(f.includes('ean_13')) detector = new BarcodeDetector({formats:f});
      }
    }catch(e){ detector = false; }
    return detector;
  }
  // يقرا صورة (فيديو أو صورة ملتقطة) ويرجع رقم الباركود أو ''
  async function decode(src, w, h){
    const det = await getDetector();
    if(det){
      try{ const r = await det.detect(src); const hit = r.find(x=>x.rawValue); if(hit) return hit.rawValue; }catch(e){}
      if(!(src instanceof HTMLCanvasElement) && src.tagName === 'VIDEO') return '';
    }
    const z = await loadZX();
    const scale = Math.min(1, 1100 / Math.max(w, h));
    canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
    const g = canvas.getContext('2d', {willReadFrequently:true});
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    const r = await z.readBarcodes(img, {formats:FORMATS_ZX, tryHarder:true, maxNumberOfSymbols:1});
    const hit = r.find(x=>x.isValid && x.text);
    return hit ? hit.text : '';
  }

  function show(state){
    ['bc-live','bc-res'].forEach(id=>$(id).hidden = id !== state);
  }
  function msg(t){ $('bc-msg').textContent = t; }

  async function open(c){
    ctx = c || 'food'; found = false; offData = null;
    $('bc').hidden = false; document.body.classList.add('bc-open');
    $('bc-code').value = '';
    show('bc-live');
    msg('وجّه الكاميرا على الباركود (الخطوط السودة) وخليه داخل الإطار');
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ camFail(); return; }
    try{
      stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}});
    }catch(e){ camFail(e && e.name === 'NotAllowedError'); return; }
    if($('bc').hidden){ stop(); return; }
    const v = $('bc-video'); v.srcObject = stream; v.setAttribute('playsinline',''); v.muted = true;
    try{ await v.play(); }catch(e){}
    const track = stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    $('bc-torch').hidden = !caps.torch;
    $('bc-frame').classList.add('on');
    getDetector().then(d=>{ if(!d) loadZX().catch(()=>{}); });
    loop();
  }
  function camFail(denied){
    $('bc-frame').classList.remove('on');
    msg(denied ? 'الكاميرا مقفولة على هيرو. فعّلها من إعدادات الموبايل، أو صوّر الباركود، أو اكتب الرقم تحت.'
               : 'ما كدرنا نفتح الكاميرا هنا. صوّر الباركود، أو اكتب الرقم تحت.');
  }
  function loop(){
    clearTimeout(timer);
    timer = setTimeout(async ()=>{
      const v = $('bc-video');
      if(!stream || found || $('bc').hidden) return;
      if(!busy && v.readyState >= 2 && v.videoWidth){
        busy = true;
        try{ const code = await decode(v, v.videoWidth, v.videoHeight); if(code && !found) got(code); }
        catch(e){ if(!zx && !detector) msg('القارئ ما اشتغل. صوّر الباركود، أو اكتب الرقم تحت.'); }
        busy = false;
      }
      loop();
    }, 180);
  }
  function stop(){
    clearTimeout(timer);
    if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
    const v = $('bc-video'); if(v) v.srcObject = null;
    torchOn = false; $('bc-torch').classList.remove('on');
  }
  function close(){
    stop(); found = true;
    $('bc').hidden = true; document.body.classList.remove('bc-open');
  }
  async function torch(){
    const t = stream && stream.getVideoTracks()[0]; if(!t) return;
    torchOn = !torchOn;
    try{ await t.applyConstraints({advanced:[{torch:torchOn}]}); }catch(e){ torchOn = false; }
    $('bc-torch').classList.toggle('on', torchOn);
  }
  async function photo(input){
    const file = input.files && input.files[0]; input.value = '';
    if(!file) return;
    msg('دا نقرا الصورة…');
    try{
      const bmp = await createImageBitmap(file);
      let code = '';
      const det = await getDetector();
      if(det){ try{ const r = await det.detect(bmp); const h = r.find(x=>x.rawValue); if(h) code = h.rawValue; }catch(e){} }
      if(!code) code = await decode(bmp, bmp.width, bmp.height);
      if(code) got(code);
      else msg('ما بان الباركود بالصورة. قرّب الموبايل وخلي الضو زين، أو اكتب الرقم تحت.');
    }catch(e){ msg('ما كدرنا نقرا الصورة. اكتب الرقم تحت.'); }
  }
  function typed(){
    const code = $('bc-code').value.replace(/\D/g,'');
    if(code.length < 6){ notify('اكتب رقم الباركود كامل (الأرقام اللي تحت الخطوط)'); return; }
    got(code);
  }

  async function got(code){
    found = true; stop();
    if(navigator.vibrate) try{ navigator.vibrate(60); }catch(e){}
    code = String(code).trim();
    if(ctx === 'cf'){ $('cf-barcode').value = code; close(); fillCfFromOff(code); return; }
    const f = mine(code);
    if(f){ close(); useFood(f.name); return; }
    show('bc-res');
    $('bc-res').innerHTML = `<div class="bc-wait"><span class="bc-spin"></span><div>دا ندور على المنتج…</div><div class="bc-num" data-no-tr>${esc(code)}</div></div>`;
    const p = await lookup(code);
    if($('bc').hidden) return;
    if(p) offCard(code, p); else notFound(code, p === null);
  }

  // Open Food Facts: قاعدة بيانات مفتوحة ومجانية للمنتجات
  async function lookup(code){
    if(!navigator.onLine) return null;
    const ac = 'AbortController' in window ? new AbortController() : null;
    const t = setTimeout(()=>ac && ac.abort(), 9000);
    try{
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ar,product_name_en,generic_name,brands,nutriments,serving_quantity,serving_quantity_unit,serving_size,quantity`, {signal: ac ? ac.signal : undefined});
      if(r.status === 404) return false;
      if(!r.ok) return null;
      const j = await r.json();
      if(!j || j.status !== 1 || !j.product) return false;
      const p = j.product, n = p.nutriments || {};
      const kcal = n['energy-kcal_100g'] != null ? num(n['energy-kcal_100g']) : (n['energy_100g'] != null ? num(n['energy_100g'])/4.184 : NaN);
      const v = {cal:kcal, pro:num(n.proteins_100g), carb:num(n.carbohydrates_100g), fat:num(n.fat_100g)};
      const en = window.I18N && I18N.en;
      let name = (en ? (p.product_name_en || p.product_name || p.product_name_ar) : (p.product_name_ar || p.product_name || p.product_name_en)) || p.generic_name || '';
      name = String(name).trim();
      const brand = String(p.brands||'').split(',')[0].trim();
      const b1 = brand.split(/\s+/)[0].toLowerCase();
      const AR_ = /[\u0600-\u06FF]/;
      if(brand && name && brand.length <= 16 && AR_.test(brand) === AR_.test(name) && !name.toLowerCase().includes(b1)) name = brand + ' ' + name;
      if(!name) name = brand;
      const sq = num(p.serving_quantity), su = String(p.serving_quantity_unit||'g').toLowerCase();
      const serving = sq > 0 && sq < 2000 && /^(g|ml|)$/.test(su) ? Math.round(sq*10)/10 : 0;
      return {name: name.slice(0, 100), v, ok: isFinite(kcal) && kcal >= 0, serving};
    }catch(e){ return null; }
    finally{ clearTimeout(t); }
  }
  const r1 = x => Math.round(num(x)*10)/10;
  function offCard(code, p){
    offData = {code, p};
    const v = p.v;
    $('bc-res').innerHTML = `
      <div class="bc-found">✅ لكينا المنتج</div>
      <div class="bc-num" data-no-tr>${esc(code)}</div>
      <div class="field"><label for="bc-name">اسم المنتج</label><input type="text" id="bc-name" value="${esc(p.name)}" placeholder="اكتب اسم المنتج"></div>
      <div class="goal-note" style="margin-top:0;">القيم لكل 100 غم. صححها من الملصق إذا مو مضبوطة.</div>
      <div class="row">
        <div class="field"><label for="bc-cal">السعرات</label><input type="number" id="bc-cal" inputmode="decimal" value="${p.ok ? Math.round(v.cal) : ''}" placeholder="0"></div>
        <div class="field"><label for="bc-pro">بروتين (غم)</label><input type="number" id="bc-pro" inputmode="decimal" value="${r1(v.pro)}"></div>
      </div>
      <div class="row">
        <div class="field"><label for="bc-carb">كارب (غم)</label><input type="number" id="bc-carb" inputmode="decimal" value="${r1(v.carb)}"></div>
        <div class="field"><label for="bc-fat">دهون (غم)</label><input type="number" id="bc-fat" inputmode="decimal" value="${r1(v.fat)}"></div>
      </div>
      <div class="field"><label for="bc-serv">حجم الحصة / العلبة (غم)</label><input type="number" id="bc-serv" inputmode="decimal" value="${p.serving || ''}" placeholder="مثلاً 240"></div>
      <button class="primary" onclick="BC.saveOff()">احفظه بمنتجاتي وسجّله</button>
      <button class="ghost bc-again" onclick="BC.again()">امسح مرة ثانية</button>
      <div class="goal-note bc-src">المعلومات من Open Food Facts (قاعدة بيانات مفتوحة يكتبها الناس)، فتأكد منها مرة وحدة. بعدها كل ما تمسحه يطلعلك فوراً حتى بدون نت.</div><div class="goal-note bc-src" data-no-tr dir="ltr" style="margin-top:4px;"><a href="https://world.openfoodfacts.org/product/${esc(code)}" target="_blank" rel="noopener">© Open Food Facts contributors</a> · ODbL</div>`;
  }
  function notFound(code, offline){
    $('bc-res').innerHTML = `
      <div class="bc-miss">${offline ? '📶 ما كدرنا ندور، تأكد من النت' : '🔍 هذا المنتج مو موجود بعد'}</div>
      <div class="bc-num" data-no-tr>${esc(code)}</div>
      <div class="goal-note">${offline ? 'منتجاتك المحفوظة تنقرا بدون نت، بس المنتجات الجديدة نحتاج نت حتى ندورها.' : 'ضيفه مرة وحدة من الملصق (السعرات والبروتين…) والباركود ينحفظ وياه، وبعدها كل ما تمسحه يطلع فوراً.'}</div>
      <button class="primary" onclick="BC.toForm()">ضيفه من الملصق</button>
      <button class="ghost bc-again" onclick="BC.again()">امسح مرة ثانية</button>`;
    offData = {code, p:null};
  }
  function again(){ open(ctx); }
  function toForm(){
    const code = offData && offData.code || '';
    close(); openLib('products');
    ['cf-name','cf-serving','cf-cal','cf-pro','cf-carb','cf-fat'].forEach(id=>$(id).value='');
    $('cf-barcode').value = code; updateCfLabels();
    setTimeout(()=>{ const n = $('cf-name'); n.scrollIntoView({block:'center'}); n.focus(); }, 250);
  }
  async function saveOff(){
    const name = $('bc-name').value.trim();
    const cal = num($('bc-cal').value), pro = num($('bc-pro').value), carb = num($('bc-carb').value), fat = num($('bc-fat').value);
    const serv = num($('bc-serv').value);
    if(!name){ notify('اكتب اسم المنتج'); $('bc-name').focus(); return; }
    if(cal<=0 && pro<=0 && carb<=0 && fat<=0){ notify('اكتب السعرات من الملصق (لكل 100 غم)'); $('bc-cal').focus(); return; }
    if(data.customFoods.some(f=>f.name===name) && !await askConfirm(`عندك منتج بنفس الاسم. تستبدله؟`, 'استبدال')) return;
    const s = serv > 0 ? serv : 100;
    data.customFoods = data.customFoods.filter(f=>f.name!==name);
    data.customFoods.push({name, cal, pro, carb, fat, barcode:offData.code, servingSize:s,
      rawCal:r1(cal*s/100), rawPro:r1(pro*s/100), rawCarb:r1(carb*s/100), rawFat:r1(fat*s/100)});
    save(); populateFoodList(); if(typeof renderCustomFoods==='function') renderCustomFoods();
    close(); useFood(name);
    notify('انحفظ بمنتجاتك ✅');
  }
  // نحط المنتج بخانة «شكد أكلت؟» بالحصة
  function useFood(name){
    if(ctx !== 'food') return;
    if($('sheet').hidden) openSheet();
    const inp = $('db-food'); inp.value = name;
    onFoodSearch('db'); CTX.db.hits = []; renderSearch('db');
    syncUnits('db');
    const sel = $('db-unit');
    if([...sel.options].some(o=>o.value==='serv')){ sel.value = 'serv'; $('db-amount').value = 1; }
    else $('db-amount').value = '';
    onUnitChange('db');
    const pick = $('db-pick'); if(pick) pick.scrollIntoView({block:'nearest'});
    $('db-amount').focus();
    notify('تم: ' + name);
  }
  // من فورم «منتج جديد»: نعبي الفراغات من Open Food Facts إذا لكيناه
  async function fillCfFromOff(code){
    if($('cf-name').value.trim() && $('cf-cal').value) return;
    const p = await lookup(code);
    if(!p || !p.ok){ notify(p === false ? 'الباركود انكتب. المنتج مو موجود بقاعدة البيانات، كمّل القيم من الملصق' : 'الباركود انكتب ✅'); return; }
    const s = p.serving || 100;
    const setIf = (id, val)=>{ const e = $(id); if(!e.value) e.value = val; };
    setIf('cf-name', p.name); setIf('cf-serving', s);
    setIf('cf-cal', Math.round(p.v.cal*s/100)); setIf('cf-pro', r1(p.v.pro*s/100));
    setIf('cf-carb', r1(p.v.carb*s/100)); setIf('cf-fat', r1(p.v.fat*s/100));
    updateCfLabels();
    notify('عبّينا القيم من Open Food Facts. تأكد منها ويا الملصق وبعدين احفظ');
  }
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !$('bc').hidden) close(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && stream) close(); });
  return {open, close, torch, photo, typed, again, toForm, saveOff, lookup, mine, decode, _got: got};
})();

// ================= v87: صوّر صحنك =================
// المستخدم يصوّر الصحن ← نصغّر الصورة بالموبايل ← سيرفر هيرو (Cloudflare Worker) يسأل Claude
// شنو الأكلات وشكد غرام ← السعرات نحسبها هنا من قاعدة الأكل (المصادر العلمية) ← المستخدم يصحّح ويضيف للوجبة.
// الصورة ما تنحفظ بأي مكان.
const SNAP = (()=>{
  const API = 'https://hero-snap.baghdadhurr.workers.dev/analyze';
  const MAX_SIDE = 1024, QUALITY = 0.8, TIMEOUT = 40000;
  const $ = id => document.getElementById(id);
  const G = {label:'غم', grams:1, ok:true};
  let items = [], busy = false, ctl = null;

  const LS = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  function device(){
    let id = LS.get('hero_snap_id');
    if(!id || !/^[a-z0-9-]{8,64}$/.test(id)){
      id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12))).toLowerCase();
      LS.set('hero_snap_id', id);
    }
    return id;
  }
  const isEn = () => !!(window.I18N && I18N.en);
  const dn = n => (isEn() && I18N.food(n)) || n;   // اسم الأكلة حسب اللغة

  // كل الأسماء اللي نگدر نحسب سعراتها بالغرام: قاعدة الأكل + منتجاتي + طبخاتي المعروف وزنها
  function catalog(){
    if(!SEARCH_INDEX.length) populateFoodList();
    return SEARCH_INDEX.filter(x=>x.kind !== 'recipe' || x.f.cookedKnown).map(x=>x.name);
  }

  function show(state){ ['snap-pick','snap-wait','snap-res'].forEach(id=>$(id).hidden = id !== state); }
  function leftNote(){
    const d = LS.get('hero_snap_left');
    if(!d) return '';
    const [day, left] = d.split('|');
    return day === todayKey() ? left : '';
  }
  function renderPick(msg){
    show('snap-pick');
    $('snap-msg').textContent = msg || '';
    const l = leftNote(), el = $('snap-left');
    el.hidden = l === '';
    if(l !== '') $('snap-left-n').textContent = l;
  }

  function open(){
    if(busy) return;
    $('snap').hidden = false; document.body.classList.add('bc-open');
    renderPick('');
  }
  function close(){
    if(ctl) ctl.abort();
    busy = false; items = [];
    $('snap').hidden = true; document.body.classList.remove('bc-open');
    const img = $('snap-img'); if(img.src.startsWith('blob:')) URL.revokeObjectURL(img.src); img.removeAttribute('src');
  }

  // نصغّر الصورة: أسرع بالنت، وأرخص، وتكفي حتى يتعرف على الأكل
  async function shrink(file){
    let bmp;
    try{ bmp = await createImageBitmap(file, {imageOrientation:'from-image'}); }
    catch(e){ bmp = await new Promise((ok, no)=>{ const im = new Image(); im.onload = ()=>ok(im); im.onerror = no; im.src = URL.createObjectURL(file); }); }
    const w = bmp.width, h = bmp.height, k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(ok=>c.toBlob(ok, 'image/jpeg', QUALITY));
    const b64 = await new Promise((ok, no)=>{ const r = new FileReader(); r.onload = ()=>ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
    return {blob, b64};
  }

  async function photo(input){
    const file = input.files && input.files[0]; input.value = '';
    if(!file || busy) return;
    if(!navigator.onLine){ renderPick('📶 تحليل الصورة يحتاج نت. تأكد من الاتصال وجرب مرة ثانية.'); return; }
    busy = true; show('snap-wait');
    let img;
    try{ img = await shrink(file); }
    catch(e){ busy = false; renderPick('ما كدرنا نفتح الصورة. جرب صورة ثانية.'); return; }
    $('snap-img').src = URL.createObjectURL(img.blob);
    ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), TIMEOUT);
    let res, body = null;
    try{
      res = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json'}, signal:ctl.signal,
        body: JSON.stringify({image:img.b64, type:'image/jpeg', device:device(), lang:isEn() ? 'en' : 'ar', names:catalog()})});
      body = await res.json().catch(()=>null);
    }catch(e){
      clearTimeout(t); ctl = null;
      if(!busy) return;   // المستخدم سد الشاشة
      busy = false; renderPick('📶 ما وصلنا للسيرفر. تأكد من النت وجرب مرة ثانية.'); return;
    }
    clearTimeout(t); ctl = null;
    if(!busy) return;
    busy = false;
    if(body && body.left != null) LS.set('hero_snap_left', todayKey() + '|' + body.left);
    if(res.status === 429 || (body && body.error === 'limit')){
      LS.set('hero_snap_left', todayKey() + '|0');
      renderPick('خلصت صور اليوم 🙏 تتجدد باچر. لحد ذاك الوقت ضيف أكلك بالبحث أو الباركود.'); return;
    }
    if(!res.ok || !body || !Array.isArray(body.items)){
      renderPick(body && body.error === 'busy' ? 'السيرفر مشغول هسه. جرب بعد دقيقة.' : 'صار خلل بالتحليل. جرب مرة ثانية، أو ضيف الأكل بالبحث.'); return;
    }
    if(!body.items.length){
      renderPick(body.problem === 'no_food' ? '🍽️ ما شفنا أكل بالصورة. صوّر الصحن من فوك وهو واضح.' : '🔍 الصورة مو واضحة. صوّر بضو زين ومن فوك الصحن.'); return;
    }
    items = body.items.filter(it=>it.grams >= 5).map(it=>{   // تحت 5 غم = بقايا تخمين، مو أكلة
      let name = it.name ? exactName(it.name) : null, f = name ? findFood(name) : null, g = false;
      if(!f){ const n2 = guess(it.seen); if(n2){ name = n2; f = findFood(n2); g = !!f; } }
      const k = f ? factor(name) : {x:1, mine:false};
      const grams = Math.max(1, Math.round(it.grams * k.x));
      return {name: f ? name : null, f, seen: it.seen, grams, est: grams, raw: it.grams, mine: k.mine, conf: it.confidence, guess: g};
    });
    render();
  }

  // ===== معايرة الكميات =====
  // النشويات المنفوشة (رز، بطاطا مكعبات...) النموذج يبالغ بيها بالتجربة، فنصغّرها بالبداية
  const STARCH = /رز|تمن|بطاط|معكرون|برغل|شعري|خبز|صمون|كسكس|rice|potato|pasta|bread/;
  const CAL_K = 'hero_snap_cal';
  function calMap(){ try{ return JSON.parse(localStorage.getItem(CAL_K) || '{}'); }catch(e){ return {}; } }
  function factor(name){
    const m = calMap()[name];
    if(m && m.n) return {x: m.r, mine: true};          // تعلّمناها من تصحيحات المستخدم
    return {x: STARCH.test(normAr(name)) ? 0.55 : 1, mine: false};
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
  // ===== تبديل سريع بين الدجاج والسمك واللحم (أكثر غلط يصير بالصور) =====
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
  // أكلة ما إلها تطابق: نجرب الاسم كامل، وبعدين كل كلمة (أطول كلمة أول، لأنها غالباً المكون الرئيسي)
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
  function calc(it){ return it.f ? makeItem(it.name, it.f, it.grams, G) : null; }
  function render(){
    show('snap-res');
    const ok = items.filter(it=>it.f), t = sumItems(ok.map(calc));
    $('snap-list').innerHTML = items.map((it, i)=>{
      const m = calc(it);
      if(!m) return `<div class="snap-row miss">
        <div class="snap-name"><span>⚠️</span> <b data-no-tr>${esc(it.seen)}</b></div>
        <div class="snap-sub">ما لكيناها بقاعدة الأكل</div>
        <div class="snap-acts"><button type="button" class="ghost" onclick="SNAP.find(${i})">🔍 دوّر عليها</button><button type="button" class="del" aria-label="حذف" onclick="SNAP.del(${i})">✕</button></div>
      </div>`;
      return `<div class="snap-row${it.conf < 0.5 ? ' low' : ''}">
        <div class="snap-top"><div class="snap-name">${esc(dn(it.name))}${it.f.src === 'E' ? ' <small>(تقديري)</small>' : ''}${it.mine ? '<div class="snap-sub">⚖️ معدّل حسب تصحيحاتك</div>' : ''}</div><button type="button" class="del" aria-label="حذف" onclick="SNAP.del(${i})">✕</button></div>
        ${it.guess ? `<div class="snap-sub">🔄 أقرب شي بالقاعدة لـ: <span data-no-tr>${esc(it.seen)}</span></div><div class="snap-acts"><button type="button" class="ghost" onclick="SNAP.find(${i})">🔍 غيّرها</button></div>`
          : it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}
        ${it.guess ? '' : famChips(it, i)}
        <div class="snap-bot">
          <input type="number" class="amt" inputmode="decimal" min="1" step="any" value="${it.grams}" aria-label="الكمية" onchange="SNAP.grams(${i}, this.value)"><span>غم</span>
          <span class="pill"><span data-no-tr>${Math.round(m.cal)}</span> سعرة</span>
        </div>
      </div>`;
    }).join('');
    $('snap-cal').textContent = Math.round(t.cal);
    $('snap-pro').textContent = Math.round(t.pro);
    $('snap-carb').textContent = Math.round(t.carb);
    $('snap-fat').textContent = Math.round(t.fat);
    $('snap-add').disabled = !ok.length;
    const l = leftNote(); $('snap-res-left').hidden = l === ''; if(l !== '') $('snap-res-left-n').textContent = l;
  }
  function grams(i, v){
    v = num(v);
    if(v <= 0){ notify('الكمية لازم تكون أكثر من صفر'); render(); return; }
    items[i].grams = Math.round(v); render();
  }
  function del(i){ items.splice(i, 1); if(!items.length){ renderPick(''); return; } render(); }
  // ملعقة دهن: إذا الأكل مدهّن أكثر من الطبيعي
  function oil(){
    const name = 'زيت نباتي', f = findFood(name);
    if(!f) return;
    const ex = items.find(it=>it.name === name);
    if(ex) ex.grams += 10; else items.push({name, f, seen:'', grams:10, conf:1});
    render();
  }
  function toDraft(){
    const ok = items.filter(it=>it.f);
    learn(ok);
    ok.forEach(it=>{ const m = calc(it); m.snap = 1; draft.push(m); });
    return ok.length;
  }
  function add(){
    const n = toDraft();
    if(!n){ notify('ماكو أكلة نگدر نضيفها'); return; }
    close();
    if(!$('draft-label').value.trim() && (curDay||todayKey()) === todayKey()) setMealName(mealNameByTime());
    renderDraft(); openSheet();
    notify('انضافت للوجبة ✅ راجعها واضغط حفظ الوجبة');
  }
  // أكلة ما لكيناها: نضيف الباقي للوجبة، ونفتح البحث باسمها
  function find(i){
    const q = items[i].seen;
    items.splice(i, 1);
    toDraft(); close(); renderDraft(); openSheet();
    const inp = $('db-food'); inp.value = q; onFoodSearch('db'); inp.focus();
  }
  function again(){ items = []; renderPick(''); }

  return {open, close, photo, grams, del, oil, add, find, again, swapTo};
})();

// ================= custom products =================
function updateCfLabels(){
  const s = document.getElementById('cf-serving').value;
  const suffix = s ? ('/ '+s+'غم') : '/ الحصة';
  document.getElementById('cf-cal-label').textContent = 'السعرات '+suffix;
  document.getElementById('cf-pro-label').textContent = 'بروتين '+suffix;
  document.getElementById('cf-carb-label').textContent = 'كارب '+suffix;
  document.getElementById('cf-fat-label').textContent = 'دهون '+suffix;
}
async function addCustomFood(){
  const name = document.getElementById('cf-name').value.trim();
  const serving = num(document.getElementById('cf-serving').value);
  const rCal = num(document.getElementById('cf-cal').value), rPro = num(document.getElementById('cf-pro').value);
  const rCarb = num(document.getElementById('cf-carb').value), rFat = num(document.getElementById('cf-fat').value);
  const barcode = document.getElementById('cf-barcode').value.trim();
  if(!name || (rCal<=0 && rPro<=0 && rCarb<=0 && rFat<=0)){ notify('اكتب اسم المنتج وقيمة غذائية وحدة على الأقل'); return; }
  if(serving<=0){ notify('اكتب حجم الحصة بالغرام (مثل ما مكتوب على العلبة)'); return; }
  if(data.customFoods.some(f=>f.name===name) && !await askConfirm(`عندك منتج اسمه "${name}". تستبدله؟`, 'استبدال')) return;
  data.customFoods = data.customFoods.filter(f=>f.name!==name);
  data.customFoods.push({name, cal:rCal/serving*100, pro:rPro/serving*100, carb:rCarb/serving*100, fat:rFat/serving*100,
    barcode, servingSize:serving, rawCal:rCal, rawPro:rPro, rawCarb:rCarb, rawFat:rFat});
  save();
  ['cf-name','cf-serving','cf-cal','cf-pro','cf-carb','cf-fat','cf-barcode'].forEach(id=>document.getElementById(id).value='');
  updateCfLabels(); populateFoodList(); renderCustomFoods();
  notify('انحفظ المنتج ✅');
}
async function deleteCustomFood(i){
  const f = data.customFoods[i]; if(!f) return;
  if(!await askConfirm(`حذف "${f.name}" من منتجاتك؟ الوجبات المسجلة سابقاً ما تتأثر.`, 'حذف', true)) return;
  data.customFoods.splice(i,1);
  save(); populateFoodList(); renderCustomFoods();
}
function renderCustomFoods(){
  const el = document.getElementById('custom-food-list');
  if(!data.customFoods.length){ el.innerHTML = '<div class="empty">ما عندك منتجات مضافة بعد</div>'; return; }
  el.innerHTML = data.customFoods.map((f,i)=>`
    <div class="list-item">
      <div>
        <div>${esc(f.name)} ${f.barcode ? '<span class="pill">'+esc(f.barcode)+'</span>' : ''}</div>
        <div class="meta">الحصة ${num(f.servingSize)}غم: ${num(f.rawCal)} سعرة · بروتين ${num(f.rawPro)}غم · كارب ${num(f.rawCarb)}غم · دهون ${num(f.rawFat)}غم</div>
      </div>
      <button class="del" aria-label="حذف" onclick="deleteCustomFood(${i})">✕</button>
    </div>`).join('');
}

// ================= real TDEE from logs =================
let realTdeeValue = null;
function weightSlope(daysBack, minSpan){
  const W = data.weights;
  if(W.length<2) return null;
  const last = dateFromKey(W[W.length-1].date);
  const start = new Date(last); start.setDate(start.getDate()-daysBack);
  const win = W.filter(x=>dateFromKey(x.date)>=start);
  if(win.length<2) return null;
  const t0 = dateFromKey(win[0].date);
  const span = (last - t0)/86400000;
  if(span<minSpan) return null;
  const xs = win.map(x=>(dateFromKey(x.date)-t0)/86400000), ys = win.map(x=>x.w);
  const mx = xs.reduce((a,b)=>a+b,0)/xs.length, my = ys.reduce((a,b)=>a+b,0)/ys.length;
  let n=0, dn=0; xs.forEach((x,i)=>{n+=(x-mx)*(ys[i]-my); dn+=(x-mx)**2;});
  return {slope: dn ? n/dn : 0, t0, last, span, points:win.length, avgW:my};
}
function computeRealTdee(){
  const s = weightSlope(28, 14); if(!s) return null;
  const days = Object.keys(data.meals).filter(k=>{ const d = dateFromKey(k); return d>=s.t0 && d<=s.last && data.meals[k].length>0; });
  if(days.length < s.span*0.7) return null;
  const avgIn = days.reduce((a,k)=>a + data.meals[k].reduce((b,m)=>b+mealTotals(m).cal,0),0)/days.length;
  return {tdee: avgIn - s.slope*KCAL_PER_KG, avgIn, slopeWeek: s.slope*7, span:Math.round(s.span), days:days.length};
}
function renderRealTdee(){
  const r = computeRealTdee();
  const el = document.getElementById('real-tdee');
  document.getElementById('real-tdee-reset').style.display = (data.profile && data.profile.tdeeOverride) ? 'flex' : 'none';
  if(!r){
    realTdeeValue = null;
    document.getElementById('real-tdee-btns').style.display='none';
    el.textContent = 'يحتاج 14 يوم على الأقل: وزن مسجل ببداية ونهاية الفترة (يفضل 2-3 مرات بالأسبوع)، وأكل مسجل بأغلب الأيام.';
    return;
  }
  realTdeeValue = Math.round(r.tdee);
  el.textContent = `خلال ${r.span} يوم (${r.days} يوم مسجل): معدل أكلك ${Math.round(r.avgIn)} سعرة، ووزنك تغير ${r.slopeWeek>=0?'+':''}${r.slopeWeek.toFixed(2)} كغم بالأسبوع. يعني حرقك الفعلي ≈ ${realTdeeValue} سعرة يومياً. الدقة تعتمد على دقة تسجيل الأكل.`;
  document.getElementById('real-tdee-btns').style.display = data.profile ? 'flex' : 'none';
}
function useRealTdee(){
  if(!data.profile || !realTdeeValue) return;
  data.profile.tdeeOverride = realTdeeValue;
  save(); applyTargets(); renderToday(); renderRealTdee();
  notify('اعتمدنا حرقك الحقيقي ✅ الأهداف اتعدلت');
}
function clearRealTdee(){
  if(!data.profile) return;
  delete data.profile.tdeeOverride;
  save(); applyTargets(); renderToday(); renderRealTdee();
}

// ================= weight =================
function addWeight(){
  const w = num(document.getElementById('in-weight').value);
  let d = document.getElementById('in-weight-date').value;
  if(!DATE_RE.test(d||'')) d = todayKey();
  if(d > todayKey()){ notify('ما ينفع تسجل وزن بتاريخ جاي'); return; }
  if(w<25 || w>350){ notify('اكتب وزن صحيح بالكيلوغرام'); return; }
  data.weights = data.weights.filter(x=>x.date!==d);
  data.weights.push({date:d, w});
  data.weights.sort((a,b)=>a.date.localeCompare(b.date));
  if(data.profile){ data.profile.weight = data.weights[data.weights.length-1].w; applyTargets(); renderToday(); }
  save();
  document.getElementById('in-weight').value='';
  renderWeight();
  notify('انسجل الوزن ✅');
}
async function deleteWeightAt(i){
  const x = data.weights[i]; if(!x) return;
  if(!await askConfirm(`حذف وزن ${x.date}؟`, 'حذف', true)) return;
  data.weights.splice(i,1);
  save(); renderWeight();
}
function trendSeries(){
  // 7-day time-window average of logged weights ending at each point
  return data.weights.map((x,i)=>{
    const d = dateFromKey(x.date), from = new Date(d); from.setDate(from.getDate()-6);
    const win = data.weights.slice(0,i+1).filter(y=>dateFromKey(y.date)>=from);
    return {date:x.date, w:x.w, trend: win.reduce((a,y)=>a+y.w,0)/win.length};
  });
}
function renderWeightRate(){
  const el = document.getElementById('weight-rate');
  const s = weightSlope(21, 7);
  if(!s){ el.textContent = 'سجل وزنك 2-3 مرات بالأسبوع، وبعد أسبوع يطلعلك معدل التغير الأسبوعي.'; return; }
  const wk = s.slope*7, pct = wk/s.avgW*100;
  let msg = `المعدل آخر ${Math.round(s.span)} يوم: ${wk>=0?'+':''}${wk.toFixed(2)} كغم بالأسبوع (${pct>=0?'+':''}${pct.toFixed(2)}% من وزنك). `;
  const p = data.profile;
  if(p && p.goal==='cut'){
    const target = GOALS.cut.lossPct[p.pace||'slow'];
    if(pct > -0.1) msg += '⚠️ الوزن مو دا ينزل — راجع دقة التسجيل، أو خفف السعرات شوية.';
    else if(-pct > 1.0) msg += '⚠️ أسرع من الحد الأعلى الموصى (1%) — خطر على العضل، زيد السعرات شوية.';
    else if(-pct < target*0.5) msg += `🔸 أبطأ من هدفك (${target}%) — عادي بالأسابيع الأولى، راقب أسبوع ثاني.`;
    else msg += `✅ ضمن الهدف (${target}% بالأسبوع).`;
  } else if(p && p.goal==='bulk'){
    if(pct > 0.5) msg += '⚠️ أسرع من الموصى (0.5%) — أغلب الزيادة ممكن تكون دهون.';
    else if(pct < 0.1) msg += '🔸 الزيادة بطيئة — زيد السعرات شوية.';
    else msg += '✅ ضمن الهدف (0.25-0.5% بالأسبوع).';
  } else if(p && p.goal==='maintain'){
    msg += Math.abs(pct) <= 0.25 ? '✅ وزنك ثابت.' : '🔸 وزنك دا يتغير أكثر من المتوقع للحفاظ.';
  }
  el.textContent = msg;
}
function renderWeightChart(){
  const box = document.getElementById('weight-chart');
  if(data.weights.length<2){ box.innerHTML = '<div class="empty">سجل وزنين على الأقل حتى يطلع الرسم</div>'; return; }
  const S = trendSeries();
  const W = 380, H = 200, L = 34, R = 10, T = 14, B = 24;
  const t0 = dateFromKey(S[0].date).getTime(), t1 = dateFromKey(S[S.length-1].date).getTime();
  const span = Math.max(t1-t0, 86400000);
  const vals = S.flatMap(p=>[p.w, p.trend]);
  let lo = Math.floor(Math.min(...vals)-0.5), hi = Math.ceil(Math.max(...vals)+0.5);
  if(hi-lo<2){ hi += 1; lo -= 1; }
  const X = t=>L + (t-t0)/span*(W-L-R), Y = v=>T + (hi-v)/(hi-lo)*(H-T-B);
  const step = (hi-lo)>8 ? 2 : (hi-lo)>4 ? 1 : 0.5;
  let grid = '';
  for(let v=Math.ceil(lo/step)*step; v<=hi+1e-9; v+=step){
    grid += `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="c-grid"/><text x="${L-6}" y="${Y(v)+4}" class="c-axis" text-anchor="end">${r1(v)}</text>`;
  }
  const md = k=>k.slice(5).replace('-','/');
  const ticks = [S[0], S[Math.floor((S.length-1)/2)], S[S.length-1]].filter((p,i,a)=>a.findIndex(q=>q.date===p.date)===i);
  const xl = ticks.map((p,i)=>`<text x="${X(dateFromKey(p.date).getTime())}" y="${H-6}" class="c-axis" text-anchor="${i===0?'start':i===ticks.length-1?'end':'middle'}">${md(p.date)}</text>`).join('');
  const pts = S.map(p=>({x:X(dateFromKey(p.date).getTime()), y:Y(p.w), ty:Y(p.trend), p}));
  const path = pts.map((q,i)=>(i?'L':'M')+q.x.toFixed(1)+' '+q.ty.toFixed(1)).join(' ');
  const dots = pts.map(q=>`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4" class="c-dot"/>`).join('');
  const lastP = pts[pts.length-1];
  box.innerHTML = `
    <div class="legend"><span><span class="lg-dot"></span>الوزن اليومي</span><span><span class="lg-line"></span>المعدل (7 أيام)</span></div>
    <div class="chart-wrap" dir="ltr">
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="رسم الوزن: آخر معدل ${r1(S[S.length-1].trend)} كغم">
        ${grid}${xl}
        <path d="${path}" class="c-line"/>
        ${dots}
        <text x="${Math.min(lastP.x, W-R-2)}" y="${lastP.ty-10}" class="c-label" text-anchor="end">${r1(lastP.p.trend)}</text>
        <line id="c-cross" class="c-cross" y1="${T}" y2="${H-B}" x1="0" x2="0" style="display:none"/>
        <rect id="c-hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>
      </svg>
      <div class="chart-tip" id="c-tip"></div>
    </div>`;
  const svg = box.querySelector('svg'), hit = box.querySelector('#c-hit'), tip = box.querySelector('#c-tip'), cross = box.querySelector('#c-cross');
  const move = ev=>{
    const rect = svg.getBoundingClientRect(); if(!rect.width) return;
    const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) / rect.width * W;
    let best = pts[0]; pts.forEach(q=>{ if(Math.abs(q.x-cx) < Math.abs(best.x-cx)) best = q; });
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.style.display='';
    tip.innerHTML = `<b>${esc(best.p.date)}</b><br>الوزن: ${r1(best.p.w)} كغم<br>المعدل: ${r1(best.p.trend)} كغم`;
    tip.style.display='block';
    const px = best.x/W*rect.width, tw = tip.offsetWidth || 120;
    tip.style.left = Math.max(0, Math.min(rect.width-tw, px - tw/2)) + 'px';
    tip.style.top = '4px';
  };
  const out = ()=>{ tip.style.display='none'; cross.style.display='none'; };
  hit.addEventListener('mousemove', move); hit.addEventListener('mouseleave', out);
  hit.addEventListener('touchstart', move, {passive:true}); hit.addEventListener('touchmove', move, {passive:true}); hit.addEventListener('touchend', out);
}
function renderWeight(){
  renderRealTdee(); renderWeightRate(); renderWeightChart(); renderWaist(); ppRender();
  const list = document.getElementById('weight-list');
  if(!data.weights.length){
    list.innerHTML = '<div class="empty">لا توجد تسجيلات بعد</div>';
    document.getElementById('last-weight').textContent='—';
    document.getElementById('weight-change').textContent='—';
    return;
  }
  const last = data.weights[data.weights.length-1], first = data.weights[0];
  document.getElementById('last-weight').textContent = last.w + ' كغم';
  const diff = (last.w - first.w).toFixed(1);
  document.getElementById('weight-change').textContent = (diff>0?'+':'')+diff+' كغم';
  document.getElementById('weight-share').hidden = data.weights.length < 2;
  const WN = 7, wAll = data.weights.slice().reverse(), wShow = window.__wAll ? wAll : wAll.slice(0, WN);
  list.innerHTML = wShow.map((x,ri)=>`
    <div class="list-item">
      <div>${esc(dayName(x.date))} <span class="pill">${num(x.w)} كغم</span></div>
      <button class="del" aria-label="حذف" onclick="deleteWeightAt(${data.weights.length-1-ri})">✕</button>
    </div>`).join('') + (wAll.length > WN ? `<button class="more-btn" onclick="window.__wAll=!window.__wAll; renderWeight();">${window.__wAll ? 'عرض أقل' : `عرض الكل (${wAll.length})`}</button>` : '');
}

// ================= waist (optional) =================
// WHO 2008 expert consultation: increased risk men ≥94 cm / women ≥80 cm; substantially increased ≥102 / ≥88
function addWaist(){
  const cm = num(document.getElementById('in-waist').value);
  let d = document.getElementById('in-waist-date').value;
  if(!DATE_RE.test(d||'')) d = todayKey();
  if(d > todayKey()){ notify('ما ينفع تسجل قياس بتاريخ جاي'); return; }
  if(cm<40 || cm>200){ notify('اكتب محيط الخصر بالسنتيمتر'); return; }
  data.waist = data.waist.filter(x=>x.date!==d);
  data.waist.push({date:d, cm});
  data.waist.sort((a,b)=>a.date.localeCompare(b.date));
  save();
  document.getElementById('in-waist').value='';
  renderWaist(); notify('انسجل القياس ✅');
}
async function deleteWaistAt(i){
  const x = data.waist[i]; if(!x) return;
  if(!await askConfirm(`حذف قياس ${x.date}؟`, 'حذف', true)) return;
  data.waist.splice(i,1); save(); renderWaist();
}
function renderWaist(){
  const W = data.waist, card = document.getElementById('waist-card');
  if(!card) return;
  if(W.length && !card.dataset.touched){ card.open = true; card.dataset.touched = '1'; }
  const note = document.getElementById('waist-note'), box = document.getElementById('waist-chart'), list = document.getElementById('waist-list');
  if(!W.length){ box.innerHTML=''; list.innerHTML=''; note.textContent=''; return; }
  const first = W[0], last = W[W.length-1], diff = last.cm - first.cm;
  let msg = `آخر قياس ${r1(last.cm)} سم` + (W.length>1 ? `، التغير ${diff>0?'+':''}${r1(diff)} سم من أول قياس.` : '.');
  const f = data.profile && data.profile.sex==='f';
  const [inc, high] = f ? [80, 88] : [94, 102];
  if(last.cm >= high) msg += ` حسب منظمة الصحة العالمية، ${high} سم وفوق يرفع المخاطر الصحية بشكل واضح.`;
  else if(last.cm >= inc) msg += ` حسب منظمة الصحة العالمية، ${inc} سم وفوق يرفع المخاطر الصحية شوية.`;
  note.textContent = msg;
  if(W.length>=2){
    const Wd = 640, H = 170, L = 40, R = 16, T = 12, B = 26;
    const t0 = dateFromKey(first.date).getTime(), t1 = dateFromKey(last.date).getTime(), span = Math.max(t1-t0, 86400000);
    let lo = Math.floor(Math.min(...W.map(x=>x.cm))-1), hi = Math.ceil(Math.max(...W.map(x=>x.cm))+1);
    const X = t=>L + (t-t0)/span*(Wd-L-R), Y = v=>T + (hi-v)/(hi-lo)*(H-T-B);
    const step = (hi-lo)>8 ? 2 : 1;
    let g = '';
    for(let v=Math.ceil(lo/step)*step; v<=hi; v+=step) g += `<line x1="${L}" x2="${Wd-R}" y1="${Y(v)}" y2="${Y(v)}" class="c-grid"/><text x="${L-6}" y="${Y(v)+4}" class="c-axis" text-anchor="end">${v}</text>`;
    const pts = W.map(x=>({x:X(dateFromKey(x.date).getTime()), y:Y(x.cm), p:x}));
    const path = pts.map((q,i)=>(i?'L':'M')+q.x.toFixed(1)+' '+q.y.toFixed(1)).join(' ');
    const md = k=>k.slice(5).replace('-','/');
    box.innerHTML = `<div dir="ltr"><svg viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="تطور محيط الخصر">${g}
      <path d="${path}" class="c-line"/>
      ${pts.map(q=>`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4.5" class="c-dot" style="fill:var(--chart-line)"><title>${esc(q.p.date)}: ${r1(q.p.cm)} سم</title></circle>`).join('')}
      <text x="${L}" y="${H-8}" class="c-axis">${md(first.date)}</text><text x="${Wd-R}" y="${H-8}" class="c-axis" text-anchor="end">${md(last.date)}</text>
      <text x="${Math.min(pts[pts.length-1].x, Wd-R-2)}" y="${pts[pts.length-1].y-10}" class="c-label" text-anchor="end">${r1(last.cm)}</text>
    </svg></div>`;
  } else box.innerHTML = '';
  list.innerHTML = W.slice().reverse().map((x,ri)=>`<div class="list-item"><div>${esc(x.date)} <span class="pill">${r1(x.cm)} سم</span></div>
    <button class="del" aria-label="حذف" onclick="deleteWaistAt(${W.length-1-ri})">✕</button></div>`).join('');
}

// ================= history + backup =================
function renderHistory(){
  const el = document.getElementById('day-history');
  const keys = Object.keys(data.meals).filter(k=>DATE_RE.test(k) && data.meals[k].length>0).sort().reverse();
  if(!keys.length){ el.innerHTML='<div class="empty">لا يوجد سجل بعد</div>'; }
  else el.innerHTML = (window.__hAll ? keys : keys.slice(0, 10)).map(k=>{
    let sc=0,sp=0;
    data.meals[k].forEach(m=>{ const t=mealTotals(m); sc+=t.cal; sp+=t.pro; });
    return `<div class="list-item" style="cursor:pointer;" onclick="openDay('${k}')">
      <div>${esc(dayName(k))} <span class="pill">${data.meals[k].length} وجبة</span></div>
      <div class="meta">${Math.round(sc)} سعرة · ${Math.round(sp)}غم بروتين ›</div>
    </div>`;
  }).join('') + (keys.length > 10 ? `<button class="more-btn" onclick="window.__hAll=!window.__hAll; renderHistory();">${window.__hAll ? 'عرض أقل' : `عرض الكل (${keys.length} يوم)`}</button>` : '');
  renderBackupStatus();
}
function backupPayload(){ return JSON.stringify({app:'hurr-tracker', version:2, exported:new Date().toISOString(), data}, null, 1); }
function renderBackupStatus(){
  const el = document.getElementById('backup-status');
  if(!data.lastBackup){ el.innerHTML = '<span class="warn-text">⚠️ ما نزلت أي نسخة احتياطية بعد.</span>'; return; }
  const days = Math.floor((Date.now()-data.lastBackup)/86400000);
  el.innerHTML = days>=7 ? `<span class="warn-text">⚠️ آخر نسخة قبل ${days} يوم — نزّل وحدة جديدة.</span>`
    : `✅ آخر نسخة احتياطية: ${days===0 ? 'اليوم' : 'قبل '+days+' يوم'}.`;
}
async function exportBackup(){
  const filename = `nutrition-backup-${todayKey()}.json`;
  data.lastBackup = Date.now();
  const text = backupPayload();
  let saved = false;
  try{
    const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if(dl){ await dl.save({filename, data: text}); saved = true; }
    else {
      const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      saved = true;
    }
  }catch(e){
    if(e && e.code==='declined'){ load(); return; }
    if(e && e.code==='rate_limited'){ load(); notify('فيه نافذة تنزيل مفتوحة. سكرها وجرب مرة ثانية.'); return; }
    saved = false;
  }
  if(saved){ save(); renderBackupStatus(); document.getElementById('backup-fallback').style.display='none'; notify('نزلت النسخة الاحتياطية ✅'); }
  else { load(); document.getElementById('backup-text').value = text; document.getElementById('backup-fallback').style.display='block'; }
}
function cleanRef(r){
  if(!r || typeof r!=='object' || !r.per) return undefined;
  const amount = num(r.amount), g = num(r.unitGrams);
  if(amount<=0 || g<=0) return undefined;
  return {name:String(r.name||'').slice(0,120), per:{cal:num(r.per.cal), pro:num(r.per.pro), carb:num(r.per.carb), fat:num(r.per.fat)},
    amount, unitLabel:String(r.unitLabel||'غم').replace(/كفكير/g,'چفچير').slice(0,30), unitGrams:g, approx:!!r.approx, hideGrams:!!r.hideGrams, src:['U','E','C','R'].includes(r.src)?r.src:''};
}
function cleanItem(it){
  const out = {cal:num(it.cal), pro:num(it.pro), carb:num(it.carb), fat:num(it.fat), note:String(it.note||'مقدار').replace(/كفكير/g,'چفچير').slice(0,200)};
  const ref = cleanRef(it.ref); if(ref){ out.ref = ref; recalcItem(out); }
  return out;
}
function cleanItems(a){ return (Array.isArray(a)?a:[]).filter(x=>x && typeof x==='object').map(cleanItem); }
function cleanImported(raw){
  const d = raw && raw.data ? raw.data : raw;
  if(!d || typeof d!=='object') throw new Error('bad');
  const out = {meals:{}, weights:[], customFoods:[], savedMeals:[], recipes:[], water:{}, waist:[], workouts:{}};
  Object.keys(d.meals||{}).forEach(k=>{
    if(!DATE_RE.test(k) || !Array.isArray(d.meals[k])) return;
    out.meals[k] = d.meals[k].filter(m=>m && typeof m==='object').map(m=> Array.isArray(m.items)
      ? {label:String(m.label||'وجبة').slice(0,120), items:cleanItems(m.items), t:num(m.t)}
      : {label:String(m.label||m.note||'وجبة').slice(0,120), items:[cleanItem(m)], t:num(m.t)});
    if(!out.meals[k].length) delete out.meals[k];
  });
  (Array.isArray(d.weights)?d.weights:[]).forEach(x=>{ if(x && DATE_RE.test(x.date) && num(x.w)>0) out.weights.push({date:x.date, w:num(x.w)}); });
  out.weights.sort((a,b)=>a.date.localeCompare(b.date));
  (Array.isArray(d.waist)?d.waist:[]).forEach(x=>{ if(x && DATE_RE.test(x.date) && num(x.cm)>=40 && num(x.cm)<=200) out.waist.push({date:x.date, cm:num(x.cm)}); });
  out.waist.sort((a,b)=>a.date.localeCompare(b.date));
  (Array.isArray(d.customFoods)?d.customFoods:[]).forEach(f=>{
    if(!f || !f.name) return;
    out.customFoods.push({name:String(f.name).slice(0,120), cal:num(f.cal), pro:num(f.pro), carb:num(f.carb), fat:num(f.fat),
      barcode:String(f.barcode||'').slice(0,40), servingSize:num(f.servingSize)||100,
      rawCal:num(f.rawCal), rawPro:num(f.rawPro), rawCarb:num(f.rawCarb), rawFat:num(f.rawFat)});
  });
  (Array.isArray(d.savedMeals)?d.savedMeals:[]).forEach(s=>{
    if(!s || !s.name) return;
    out.savedMeals.push({id: ID_RE.test(s.id||'') ? s.id : uid(), name:String(s.name).slice(0,120), items:cleanItems(s.items)});
  });
  (Array.isArray(d.recipes)?d.recipes:[]).forEach(r=>{
    if(!r || !r.name || !r.per) return;
    const items = cleanItems(r.items);
    const raw = items.reduce((a,it)=>a+itemGrams(it),0), cooked = num(r.cooked);
    const base = cooked>0 ? cooked : (num(r.base) || raw);
    const t = sumItems(items);
    const per = base && items.length ? {cal:t.cal/base*100, pro:t.pro/base*100, carb:t.carb/base*100, fat:t.fat/base*100}
      : {cal:num(r.per.cal), pro:num(r.per.pro), carb:num(r.per.carb), fat:num(r.per.fat)};
    out.recipes.push({id: ID_RE.test(r.id||'') ? r.id : uid(), name:String(r.name).slice(0,120), items,
      cooked, servings:Math.max(0, Math.floor(num(r.servings))), raw, base, per});
  });
  const p = d.profile;
  if(p && typeof p==='object' && DATE_RE.test(p.dob) && num(p.height)>0 && num(p.weight)>0 && GOALS[p.goal]){
    out.profile = {name:String(p.name||'').slice(0,60), sex:p.sex==='f'?'f':'m', dob:p.dob, height:num(p.height), weight:num(p.weight),
      activity:[1.2,1.375,1.55,1.725,1.9].includes(num(p.activity))?num(p.activity):1.375, goal:p.goal, pace:p.pace==='fast'?'fast':'slow'};
    if(num(p.tdeeOverride)>0) out.profile.tdeeOverride = num(p.tdeeOverride);
    if(p.goal==='custom'){ const c = p.custom||{}; out.profile.custom = {cal:num(c.cal), pro:num(c.pro), carb:num(c.carb), fat:num(c.fat)}; }
  }
  Object.keys(d.water||{}).forEach(k=>{
    if(!DATE_RE.test(k) || !Array.isArray(d.water[k])) return;
    const a = d.water[k].filter(x=>x && num(x.ml)>0 && num(x.ml)<=3000).map(x=>({t:num(x.t), ml:num(x.ml)}));
    if(a.length) out.water[k] = a;
  });
  out.workouts = cleanWorkouts(d.workouts);
  out.sleep = {};
  Object.keys(d.sleep||{}).forEach(k=>{ const h = num(d.sleep[k]); if(DATE_RE.test(k) && h>0 && h<=16) out.sleep[k] = Math.round(h*2)/2; });
  const trn = cleanTraining(d.training); if(trn) out.training = trn;
  if(num(d.onboarded)>0) out.onboarded = num(d.onboarded);
  if(d.consent && num(d.consent.v)>0) out.consent = {v:num(d.consent.v), t:num(d.consent.t)};
  if(num(d.updatedAt)>0) out.updatedAt = num(d.updatedAt);
  if(typeof d.syncedWith==='string' && /^[A-Za-z0-9_\-]{1,64}$/.test(d.syncedWith)) out.syncedWith = d.syncedWith;
  if(num(d.lastBackup)>0) out.lastBackup = num(d.lastBackup);
  if(Array.isArray(d.achSeen)) out.achSeen = d.achSeen.filter(x=>typeof x==='string' && /^[a-z0-9]{1,16}$/.test(x)).slice(0,300);
  return out;
}
function importBackup(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    let clean;
    try{ clean = cleanImported(JSON.parse(reader.result)); }
    catch(e){ notify('هذا الملف مو نسخة احتياطية صالحة'); return; }
    const msg = `النسخة فيها: ${Object.keys(clean.meals).length} يوم أكل، ${clean.weights.length} وزن، ${clean.customFoods.length} منتج، ${clean.savedMeals.length} وجبة جاهزة، ${clean.recipes.length} طبخة.\n\nالاسترجاع يستبدل كل بياناتك الحالية بهذي النسخة.`;
    if(!await askConfirm(msg, 'استرجاع', true)) return;
    data = clean; save();
    mode = null; draft = []; rcItems = []; rcEditId = null;
    populateFoodList(); applyTargets(); setDay(todayKey()); renderDraft(); renderWeight(); renderHistory(); renderTrain();
    notify('تم الاسترجاع ✅');
  };
  reader.onerror = ()=>notify('ما گدرنا نقرا الملف');
  reader.readAsText(file);
}
async function resetAll(){
  if(!await askConfirm('مسح كل البيانات المحفوظة؟ هذا الإجراء ما يترجع.\nنصيحة: نزّل نسخة احتياطية قبل المسح.', 'مسح كل شي', true)) return;
  data = {meals:{}, weights:[], customFoods:[], savedMeals:[], recipes:[], water:{}, waist:[], workouts:{}, sleep:{}, onboarded:Date.now()};
  save(); ppClearAll();
  mode = null; draft = []; rcItems = []; rcEditId = null;
  document.getElementById('targets-wrap').style.display='none';
  document.getElementById('targets-empty').style.display='block';
  document.getElementById('hdr-sub').textContent = 'سجّل معلوماتك من "ملفي" حتى نحسب احتياجك';
  CARB_T = 0; FAT_T = 0;
  applyTargets(); populateFoodList(); setDay(todayKey()); renderDraft(); renderWeight(); renderHistory(); renderTrain();
}


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
  document.getElementById('sleep-week').innerHTML = days.map(x=>`<div class="${x.k===k?'cur':''}"><i class="${!x.h?'none':x.h<7?'lo':''}" style="height:${x.h?Math.min(100, x.h/10*100).toFixed(0):0}%"></i><small>${x.d.getDate()}</small></div>`).join('');
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
  const hasT = !!data.profile && !TRACK;
  const calDays = hasT ? tot.filter(x=>x.cal >= CAL_MIN*0.9 && x.cal <= CAL_MAX).length : 0;
  const sleepGood = sl.filter(h=>h>=7).length;
  const prog = trPlan(), trainGoal = prog ? Math.max(2, Math.min(prog.days.length, 6)) : 3;
  return {keys, startK, endK, logged:logged.length, avgCal, avgPro, workouts, waterDays, avgSleep, sleepN:sl.length, dW, hasT, calDays, sleepGood, trainGoal};
}
function weekScore(S){
  const pts = S.logged/7*25 + Math.min(1, S.workouts/S.trainGoal)*25 + S.waterDays/7*20 + S.sleepGood/7*15 + (S.hasT ? S.calDays : S.logged)/7*15;
  return Math.max(0, Math.min(100, Math.round(pts)));
}
function weekScoreMsg(sc){ return sc >= 85 ? 'أسبوع أبطال 🏆' : sc >= 65 ? 'أسبوع قوي 💪' : sc >= 40 ? 'بداية زينة، نكدر أحسن' : 'الأسبوع الجاي نشدّ حيلنا'; }
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
  const sc = weekScore(S);
  WEEK_END = endK;
  trOpenSheet('ملخص الأسبوع', `<div class="ws-head"><img src="media/hero-face.webp" alt=""><div class="ob-bubble2">${hello}</div></div>
    <div class="ws-range">${range}</div>
    <div class="ws-score"><div class="ws-ring" style="--p:${sc}"><b>${sc}</b></div><div><strong>${weekScoreMsg(sc)}</strong><span>نقاط أسبوعك من 100</span></div></div>
    <div class="ws-grid">${grid}</div>
    <div class="ws-tip"><b>💡 نصيحتي للأسبوع الجاي</b>${tip}</div>
    <div class="ws-share"><button class="primary" onclick="shareOpen('week')">📤 شارك بطاقة أسبوعك</button></div>
    <div class="ws-ch">🏆 <b>تحدّي هيرو:</b> كل جمعة نزّل بطاقة أسبوعك ستوري، وسوّي تاگ <b dir="ltr">@heroapp.iq</b> ووياه أصدقائك. الأعلى نقاط يفوز.</div>
    <details class="ws-how"><summary>شلون تنحسب النقاط؟</summary>تسجيل الأكل 25 · التمارين 25 (حسب أيام برنامجك) · الماي 20 · الأكل ضمن هدفك 15 · النوم 7 ساعات أو أكثر 15. النقاط على الالتزام، مو على الوزن، حتى يكون التحدّي عادل للكل.</details>`);
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
    <div class="btn-row">${PP.list.length>1 ? `<button class="ghost" onclick="ppCompare('${x.id}')">↔️ قارنها</button>` : ''}<button class="link-danger" onclick="ppDel('${x.id}')">🗑️ احذف الصورة</button></div>`);
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

// ---- v107: نسخة احتياطية لصور التقدّم (ملف منفصل، تنحفظ وين يختار المستخدم) ----
const PP_IMG_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/]+={0,2}$/;
const PP_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const PP_MAX_PHOTOS = 1000, PP_MAX_IMG = 4000000, PP_MAX_FILE = 400*1024*1024;
async function ppExport(){
  await ppLoad();
  if(!PP.list.length){ notify('ما عندك صور تنزّلها'); return; }
  try{
    if(PP.list.length > PP_MAX_PHOTOS){ notify('صورك أكثر من اللازم لملف واحد. احذف بعض الصور القديمة وجرب مرة ثانية.'); return; }
    const text = JSON.stringify({app:'hero-photos', version:1, exported:new Date().toISOString(), photos:PP.list.map(p=>({id:p.id, date:p.date, t:p.t, img:p.img}))});
    if(text.length > PP_MAX_FILE){ notify('صورك أكثر من اللازم لملف واحد. احذف بعض الصور القديمة وجرب مرة ثانية.'); return; }
    const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `hero-photos-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    notify('نزلت نسخة الصور ✅');
  }catch(e){ notify('ما گدرنا ننزّل ملف الصور'); }
}
function ppCleanImport(obj){
  if(!obj || typeof obj!=='object' || obj.app!=='hero-photos' || !Array.isArray(obj.photos)) throw new Error('bad');
  const seen = new Set(), out = [];
  for(const p of obj.photos){
    if(out.length >= PP_MAX_PHOTOS) break;
    if(!p || typeof p!=='object') continue;
    const id = p.id, date = p.date, t = Number(p.t), img = p.img;
    if(typeof id!=='string' || !PP_ID_RE.test(id) || seen.has(id)) continue;
    if(typeof date!=='string' || !DATE_RE.test(date) || !isFinite(t) || t<0) continue;
    if(typeof img!=='string' || img.length>PP_MAX_IMG || !PP_IMG_RE.test(img)) continue;
    seen.add(id); out.push({id, date, t, img});
  }
  return out;
}
function ppImport(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  if(file.size > PP_MAX_FILE){ notify('هذا الملف مو نسخة صور صالحة'); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    let clean;
    try{ clean = ppCleanImport(JSON.parse(reader.result)); }
    catch(e){ notify('هذا الملف مو نسخة صور صالحة'); return; }
    await ppLoad();
    const have = new Set(PP.list.map(p=>p.id));
    const fresh = clean.filter(p=>!have.has(p.id));
    if(!fresh.length){ notify('ما لكينا صور جديدة بالملف'); return; }
    if(!await askConfirm(`الملف فيه ${fresh.length} صورة جديدة. تضيفهن لصورك؟ (صورك الحالية ما تنمسح)`, 'ضيفهن')) return;
    try{ await ppTx('readwrite', st=>{ fresh.forEach(p=>st.put(p)); }); }
    catch(e){ notify('⚠️ ما گدرنا نحفظ الصور بهذا الجهاز'); return; }
    notify(`انضافت ${fresh.length} صورة ✅`);
    ppRender();
  };
  reader.onerror = ()=>notify('ما گدرنا نقرا الملف');
  reader.readAsText(file);
}

// ================= water =================
// drinking target ≈ 80% of EFSA total-water intake (≈20% comes from food): men 2.0 L, women 1.6 L
function waterTarget(){ return data.profile && data.profile.sex==='f' ? 1600 : 2000; }
function waterOf(k){ return (data.water[k]||[]).reduce((a,x)=>a+num(x.ml),0); }
function fmtL(ml){ return String(+(ml/1000).toFixed(2)); }
let nudgeToasted = false;
function addWater(ml){
  const k = curDay || todayKey();
  if(!data.water[k]) data.water[k] = [];
  data.water[k].push({t:Date.now(), ml});
  nudgeToasted = false;
  save(); renderWater();
  notify(waterOf(k) >= waterTarget() ? 'وصلت هدف الماي اليوم ✅' : `+${ml} مل`);
}
function undoWater(){
  const k = curDay || todayKey(), a = data.water[k];
  if(!a || !a.length) return;
  a.pop(); if(!a.length) delete data.water[k];
  save(); renderWater();
}
function renderWater(){
  const k = curDay || todayKey(), tot = waterOf(k), tgt = waterTarget();
  document.getElementById('water-now').textContent = fmtL(tot);
  document.getElementById('water-goal').textContent = `/ ${fmtL(tgt)} لتر`;
  const n = Math.ceil(tgt/250), full = Math.min(n, Math.floor(tot/250));
  const pop = renderWater.last && renderWater.last.k === k && full > renderWater.last.full ? full - 1 : -1;   // الكوب اللي هسه تعبى «ينط»
  renderWater.last = {k, full};
  document.getElementById('water-cups').innerHTML = Array.from({length:n}, (_,i)=>
    `<svg viewBox="0 0 20 24" class="${i<full?'full':''}${i===pop?' pop':''}"><path class="cup-f" d="M4.3 10h11.4l-1.1 11.2H5.4z"/><path class="cup-o" d="M2.5 2.5h15l-1.9 19.2H4.4z"/></svg>`).join('');
  document.getElementById('water-undo').disabled = !(data.water[k]||[]).length;
  document.getElementById('water-note').textContent = tot >= tgt ? '✅ وصلت هدفك اليوم. بالحر والتمرين اشرب أكثر.' : `باقي ${fmtL(tgt-tot)} لتر للهدف.`;
  renderNudge();
}
// gentle in-app reminder: daytime, below target, 2+ hours since the last drink
function waterNudgeDue(){
  const k = todayKey();
  if((curDay||k)!==k) return false;
  const now = new Date(), hr = now.getHours();
  if(hr<9 || hr>=23) return false;
  if(waterOf(k) >= waterTarget()) return false;
  const a = data.water[k] || [];
  const last = a.length ? a[a.length-1].t : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9).getTime();
  return Date.now() - last >= 2*3600*1000;
}
function renderNudge(){
  const due = waterNudgeDue();
  document.getElementById('water-nudge').hidden = !due;
  const todayVisible = !document.getElementById('tab-today').classList.contains('hidden');
  if(due && todayVisible && !nudgeToasted && data.onboarded && document.getElementById('onboard').hidden){ nudgeToasted = true; notify('تذكير لطيف: صار وقت كوب ماي'); }
}
setInterval(()=>{ try{ renderNudge(); }catch(e){} }, 5*60*1000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') try{ renderNudge(); }catch(e){} });


// ================= طريق البطل: الكؤوس والتحديات (بدون الأكل حالياً) =================
const ACH_LEVELS = [[0,'بداية الطريق'],[100,'ماشي بثبات'],[300,'صاحب همّة'],[600,'مثابر'],[1000,'مقاتل'],[1600,'بطل'],[2500,'بطل خارق'],[4000,'أسطورة'],[6000,'قدوة'],[9000,'هيرو']];
function achAdd(k, n){ const d = dateFromKey(k); d.setDate(d.getDate()+n); return keyFromDate(d); }
function achWeek(k){ const d = dateFromKey(k); d.setDate(d.getDate() - (d.getDay()+1)%7); return keyFromDate(d); } // الأسبوع يبدي السبت
function achFem(){ return !!(data.profile && data.profile.sex==='f'); }
function achHero(){ return achFem() ? 'عفية بطلة! كمّلي هيج 💪' : 'عفية بطل! كمّل هيج 💪'; }
function achCnt(arr, n){ return {v:Math.min(arr.length, n), g:n, date: arr.length>=n ? arr[n-1] : null}; }
function achRun(dates, n){ // أول مرة وصلت n أيام ورا بعض
  let run = 0, prev = null, best = 0;
  for(const k of dates){ run = (prev && achAdd(prev,1)===k) ? run+1 : 1; prev = k; best = Math.max(best, run); if(run>=n) return {v:n, g:n, date:k}; }
  return {v:best, g:n, date:null};
}
function achWeekRun(weeks, ok, n){ // أسابيع ورا بعض
  const ks = Object.keys(weeks).filter(w=>ok(weeks[w])).sort();
  let run = 0, prev = null, best = 0;
  for(const w of ks){ run = (prev && achAdd(prev,7)===w) ? run+1 : 1; prev = w; best = Math.max(best, run); if(run>=n) return {v:n, g:n, date:w}; }
  return {v:best, g:n, date:null};
}
function achStats(){
  const today = todayKey(), wkNow = achWeek(today);
  const sess = []; Object.keys(data.workouts||{}).sort().forEach(k=>(data.workouts[k]||[]).forEach(()=>sess.push(k)));
  const tgt = waterTarget();
  const water = Object.keys(data.water||{}).sort().filter(k=>waterOf(k)>=tgt);
  const weigh = (data.weights||[]).map(x=>x.date).sort(), waist = (data.waist||[]).map(x=>x.date).sort();
  const best = {}, prs = []; let cardio = 0, cardioDate = null, cardioDate2 = null;
  Object.keys(data.workouts||{}).sort().forEach(k=>(data.workouts[k]||[]).forEach(s=>(s.items||[]).forEach(i=>{
    if(i.type==='cardio'){ cardio += num(i.min); if(cardio>=300 && !cardioDate) cardioDate = k; if(cardio>=1500 && !cardioDate2) cardioDate2 = k; return; }
    if(!i.ex) return;
    let top = 0; (i.sets||[]).forEach(x=>{ const sc = i.type==='kg' ? num(x.w)*(1+num(x.r)/30) : num(x.r); if(sc>top) top = sc; });
    if(top<=0) return;
    if(best[i.ex]!==undefined && top > best[i.ex]+1e-9) prs.push(k);
    if(best[i.ex]===undefined || top > best[i.ex]) best[i.ex] = top;
  })));
  const active = new Set([...sess, ...water]), act = [...active].sort();
  let streak = 0, d = active.has(today) ? today : achAdd(today,-1);
  while(active.has(d)){ streak++; d = achAdd(d,-1); }
  let bestStreak = 0, run = 0, prev = null; act.forEach(k=>{ run = (prev && achAdd(prev,1)===k) ? run+1 : 1; prev = k; bestStreak = Math.max(bestStreak, run); });
  const prog = trPlan(), trainGoal = prog ? Math.max(2, Math.min(prog.days.length, 6)) : 3;
  const weeks = {}; const W = k=>(weeks[achWeek(k)] = weeks[achWeek(k)] || {s:0, w:0, g:0});
  sess.forEach(k=>W(k).s++); water.forEach(k=>W(k).w++); weigh.forEach(k=>W(k).g++);
  const st = {today, wkNow, sess, water, weigh, waist, prs, cardio, cardioDate, cardioDate2, streak, bestStreak, act, trainGoal, weeks, todayActive:active.has(today)};
  // التحديات المكتملة بكل الأسابيع
  const chDone = [], fullWeeks = [];
  Object.keys(weeks).sort().forEach(w=>{
    const end = achAdd(w,6), dd = end < today ? end : today;
    const n = ACH_CH.filter(c=>c.val(weeks[w]) >= c.goal(st)).length;
    for(let i=0;i<n;i++) chDone.push(dd);
    if(n===ACH_CH.length) fullWeeks.push(dd);
  });
  st.chDone = chDone; st.fullWeeks = fullWeeks;
  st.xp = sess.length*30 + water.length*10 + weigh.length*5 + waist.length*5 + prs.length*10 + chDone.length*20 + (data.profile ? 20 : 0);
  return st;
}
const ACH_CH = [
  {id:'train', ic:'🏋️', t:g=>`كمّل ${g} حصص تمرين`, tf:g=>`كمّلي ${g} حصص تمرين`, goal:st=>st.trainGoal, val:w=>w.s},
  {id:'water', ic:'💧', t:()=>'وصّل هدف الماي 5 أيام', tf:()=>'وصّلي هدف الماي 5 أيام', goal:()=>5, val:w=>w.w},
  {id:'weigh', ic:'⚖️', t:()=>'سجّل وزنك مرتين', tf:()=>'سجّلي وزنك مرتين', goal:()=>2, val:w=>w.g},
];
const ACH = [
  {id:'start', ic:'🚩', n:'بداية الطريق', d:'عبّيت معلوماتك', tier:1, f:()=>({v:data.profile?1:0, g:1, date:null})},
  {id:'s1',  ic:'💪', n:'أول تمرين', d:'أول حصة كاملة', tier:1, f:st=>achCnt(st.sess,1)},
  {id:'s10', ic:'🏋️', n:'10 تمارين', d:'10 حصص', tier:1, f:st=>achCnt(st.sess,10)},
  {id:'s25', ic:'🏋️', n:'25 تمرين', d:'25 حصة', tier:2, f:st=>achCnt(st.sess,25)},
  {id:'s50', ic:'🦾', n:'50 تمرين', d:'50 حصة', tier:3, f:st=>achCnt(st.sess,50)},
  {id:'s100', ic:'👑', n:'مية تمرين', d:'100 حصة', tier:3, f:st=>achCnt(st.sess,100)},
  {id:'pr1', ic:'📈', n:'أول رقم قياسي', d:'رفعت أكثر من قبل', tier:1, f:st=>achCnt(st.prs,1)},
  {id:'pr10', ic:'🚀', n:'10 أرقام قياسية', d:'تطور مستمر', tier:2, f:st=>achCnt(st.prs,10)},
  {id:'wk4', ic:'📅', n:'شهر التزام', d:'4 أسابيع ورا بعض كمّلت تمارينها', tier:2, f:st=>achWeekRun(st.weeks, w=>w.s>=st.trainGoal, 4)},
  {id:'cardio', ic:'🏃', n:'5 ساعات كارديو', d:'مجموع الكارديو', tier:2, f:st=>({v:Math.min(300, Math.round(st.cardio)), g:300, date:st.cardioDate})},
  {id:'w1',  ic:'💧', n:'أول يوم ماي', d:'وصلت هدف الماي', tier:1, f:st=>achCnt(st.water,1)},
  {id:'w7',  ic:'🌊', n:'أسبوع ارتواء', d:'7 أيام ورا بعض', tier:2, f:st=>achRun(st.water,7)},
  {id:'w30', ic:'🐳', n:'30 يوم ماي', d:'30 يوم وصلت الهدف', tier:3, f:st=>achCnt(st.water,30)},
  {id:'g1',  ic:'⚖️', n:'أول وزن', d:'سجلت وزنك', tier:1, f:st=>achCnt(st.weigh,1)},
  {id:'g4',  ic:'🗓️', n:'متابع وزن', d:'4 أسابيع ورا بعض', tier:2, f:st=>achWeekRun(st.weeks, w=>w.g>=1, 4)},
  {id:'waist', ic:'📏', n:'أول قياس خصر', d:'قست خصرك', tier:1, f:st=>achCnt(st.waist,1)},
  {id:'st3',  ic:'🔥', n:'3 أيام نار', d:'3 أيام التزام ورا بعض', tier:1, f:st=>achRun(st.act,3)},
  {id:'st7',  ic:'🔥', n:'أسبوع نار', d:'7 أيام ورا بعض', tier:2, f:st=>achRun(st.act,7)},
  {id:'st14', ic:'🔥', n:'أسبوعين نار', d:'14 يوم ورا بعض', tier:2, f:st=>achRun(st.act,14)},
  {id:'st30', ic:'☄️', n:'شهر نار', d:'30 يوم ورا بعض', tier:3, f:st=>achRun(st.act,30)},
  {id:'ch1',  ic:'🎯', n:'أول تحدي', d:'كمّلت تحدي أسبوعي', tier:1, f:st=>achCnt(st.chDone,1)},
  {id:'chall', ic:'⭐', n:'أسبوع كامل', d:'كل تحديات الأسبوع', tier:2, f:st=>achCnt(st.fullWeeks,1)},
  {id:'ch10', ic:'🏆', n:'10 تحديات', d:'10 تحديات أسبوعية', tier:3, f:st=>achCnt(st.chDone,10)},
  {id:'s200', ic:'💎', n:'200 تمرين', d:'200 حصة', tier:3, f:st=>achCnt(st.sess,200)},
  {id:'wk12', ic:'🗓️', n:'3 أشهر التزام', d:'12 أسبوع ورا بعض كمّلت تمارينها', tier:3, f:st=>achWeekRun(st.weeks, w=>w.s>=st.trainGoal, 12)},
  {id:'pr25', ic:'🏔️', n:'25 رقم قياسي', d:'قوتك بتصاعد', tier:3, f:st=>achCnt(st.prs,25)},
  {id:'cardio2', ic:'🚴', n:'25 ساعة كارديو', d:'مجموع الكارديو', tier:3, f:st=>({v:Math.min(1500, Math.round(st.cardio)), g:1500, date:st.cardioDate2})},
  {id:'w100', ic:'🌧️', n:'100 يوم ماي', d:'100 يوم وصلت الهدف', tier:3, f:st=>achCnt(st.water,100)},
  {id:'g12', ic:'📊', n:'متابع 3 أشهر', d:'12 أسبوع ورا بعض سجلت وزنك', tier:3, f:st=>achWeekRun(st.weeks, w=>w.g>=1, 12)},
  {id:'waist4', ic:'📐', n:'4 قياسات خصر', d:'تتابع شكل جسمك', tier:2, f:st=>achCnt(st.waist,4)},
  {id:'st60', ic:'🌋', n:'60 يوم نار', d:'شهرين ورا بعض', tier:3, f:st=>achRun(st.act,60)},
  {id:'st100', ic:'👑', n:'100 يوم نار', d:'100 يوم ورا بعض', tier:3, f:st=>achRun(st.act,100)},
  {id:'ch25', ic:'🎖️', n:'25 تحدي', d:'25 تحدي أسبوعي', tier:3, f:st=>achCnt(st.chDone,25)},
  {id:'full4', ic:'🌟', n:'4 أسابيع كاملة', d:'4 أسابيع كمّلت كل تحدياتها', tier:3, f:st=>achCnt(st.fullWeeks,4)},
];
function achLevel(xp){
  let i = 0; ACH_LEVELS.forEach((l,j)=>{ if(xp>=l[0]) i = j; });
  const next = ACH_LEVELS[i+1];
  return {i, name:ACH_LEVELS[i][1], from:ACH_LEVELS[i][0], to: next ? next[0] : null, nextName: next ? next[1] : null};
}
function achEval(st){ return ACH.map(a=>{ const r = a.f(st); return Object.assign({}, a, r, {done: r.v>=r.g}); }); }
function achDateText(k){ if(!k) return ''; const d = dateFromKey(k); return `${d.getDate()}/${d.getMonth()+1}`; }
function renderAchChip(st){
  const el = document.getElementById('ach-chip'); if(!el) return;
  st = st || achStats();
  const n = achEval(st).filter(a=>a.done).length;
  document.getElementById('ach-streak').textContent = st.streak;
  document.getElementById('ach-count').textContent = n;
  el.querySelector('.fire').classList.toggle('off', !st.streak);
}
let achTimer = null;
function achSoon(){ if(data.onboarded && typeof hasConsent==='function' && !hasConsent()) return; clearTimeout(achTimer); achTimer = setTimeout(()=>{ try{ achCheck(); }catch(e){ console.error(e); } }, 350); }
function achCheck(opts){
  const st = achStats(), list = achEval(st), earned = list.filter(a=>a.done).map(a=>a.id);
  renderAchChip(st);
  const first = !Array.isArray(data.achSeen);
  const seen = first ? [] : data.achSeen;
  const fresh = earned.filter(id=>!seen.includes(id));
  if(!fresh.length){ if(first){ data.achSeen = []; saveLocal(); } return []; }
  data.achSeen = seen.concat(fresh); save();
  if(!(opts && opts.inline) && data.onboarded) achCelebrate(fresh, first);
  return fresh;
}
function achItem(id){ return ACH.find(a=>a.id===id); }
function achCelebrate(ids, first){
  const old = document.getElementById('ach-pop'); if(old) old.remove();
  const one = ids.length===1 ? achItem(ids[0]) : null;
  const colors = ['#ff9a3d','#f0476b','#ffd23f','#12c2b0','#1d6fd6','#9be15d'];
  const cf = Array.from({length:36}, (_,i)=>`<i class="cf" style="left:${Math.round(Math.random()*100)}%; background:${colors[i%colors.length]}; animation-duration:${(1.6+Math.random()*1.8).toFixed(2)}s; animation-delay:${(Math.random()*.6).toFixed(2)}s"></i>`).join('');
  const title = first ? `عندك ${ids.length} ${ids.length>2 && ids.length<11 ? 'كؤوس' : 'كأس'} من شغلك!` : one ? 'كأس جديد!' : `${ids.length} كؤوس جديدة!`;
  const body = one ? `<div class="big">${one.ic}</div><h2>${title}</h2><div style="font-weight:700; font-size:17px;">${esc(one.n)}</div><div class="meta">${esc(one.d)}</div>`
    : `<div class="big">🏆</div><h2>${title}</h2><div class="lst">${ids.map(id=>{ const a = achItem(id); return `<div class="it"><span class="e">${a.ic}</span><div><b>${esc(a.n)}</b><span>${esc(a.d)}</span></div></div>`; }).join('')}</div>`;
  const pop = document.createElement('div'); pop.id = 'ach-pop'; pop.className = 'ach-pop'; pop.setAttribute('role','dialog');
  pop.innerHTML = `${cf}<div class="box">${body}<div class="hero-say"><img src="media/hero-face.webp" alt=""><span>هيرو يكلك: ${achHero()}</span></div>
    <div class="btns"><button class="ghost" onclick="achPopClose()">تمام</button><button class="primary" onclick="achPopClose(); achOpen();">شوف طريقي</button></div>
    ${one ? `<button type="button" class="ghost" style="width:100%; margin-top:8px;" onclick="achPopClose(); shareOpen('trophy','${one.id}')">📤 <span>شارك الكأس</span></button>` : ''}</div>`;
  pop.addEventListener('click', e=>{ if(e.target===pop) achPopClose(); });
  document.body.appendChild(pop);
}
function achPopClose(){ const p = document.getElementById('ach-pop'); if(p) p.remove(); }
function achBadges(list, fresh){
  const done = list.filter(a=>a.done).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))), todo = list.filter(a=>!a.done).sort((a,b)=>(b.v/b.g)-(a.v/a.g));
  return done.concat(todo).map(a=>`<div class="badge t${a.tier} ${a.done?'':'lock'} ${fresh.includes(a.id)?'new':''}">
    <div class="md">${a.ic}</div><div class="bn">${esc(a.n)}</div>
    ${a.done ? `<div class="bd">${esc(a.d)}</div>${a.date ? `<div class="bd">${achDateText(a.date)}</div>` : ''}` : `<div class="pb"><i style="width:${Math.round(a.v/a.g*100)}%"></i></div><div class="bd" dir="ltr">${a.v} / ${a.g}</div>`}
  </div>`).join('');
}
function achOpen(){
  const st = achStats(), list = achEval(st), lv = achLevel(st.xp), f = achFem();
  const nDone = list.filter(a=>a.done).length;
  const w = st.weeks[st.wkNow] || {s:0, w:0, g:0};
  const endTxt = (()=>{ const left = Math.round((dateFromKey(achAdd(st.wkNow,6)) - dateFromKey(st.today))/86400000); return left<=0 ? 'يخلص اليوم' : left===1 ? 'باقي يوم' : `باقي ${left} أيام`; })();
  const chs = ACH_CH.map(c=>{ const g = c.goal(st), v = Math.min(c.val(w), g), ok = v>=g;
    return `<div class="ach-ch ${ok?'done':''}"><div class="ic">${ok?'✅':c.ic}</div><div class="tx"><div class="tt">${esc((f?c.tf:c.t)(g))}</div><div class="pb"><i style="width:${Math.round(v/g*100)}%"></i></div></div><div class="ct">${v}/${g}</div></div>`; }).join('');
  const pct = lv.to ? Math.round((st.xp-lv.from)/(lv.to-lv.from)*100) : 100;
  const streakNote = st.streak && !st.todayActive ? (f ? 'تمرني أو وصّلي هدف الماي اليوم حتى ما تنقطع السلسلة 🔥' : 'تمرن أو وصّل هدف الماي اليوم حتى ما تنقطع السلسلة 🔥')
    : 'اليوم يحسب بالسلسلة إذا تمرنت أو وصلت هدف الماي.';
  trOpenSheet('طريق البطل', `
    <div class="ach-lv"><div class="k">المستوى ${lv.i+1} من ${ACH_LEVELS.length}</div><div class="nm">${esc(lv.name)}</div>
      <button type="button" class="share-mini" onclick="shareOpen('streak')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><span>شارك طريقي</span></button>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="lvsteps">${ACH_LEVELS.map((l,j)=>`<i class="${j<=lv.i?'on':''}"></i>`).join('')}</div>
      <div class="row"><span>${st.xp} نقطة</span><span>${lv.to ? `${lv.to - st.xp} نقطة لـ «${esc(lv.nextName)}»` : 'وصلت القمة 👑'}</span></div></div>
    <div class="ach-streak"><div class="stat"><div class="n">🔥 ${st.streak}</div><div class="l">أيام ورا بعض</div></div><div class="stat"><div class="n">${st.bestStreak}</div><div class="l">أطول سلسلة</div></div></div>
    <div class="ach-note">${streakNote}</div>
    <div class="ach-h"><h3>تحديات هذا الأسبوع</h3><span>${endTxt}</span></div>
    ${chs}
    <div class="ach-h"><h3>كؤوسي</h3><span>${nDone} من ${list.length}</span></div>
    <div class="ach-grid">${achBadges(list, [])}</div>
    <div class="goal-note" style="margin-top:14px;">النقاط: حصة تمرين 30، يوم ماي كامل 10، رقم قياسي 10، تحدي أسبوعي 20، تسجيل وزن أو خصر 5.</div>`);
  document.getElementById('tr-sheet').classList.add('ach');
}

// ================= welcome screens =================
let obStep = 0, obConsentOnly = false;
const CONSENT_V = 1;
function hasConsent(){ return !!(data.consent && data.consent.v >= CONSENT_V); }
// للمستخدمين القدامى: شاشة التنبيه والموافقة بس
function openConsent(){
  obStep = 2; obConsentOnly = true; document.getElementById('ob-ack').checked = false;
  document.getElementById('onboard').hidden = false; document.body.classList.add('sheet-open'); obSync();
}
function openOnboard(){
  obStep = 0; obConsentOnly = false; document.getElementById('ob-ack').checked = !!(data.consent && data.consent.v >= 1);
  document.getElementById('onboard').hidden = false; document.body.classList.add('sheet-open'); obSync();
}
function obSync(){
  document.querySelectorAll('.ob-step').forEach(s=>s.hidden = Number(s.dataset.step)!==obStep);
  document.querySelectorAll('#ob-dots i').forEach((d,i)=>d.classList.toggle('on', i===obStep));
  const next = document.getElementById('ob-next');
  next.textContent = obStep===3 ? 'يلا نبدي' : obStep===2 ? 'موافق، كمّل' : 'التالي';
  next.disabled = obStep===2 && !document.getElementById('ob-ack').checked;
  document.getElementById('ob-back').style.visibility = (obStep===0 || obConsentOnly) ? 'hidden' : 'visible';
  if(obConsentOnly) next.textContent = 'موافق';
}
function obNext(){
  if(obStep===2 && !document.getElementById('ob-ack').checked) return;
  if(obStep===2){ data.consent = {v: CONSENT_V, t: Date.now()}; save(); }
  if(obConsentOnly){ obConsentOnly = false; document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open'); achSoon(); setTimeout(fixNotice, 1200); setTimeout(newsNotice, 1800); setTimeout(INST.nudge, 2400); return; }
  if(obStep<3){ obStep++; obSync(); return; }
  data.onboarded = Date.now(); save();
  document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open');
  if(!data.profile) switchTab('profile'); else renderNudge();
  setTimeout(()=>{ if(typeof INST !== 'undefined') INST.nudge(); }, 1500);
}
function obBack(){ if(obStep>0){ obStep--; obSync(); } }

// ================= تمريني =================
// المبادئ العلمية: كل عضلة مرتين بالأسبوع (Schoenfeld 2016)، 10-20 جولة للعضلة أسبوعياً (Schoenfeld 2017)،
// توقف قبل الفشل بـ 1-3 عدات، راحة 2-3 د لأول مركب ثقيل (Schoenfeld 2016) و90-120 ث للباقي (Singer 2024)، والتقدم التدريجي بالوزن أو العدات (ACSM 2009).
// السعرات: MET من جداول Compendium of Physical Activities (Herrmann 2024)، صافي = (MET-1) × الوزن × الساعات.
const MUS_AR = {pecUpper:'الصدر العلوي', pecLower:'الصدر', deltFront:'الكتف الأمامي', deltSide:'الكتف الجانبي', deltRear:'الكتف الخلفي',
  biceps:'البايسبس', triceps:'الترايسبس', forearm:'الساعد', abs:'البطن', obliques:'الخواصر', serratus:'عضلة المنشار', lats:'الظهر العريض',
  traps:'الترابيس', erectors:'أسفل الظهر', glutes:'الأرداف', quads:'الفخذ الأمامي', adductors:'الفخذ الداخلي', hamstrings:'الفخذ الخلفي',
  calves:'السمانة', tibialis:'مقدمة الساق', cardio:'القلب والرئة'};
const XE = (n, p, s, req, type, o)=>Object.assign({n, p, s, req, type}, o||{});
const EXLIB = {
  bb_squat: XE('سكوات بالبار', ['quads','glutes'], ['adductors','erectors','abs'], ['bb'], 'kg', {lvl:2, inc:5, av:['lowback'], cue:'البار على أعلى ظهرك مو على رقبتك. انزل لحد ما فخذك يوازي الأرض، ركبك باتجاه أصابع رجلك، وظهرك مستقيم. ادفع من كامل القدم.'}),
  goblet: XE('سكوات بالدمبل', ['quads','glutes'], ['adductors','abs'], ['db'], 'kg', {inc:2, cue:'شيل الدمبل كدام صدرك وانزل كأنك تكعد على كرسي لحد ما فخذك يوازي الأرض. ركبك باتجاه أصابع رجلك وكعبك ما يرتفع.'}),
  db_squat: XE('سكوات بدمبلين', ['quads','glutes'], ['adductors','forearm'], ['db'], 'kg', {inc:2, cue:'دمبل بكل إيد جنبك. انزل وظهرك مستقيم لحد ما فخذك يوازي الأرض، وادفع من كامل القدم.'}),
  bw_squat: XE('سكوات بوزن الجسم', ['quads','glutes'], ['adductors','abs'], [], 'bw', {cue:'إيديك كدامك للتوازن. انزل كأنك تكعد على كرسي، ظهرك مستقيم وكعبك على الأرض.'}),
  leg_press: XE('دفع الأرجل بالجهاز (ليغ بريس)', ['quads','glutes'], ['adductors','hamstrings'], ['machine'], 'kg', {inc:10, cue:'ظهرك لاصق بالمسند. نزّل الثقل لحد ما ركبك تصير زاوية قائمة تقريباً، وادفع بدون ما تقفل الركبة بالنهاية.'}),
  rdl_bb: XE('رومانيان ديدلفت بالبار', ['hamstrings','glutes'], ['erectors','forearm','traps'], ['bb'], 'kg', {lvl:2, inc:5, av:['lowback'], cue:'ركبك مثنية شوية وثابتة. ارجع وركك لورا والبار ينزل ملاصق لرجلك لحد ما تحس شد بالفخذ الخلفي، وظهرك مستقيم طول الحركة.'}),
  rdl_db: XE('رومانيان ديدلفت بالدمبل', ['hamstrings','glutes'], ['erectors','forearm'], ['db'], 'kg', {inc:2, av:['lowback'], cue:'ركبك مثنية شوية وثابتة. ارجع وركك لورا والدمبلز تنزل ملاصقة لرجلك لحد ما تحس شد بالفخذ الخلفي، وظهرك مستقيم.'}),
  lunge_db: XE('لنجز بالدمبل', ['quads','glutes'], ['adductors','hamstrings','calves'], ['db'], 'kg', {inc:2, av:['knee'], per:'لكل رجل', cue:'خطوة لكدام ونزّل الركبة الخلفية لقرب الأرض. الركبة الكدامية فوق القدم وجسمك مستقيم. العدات لكل رجل.'}),
  lunge_bw: XE('لنجز بوزن الجسم', ['quads','glutes'], ['adductors','hamstrings','calves'], [], 'bw', {av:['knee'], per:'لكل رجل', cue:'إيديك على خصرك. خطوة لكدام ونزّل الركبة الخلفية لقرب الأرض، وجسمك مستقيم. العدات لكل رجل.'}),
  bulgarian: XE('بلغاري سبليت سكوات بالدمبل', ['quads','glutes'], ['adductors','hamstrings'], ['db','chair'], 'kg', {lvl:2, inc:2, av:['knee'], per:'لكل رجل', cue:'رجلك الخلفية على بنج أو كرسي. انزل عمودي لحد ما فخذك الكدامي يوازي الأرض. العدات لكل رجل.'}),
  bulgarian_bw: XE('بلغاري سبليت سكوات', ['quads','glutes'], ['adductors','hamstrings'], ['chair'], 'bw', {av:['knee'], per:'لكل رجل', cue:'رجلك الخلفية على كرسي ثابت. انزل عمودي لحد ما فخذك الكدامي يوازي الأرض. العدات لكل رجل.'}),
  hip_thrust: XE('هيب ثرست بالبار', ['glutes'], ['hamstrings','quads'], ['bb','bench'], 'kg', {lvl:2, inc:5, cue:'أعلى ظهرك على البنج والبار على وركك (حط إسفنجة). ادفع وركك لفوق لحد ما جسمك يصير خط مستقيم، وشد أردافك بالأعلى ثانية.'}),
  glute_bridge: XE('جسر الأرداف', ['glutes'], ['hamstrings','abs'], [], 'bw', {cue:'نايم على ظهرك وركبك مثنية. ارفع وركك لحد ما يصير خط مستقيم من الركبة للكتف، وشد أردافك بالأعلى.'}),
  leg_ext: XE('فرد الرجل بالجهاز', ['quads'], [], ['machine'], 'kg', {inc:5, av:['knee'], cue:'اكعد وظهرك على المسند. افرد رجلك لحد ما تصير مستقيمة، ونزّلها على مهل.'}),
  leg_curl: XE('ثني الرجل بالجهاز', ['hamstrings'], ['calves'], ['machine'], 'kg', {inc:5, cue:'نايم على بطنك والوسادة فوق كعبك. اثني رجلك باتجاه أردافك، ونزّلها على مهل.'}),
  calf_raise: XE('رفع السمانة بالدمبل', ['calves'], [], ['db'], 'kg', {inc:2, cue:'واقف ودمبل بإيدك. ارتفع على أطراف أصابعك لأعلى نقطة، اثبت ثانية، ونزل على مهل.'}),
  calf_bw: XE('رفع السمانة', ['calves'], [], [], 'bw', {cue:'ارتفع على أطراف أصابعك لأعلى نقطة ونزل على مهل. على درجة يصير المدى أكبر.'}),
  bench_bb: XE('بنج برس بالبار', ['pecLower','pecUpper'], ['triceps','deltFront'], ['bb','bench'], 'kg', {lvl:2, inc:2.5, av:['chest','shoulder'], cue:'نايم على البنج وعيونك تحت البار. نزّل البار لأسفل صدرك على مهل والكوع لبرّه شوية، وادفع لفوق.'}),
  bench_db: XE('ضغط دمبل على بنج مستوي', ['pecLower','pecUpper'], ['triceps','deltFront'], ['db','bench'], 'kg', {inc:2, av:['chest'], cue:'دمبل بكل إيد. نزّلهن لمستوى صدرك والكوع تحت، وادفعهن لفوق بدون ما تقفل الكوع.'}),
  incline_db: XE('ضغط دمبل على بنج مائل', ['pecUpper'], ['pecLower','deltFront','triceps'], ['db','bench'], 'kg', {inc:2, av:['chest'], cue:'البنج على ميلان 30°. نزّل الدمبلز لمستوى صدرك العلوي على مهل والكوع لبرّه شوية، وادفعهن لفوق بدون ما تقفل الكوع.'}),
  chest_press: XE('جهاز ضغط الصدر', ['pecLower','pecUpper'], ['triceps','deltFront'], ['machine'], 'kg', {inc:5, av:['chest'], cue:'اضبط المقعد حتى المقابض بمستوى صدرك. ادفع لكدام بدون ما تقفل الكوع، وارجع على مهل.'}),
  pushup: XE('ضغط', ['pecLower','pecUpper'], ['triceps','deltFront','abs','serratus'], [], 'bw', {av:['chest','wrist'], cue:'إيديك أعرض شوية من كتافك وجسمك خط مستقيم من الراس للكعب. انزل لحد ما صدرك يقرب من الأرض وادفع. إذا صعبة، سويها على ركبك.'}),
  knee_pushup: XE('ضغط على الركب', ['pecLower','pecUpper'], ['triceps','deltFront','abs'], [], 'bw', {av:['chest','wrist'], cue:'ركبك على الأرض وجسمك خط مستقيم من الراس للركبة. انزل لحد ما صدرك يقرب من الأرض وادفع.'}),
  db_fly: XE('تفتيح دمبل', ['pecLower','pecUpper'], ['deltFront'], ['db','bench'], 'kg', {inc:1, av:['chest','shoulder'], cue:'نايم ودمبل بكل إيد فوق صدرك والكوع مثني شوية. افتح إيديك للجانبين لحد ما تحس شد بصدرك، وارجع بنفس القوس.'}),
  ohp_db: XE('ضغط كتف بالدمبل جالس', ['deltFront','deltSide'], ['triceps','traps'], ['db','chair'], 'kg', {inc:2, av:['shoulder'], cue:'اكعد وظهرك مسنود. ادفع الدمبلز من مستوى كتفك لفوق راسك، ونزّلهن على مهل.'}),
  ohp_bb: XE('ضغط كتف بالبار واقف', ['deltFront','deltSide'], ['triceps','traps','abs'], ['bb'], 'kg', {lvl:2, inc:2.5, av:['shoulder','lowback'], cue:'واقف وبطنك مشدود. ادفع البار من كدام كتفك لفوق راسك، وراسك يرجع لكدام شوية بعد ما يعبر البار.'}),
  pike_pushup: XE('ضغط بايك للكتف', ['deltFront'], ['triceps','pecUpper'], [], 'bw', {lvl:2, av:['shoulder','wrist'], cue:'جسمك على شكل V مقلوب. اثني كوعك ونزّل راسك باتجاه الأرض كدام إيديك، وادفع.'}),
  lat_raise: XE('رفرفة جانبي بالدمبل', ['deltSide'], ['deltFront','traps'], ['db'], 'kg', {inc:1, av:['shoulder'], cue:'دمبل خفيف بكل إيد. ارفعهن للجانبين لمستوى الكتف والكوع مثني شوية، ونزّلهن على مهل.'}),
  band_lat_raise: XE('رفرفة جانبي بالحبل المطاطي', ['deltSide'], ['traps'], ['band'], 'bw', {av:['shoulder'], cue:'اوكف على الحبل المطاطي. ارفع إيديك للجانبين لمستوى الكتف، ونزّلهن على مهل.'}),
  rear_fly: XE('رفرفة خلفي منحني', ['deltRear'], ['traps','lats'], ['db'], 'kg', {inc:1, av:['lowback'], cue:'انحني لكدام وظهرك مستقيم. افتح إيديك للجانبين وضم لوحات كتفك، ونزل على مهل.'}),
  lat_pulldown: XE('سحب أمامي بالجهاز', ['lats'], ['biceps','deltRear','traps','forearm'], ['cable'], 'kg', {inc:5, cue:'اكعد وفخذك تحت الوسادة. اسحب البار لأعلى صدرك والكوع ينزل لتحت ولورا، وارجع على مهل.'}),
  pullup: XE('عقلة', ['lats'], ['biceps','forearm','deltRear','abs'], ['bar'], 'bw', {lvl:2, av:['shoulder'], cue:'اتعلق وإيديك أعرض من كتفك. اسحب نفسك لحد ما ذقنك يعبر العقلة، ونزل على مهل. إذا صعبة، ابدي بالنزول البطيء بس.'}),
  band_pulldown: XE('سحب بالحبل المطاطي لتحت', ['lats'], ['biceps','deltRear'], ['band'], 'bw', {cue:'اربط الحبل بأعلى الباب. اسحبه لصدرك والكوع ينزل لتحت ولورا، وارجع على مهل.'}),
  cable_row: XE('سحب أرضي بالكيبل', ['lats','traps'], ['biceps','deltRear','forearm'], ['cable'], 'kg', {inc:5, cue:'اكعد وظهرك مستقيم. اسحب المقبض لبطنك وضم لوحات كتفك، وارجع على مهل بدون ما تتقوس.'}),
  db_row: XE('سحب دمبل منحني', ['lats','traps'], ['biceps','deltRear','erectors'], ['db'], 'kg', {inc:2, av:['lowback'], cue:'انحني لكدام وظهرك مستقيم ودمبل بكل إيد. اسحبهن لبطنك والكوع لورا، ونزّلهن على مهل.'}),
  bb_row: XE('سحب بار منحني', ['lats','traps'], ['biceps','deltRear','erectors','hamstrings'], ['bb'], 'kg', {lvl:2, inc:2.5, av:['lowback'], cue:'انحني لكدام وظهرك مستقيم. اسحب البار لأسفل بطنك، ونزّله على مهل.'}),
  band_row: XE('سحب بالحبل المطاطي جالس', ['lats','traps'], ['biceps','deltRear'], ['band'], 'bw', {cue:'اكعد ورجلك ممدودة والحبل حول قدمك. اسحبه لبطنك وضم لوحات كتفك.'}),
  inv_row: XE('سحب مقلوب تحت طاولة', ['lats','traps'], ['biceps','deltRear','abs'], ['table'], 'bw', {cue:'تحت طاولة قوية وثابتة، امسك حافتها وجسمك مستقيم. اسحب صدرك للطاولة ونزل على مهل. تأكد إن الطاولة تتحمل وزنك.'}),
  db_curl: XE('بايسبس بالدمبل', ['biceps'], ['forearm'], ['db'], 'kg', {inc:1, cue:'الكوع ثابت جنب جسمك. ارفع الدمبل لكتفك ونزّله على مهل بدون ما تتمرجح.'}),
  hammer: XE('هامر كيرل', ['biceps','forearm'], [], ['db'], 'kg', {inc:1, cue:'مثل البايسبس، بس الدمبل عمودي مثل المطرقة والكوع ثابت جنبك.'}),
  bb_curl: XE('بايسبس بالبار', ['biceps'], ['forearm'], ['bb'], 'kg', {inc:2.5, cue:'الكوع ثابت جنبك. ارفع البار لصدرك ونزّله على مهل.'}),
  band_curl: XE('بايسبس بالحبل المطاطي', ['biceps'], ['forearm'], ['band'], 'bw', {cue:'اوكف على الحبل والكوع جنبك. ارفع إيديك لكتفك ونزل على مهل.'}),
  tri_push: XE('ترايسبس بالكيبل', ['triceps'], ['forearm'], ['cable'], 'kg', {inc:2.5, cue:'الكوع ثابت جنب جسمك. ادفع المقبض لتحت لحد ما إيدك تنفرد، وارجع على مهل.'}),
  oh_tri: XE('ترايسبس فوق الراس بالدمبل', ['triceps'], [], ['db'], 'kg', {inc:1, av:['shoulder'], cue:'شيل الدمبل بإيديك الثنين فوق راسك. نزّله ورا راسك والكوع ثابت لفوق، وارجع افرد إيدك.'}),
  bench_dip: XE('ديبس على كرسي', ['triceps'], ['pecLower','deltFront'], ['chair'], 'bw', {av:['shoulder','wrist','chest'], cue:'إيديك على حافة كرسي ثابت وراك. نزّل جسمك لحد ما كوعك يصير زاوية قائمة، وادفع لفوق.'}),
  plank: XE('بلانك', ['abs'], ['obliques','deltFront','quads'], [], 'time', {cue:'على كوعك وأطراف أصابعك وجسمك خط مستقيم. شد بطنك وأردافك وتنفس بهدوء.'}),
  crunch: XE('كرنش', ['abs'], ['obliques'], [], 'bw', {cue:'نايم وركبك مثنية. ارفع كتفك من الأرض بشد البطن، مو بسحب راسك، ونزل على مهل.'}),
  dead_bug: XE('ديد بك', ['abs'], ['obliques'], [], 'bw', {per:'لكل جهة', cue:'نايم وإيديك لفوق ورجلك مثنية بزاوية قائمة. مد إيد ورجل معاكسة ببطء وأسفل ظهرك لاصق بالأرض، وبدّل.'}),
  leg_raise: XE('رفع الرجلين نايم', ['abs'], ['obliques','quads'], [], 'bw', {av:['lowback'], cue:'نايم على ظهرك. ارفع رجلك مستقيمة لفوق ونزّلها ببطء بدون ما يرتفع أسفل ظهرك.'}),
  side_plank: XE('بلانك جانبي', ['obliques','abs'], ['glutes'], [], 'time', {per:'لكل جهة', av:['shoulder'], cue:'على جنبك، الكوع تحت الكتف بالضبط والرجلين فوك بعض. ارفع وركك لحد ما جسمك يصير خط مستقيم من الراس للقدم، ولا تخلي الورك ينزل.'}),
  bicycle: XE('كرنش الدراجة', ['abs','obliques'], [], [], 'bw', {per:'لكل جهة', cue:'نايم وإيديك ورا راسك من غير سحب. ارفع كتفك، قرّب ركبة للصدر وافرد الثانية مايلة، ولف جذعك حتى الكوع يروح للركبة المعاكسة. بدّل على مهل.'}),
  superman: XE('سوبرمان', ['erectors'], ['glutes','deltRear'], [], 'bw', {av:['lowback'], cue:'نايم على بطنك. ارفع إيديك ورجلك من الأرض سوة، اثبت ثانيتين، ونزل.'}),
  tread: XE('مشي بميلان على التردمل', ['glutes','calves','hamstrings'], ['quads','tibialis'], ['treadmill'], 'cardio', {met:7.0, set:'سرعة 4.5-5.5 كم/س · ميلان 6-10%', cue:'لا تمسك الحواجز. امشي بسرعة تكدر تحچي بيها بس ما تكدر تغني، وهذي هي الشدة المتوسطة.'}),
  bike: XE('دراجة ثابتة', ['quads','glutes'], ['calves','hamstrings'], ['bike'], 'cardio', {met:6.8, set:'مقاومة متوسطة · 70-90 دورة بالدقيقة', cue:'اضبط المقعد حتى رجلك تكون مثنية شوية بأسفل الدورة. دوّس بسرعة ثابتة وبشدة تكدر تحچي بيها بس ما تكدر تغني.'}),
  walk: XE('مشي سريع', ['glutes','calves'], ['quads','hamstrings'], [], 'cardio', {met:4.3, set:'5.5-6 كم/س', cue:'امشي بخطوات سريعة وإيديك تتحرك. تكدر تحچي، بس تنفسك أسرع من العادي.'}),
  march: XE('مشي بالمكان مع رفع الركب', ['quads'], ['calves','abs'], [], 'cardio', {met:4.0, set:'ارفع ركبك لمستوى الورك', cue:'امشي بمكانك وارفع ركبك لمستوى الورك وحرك إيديك. مناسب بالبيت وخفيف على المفاصل.'}),
  jacks: XE('قفز جانبي (جمبنج جاك)', ['calves','glutes'], ['deltSide','quads'], [], 'cardio', {met:8.0, av:['knee'], set:'دقيقة شغل ونص دقيقة راحة', cue:'اقفز وافتح رجلك وارفع إيديك فوق راسك، وارجع. إذا عندك ألم ركبة، بدّله بالمشي بالمكان.'}),
  // ---- مكائن وكيبل
  smith_squat: XE('سكوات بجهاز السميث', ['quads','glutes'], ['adductors','abs'], ['machine'], 'kg', {inc:5, cue:'البار على أعلى ظهرك ورجلك كدام البار شوية. فك قفل البار، وانزل لحد ما فخذك يوازي الأرض، وادفع من كامل القدم. الجهاز يثبت المسار، فركز على العمق.'}),
  hip_abd: XE('جهاز فتح الأرجل (أبدكتر)', ['glutes'], [], ['machine'], 'kg', {inc:5, cue:'اكعد وظهرك على المسند والوسائد على الجهة الخارجية لركبك. افتح رجلك للجانبين بقوة الأرداف، وارجعها على مهل بدون ما يضرب الثقل.'}),
  hip_add: XE('جهاز ضم الأرجل (أدكتر)', ['adductors'], [], ['machine'], 'kg', {inc:5, cue:'اكعد وظهرك على المسند والوسائد على الجهة الداخلية لركبك. ضم رجلك لبعض، وافتحها على مهل لحد ما تحس شد خفيف بالفخذ الداخلي.'}),
  kickback: XE('كيك باك للأرداف بالكيبل', ['glutes'], ['hamstrings'], ['cable'], 'kg', {inc:2.5, per:'لكل رجل', cue:'اربط الحزام بكاحلك وامسك الجهاز. ادفع رجلك لورا بقوة الأرداف بدون ما تقوس ظهرك، وارجعها على مهل. العدات لكل رجل.'}),
  donkey: XE('دنكي كيك', ['glutes'], ['hamstrings','abs'], [], 'bw', {av:['wrist','knee'], per:'لكل رجل', cue:'على إيديك وركبك وظهرك مستقيم. ارفع رجل وحدة لفوق والركبة مثنية لحد ما فخذك يوازي الأرض، وشد أردافك. العدات لكل رجل.'}),
  seated_calf: XE('سمانة جالس بالجهاز', ['calves'], [], ['machine'], 'kg', {inc:5, cue:'أطراف أصابعك على الحافة والوسادة فوق ركبك. نزّل كعبك لأوطى نقطة، وارتفع لأعلى نقطة واثبت ثانية.'}),
  pec_deck: XE('جهاز التفتيح (بيك ديك)', ['pecLower','pecUpper'], ['deltFront'], ['machine'], 'kg', {inc:5, av:['chest','shoulder'], cue:'اضبط المقعد حتى المقابض بمستوى صدرك. ضم إيديك كدامك والكوع مثني شوية، وارجعها على مهل لحد ما تحس شد بصدرك.'}),
  rev_pec: XE('جهاز الكتف الخلفي (ريفرس بيك ديك)', ['deltRear'], ['traps'], ['machine'], 'kg', {inc:2.5, cue:'اكعد وصدرك على الوسادة. افتح إيديك للجانبين وهي تقريباً مستقيمة، وارجعها على مهل. الحركة من الكتف مو من الظهر.'}),
  shoulder_press_m: XE('جهاز ضغط الكتف', ['deltFront','deltSide'], ['triceps'], ['machine'], 'kg', {inc:5, av:['shoulder'], cue:'اضبط المقعد حتى المقابض بمستوى كتفك. ادفع لفوق بدون ما تقفل الكوع، ونزل على مهل. ظهرك لاصق بالمسند.'}),
  machine_row: XE('جهاز السحب الأفقي', ['lats','traps'], ['biceps','deltRear'], ['machine'], 'kg', {inc:5, cue:'صدرك على الوسادة. اسحب المقابض لجسمك والكوع لورا وضم لوحات كتفك، وارجع على مهل. مناسب إذا أسفل ظهرك يتعب.'}),
  cable_curl: XE('بايسبس بالكيبل', ['biceps'], ['forearm'], ['cable'], 'kg', {inc:2.5, cue:'البكرة بالأسفل والكوع ثابت جنبك. ارفع البار لصدرك ونزّله على مهل. الكيبل يخلي الشد ثابت طول الحركة.'}),
  face_pull: XE('فيس بول بالكيبل', ['deltRear','traps'], ['biceps'], ['cable'], 'kg', {inc:2.5, cue:'البكرة بمستوى وجهك والحبل بإيديك. اسحب الحبل لوجهك والكوع عالي ولبرّه، وافتح إيديك بالنهاية. زين لصحة الكتف.'}),
  back_ext: XE('جهاز أسفل الظهر (هايبر 45°)', ['erectors','glutes'], ['hamstrings'], ['machine'], 'bw', {av:['lowback'], cue:'الوسادة تحت وركك مباشرة. انزل بجسمك لكدام وظهرك مستقيم، واطلع لحد ما جسمك يصير خط مستقيم، ولا ترجع لورا أكثر.'}),
  // ---- بطن
  cable_crunch: XE('كرنش بالكيبل', ['abs'], ['obliques'], ['cable'], 'kg', {inc:2.5, cue:'اركع كدام الجهاز والحبل جنب راسك. اثني ظهرك ونزّل كوعك باتجاه ركبك بشد البطن، مو بسحب إيديك، وارجع على مهل.'}),
  ab_machine: XE('جهاز البطن (كرنش جالس)', ['abs'], ['obliques'], ['machine'], 'kg', {inc:5, cue:'اكعد وثبت رجلك تحت الوسائد وامسك المقابض جنب راسك. انحني لكدام ونزّل صدرك باتجاه ركبك بشد البطن، مو بسحب إيديك، وارجع على مهل.'}),
  captain_chair: XE('رفع الركب على جهاز الكابتن', ['abs'], ['obliques'], ['machine'], 'bw', {cue:'ظهرك لاصق بالمسند وساعدك على الوسائد. ارفع ركبك لمستوى صدرك بشد البطن، ونزّلها على مهل بدون ما تتمرجح. أسهل من التعلق بالعقلة.'}),
  hanging_knee: XE('رفع الركب معلق', ['abs'], ['obliques','forearm'], ['bar'], 'bw', {lvl:2, av:['shoulder'], cue:'اتعلق بالعقلة. ارفع ركبك لصدرك بشد البطن، ونزلها على مهل بدون ما تتمرجح.'}),
  rev_crunch: XE('كرنش عكسي', ['abs'], ['obliques'], [], 'bw', {cue:'نايم وركبك مثنية لفوق. اسحب ركبك لصدرك وارفع وركك شوية من الأرض بشد البطن، ونزل على مهل.'}),
  climber: XE('متسلق الجبل', ['abs'], ['obliques','deltFront','quads'], [], 'time', {av:['wrist'], cue:'بوضعية الضغط وإيديك تحت كتافك. قرّب ركبة لصدرك وبدّل بسرعة ثابتة، ووركك ما يرتفع.'}),
  // ---- أجهزة كارديو
  elliptical: XE('جهاز الإليبتكال (أوربتراك)', ['quads','glutes'], ['hamstrings','calves','deltFront'], ['elliptical'], 'cardio', {met:5.0, set:'مقاومة متوسطة · 50-60 دورة بالدقيقة', cue:'اوكف مستقيم وحرك إيديك ويا رجلك. ما يضغط على الركبة مثل الركض. شدة متوسطة: تكدر تحچي بس ما تكدر تغني.'}),
  rower: XE('جهاز التجذيف (روينغ)', ['quads','glutes','lats'], ['hamstrings','traps','biceps','erectors','calves'], ['rower'], 'cardio', {met:6.0, av:['lowback'], set:'شدة متوسطة · 22-26 سحبة بالدقيقة', cue:'السحبة: ادفع برجلك أول، بعدين ميّل ظهرك شوية لورا، وآخر شي اسحب المقبض لأسفل صدرك. الرجعة بالعكس: إيدك، بعدين جسمك، بعدين رجلك. ظهرك مستقيم وما تحدّب.'}),
  stairs: XE('جهاز الدرج (ستيرماستر)', ['glutes','quads'], ['calves','hamstrings'], ['stairs'], 'cardio', {met:9.0, av:['knee'], set:'سرعة هادئة · خطوات كاملة', cue:'اصعد بكامل القدم وجسمك مستقيم، ولا تتكى على الحواجز. ابدي بسرعة هادئة، لأنه أتعب من المشي.'})
};
const TR_ISO = new Set(['quadIso','hamIso','calf','fly','latraise','rear','biceps','triceps','core','backext','abd']);
const TR_PREFS = {
  squat:{gym:{beg:['leg_press','goblet','smith_squat','bb_squat'], adv:['bb_squat','leg_press','smith_squat','goblet']}, home:['goblet','db_squat','bw_squat']},
  hinge:{gym:{beg:['rdl_db','back_ext','rdl_bb'], adv:['rdl_bb','rdl_db','back_ext']}, home:['rdl_db','glute_bridge']},
  lunge:{gym:['bulgarian','lunge_db'], home:['lunge_db','bulgarian','bulgarian_bw','lunge_bw']},
  glute:{gym:['hip_thrust','kickback','glute_bridge'], home:['glute_bridge','donkey']},
  abd:{gym:['hip_abd'], home:[]},
  quadIso:{gym:['leg_ext'], home:[]}, hamIso:{gym:['leg_curl'], home:[]},
  calf:{gym:['seated_calf','calf_raise'], home:['calf_raise','calf_bw']},
  hpush:{gym:{beg:['chest_press','bench_db','bench_bb'], adv:['bench_bb','chest_press','bench_db']}, home:{beg:['bench_db','knee_pushup','pushup'], adv:['bench_db','pushup']}},
  ipush:{gym:['incline_db'], home:['incline_db','pushup','knee_pushup']},
  vpush:{gym:['shoulder_press_m','ohp_db','ohp_bb'], home:{beg:['ohp_db'], adv:['ohp_db','pike_pushup']}},
  fly:{gym:['pec_deck','db_fly'], home:['db_fly']}, latraise:{gym:['lat_raise'], home:['lat_raise','band_lat_raise']},
  rear:{gym:['face_pull','rear_fly','rev_pec'], home:['rear_fly']},
  hpull:{gym:['cable_row','db_row','machine_row','bb_row'], home:['db_row','band_row','inv_row']},
  vpull:{gym:['lat_pulldown','pullup'], home:['pullup','band_pulldown']},
  biceps:{gym:['db_curl','cable_curl','hammer','bb_curl'], home:['db_curl','hammer','band_curl']},
  triceps:{gym:['tri_push','oh_tri'], home:['oh_tri','bench_dip']},
  core:{gym:['cable_crunch','plank','captain_chair','rev_crunch','ab_machine','dead_bug','hanging_knee','crunch','climber','leg_raise','side_plank','bicycle'], home:['plank','rev_crunch','dead_bug','crunch','climber','hanging_knee','leg_raise','side_plank','bicycle']},
  backext:{gym:['back_ext','superman'], home:['superman']}
};
const TR_FALLBACK = {vpull:'hpull', hinge:'glute', ipush:'hpush', hamIso:'glute', abd:'glute'};
const TR_DAYS = {
  FA:{n:'الجسم كامل A', k:'full', s:['squat','hpush','hpull','hinge','latraise','core']},
  FB:{n:'الجسم كامل B', k:'full', s:['hinge','vpull','ipush','lunge','biceps','triceps','core']},
  FC:{n:'الجسم كامل C', k:'full', s:['lunge','hpush','hpull','glute','vpush','core']},
  UA:{n:'الجزء العلوي A', k:'upper', s:['hpush','hpull','vpush','vpull','latraise','biceps','triceps']},
  LA:{n:'الجزء السفلي A', k:'lower', s:['squat','hinge','lunge','quadIso','hamIso','calf','core']},
  UB:{n:'الجزء العلوي B', k:'upper', s:['ipush','vpull','hpull','fly','rear','triceps','biceps']},
  LB:{n:'الجزء السفلي B', k:'lower', s:['hinge','squat','glute','lunge','hamIso','calf','core']},
  PU:{n:'دفع: صدر وكتف وترايسبس', k:'upper', s:['hpush','ipush','vpush','fly','latraise','triceps']},
  PL:{n:'سحب: ظهر وبايسبس', k:'upper', s:['vpull','hpull','rear','biceps','hpull','core']},
  LG:{n:'أرجل', k:'lower', s:['squat','hinge','lunge','quadIso','hamIso','calf']},
  PU2:{n:'دفع B', k:'upper', s:['ipush','vpush','hpush','latraise','fly','triceps']},
  PL2:{n:'سحب B', k:'upper', s:['hpull','vpull','rear','biceps','hpull','core']},
  LG2:{n:'أرجل B', k:'lower', s:['hinge','squat','glute','lunge','hamIso','calf']}
};
const TR_SPLITS = {2:['FA','FB'], 3:['FA','FB','FC'], 4:['UA','LA','UB','LB'], 5:['UA','LA','PU','PL','LG'], 6:['PU','PL','LG','PU2','PL2','LG2']};
const TR_EQUIP_HOME = ['db','band','bar','bench'];
const TR_AVOIDS = [['chest','الصدر'],['shoulder','الكتف'],['knee','الركبة'],['lowback','أسفل الظهر'],['wrist','الرسغ']];
const LEVEL_AR = {beg:'مبتدئ', int:'متوسط', adv:'متقدم'};
const STYLE_AR = {machine:'مكائن أكثر', mix:'مكائن وأوزان حرة', free:'أوزان حرة أكثر'};
// الكارديو حسب الهدف (شدة متوسطة بعد الأوزان). n مرات بالأسبوع × m دقيقة (Helms 2014، Wilson 2012، WHO 2020)
const CARDIO_GOAL = {cut:{n:4, m:{beg:20, int:25, adv:30}}, recomp:{n:3, m:{beg:15, int:20, adv:20}}, maintain:{n:2, m:{beg:20, int:20, adv:20}}, bulk:{n:2, m:{beg:15, int:15, adv:15}}};
// مدة الحصة يحددها التطبيق مو الشخص: دقايق الأوزان بالأسبوع حسب المستوى حتى كل عضلة تاخذ حجمها العلمي
// (المبتدئ أقل، والمتوسط والمتقدم 10-20 جولة للعضلة، Schoenfeld 2017) مقسومة على أيام التمرين، ويا حد أعلى للحصة
const TR_GEN_V = 2; // نسخة صانع البرامج: البرامج الأقدم ينعرض لها تحديث
const WEEK_W = {beg:135, int:190, adv:240}, W_RANGE = {beg:[30,55], int:[45,65], adv:[50,70]}, SESSION_MAX = {beg:70, int:80, adv:90};
function trAvail(st){ return st.place==='gym' ? ['bb','db','machine','cable','bar','band','bench','chair','treadmill','bike','elliptical','stairs','rower'] : ['chair','table'].concat((st.equip||[]).filter(x=>TR_EQUIP_HOME.includes(x))); }
// نوع التمرين: جهاز/كيبل، أوزان حرة، أو وزن الجسم
function trKind(id){ const r = (EXLIB[id]||{}).req||[]; if(r.some(x=>['machine','cable','treadmill','bike','elliptical','stairs','rower'].includes(x))) return 'machine'; if(r.includes('bb')||r.includes('db')) return 'free'; return 'bw'; }
function trKindLabel(id){ const r = (EXLIB[id]||{}).req||[]; return r.includes('cable') ? 'كيبل' : r.some(x=>['machine','treadmill','bike','elliptical','stairs','rower'].includes(x)) ? 'جهاز' : r.includes('bb') ? 'بار' : r.includes('db') ? 'دمبل' : r.includes('band') ? 'مطاط' : r.includes('bar') ? 'عقلة' : 'وزن الجسم'; }
function trCardioPlan(st){
  const g = CARDIO_GOAL[st.goal] ? st.goal : 'maintain', c = CARDIO_GOAL[g], lv = c.m[st.level] ? st.level : 'beg';
  const days = [2,3,4,5,6].includes(num(st.days)) ? num(st.days) : 3, count = Math.min(c.n, days);
  // أيام أقل؟ الجلسة تطول شوية حتى يبقى المجموع الأسبوعي قريب، بس ما تتجاوز 30 دقيقة
  return {count, min:Math.min(30, Math.round(c.n*c.m[lv]/count/5)*5), goal:g};
}
function trSessionPlan(st){
  const lv = W_RANGE[st.level] ? st.level : 'beg', days = [2,3,4,5,6].includes(num(st.days)) ? num(st.days) : 3;
  const c = trCardioPlan(st), max = SESSION_MAX[lv], want = c.min;
  let w = Math.min(W_RANGE[lv][1], Math.max(W_RANGE[lv][0], Math.round(WEEK_W[lv]/days/5)*5)), cm = want;
  if(5 + w + cm > max) cm = Math.max(15, max - 5 - w);   // الكارديو يقصر أول، والباقي مشي بأيام الراحة
  if(5 + w + cm > max) w = max - 5 - cm;
  return {days, weights:w, cardioN:c.count, cardioMin:cm, cardioShort:cm < want, total:5 + w + (c.count ? cm : 0), plain:5 + w, goal:c.goal};
}
function trCardioText(st){
  const sp = trSessionPlan(st), pg = data.profile && data.profile.goal;
  const lbl = CARDIO_GOAL[pg] ? `هدفك "${GOALS[pg].label}"` : pg && GOALS[pg] ? `هدفك "${GOALS[pg].label}"، فحسبناه للصحة العامة` : 'ما عندنا هدفك بـ"ملفي"، فحسبناه للصحة العامة';
  const why = {cut:'بالتنشيف الأكل هو اللي ينزل الدهون، والكارديو يساعد ويقوي القلب. وبأيام الراحة: مشي 30-45 دقيقة أو 8-10 آلاف خطوة.',
    recomp:'كارديو معتدل حتى يساعد بالحرق بدون ما يأثر على بناء العضل. وبأيام الراحة مشي خفيف.',
    maintain:'للصحة: 150 دقيقة حركة متوسطة بالأسبوع من كل نشاطك، والمشي اليومي يكمل الباقي.',
    bulk:'قليل حتى ما ياخذ من طاقة بناء العضل، بس مهم لصحة القلب.'}[sp.goal];
  return `${lbl}: كارديو ${sp.cardioN} ${sp.cardioN===1?'مرة':'مرات'} بالأسبوع × ${sp.cardioMin} دقيقة بآخر الحصة. ${why}${sp.cardioShort ? ' قصّرناه شوية حتى الحصة ما تطول، والمشي بأيام الراحة يعوّضه.' : ''}`;
}
function trTimeText(st){
  const sp = trSessionPlan(st);
  return sp.cardioN
    ? `الحصة تقريباً ${sp.total} دقيقة بأيام الكارديو (5 إحماء + ${sp.weights} أوزان وبطن + ${sp.cardioMin} كارديو)${sp.cardioN < sp.days ? `، و${sp.plain} دقيقة بالأيام الثانية` : ''}.`
    : `الحصة تقريباً ${sp.plain} دقيقة (5 إحماء + ${sp.weights} أوزان وبطن).`;
}
function trUsable(id, st){
  const e = EXLIB[id]; if(!e) return false;
  const av = trAvail(st);
  if(!e.req.every(r=>av.includes(r))) return false;
  if((e.av||[]).some(a=>(st.avoid||[]).includes(a))) return false;
  return true;
}
function trDose(id, slot, level, first){
  const e = EXLIB[id], iso = TR_ISO.has(slot);
  let sets = iso ? (level==='beg'?2:3) : (level==='adv' && first ? 4 : 3), lo, hi, rest;
  if(e.type==='time'){ lo = level==='beg'?20:30; hi = level==='beg'?40:60; rest = 60; sets = level==='beg'?2:3; }
  else if(slot==='core'){ if(e.type==='kg'){ lo=10; hi=15; } else if(id==='hanging_knee' || id==='captain_chair'){ lo=8; hi=15; } else { lo=12; hi=20; } rest = 60; }
  else if(e.type==='bw'){
    if(id==='pullup'){ lo=3; hi=8; rest=120; }
    else if(id==='knee_pushup'){ lo=6; hi=12; rest=90; }
    else if(['pushup','pike_pushup','inv_row','bench_dip'].includes(id)){ lo=8; hi=15; rest=90; }
    else { lo=12; hi=20; rest = iso?60:75; }
  }
  else if(iso){ if(['lat_raise','calf_raise','rear_fly','face_pull','rev_pec','hip_abd','hip_add','seated_calf'].includes(id)){ lo=12; hi=20; rest=60; } else { lo=10; hi=15; rest=75; } }
  // الراحة: أكثر من 60 ثانية أفضل، وفوق 90 ما يفرق بالعضل (Singer 2024). المركب الأول الثقيل ياخذ أطول للقوة.
  else if(level==='beg'){ lo=8; hi=12; rest = trKind(id)==='machine' ? 90 : 120; }
  else if(first){ lo = level==='adv' ? 5 : 6; hi = level==='adv' ? 8 : 10; rest = level==='adv' ? 180 : 150; }
  else { lo=6; hi=10; rest = trKind(id)==='machine' ? 90 : 120; }
  return {sets, lo, hi, rest};
}
function trItemMin(it){ return it.type==='cardio' ? num(it.min) : it.sets*(it.rest/60 + (it.type==='time' ? Math.max(0.5, it.hi/60) : 0.75)); }
function trPick(slot, st, used, occ){
  const pr = TR_PREFS[slot]; if(!pr) return null;
  let list = st.place==='gym' ? pr.gym : pr.home;
  if(!Array.isArray(list)) list = st.level==='beg' ? list.beg : list.adv;
  if(st.place==='gym' && (st.style==='machine' || st.style==='free')){
    const ord = st.style==='machine' ? {machine:0, free:1, bw:2} : {free:0, bw:1, machine:2};
    list = list.slice().sort((a,b)=>ord[trKind(a)] - ord[trKind(b)]);
  }
  let ok = list.filter(id=>trUsable(id, st) && !used.has(id));
  const lvlOk = ok.filter(id=>(EXLIB[id].lvl||1) <= (st.level==='beg' ? 1 : 2));
  if(lvlOk.length) ok = lvlOk;
  if(!ok.length) return null;
  return ok[(occ[slot]||0) % ok.length];
}
function trCardioId(st){
  const want = st.cardioType && st.cardioType!=='auto' ? st.cardioType : (st.place==='gym' ? ((st.avoid||[]).includes('knee') ? 'elliptical' : 'tread') : 'walk');
  if(trUsable(want, st)) return want;
  return ['tread','elliptical','bike','walk','march'].find(id=>trUsable(id, st)) || 'walk';
}
function trGenerate(st){
  const keys = TR_SPLITS[st.days] || TR_SPLITS[3], occ = {}, days = [];
  const sp = trSessionPlan(st), cardioN = Math.min(sp.cardioN, keys.length), cardioDays = new Set();
  for(let j=0;j<cardioN;j++) cardioDays.add(Math.floor(j*keys.length/cardioN));
  keys.forEach((k, di)=>{
    const tpl = TR_DAYS[k]; let slots = tpl.s.slice();
    if(st.focus==='lower'){
      if(tpl.k!=='upper' && !slots.includes('glute')) slots.splice(tpl.k==='full'?2:1, 0, 'glute');
      if(tpl.k==='full' && !slots.includes('calf')) slots.splice(slots.length-1, 0, 'calf');
      if(tpl.k==='upper' && slots.length>4) slots.pop();
      if(st.place==='gym' && tpl.k!=='upper' && !slots.includes('abd')) slots.splice(slots.indexOf('glute')+1, 0, 'abd');
    } else if(st.focus==='upper'){
      if(tpl.k!=='lower'){ if(!slots.includes('latraise')) slots.splice(slots.length-1, 0, 'latraise'); if(!slots.includes('biceps')) slots.push('biceps'); }
      if(tpl.k==='lower' && slots.length>4) slots.pop();
    }
    if((st.avoid||[]).includes('chest')){
      slots = slots.filter(s=>!['hpush','ipush','fly'].includes(s));
      if(tpl.k!=='lower' && !slots.includes('rear')) slots.push('rear');
    }
    // تمرين بطن بكل حصة، وبرنامج اليومين ياخذ تمرينين حتى يوصل البطن حجم كافي
    slots = slots.filter(x=>x!=='core'); slots.push('core');
    if(keys.length===2) slots.push('core');
    const items = [], used = new Set();
    const cardio = cardioDays.has(di) ? {ex:trCardioId(st), min:sp.cardioMin} : null;
    const budget = sp.weights;
    let firstDone = false;
    for(const slot of slots){
      let id = trPick(slot, st, used, occ);
      if(!id && TR_FALLBACK[slot]) id = trPick(TR_FALLBACK[slot], st, used, occ);
      if(!id) continue;
      const d = trDose(id, slot, st.level, !TR_ISO.has(slot) && !firstDone);
      items.push(Object.assign({ex:id, name:EXLIB[id].n, type:EXLIB[id].type, slot}, d)); used.add(id); occ[slot] = (occ[slot]||0) + 1;
      if(!TR_ISO.has(slot)) firstDone = true;
    }
    // قيود كثيرة (إصابات/أدوات) خلّت اليوم قصير؟ نكمله من تمارين تناسب نوع اليوم
    const FILL = {upper:['hpull','vpull','rear','biceps','triceps','latraise','backext','core','core'], lower:['glute','calf','hamIso','quadIso','core','core'], full:['core','glute','hpull','calf','biceps','backext']};
    for(const slot of FILL[tpl.k]){
      if(items.length >= 4) break;
      const id = trPick(slot, st, used, occ); if(!id) continue;
      items.push(Object.assign({ex:id, name:EXLIB[id].n, type:EXLIB[id].type, slot}, trDose(id, slot, st.level, false))); used.add(id); occ[slot] = (occ[slot]||0) + 1;
    }
    const total = ()=>items.reduce((a,it)=>a+trItemMin(it),0);
    // نختصر حتى يدخل بالوقت ونحافظ على تنوع العضلات: نقلل الجولات قبل ما نشيل تمارين، والبطن يبقى
    const isCore = it=>it.slot==='core', isIso = it=>!isCore(it) && TR_ISO.has(it.slot), isMain = it=>!isCore(it);
    const coreN = ()=>items.filter(isCore).length, mainN = ()=>items.filter(isMain).length;
    const dropLast = test=>{ for(let k=items.length-1; k>0; k--) if(test(items[k])){ items.splice(k,1); return true; } return false; };
    const cutSet = (test, min)=>{ for(let k=items.length-1; k>=0; k--) if(test(items[k]) && items[k].sets > (min||2)){ items[k].sets--; return true; } return false; };
    const isComp = it=>isMain(it) && !isIso(it);
    const steps = [
      ()=>cutSet(isIso),
      ()=>cutSet(isComp, 3),
      ()=>mainN() > 5 && dropLast(isIso),
      ()=>coreN() > 1 && dropLast(isCore),
      ()=>cutSet(isCore),
      ()=>cutSet(isComp),
      ()=>mainN() > 3 && (dropLast(isIso) || dropLast(isMain)),
      ()=>mainN() > 2 && dropLast(isMain)
    ];
    for(const step of steps) while(total() > budget && step());
    // وقت زايد؟ جولة إضافية للتمارين المركبة (حد 3 للمبتدئ، 4 للمتوسط، 5 للمتقدم — ACSM 2009)
    const setCap = {beg:3, int:4, adv:5}[st.level] || 3;
    let guard = 0;
    while(guard++ < 12){
      const cand = items.filter(it=>!TR_ISO.has(it.slot) && it.type!=='time' && it.sets < setCap && total() + it.rest/60 + 0.75 <= budget).sort((a,b)=>a.sets-b.sets)[0];
      if(!cand) break;
      cand.sets++;
    }
    // بعده وقت؟ تمرين عزل إضافي يناسب اليوم بدل ما نزيد جولات
    const EXTRA = {upper:['latraise','rear','biceps','triceps','hpull','vpull'], lower:['calf','glute','hamIso','quadIso','abd'], full:['hamIso','latraise','biceps','triceps','glute','calf','rear']};
    for(const slot of EXTRA[tpl.k]){
      if(items.some(x=>x.slot===slot)) continue;
      const id = trPick(slot, st, used, occ); if(!id) continue;
      const it = Object.assign({ex:id, name:EXLIB[id].n, type:EXLIB[id].type, slot}, trDose(id, slot, st.level, false));
      if(total() + trItemMin(it) > budget) continue;
      const at = items.findIndex(x=>x.slot==='core'); items.splice(at<0 ? items.length : at, 0, it); used.add(id); occ[slot] = (occ[slot]||0) + 1;
    }
    items.forEach(it=>delete it.slot);
    if(cardio) items.push({ex:cardio.ex, name:EXLIB[cardio.ex].n, type:'cardio', sets:1, lo:0, hi:0, rest:0, min:cardio.min});
    days.push({name:`اليوم ${di+1} · ${tpl.n}`, items});
  });
  const settings = JSON.parse(JSON.stringify(st)); Object.assign(settings, {cardioMode:'auto', cardio:cardioN, cardioMin:sp.cardioMin, minutes:sp.total});
  return {id:uid(), name:`برنامج ${st.place==='gym'?'الجم':'البيت'} · ${keys.length} أيام`, kind:'gen', v:TR_GEN_V, created:Date.now(), settings, days};
}
// جولات العضلات الأساسية بالأسبوع: العضلة الأولى بالتمرين تنحسب جولة كاملة، والأساسية الثانية نص جولة (العد الجزئي، Pelland 2025)
function trWeeklySets(prog){
  const G = {'الصدر':['pecUpper','pecLower'], 'الظهر':['lats','traps'], 'الكتف':['deltFront','deltSide','deltRear'], 'الفخذ الأمامي':['quads'], 'الفخذ الخلفي':['hamstrings'], 'الأرداف':['glutes'], 'الذراع':['biceps','triceps'], 'البطن':['abs']};
  const out = {};
  prog.days.forEach(d=>d.items.forEach(it=>{
    const e = it.ex && EXLIB[it.ex]; if(!e || it.type==='cardio') return;
    Object.keys(G).forEach(g=>{
      const f = G[g].includes(e.p[0]) ? 1 : e.p.some(m=>G[g].includes(m)) ? 0.5 : 0;
      if(f) out[g] = (out[g]||0) + f*it.sets;
    });
  }));
  Object.keys(out).forEach(g=>{ out[g] = Math.round(out[g]); if(!out[g]) delete out[g]; });
  return out;
}
// السعرات (صافي فوق الراحة) = (MET-1) × الوزن × الساعات
function trResistMet(st){ return (!st || st.place==='home' || st.level==='beg') ? 3.5 : 5.0; }
function trSessionKcal(day, w, st){
  let k = 0, resist = 0;
  day.items.forEach(it=>{
    if(it.type==='cardio'){ const met = (it.ex && EXLIB[it.ex] && EXLIB[it.ex].met) || 5; k += (met-1)*w*num(it.min)/60; }
    else resist += trItemMin(it);
  });
  return k + (trResistMet(st)-1)*w*resist/60;
}
function trDailyKcal(w){
  const tr = data.training; if(!tr || !tr.program || !w) return 0;
  const wk = tr.program.days.reduce((a,d)=>a + trSessionKcal(d, w, tr.program.settings), 0);
  return wk/7;
}

// ---------- السجل والتقدم ----------
function trSessions(){ // الأحدث أولاً
  const out = [];
  Object.keys(data.workouts||{}).sort().reverse().forEach(k=>(data.workouts[k]||[]).slice().reverse().forEach(s=>out.push({date:k, s})));
  return out;
}
function trLast(item){
  for(const {date, s} of trSessions()){
    const x = s.items.find(i=>(item.ex ? i.ex===item.ex : (!i.ex && i.name===item.name)) && (i.sets||[]).length);
    if(x) return {date, x};
  }
  return null;
}
function trSuggest(item, last){
  const e = item.ex && EXLIB[item.ex];
  if(item.type==='cardio') return '';
  if(!last) return item.type==='kg' ? `أول مرة: اختار وزن تكدر تسوي بي ${item.hi} عدات، وتبقى عندك 2 بالمخزن.` : '';
  const sets = last.x.sets, allHit = sets.length >= item.sets && sets.every(s=>num(s.r) >= item.hi);
  if(item.type==='kg'){
    const w0 = Math.max(...sets.map(s=>num(s.w))), inc = (e && e.inc) || 2.5;
    if(allHit) return `كملت كل الجولات بـ ${item.hi} عدات: جرب ${fmtKg(w0+inc)} كغم.`;
    if(num(sets[0].r) < item.lo - 1) return `العدات كانت أقل من المطلوب: خلي ${fmtKg(Math.max(0, w0-inc))} كغم أو نفس الوزن وركز على الأداء.`;
    return `نفس الوزن ${fmtKg(w0)} كغم وحاول تزيد عدة وحدة.`;
  }
  if(item.type==='time') return allHit ? 'كملتها كلها: زيد 10 ثواني.' : 'حاول تثبت أطول من المرة الماضية.';
  if(allHit){ if(item.ex==='knee_pushup') return 'ممتاز: جرب الضغط العادي.'; return 'كملت كل الجولات: زيد عدتين أو جرب نسخة أصعب.'; }
  return 'حاول تزيد عدة وحدة.';
}
function fmtKg(x){ return String(+(+x).toFixed(1)); }
function trSetText(it, s){
  if(it.type==='kg') return `${fmtKg(s.w)}×${s.r}`;
  if(it.type==='time') return `${s.r} ث`;
  return `${s.r} عدة`;
}
function trPRs(){
  const best = {};
  Object.keys(data.workouts||{}).sort().forEach(k=>(data.workouts[k]||[]).forEach(s=>s.items.forEach(i=>{
    if(!i.ex || i.type==='cardio') return;
    (i.sets||[]).forEach(x=>{
      const score = i.type==='kg' ? num(x.w)*(1+num(x.r)/30) : num(x.r);
      if(score<=0) return;
      if(!best[i.ex] || score > best[i.ex].score) best[i.ex] = {score, set:x, date:k, type:i.type};
    });
  })));
  return best;
}

// ---------- التبويب ----------
function trDefaults(){
  const p = data.profile || {};
  return {place:'gym', equip:['db'], days:3, level:'beg', style:'machine', focus: p.sex==='f' ? 'lower' : 'bal', cardioMode:'auto', goal:trGoalKey(), cardioType:'auto', avoid:[]};
}
function trGoalKey(){ const g = data.profile && data.profile.goal; return CARDIO_GOAL[g] ? g : 'maintain';
}
function trPlan(){ return data.training && data.training.program; }
function renderTrain(){
  const root = document.getElementById('tr-root'); if(!root) return;
  const tr = data.training || {}, prog = tr.program;
  if(!prog){
    const sx = data.profile && data.profile.sex==='f' ? 'f' : 'm';
    root.innerHTML = `<div class="card hero hero-train tr-hero">
      <div class="tr-coach"><img src="media/hero-full.webp" alt="هيرو"></div>
      <h3>تمريني</h3>
      <div class="goal-note" style="margin:0;">برنامج تمرين مبني على أسس علمية حسب مكانك وأيامك ومستواك، ومدرب ثلاثي الأبعاد يوريك كل حركة، وتسجيل أوزانك وتقدمك.</div>
      <button class="primary" onclick="trOpenGen()">سوّيلي برنامج</button>
      <button class="ghost" onclick="trOpenCustom()">عندي برنامج، أدخله</button>
    </div>
    <div class="card"><h2>قبل ما تبدي</h2><div class="goal-note" style="margin:0;">إذا عندك إصابة أو عملية قريبة أو حالة صحية، خذ موافقة طبيبك قبل التمرين، واختار "أتجنب" بالبرنامج للمنطقة اللي تألمك.</div></div>`;
    return;
  }
  const next = Math.min(num(tr.next), prog.days.length-1), day = prog.days[next];
  const w = data.profile ? data.profile.weight : 0, st = prog.settings || {};
  const estMin = Math.round(5 + day.items.reduce((a,it)=>a+trItemMin(it),0));
  const act = tr.active;
  const sess = trSessions().slice(0,8), prs = trPRs();
  const prKeys = Object.keys(prs).sort((a,b)=>prs[b].date.localeCompare(prs[a].date)).slice(0,8);
  const weekKcal = w ? Math.round(prog.days.reduce((a,d)=>a+trSessionKcal(d, w, st),0)) : 0;
  const measured = !!(data.profile && data.profile.tdeeOverride);
  root.innerHTML = `
    ${act ? `<div class="card" style="border-color:var(--warn);"><h2>عندك تمرين ما خلص</h2>
      <div class="goal-note" style="margin:0 0 10px;">${esc(act.dayName)} · بديت ${esc(new Date(act.t).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'}))}</div>
      <div class="btn-row"><button class="primary" onclick="plResume()">كمّل التمرين</button><button class="ghost" onclick="plDiscard()">احذفه</button></div></div>` : ''}
    <div class="card hero hero-train">
      <h2>الحصة الجاية</h2>
      <div class="tr-next-day">${esc(day.name)}</div>
      <div class="meta" style="margin-bottom:8px;">${day.items.length} تمارين · تقريباً ${estMin} دقيقة${w ? ` · ~${Math.round(trSessionKcal(day, w, st))} سعرة` : ''}</div>
      ${day.items.map(it=>`<div class="ex-row"><span>${trExName(it)}</span><span class="meta">${esc(trDoseText(it))}</span></div>`).join('')}
      <div class="goal-note">ابدي بإحماء 5 دقايق: حركة خفيفة وجولة خفيفة من أول تمرين. وقف كل جولة قبل الفشل بعدة إلى ثلاث.</div>
      <button class="primary" style="margin-top:10px;" onclick="plStart(${next})" ${act?'disabled':''}>ابدأ التمرين</button>
    </div>
    <div class="card">
      <h2>برنامجك</h2>
      <div style="font-weight:700; font-size:16px; margin-bottom:4px;">${esc(prog.name)}</div>
      <div class="chips" style="margin-bottom:10px;">
        ${prog.kind==='gen' ? `<span class="pill">${st.place==='gym'?'جم':'بيت'}</span><span class="pill">${prog.days.length} أيام بالأسبوع</span><span class="pill">~${num(st.minutes)} دقيقة</span><span class="pill">${LEVEL_AR[st.level]||''}</span>${st.place==='gym' && STYLE_AR[st.style] ? `<span class="pill">${STYLE_AR[st.style]}</span>` : ''}` : `<span class="pill">برنامج خاص</span><span class="pill">${prog.days.length} أيام</span>`}
      </div>
      ${prog.kind==='gen' && !(num(prog.v) >= TR_GEN_V) ? `<div class="nudge" style="margin:0 0 10px;"><span>برنامجك مسوّى قبل التحديث. البرنامج الجديد بيه مكائن وبطن بكل حصة، والكارديو ومدة الحصة محسوبة حسب هدفك.</span><button class="ghost" onclick="trOpenGen()">سوّيه من جديد</button></div>` : ''}
      ${prog.kind==='gen' && num(prog.v) >= TR_GEN_V && st.cardioMode==='auto' && data.profile && trGoalKey()!==st.goal ? `<div class="nudge" style="margin:0 0 10px;"><span>هدفك تغيّر بـ"ملفي"، فالكارديو بالبرنامج صار مو مناسب. سوّي برنامج جديد حتى نعدله.</span><button class="ghost" onclick="trOpenGen()">برنامج جديد</button></div>` : ''}
      ${prog.days.map((d,i)=>`<button class="day-btn ${i===next?'next':''}" onclick="trShowDay(${i})"><span>${esc(d.name)}</span><span class="meta">${d.items.length} تمارين ›</span></button>`).join('')}
      <div class="btn-row"><button class="ghost" onclick="trOpenCustom(true)">تعديل الجدول</button><button class="ghost" onclick="trOpenGen()">برنامج جديد</button></div>
      <button class="ghost" style="width:100%; margin-top:8px;" onclick="trOpenCustom(false)">عندي جدول من مدربي، أدخله</button>
    </div>
    <div class="card">
      <div class="switch"><div><div style="font-weight:600;">اربط التمرين بسعراتي</div><div class="meta">يضيف حرق برنامجك لاحتياجك اليومي</div></div>
        <label class="tgl" aria-label="اربط التمرين بسعراتي"><input type="checkbox" id="tr-link" ${tr.link?'checked':''} onchange="trSetLink(this.checked)"><span></span></label></div>
      <div class="goal-note">${w ? `برنامجك يحرق تقريباً ${weekKcal} سعرة بالأسبوع (~${Math.round(weekKcal/7)} باليوم كمعدل). ` : 'سجّل وزنك بـ"ملفي" حتى نحسب الحرق. '}${tr.link ? (measured ? 'حرقك اليومي محسوب من سجلك الفعلي وهو أصلاً يشمل تمرينك، فما نضيف شي فوقه.' : 'مستوى النشاط بـ"ملفي" صار يعني حياتك اليومية بدون التمرين، حتى ما ينحسب التمرين مرتين.') : 'مطفي: احتياجك محسوب من مستوى النشاط بـ"ملفي" بس.'} الأرقام تقديرية من جداول النشاط العالمية.</div>
    </div>
    <div class="card"><h2>آخر التمارين</h2>
      ${sess.length ? sess.map(({date,s},i)=>`<div class="list-item" style="cursor:pointer;" onclick="trShowSession('${date}', ${num(s.t)})"><div>${esc(dayName(date))} <span class="pill">${esc(s.dayName||'')}</span></div><div class="meta">${Math.round((num(s.end)-num(s.t))/60000)} د · ${s.items.reduce((a,x)=>a+(x.sets||[]).length,0)} جولة ›</div></div>`).join('') : '<div class="empty">بعدك ما سجلت تمرين</div>'}
    </div>
    ${prKeys.length ? `<div class="card"><h2>أرقامك القياسية</h2>${prKeys.map(k=>{ const b = prs[k]; return `<div class="pr-row"><span>${esc(EXLIB[k].n)}</span><span class="meta">${b.type==='kg' ? `${fmtKg(b.set.w)} كغم × ${b.set.r}` : b.type==='time' ? `${b.set.r} ثانية` : `${b.set.r} عدة`} · ${esc(dayName(b.date))}</span></div>`; }).join('')}</div>` : ''}
    <details class="card"><summary><h2>المصادر العلمية</h2><span class="sum-hint">اضغط للعرض</span></summary><div class="goal-note" style="margin-top:0;">
      <b>التكرار:</b> تمرين كل عضلة مرتين بالأسبوع أفضل من مرة. <a href="https://pubmed.ncbi.nlm.nih.gov/27102172/" target="_blank">Schoenfeld 2016</a><br>
      <b>الحجم:</b> 10 جولات أو أكثر للعضلة بالأسبوع تعطي نمو أكثر. <a href="https://pubmed.ncbi.nlm.nih.gov/27433992/" target="_blank">Schoenfeld 2017</a><br>
      <b>الراحة:</b> 2-3 دقايق لأول تمرين مركب ثقيل أفضل للقوة. <a href="https://pubmed.ncbi.nlm.nih.gov/26605807/" target="_blank">Schoenfeld 2016</a> · للعضل: أكثر من 60 ثانية أفضل، وفوق 90 ثانية ما يفرق كثير. <a href="https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full" target="_blank">Singer 2024</a><br>
      <b>عدّ الجولات:</b> التمرين ينحسب جولة كاملة لعضلته الأولى ونص جولة للثانية، وهذي أدق طريقة تفسّر نمو العضل. <a href="https://link.springer.com/article/10.1007/s40279-025-02344-w" target="_blank">Pelland 2025</a><br>
      <b>التقدم:</b> زيادة تدريجية بالوزن أو العدات. <a href="https://pubmed.ncbi.nlm.nih.gov/19204579/" target="_blank">ACSM 2009</a><br>
      <b>المكائن والأوزان الحرة:</b> تبني عضل بنفس الدرجة تقريباً. <a href="https://pubmed.ncbi.nlm.nih.gov/37582807/" target="_blank">Haugen 2023</a><br>
      <b>البطن:</b> تمارين البطن تقوي العضلة، بس ما تحرق دهون البطن نفسها. اللي يبين البطن هو نزول الدهون من كل الجسم. <a href="https://pubmed.ncbi.nlm.nih.gov/21804427/" target="_blank">Vispute 2011</a><br>
      <b>الكارديو:</b> 150-300 دقيقة متوسطة بالأسبوع للصحة العامة. <a href="https://www.who.int/publications/i/item/9789240015128" target="_blank">WHO 2020</a> · الكارديو الطويل والكثير ويا الأوزان يقلل نمو العضل، فنخليه معتدل. <a href="https://pubmed.ncbi.nlm.nih.gov/22002517/" target="_blank">Wilson 2012</a> · 8-10 آلاف خطوة باليوم مرتبطة بصحة أفضل. <a href="https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext" target="_blank">Paluch 2022</a><br>
      <b>الحرق:</b> قيم MET من <a href="https://pacompendium.com/" target="_blank">Compendium of Physical Activities</a>.
    </div></details>`;
}
function trExName(it){ return `${esc(it.name)}${it.ex && EXLIB[it.ex] && it.type!=='cardio' ? ` <span class="kind">${trKindLabel(it.ex)}</span>` : ''}`; }
function trDoseText(it){
  if(it.type==='cardio') return `${num(it.min)} دقيقة`;
  const per = it.ex && EXLIB[it.ex] && EXLIB[it.ex].per ? ` ${EXLIB[it.ex].per}` : '';
  if(it.type==='time') return `${it.sets} × ${it.lo}-${it.hi} ث`;
  return `${it.sets} × ${it.lo===it.hi ? it.lo : it.lo+'-'+it.hi}${per}`;
}
function trSetLink(v){
  if(!data.training) data.training = {next:0};
  data.training.link = !!v; save(); applyTargets(); renderTrain(); syncActivityLabel();
  notify(v ? 'انربط التمرين بسعراتك. راجع مستوى النشاط بـ"ملفي".' : 'انفك الربط');
}

// ---------- ورقة التمرين (بوتوم شيت) ----------
/* ============ v75: رأيك يهمنا (يوصل برسالة انستغرام) ============ */
const HERO_VER = '106', FB_IG = 'heroapp.iq';
function fbOpen(type){
  let draft = ''; try{ draft = localStorage.getItem('hero_fb') || ''; }catch(e){}
  const t = type || 'idea';
  const opt = (v, ic, l)=>`<label><input type="radio" name="fb-type" value="${v}"${v===t?' checked':''}><span>${ic}</span>${l}</label>`;
  trOpenSheet('رأيك يهمنا 💬', `<div class="fb-card">
    <div class="fb-types">${opt('bug','🐞','مشكلة')}${opt('idea','💡','اقتراح')}${opt('like','❤️','عجبني')}</div>
    <textarea id="fb-text" placeholder="اكتب ملاحظتك هنا… مثلاً: بصفحة التمرين الزر الفلاني ما واضح" oninput="try{localStorage.setItem('hero_fb', this.value)}catch(e){}">${esc(draft)}</textarea>
    <a class="fb-send" id="fb-send" href="https://ig.me/m/${FB_IG}" target="_blank" rel="noopener" onclick="fbSend(event)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
      انسخ الرسالة وافتح انستغرام</a>
    <ol class="fb-steps"><li>تنفتح محادثة <b dir="ltr">@${FB_IG}</b> بانستغرام.</li><li>اضغط مطوّل بخانة الكتابة واختار «لصق»، وبعدين دز.</li></ol>
    <div id="fb-ok" hidden></div>
  </div>`);
}
function fbMissing(){
  const q = ((document.getElementById('db-food') || {}).value || '').trim();
  const en = !!(window.I18N && I18N.en);
  const msg = en ? `I couldn't find this food in Hero: ${q || '…'}\n(What's in it or how you cook it, if you like:) `
                 : `ما لگيت هاي الأكلة بهيرو: ${q || '…'}\n(شنو بيها أو شلون تنطبخ عدكم، إذا تحب:) `;
  try{ localStorage.setItem('hero_fb', msg); }catch(e){}
  fbOpen('idea');
  setTimeout(()=>{ const t = document.getElementById('fb-text'); if(t){ t.value = msg; t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 50);
}
function fbMsg(){
  const tx = (document.getElementById('fb-text').value || '').trim();
  const tp = (document.querySelector('input[name="fb-type"]:checked') || {}).value || 'idea';
  const TL = {bug:'🐞 مشكلة', idea:'💡 اقتراح', like:'❤️ عجبني'};
  const ua = navigator.userAgent || '', dev = /iPhone|iPad/.test(ua) ? 'آيفون' : /Android/.test(ua) ? 'أندرويد' : 'كمبيوتر';
  let lite = ''; try { const L = JSON.parse(localStorage.getItem('hero_3d_lite') || 'null'); if(L) lite = ` · مدرب خفيف (${L.gpu || '?'})`; }catch(e){}
  return {tx, text: `رأيي بتطبيق هيرو (${TL[tp]})\n\n${tx}\n\n— نسخة ${HERO_VER} · ${dev}${lite}`};
}
function fbCopy(text){
  let ok = false;
  try{ const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly',''); ta.style.cssText = 'position:fixed;top:0;opacity:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); ta.remove(); }catch(e){}
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(()=>{}); ok = true; }catch(e){}
  return ok;
}
function fbSend(ev){
  const m = fbMsg();
  if(m.tx.length < 3){ ev.preventDefault(); notify('اكتب ملاحظتك أول ✍️'); document.getElementById('fb-text').focus(); return; }
  const ok = fbCopy(m.text);
  try{ localStorage.removeItem('hero_fb'); }catch(e){}
  const box = document.getElementById('fb-ok'); box.hidden = false; box.className = 'fb-ok';
  box.textContent = ok ? '✅ انسخت رسالتك. الصقها بمحادثة انستغرام ودزها. شكراً إلك!' : 'ما انسخت تلقائياً، انسخ النص من الخانة يدوياً والصقه بانستغرام.';
}
function trOpenSheet(title, html, over){
  document.getElementById('tr-sheet').classList.remove('ach');
  document.getElementById('tr-sheet').classList.toggle('over', !!over); document.getElementById('tr-backdrop').classList.toggle('over', !!over);
  document.getElementById('tr-sheet-title').textContent = title;
  document.getElementById('tr-sheet-body').innerHTML = html;
  document.getElementById('tr-sheet').hidden = false; document.getElementById('tr-backdrop').hidden = false;
  document.body.classList.add('sheet-open');
  document.getElementById('tr-sheet-body').scrollTop = 0;
}
function trCloseSheet(){
  document.getElementById('tr-sheet').hidden = true; document.getElementById('tr-backdrop').hidden = true;
  if(document.getElementById('player').hidden) document.body.classList.remove('sheet-open');
}
let GEN = null;
function trOpenGen(){
  const prev = trPlan() && trPlan().kind==='gen' ? trPlan().settings : null;
  GEN = JSON.parse(JSON.stringify(prev || trDefaults()));
  const d = trDefaults(); ['style'].forEach(k=>{ if(!GEN[k]) GEN[k] = d[k]; }); GEN.cardioMode = 'auto';
  GEN.goal = trGoalKey();
  trRenderGen();
}
function trOptBtns(key, opts, multi){
  return `<div class="opts" role="group">${opts.map(([v,l])=>{
    const on = multi ? (GEN[key]||[]).includes(v) : String(GEN[key])===String(v);
    return `<button type="button" class="opt" aria-pressed="${on}" onclick="trGenSet('${key}','${v}',${multi?1:0})">${l}</button>`;
  }).join('')}</div>`;
}
function trGenSet(key, v, multi){
  if(multi){ const a = GEN[key] = GEN[key]||[]; const i = a.indexOf(v); if(i>=0) a.splice(i,1); else a.push(v); }
  else GEN[key] = /^\d+$/.test(v) ? Number(v) : v;
  trRenderGen();
}
function trRenderGen(){
  const g = GEN, home = g.place==='home';
  const html = `
    <div class="nudge" style="margin:0 0 14px;"><span>عندك جدول من مدربك؟</span><button class="ghost" onclick="trOpenCustom(false)">أدخل جدولي</button></div>
    <div class="opt-group"><span class="opt-label">وين تتمرن؟</span>${trOptBtns('place', [['gym','بالجم'],['home','بالبيت']])}</div>
    ${home ? `<div class="opt-group"><span class="opt-label">شنو عندك بالبيت؟</span><div class="opt-help">وزن جسمك والكرسي موجودة دائماً. اختار الباقي.</div>${trOptBtns('equip', [['db','دمبلز'],['band','أحزمة مطاطية'],['bar','عقلة'],['bench','بنج']], true)}</div>` : ''}
    <div class="opt-group"><span class="opt-label">كم يوم بالأسبوع؟</span>${trOptBtns('days', [[2,'2'],[3,'3'],[4,'4'],[5,'5'],[6,'6']])}</div>
    <div class="opt-group"><span class="opt-label">مستواك</span><div class="opt-help">مبتدئ: أقل من 6 أشهر تمرين منتظم. متوسط: من 6 أشهر لسنتين. متقدم: أكثر.</div>${trOptBtns('level', [['beg','مبتدئ'],['int','متوسط'],['adv','متقدم']])}</div>
    ${home ? '' : `<div class="opt-group"><span class="opt-label">المكائن أو الأوزان الحرة؟</span><div class="opt-help">المكائن أسهل بالتعلم وأأمن للمبتدئ بدون مدرب، والنتيجة بالعضل تقريباً نفسها. الأوزان الحرة تبني قوة وتوازن أكثر. وأي تمرين تكدر تبدّله إذا الجهاز مشغول.</div>${trOptBtns('style', [['machine','مكائن أكثر'],['mix','مزيج'],['free','أوزان حرة أكثر']])}</div>`}
    <div class="opt-group"><span class="opt-label">التركيز</span>${trOptBtns('focus', [['bal','متوازن'],['lower','الجزء السفلي والأرداف'],['upper','الجزء العلوي']])}</div>
    <div class="opt-group"><span class="opt-label">الكارديو</span><div class="goal-note" style="margin-top:0;">${esc(trCardioText(g))}</div></div>
    <div class="opt-group"><span class="opt-label">نوع الكارديو</span>${trOptBtns('cardioType', home ? [['auto','تلقائي'],['walk','مشي سريع'],['march','مشي بالمكان'],['jacks','قفز جانبي']] : [['auto','تلقائي'],['tread','تردمل بميلان'],['elliptical','إليبتكال'],['bike','دراجة'],['rower','تجذيف (روينغ)'],['stairs','جهاز الدرج']])}</div>
    <div class="opt-group"><span class="opt-label">أتجنب (إصابة أو ألم)</span><div class="opt-help">نشيل التمارين اللي تضغط على هذي المنطقة. الإصابة تحتاج رأي طبيب أو معالج.</div>${trOptBtns('avoid', TR_AVOIDS, true)}</div>
    <div class="card" style="margin:0 0 12px; background:var(--accent-soft); border-color:transparent;"><div style="font-weight:700; margin-bottom:4px;">مدة الحصة</div>
      <div class="goal-note" style="margin:0;">${esc(trTimeText(g))} حسبناها حتى كل عضلة تتمرن مرتين بالأسبوع وتاخذ عدد الجولات المناسب لمستواك، بدون ما تطول الحصة أكثر من اللازم.</div></div>
    <button class="primary" onclick="trGenPreview()">سوّي البرنامج</button>`;
  trOpenSheet('صانع البرنامج', html);
}
let GEN_PREVIEW = null;
function trGenPreview(){
  GEN_PREVIEW = trGenerate(GEN);
  const ws = trWeeklySets(GEN_PREVIEW), w = data.profile ? data.profile.weight : 0;
  const html = `
    <div class="goal-note" style="margin:0 0 10px;">كل عضلة تتمرن تقريباً مرتين بالأسبوع. هذي جولاتها بالأسبوع (العلمي: 10-20 للمتمرن، والمبتدئ يكفيه أقل بالبداية):</div>
    <div class="chips" style="margin-bottom:12px;">${Object.keys(ws).map(k=>`<span class="pill">${esc(k)} ${ws[k]}</span>`).join('')}</div>
    <div class="goal-note" style="margin:0 0 12px;">${esc(trTimeText(GEN))} ${esc(trCardioText(GEN))}</div>
    ${GEN_PREVIEW.days.map(d=>`<div class="card" style="margin-bottom:10px;"><div style="font-weight:700; margin-bottom:4px;">${esc(d.name)}</div>
      <div class="meta" style="margin-bottom:4px;">تقريباً ${Math.round(5 + d.items.reduce((a,it)=>a+trItemMin(it),0))} دقيقة${w ? ` · ~${Math.round(trSessionKcal(d, w, GEN))} سعرة` : ''}</div>
      ${d.items.map(it=>`<div class="ex-row"><span>${trExName(it)}</span><span class="meta">${esc(trDoseText(it))}${it.rest ? ` · راحة ${it.rest>=120 ? (it.rest/60)+' د' : it.rest+' ث'}` : ''}</span></div>`).join('')}</div>`).join('')}
    <div class="btn-row"><button class="primary" onclick="trGenAccept()">اعتمد البرنامج</button><button class="ghost" onclick="trRenderGen()">رجوع وتعديل</button></div>`;
  trOpenSheet('برنامجك المقترح', html);
}
async function trGenAccept(){
  if(!GEN_PREVIEW) return;
  if(data.training && data.training.active && !await askConfirm('عندك تمرين ما خلص. البرنامج الجديد يحذفه. نكمل؟', 'نعم', true)) return;
  data.training = Object.assign({}, data.training||{}, {program:GEN_PREVIEW, next:0});
  delete data.training.active;
  save(); trCloseSheet(); renderTrain(); applyTargets();
  notify('انحفظ برنامجك ✅');
}

// ---------- برنامج خاص ----------
let CUS = null;
function trOpenCustom(fromCurrent){
  const p = trPlan();
  CUS = fromCurrent && p ? JSON.parse(JSON.stringify({name:p.name, days:p.days, settings:p.settings})) : {name:'برنامجي', days:[{name:'اليوم 1', items:[]}], fresh:true};
  trRenderCustom();
}
function trRenderCustom(){
  const html = `
    <div class="goal-note" style="margin:0 0 12px;">اكتب جدولك مثل ما عطاك مدربك: لكل يوم ضيف التمارين بالبحث أو من العضلات، وعدّل الجولات والعدات والراحة. التطبيق يتابع أوزانك ويحسب حرقك مثل البرنامج الجاهز.</div>
    <div class="field" style="margin-bottom:12px;"><label for="cu-name">اسم البرنامج</label><input id="cu-name" value="${esc(CUS.name)}" oninput="CUS.name=this.value" maxlength="60"></div>
    ${CUS.days.map((d,di)=>`<div class="card" style="margin-bottom:10px;">
      <div class="row" style="align-items:flex-end;"><div class="field" style="flex:1 1 60%;"><label for="cu-d${di}">اسم اليوم</label><input id="cu-d${di}" value="${esc(d.name)}" oninput="CUS.days[${di}].name=this.value" maxlength="50"></div>
        <button class="ghost" style="flex:0 0 auto;" onclick="trCusDelDay(${di})" aria-label="حذف اليوم">حذف اليوم</button></div>
      ${d.items.map((it,ii)=>`<div class="item"><div class="item-top"><b>${esc(it.name)}</b><button class="del" onclick="trCusDel(${di},${ii})" aria-label="حذف ${esc(it.name)}">✕</button></div>
        <div class="item-bot">${it.type==='cardio' ? `<label style="margin:0;">دقايق <input class="amt" type="number" min="1" max="180" value="${num(it.min)}" onchange="trCusSet(${di},${ii},'min',this.value)"></label>` : `
          <label style="margin:0;">جولات <input class="amt" type="number" min="1" max="10" value="${it.sets}" onchange="trCusSet(${di},${ii},'sets',this.value)"></label>
          <label style="margin:0;">${it.type==='time'?'ثواني':'عدات'} <input class="amt" type="number" min="1" max="300" value="${it.lo}" onchange="trCusSet(${di},${ii},'lo',this.value)"> - <input class="amt" type="number" min="1" max="300" value="${it.hi}" onchange="trCusSet(${di},${ii},'hi',this.value)"></label>
          <label style="margin:0;">راحة (ث) <input class="amt" type="number" min="0" max="600" step="15" value="${it.rest}" onchange="trCusSet(${di},${ii},'rest',this.value)"></label>`}</div></div>`).join('')}
      <div class="field" style="margin-top:8px;"><label for="cu-s${di}">ضيف تمرين</label><input id="cu-s${di}" placeholder="ابحث: سكوات، بنج، عقلة، مشي..." oninput="trCusSearch(${di})" autocomplete="off"></div>
      <div class="chips" style="margin-top:8px;" role="group" aria-label="اختار حسب العضلة">${TR_GROUPS.map(([k,l])=>`<button type="button" class="chip" onclick="trCusBrowse(${di},'${k}')">${l}</button>`).join('')}</div>
      <div class="results" id="cu-r${di}"></div>
    </div>`).join('')}
    <div class="btn-row"><button class="ghost" onclick="trCusAddDay()" ${CUS.days.length>=7?'disabled':''}>+ ضيف يوم</button></div>
    <button class="primary" style="margin-top:12px;" onclick="trCusSave()">احفظ البرنامج</button>`;
  trOpenSheet('برنامج خاص', html);
}
const TR_GROUPS = [['chest','صدر'],['back','ظهر'],['shoulder','كتف'],['legs','أرجل'],['glutes','أرداف'],['arms','ذراع'],['abs','بطن'],['cardio','كارديو']];
const TR_GROUP_MUS = {chest:['pecUpper','pecLower'], back:['lats','traps','erectors'], shoulder:['deltFront','deltSide','deltRear'], legs:['quads','hamstrings','adductors','calves'], glutes:['glutes'], arms:['biceps','triceps','forearm'], abs:['abs','obliques']};
function trCusExBtn(di, id){ return `<button class="result" onclick="trCusAdd(${di},'${id}')"><span>${esc(EXLIB[id].n)}${EXLIB[id].type!=='cardio' ? ` <span class="kind">${trKindLabel(id)}</span>` : ''}</span><span class="meta">＋</span></button>`; }
function trCusBrowse(di, g){
  const box = document.getElementById('cu-r'+di); if(!box) return;
  const ids = Object.keys(EXLIB).filter(id=>g==='cardio' ? EXLIB[id].type==='cardio' : EXLIB[id].type!=='cardio' && EXLIB[id].p.some(m=>(TR_GROUP_MUS[g]||[]).includes(m)));
  box.innerHTML = ids.map(id=>trCusExBtn(di, id)).join('');
}
function trCusSearch(di){
  const q = normAr(document.getElementById('cu-s'+di).value.trim()), box = document.getElementById('cu-r'+di);
  if(!q){ box.innerHTML = ''; return; }
  const words = q.split(/\s+/);
  const hits = Object.keys(EXLIB).filter(id=>{ const n = normAr(EXLIB[id].n); return words.every(w=>n.includes(w)); }).slice(0,8);
  const raw = document.getElementById('cu-s'+di).value.trim();
  box.innerHTML = hits.map(id=>trCusExBtn(di, id)).join('')
    + `<button class="result" onclick="trCusAddCustom(${di})"><span>ضيف "${esc(raw)}" كتمرين خاص</span><span class="meta">بدون رسم</span></button>`;
}
function trCusAdd(di, id){
  const e = EXLIB[id], st = (trPlan() && trPlan().settings) || trDefaults();
  const d = e.type==='cardio' ? {sets:1, lo:0, hi:0, rest:0, min:20} : trDose(id, '', st.level || 'beg', true);
  CUS.days[di].items.push(Object.assign({ex:id, name:e.n, type:e.type}, d));
  trRenderCustom();
}
function trCusAddCustom(di){
  const raw = document.getElementById('cu-s'+di).value.trim().slice(0,60); if(!raw) return;
  CUS.days[di].items.push({ex:null, name:raw, type:'kg', sets:3, lo:8, hi:12, rest:90});
  trRenderCustom();
}
function trCusSet(di, ii, k, v){ const it = CUS.days[di].items[ii]; it[k] = Math.max(0, Math.round(num(v))); if(k==='lo' && it.hi < it.lo) it.hi = it.lo; if(k==='hi' && it.hi < it.lo) it.lo = it.hi; }
function trCusDel(di, ii){ CUS.days[di].items.splice(ii,1); trRenderCustom(); }
function trCusAddDay(){ if(CUS.days.length<7){ CUS.days.push({name:`اليوم ${CUS.days.length+1}`, items:[]}); trRenderCustom(); } }
function trCusDelDay(di){ CUS.days.splice(di,1); if(!CUS.days.length) CUS.days.push({name:'اليوم 1', items:[]}); trRenderCustom(); }
async function trCusSave(){
  const days = CUS.days.filter(d=>d.items.length);
  if(!days.length){ notify('ضيف تمرين واحد على الأقل'); return; }
  if(CUS.fresh && trPlan() && !await askConfirm('جدولك راح يصير برنامجك بدل الحالي. سجل تمارينك وأرقامك تبقى محفوظة. نكمل؟', 'احفظ جدولي')) return;
  const cleaned = cleanTraining({program:{id:uid(), name:CUS.name||'برنامجي', kind:'custom', created:Date.now(), settings:CUS.settings||trDefaults(), days}, next:0});
  if(data.training && data.training.active) delete data.training.active;
  data.training = Object.assign({}, data.training||{}, {program:cleaned.program, next:0});
  save(); trCloseSheet(); renderTrain(); applyTargets();
  notify('انحفظ برنامجك ✅');
}
function trShowDay(i){
  const p = trPlan(); if(!p || !p.days[i]) return;
  const d = p.days[i];
  trOpenSheet(d.name, `<div class="goal-note" style="margin:0 0 6px;">الجهاز مو موجود بجمك؟ اضغط "بدّل" وتلكى بديل يشتغل على نفس العضلات.</div>
    ${d.items.map((it,k)=>`<div class="ex-row"><span>${trExName(it)}<br><span class="meta">${esc(trDoseText(it))}</span></span>${it.ex ? `<button class="ghost" style="flex:0 0 auto;" onclick="trSwapPick(${i},${k})" aria-label="بدّل ${esc(it.name)}">بدّل</button>` : ''}</div>`).join('')}
    <button class="primary" style="margin-top:12px;" onclick="trCloseSheet(); plStart(${i})" ${data.training.active?'disabled':''}>ابدأ هذا اليوم</button>`);
}
// ---------- البدائل ----------
function trPrefList(pr){ return [].concat(...['gym','home'].map(k=>{ const L = pr[k]||[]; return Array.isArray(L) ? L : [].concat(L.beg||[], L.adv||[]); })); }
function trSlotsOf(id){ return Object.keys(TR_PREFS).filter(x=>trPrefList(TR_PREFS[x]).includes(id)); }
function trAlts(item, st){
  const e = item && item.ex && EXLIB[item.ex]; if(!e) return [];
  const cardio = e.type==='cardio', out = [], seen = new Set([item.ex]);
  const push = id=>{ if(seen.has(id) || !EXLIB[id]) return; seen.add(id); if((EXLIB[id].type==='cardio')!==cardio || !trUsable(id, st)) return; out.push(id); };
  if(cardio) Object.keys(EXLIB).forEach(push);
  else { trSlotsOf(item.ex).forEach(x=>trPrefList(TR_PREFS[x]).forEach(push)); Object.keys(EXLIB).forEach(id=>{ if(EXLIB[id].p[0]===e.p[0]) push(id); }); }
  // نفس النوع أول (جهاز ← جهاز، دمبل ← دمبل)، وبعدها الباقي بنفس الترتيب
  const slotSet = new Set(cardio ? [] : trSlotsOf(item.ex)), k0 = trKind(item.ex);
  const rank = id=>(cardio || trSlotsOf(id).some(x=>slotSet.has(x)) ? 0 : 2) + (trKind(id)===k0 ? 0 : 1);
  return out.map((id,i)=>({id, i, r:rank(id)})).sort((a,b)=>a.r-b.r || a.i-b.i).slice(0, 10).map(x=>x.id);
}
function trSwapItem(old, id, st){
  const e = EXLIB[id];
  if(e.type==='cardio') return {ex:id, name:e.n, type:'cardio', sets:1, lo:0, hi:0, rest:0, min:num(old.min)||20};
  const slots = trSlotsOf(id), slot = slots.length && slots.every(x=>TR_ISO.has(x)) ? slots[0] : '';
  const d = trDose(id, slot, (st && st.level) || 'beg', false);
  return Object.assign({ex:id, name:e.n, type:e.type}, d, {sets: old.type==='cardio' ? d.sets : trClampInt(old.sets, 1, 6, d.sets)});
}
function trAltList(item, st, fn){
  const alts = trAlts(item, st);
  return alts.length ? alts.map(id=>`<button type="button" class="result" onclick="${fn}('${id}')"><span>${esc(EXLIB[id].n)} <span class="kind">${trKindLabel(id)}</span></span><span class="meta">${esc(EXLIB[id].p.map(m=>MUS_AR[m]).join(' · '))}</span></button>`).join('')
    : '<div class="empty">ما لكينا بديل مناسب بأدواتك.</div>';
}
let TR_SW = null;
function trSwapPick(di, k){
  const p = trPlan(), it = p && p.days[di] && p.days[di].items[k]; if(!it) return;
  TR_SW = {di, k};
  trOpenSheet('بديل: ' + it.name, `<div class="goal-note" style="margin:0 0 10px;">اختار البديل، ويتبدل بالبرنامج دائماً.</div>
    <div class="results" style="margin-top:0;">${trAltList(it, p.settings, 'trSwapProg')}</div>
    <button class="ghost" style="width:100%; margin-top:10px;" onclick="trShowDay(${di})">رجوع</button>`);
}
function trSwapProg(id){
  const p = trPlan(); if(!p || !TR_SW || !EXLIB[id]) return;
  const day = p.days[TR_SW.di]; if(!day || !day.items[TR_SW.k]) return;
  day.items[TR_SW.k] = trSwapItem(day.items[TR_SW.k], id, p.settings);
  save(); renderTrain(); trShowDay(TR_SW.di); notify('تبدّل التمرين بالبرنامج ✅');
}
function trShowSession(date, t){
  const s = (data.workouts[date]||[]).find(x=>num(x.t)===num(t)); if(!s) return;
  const vol = s.items.reduce((a,i)=>a + (i.type==='kg' ? (i.sets||[]).reduce((b,x)=>b+num(x.w)*num(x.r),0) : 0), 0);
  trOpenSheet(s.dayName || 'تمرين', `
    <div class="meta" style="margin-bottom:10px;">${esc(dayName(date))} · ${Math.round((num(s.end)-num(s.t))/60000)} دقيقة${vol ? ` · مجموع الأوزان ${Math.round(vol)} كغم` : ''}${num(s.kcal) ? ` · ~${Math.round(s.kcal)} سعرة` : ''}</div>
    ${s.items.map(i=>`<div class="item"><div class="item-top"><b>${esc(i.name)}</b></div><div class="item-bot">${i.type==='cardio' ? `${num(i.min)} دقيقة` : (i.sets||[]).map(x=>`<span class="setchip">${esc(trSetText(i,x))}</span>`).join('') || 'ما انسجل'}</div></div>`).join('')}
    <div class="btn-row" style="margin-top:12px;"><button class="ghost" style="color:var(--bad);" onclick="trDelSession('${date}', ${num(s.t)})">حذف هذا التمرين</button></div>`);
}
async function trDelSession(date, t){
  if(!await askConfirm('حذف هذا التمرين من السجل؟', 'حذف', true)) return;
  data.workouts[date] = (data.workouts[date]||[]).filter(x=>num(x.t)!==num(t));
  if(!data.workouts[date].length) delete data.workouts[date];
  save(); trCloseSheet(); renderTrain();
}

// ---------- مشغل التمرين ----------
let PL = null, plTick = null, plWake = null;
function plStart(dayIdx){
  const p = trPlan(); if(!p || !p.days[dayIdx]) return;
  const day = p.days[dayIdx];
  data.training.active = {t:Date.now(), day:dayIdx, dayName:day.name, i:0, items: day.items.map((it,k)=>Object.assign({}, it, {log:[], pi:k})), cardio:{}};
  save(); plOpen();
}
function plResume(){ if(data.training && data.training.active) plOpen(); }
async function plDiscard(){
  if(!await askConfirm('حذف التمرين اللي ما خلص؟', 'حذف', true)) return;
  delete data.training.active; save(); renderTrain();
}
function plOpen(){
  PL = data.training.active;
  document.getElementById('player').hidden = false; document.body.classList.add('sheet-open');
  document.getElementById('pl-summary').hidden = true; document.getElementById('pl-main').hidden = false;
  plRender(true);
  clearInterval(plTick); plTick = setInterval(plTickFn, 500);
  try{ if(navigator.wakeLock) navigator.wakeLock.request('screen').then(w=>{ plWake = w; }).catch(()=>{}); }catch(e){}
}
function plHide(){
  document.getElementById('player').hidden = true; document.getElementById('pl-rest').hidden = true;
  if(document.getElementById('tr-sheet').hidden) document.body.classList.remove('sheet-open');
  clearInterval(plTick); plTick = null;
  try{ if(window.Coach3D) Coach3D.stop(); }catch(e){}
  try{ if(plWake) plWake.release(); }catch(e){} plWake = null;
  renderTrain();
}
async function plClose(){
  const done = PL.items.some(it=>it.log.length || (it.type==='cardio' && it.doneMin));
  if(!done){ if(await askConfirm('تطلع من التمرين؟ تكدر تكمله بعدين من "تمريني".', 'اطلع')) plHide(); return; }
  if(await askConfirm('تنهي التمرين هسه وتحفظ اللي سويته؟', 'أنهي واحفظ')) plFinish();
}
function plSync(){
  const a = data.training && data.training.active;
  if(!a){ if(PL && !document.getElementById('player').hidden && document.getElementById('pl-summary').hidden){ PL = null; plHide(); } return false; }
  if(a !== PL) PL = a;
  return true;
}
function plCur(){ return PL.items[PL.i]; }
function plFmt(sec){ sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0'); }
function plRender(first){
  if(!plSync()) return;
  const it = plCur(), e = it.ex && EXLIB[it.ex];
  document.getElementById('pl-day').textContent = PL.dayName;
  document.getElementById('pl-count').textContent = `${PL.i+1}/${PL.items.length}`;
  document.getElementById('pl-bars').innerHTML = PL.items.map((x,k)=>`<i class="${k<PL.i || x.done ? 'done' : k===PL.i ? 'cur' : ''}"></i>`).join('');
  document.getElementById('pl-name').textContent = it.name;
  const dose = [];
  if(it.type==='cardio'){ dose.push(`${num(it.min)} دقيقة`); if(e && e.set) dose.push(e.set); }
  else { dose.push(`الجولة ${Math.min(it.log.length+1, it.sets)} من ${it.sets}`); dose.push(it.type==='time' ? `${it.lo}-${it.hi} ثانية` : `${it.lo===it.hi?it.lo:it.lo+'-'+it.hi} ${e && e.per ? 'عدة '+e.per : 'عدة'}`); if(it.rest) dose.push(`راحة ${it.rest>=120 ? (it.rest/60)+' د' : it.rest+' ث'}`); }
  document.getElementById('pl-dose').innerHTML = dose.map(d=>`<span class="chip">${esc(d)}</span>`).join('');
  document.getElementById('pl-cue').textContent = e ? e.cue : 'تمرين خاص: سوّيه حسب طريقة مدربك.';
  document.getElementById('pl-legend').innerHTML = e ? `<div><i class="sw sw-p"></i><b>الأساسية:</b> ${esc(e.p.map(m=>MUS_AR[m]).join(' · '))}</div>${e.s.length ? `<div><i class="sw sw-s"></i><b>مساعدة:</b> ${esc(e.s.map(m=>MUS_AR[m]).join(' · '))}</div>` : ''}` : '';
  const last = it.type!=='cardio' ? trLast(it) : null;
  const lastTxt = last ? `المرة الماضية (${dayName(last.date)}): ${last.x.sets.map(s=>trSetText(it,s)).join('، ')}` : '';
  const sug = trSuggest(it, last);
  const lastEl = document.getElementById('pl-last');
  lastEl.textContent = [lastTxt, sug].filter(Boolean).join('\n'); lastEl.hidden = !lastEl.textContent;
  document.getElementById('pl-sets').innerHTML = it.log.map((s,k)=>`<span class="setchip">${k+1}: ${esc(trSetText(it,s))}</span>`).join('');
  const box = document.getElementById('pl-log'), btn = document.getElementById('pl-done');
  if(it.type==='cardio'){
    const c = PL.cardio[PL.i] || {};
    const el = (num(c.acc) + (c.run ? (Date.now()-c.run)/1000 : 0));
    box.innerHTML = `<div class="cardio-clock" id="pl-cclock">${plFmt(el)}</div><div class="meta" style="text-align:center;">الهدف ${num(it.min)} دقيقة</div>
      <div class="btn-row"><button class="ghost" onclick="plCardioToggle()">${c.run ? 'إيقاف مؤقت' : (el>0 ? 'كمّل' : 'ابدأ العداد')}</button></div>`;
    btn.textContent = 'خلصت الكارديو'; btn.disabled = false;
  } else if(it.log.length >= it.sets){
    box.innerHTML = `<div class="goal-note" style="margin:0; text-align:center;">✅ خلصت جولات هذا التمرين</div>`;
    btn.textContent = PL.i < PL.items.length-1 ? 'التمرين التالي' : 'إنهاء التمرين'; btn.disabled = false;
  } else {
    const prev = it.log[it.log.length-1] || (last && last.x.sets[it.log.length]) || (last && last.x.sets[0]) || null;
    const sugW = (()=>{ const m = sug.match(/(\d+(?:\.\d+)?) كغم/); return m ? m[1] : ''; })();
    const w0 = it.type==='kg' ? (it.log.length ? num(prev.w) : (sugW || (prev ? num(prev.w) : ''))) : '';
    const r0 = prev ? num(prev.r) : it.hi;
    const step = e && e.inc ? Math.min(e.inc, 2.5) : 2.5;
    box.innerHTML = `<div class="logrow">
      ${it.type==='kg' ? `<div><span class="step-l">الوزن (كغم)</span><div class="stepper"><button type="button" onclick="plStep('pl-w',${-step})" aria-label="أقل">−</button><input id="pl-w" type="number" inputmode="decimal" min="0" step="0.5" value="${w0}" placeholder="0" aria-label="الوزن بالكيلو"><button type="button" onclick="plStep('pl-w',${step})" aria-label="أكثر">+</button></div></div>` : ''}
      <div ${it.type==='kg'?'':'style="grid-column:1/-1;"'}><span class="step-l">${it.type==='time'?'الثواني':'العدات'}</span><div class="stepper"><button type="button" onclick="plStep('pl-r',-1)" aria-label="أقل">−</button><input id="pl-r" type="number" inputmode="numeric" min="0" value="${r0}" aria-label="${it.type==='time'?'الثواني':'العدات'}"><button type="button" onclick="plStep('pl-r',1)" aria-label="أكثر">+</button></div></div>
    </div>`;
    btn.textContent = `خلصت الجولة ${it.log.length+1}`; btn.disabled = false;
  }
  { const stp = document.getElementById('pl-steps'); if(stp) stp.hidden = !(it.type!=='cardio' && it.log.length < it.sets && it.log.length===0 && PL.i===0); }
  document.getElementById('pl-prev').disabled = PL.i===0;
  { const hw = document.getElementById('pl-how'); if(hw && !hw.dataset.bound){ hw.dataset.bound = '1'; try{ hw.open = localStorage.getItem('hero_how') !== '0'; }catch(e){ hw.open = true; } hw.addEventListener('toggle', ()=>{ try{ localStorage.setItem('hero_how', hw.open ? '1' : '0'); }catch(e){} }); } }
  plShow3D(it, first);
}
function plStep(id, d){ const el = document.getElementById(id); el.value = String(Math.max(0, +(num(el.value) + d).toFixed(2))); }
function plCardioToggle(){
  const c = PL.cardio[PL.i] = PL.cardio[PL.i] || {acc:0, run:0};
  if(c.run){ c.acc += (Date.now()-c.run)/1000; c.run = 0; } else c.run = Date.now();
  save(); plRender();
}
function plTickFn(){
  if(!PL || !plSync()) return;
  document.getElementById('pl-clock').textContent = plFmt((Date.now()-PL.t)/1000);
  const c = PL.cardio[PL.i];
  if(c && c.run){ const el = document.getElementById('pl-cclock'); if(el) el.textContent = plFmt(num(c.acc) + (Date.now()-c.run)/1000); }
  if(PL.restEnd){
    const left = (PL.restEnd - Date.now())/1000;
    document.getElementById('pl-rest-num').textContent = plFmt(left);
    if(left <= 0){ PL.restEnd = 0; document.getElementById('pl-rest').hidden = true; try{ navigator.vibrate && navigator.vibrate([180,80,180]); }catch(e){} notify('خلصت الراحة، يلا الجولة الجاية'); save(); }
  }
}
function plDone(){
  if(!plSync()) return;
  const it = plCur();
  if(it.type==='cardio'){
    const c = PL.cardio[PL.i] || {acc:0, run:0};
    const el = num(c.acc) + (c.run ? (Date.now()-c.run)/1000 : 0);
    it.doneMin = Math.max(1, Math.round(el/60) || num(it.min));
    it.done = true; delete PL.cardio[PL.i]; plAdvance(); return;
  }
  if(it.log.length >= it.sets){ it.done = true; plAdvance(); return; }
  const r = Math.round(num(document.getElementById('pl-r').value));
  const w = it.type==='kg' ? num(document.getElementById('pl-w').value) : 0;
  if(r<=0){ notify(it.type==='time' ? 'اكتب كم ثانية ثبتت' : 'اكتب عدد العدات'); return; }
  if(it.type==='kg' && (w<0 || w>1000)){ notify('الوزن مو منطقي'); return; }
  it.log.push(it.type==='kg' ? {w, r} : {r});
  if(it.log.length >= it.sets){
    it.done = true;
    if(PL.i < PL.items.length-1){ PL.i++; save(); plRender(true); document.querySelector('#player .pl-body').scrollTop = 0; plRestStart(Math.min(it.rest, 90), `الجاية: ${plCur().name}`); }
    else { save(); plRender(); }
    return;
  }
  save(); plRestStart(it.rest, `الجاية: الجولة ${it.log.length+1} من ${it.sets}`); plRender();
}
function plRestStart(sec, text){
  if(!sec) return;
  PL.restEnd = Date.now() + sec*1000;
  document.getElementById('pl-rest').hidden = false;
  document.getElementById('pl-rest-num').textContent = plFmt(sec);
  document.getElementById('pl-rest-next').textContent = text || '';
}
function plRestAdd(s){ if(PL.restEnd) PL.restEnd += s*1000; plTickFn(); }
function plRestSkip(){ PL.restEnd = 0; document.getElementById('pl-rest').hidden = true; save(); }
function plAdvance(){
  if(PL.i < PL.items.length-1){ PL.i++; save(); plRender(true); document.querySelector('#player .pl-body').scrollTop = 0; }
  else plFinish();
}
function plPrev(){ if(PL.i>0){ PL.i--; save(); plRender(true); } }
function plSkip(){ const it = plCur(); it.done = true; plAdvance(); }
function plSwapOpen(){
  if(!plSync()) return;
  const it = plCur(), prog = trPlan(), st = (prog && prog.settings) || trDefaults();
  trOpenSheet('بدّل التمرين', `
    <div class="goal-note" style="margin:0 0 10px;">الجهاز مشغول أو ما موجود؟ اختار بديل يشتغل على نفس العضلات.${it.log.length ? ' الجولات اللي سجلتها تبقى محفوظة.' : ''}</div>
    ${prog ? `<div class="switch" style="margin-bottom:10px;"><div><div style="font-weight:600;">خليه بالبرنامج دائماً</div><div class="meta">إذا مطفي، يتبدّل لهذي المرة بس</div></div><label class="tgl" aria-label="خليه بالبرنامج دائماً"><input type="checkbox" id="tr-swap-keep"><span></span></label></div>` : ''}
    <div class="results" style="margin-top:0;">${it.ex ? trAltList(it, st, 'plSwap') : '<div class="empty">هذا تمرين خاص، ما عنده بدائل.</div>'}</div>`, true);
}
function plSwap(id){
  if(!plSync() || !EXLIB[id]) return;
  const it = plCur(), prog = trPlan(), st = (prog && prog.settings) || trDefaults();
  const keep = !!(document.getElementById('tr-swap-keep') || {}).checked;
  const neu = Object.assign(trSwapItem(it, id, st), {log:[]});
  if(Number.isInteger(it.pi)) neu.pi = it.pi;
  if(it.log.length && it.type!=='cardio'){ it.done = true; neu.sets = Math.max(1, it.sets - it.log.length); PL.items.splice(PL.i+1, 0, neu); PL.i++; PL.cardio = {}; }
  else { PL.items[PL.i] = neu; delete PL.cardio[PL.i]; }
  if(keep && prog){
    const day = prog.days[num(PL.day)];
    let k = Number.isInteger(it.pi) ? it.pi : -1;
    if(!(day && day.items[k] && day.items[k].ex===it.ex)) k = day ? day.items.findIndex(x=>x.ex===it.ex) : -1;
    if(k>=0) day.items[k] = trSwapItem(day.items[k], id, st);
  }
  save(); trCloseSheet(); plRender(true); document.querySelector('#player .pl-body').scrollTop = 0;
  notify(keep ? 'تبدّل التمرين وانحفظ بالبرنامج ✅' : 'تبدّل لهذي المرة ✅');
}
function plSessionKcal(sess){
  const w = data.profile ? data.profile.weight : 0; if(!w) return 0;
  const st = trPlan() ? trPlan().settings : null;
  let cardioMin = 0, k = 0;
  sess.items.forEach(i=>{ if(i.type==='cardio'){ const met = (i.ex && EXLIB[i.ex] && EXLIB[i.ex].met) || 5; k += (met-1)*w*num(i.min)/60; cardioMin += num(i.min); } });
  const resist = Math.max(0, (num(sess.end)-num(sess.t))/60000 - cardioMin);
  return k + (trResistMet(st)-1)*w*resist/60;
}
function plFinish(){
  clearInterval(plTick); plTick = null;
  document.getElementById('pl-rest').hidden = true;
  const end = Date.now();
  const sess = {t:PL.t, end, day:PL.day, dayName:PL.dayName, items: PL.items.filter(it=>it.log.length || it.doneMin).map(it=>it.type==='cardio'
    ? {ex:it.ex, name:it.name, type:'cardio', sets:[], min:it.doneMin}
    : {ex:it.ex, name:it.name, type:it.type, sets:it.log.slice()})};
  sess.kcal = Math.round(plSessionKcal(sess));
  const prsBefore = trPRs();
  const k = keyFromDate(new Date(PL.t));
  if(sess.items.length){ (data.workouts[k] = data.workouts[k] || []).push(sess); }
  const prog = trPlan();
  if(prog && sess.items.length) data.training.next = (num(PL.day)+1) % prog.days.length;
  delete data.training.active; save();
  let achFresh = []; try{ achFresh = achCheck({inline:true}); }catch(e){ console.error(e); }
  const prsAfter = trPRs(), newPR = Object.keys(prsAfter).filter(id=>!prsBefore[id] || prsAfter[id].score > prsBefore[id].score + 1e-9).filter(id=>prsBefore[id]);
  const sets = sess.items.reduce((a,i)=>a+i.sets.length,0);
  const vol = sess.items.reduce((a,i)=>a + (i.type==='kg' ? i.sets.reduce((b,x)=>b+num(x.w)*num(x.r),0) : 0), 0);
  document.getElementById('pl-main').hidden = true;
  document.getElementById('pl-summary').hidden = false;
  document.getElementById('pl-summary').innerHTML = `
    <div class="pl-in">
      <h2 class="pl-name" style="margin-top:8px;">${sess.items.length ? 'عاشت إيدك 💪' : 'ما انسجل شي'}</h2>
      ${sess.items.length ? `<div class="sum-grid">
        <div class="stat"><div class="n">${Math.round((end-PL.t)/60000)}</div><div class="l">دقيقة</div></div>
        <div class="stat"><div class="n">${sets}</div><div class="l">جولة</div></div>
        <div class="stat"><div class="n">${Math.round(vol)}</div><div class="l">مجموع الأوزان (كغم)</div></div>
        <div class="stat"><div class="n">${sess.kcal || '—'}</div><div class="l">سعرة تقريباً</div></div>
      </div>
      ${newPR.length ? `<div class="card" style="margin-top:12px;"><h2>أرقام قياسية جديدة</h2>${newPR.map(id=>`<div class="pr-row"><span>${esc(EXLIB[id].n)}</span><span class="meta">${esc(trSetText({type:prsAfter[id].type}, prsAfter[id].set))}</span></div>`).join('')}</div>` : ''}
      ${achFresh.length ? `<div class="card pl-ach"><h2>🏆 ${achFresh.length===1 ? 'كأس جديد' : 'كؤوس جديدة'}</h2><div class="ach-grid">${achBadges(ACH.filter(a=>achFresh.includes(a.id)).map(a=>Object.assign({}, a, {done:true, date:null})), achFresh)}</div><div class="goal-note">هيرو يكلك: ${achHero()}</div></div>` : ''}
      <div class="goal-note">انحفظ بسجلك. ${prog ? `الحصة الجاية: ${esc(prog.days[data.training.next].name)}.` : ''}</div>` : '<div class="goal-note">ما سجلت أي جولة، فما انحفظ تمرين.</div>'}
      <button class="primary" style="margin-top:14px;" onclick="plHide()">تمام</button>
    </div>`;
  try{ if(window.Coach3D) Coach3D.stop(); }catch(e){}
}

// ---------- الرسم ثلاثي الأبعاد داخل المشغل ----------
let pl3dReady = false, pl3dHint = true;
function plShow3D(it, first){
  const msg = document.getElementById('pl-3dmsg'), tools = document.getElementById('pl-3dtools');
  if(!it.ex || !window.Coach3D || !Coach3D.has(it.ex)){
    msg.hidden = false; msg.textContent = it.ex ? 'ما عندنا رسم لهذا التمرين بعد' : 'تمرين خاص: ما إله رسم'; tools.hidden = true;
    try{ Coach3D.stop(); }catch(e){}
    return;
  }
  tools.hidden = false;
  const sex = data.profile && data.profile.sex==='f' ? 'f' : 'm', e = EXLIB[it.ex];
  const go = ()=>{ Coach3D.resume(); Coach3D.setClothes(plCloth); Coach3D.show(it.ex, sex, e.p, e.s); msg.hidden = true; plSyncTools(); };
  if(pl3dReady){ go(); return; }
  msg.hidden = false; msg.textContent = 'جاري تحميل المدرب…';
  Coach3D.mount(document.getElementById('pl-canvas'), document.getElementById('pl-stage'), {sex, onInteract:()=>{ document.getElementById('pl-hint').classList.add('gone'); document.querySelectorAll('#pl-3dtools [data-v]').forEach(b=>b.setAttribute('aria-pressed','false')); }})
    .then(()=>{ pl3dReady = true; if(!document.getElementById('player').hidden) go(); })
    .catch(()=>{ msg.hidden = false; msg.textContent = 'ما گدرنا نحمّل الرسم ثلاثي الأبعاد. تأكد من الإنترنت. تكدر تكمل تمرينك عادي.'; tools.hidden = true; });
}
let plSpeed = 1, plPlaying = true, plSpin = false, plCloth = false;
try{ plCloth = localStorage.getItem('afya_cloth')==='1'; }catch(e){}
function plSyncTools(){
  Coach3D.setSpeed(plSpeed); Coach3D.setPlaying(plPlaying); Coach3D.setSpin(plSpin);
  document.getElementById('pl-slow').setAttribute('aria-pressed', String(plSpeed!==1));
  document.getElementById('pl-play').setAttribute('aria-pressed', String(!plPlaying));
  document.getElementById('pl-play').setAttribute('aria-label', plPlaying ? 'إيقاف الحركة' : 'تشغيل الحركة');
  document.getElementById('pl-ic-pause').hidden = !plPlaying; document.getElementById('pl-ic-play').hidden = plPlaying;
  document.getElementById('pl-spin').setAttribute('aria-pressed', String(plSpin));
  const cb = document.getElementById('pl-cloth'); cb.hidden = !Coach3D.hasBody(); cb.setAttribute('aria-pressed', String(plCloth));
  cb.setAttribute('aria-label', plCloth ? 'عرض العضلات بدل الملابس' : 'لبّس المدرب ملابس رياضية');
  document.querySelectorAll('#pl-3dtools [data-v]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.v==='angle')));
}
function plView(v){ Coach3D.setView(v); plSpin = false; Coach3D.setSpin(false); document.getElementById('pl-spin').setAttribute('aria-pressed','false'); document.querySelectorAll('#pl-3dtools [data-v]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.v===v))); }
function plToggleSlow(){ plSpeed = plSpeed===1 ? 0.45 : 1; plSyncTools(); }
function plTogglePlay(){ plPlaying = !plPlaying; plSyncTools(); }
function plToggleSpin(){ plSpin = !plSpin; plSyncTools(); }
function plToggleCloth(){ plCloth = !plCloth; try{ localStorage.setItem('afya_cloth', plCloth ? '1' : '0'); }catch(e){} Coach3D.setClothes(plCloth); plSyncTools(); }
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape' || !document.getElementById('modal').classList.contains('hidden')) return;
  if(!document.getElementById('tr-sheet').hidden){ trCloseSheet(); return; }
  if(!document.getElementById('pl-rest').hidden){ plRestSkip(); return; }
});

// ---------- تنظيف البيانات ----------
function trClampInt(v, a, b, d){ const n = Math.round(num(v)); return (isFinite(n) && n>=a && n<=b) ? n : d; }
function cleanTrItem(it){
  if(!it || typeof it!=='object') return null;
  const ex = (typeof it.ex==='string' && EXLIB[it.ex]) ? it.ex : null;
  const type = ['kg','bw','time','cardio'].includes(it.type) ? it.type : (ex ? EXLIB[ex].type : 'kg');
  const out = {ex, name:String(it.name || (ex ? EXLIB[ex].n : '') || 'تمرين').slice(0,80), type,
    sets:trClampInt(it.sets,1,10,3), lo:trClampInt(it.lo,0,300,8), hi:trClampInt(it.hi,0,300,12), rest:trClampInt(it.rest,0,600,90), min:trClampInt(it.min,0,180,0)};
  if(out.hi < out.lo) out.hi = out.lo;
  if(type==='cardio' && !out.min) out.min = 20;
  return out;
}
function cleanTrSettings(s){
  s = s && typeof s==='object' ? s : {};
  const d = trDefaults();
  return {place: s.place==='home' ? 'home' : 'gym', equip:(Array.isArray(s.equip)?s.equip:[]).filter(x=>TR_EQUIP_HOME.includes(x)),
    days:[2,3,4,5,6].includes(num(s.days)) ? num(s.days) : d.days, minutes:trClampInt(s.minutes, 20, 120, 60),
    level:['beg','int','adv'].includes(s.level) ? s.level : 'beg', focus:['bal','lower','upper'].includes(s.focus) ? s.focus : 'bal',
    style:['machine','mix','free'].includes(s.style) ? s.style : 'mix', cardioMode: s.cardioMode==='auto' ? 'auto' : 'manual', goal: CARDIO_GOAL[s.goal] ? s.goal : 'maintain',
    cardio:trClampInt(s.cardio,0,4,0), cardioMin:[10,15,20,25,30].includes(num(s.cardioMin)) ? num(s.cardioMin) : 20,
    cardioType:['auto','tread','bike','elliptical','stairs','rower','walk','march','jacks'].includes(s.cardioType) ? s.cardioType : 'auto',
    avoid:(Array.isArray(s.avoid)?s.avoid:[]).filter(x=>TR_AVOIDS.some(a=>a[0]===x))};
}
function cleanSetLog(a, type){
  return (Array.isArray(a)?a:[]).slice(0,20).filter(x=>x && typeof x==='object').map(x=>type==='kg'
    ? {w:Math.max(0, Math.min(1000, num(x.w))), r:trClampInt(x.r,0,1000,0)} : {r:trClampInt(x.r,0,3600,0)});
}
function cleanTraining(t){
  if(!t || typeof t!=='object') return undefined;
  const out = {next:trClampInt(t.next,0,50,0), link:!!t.link};
  const p = t.program;
  if(p && typeof p==='object' && Array.isArray(p.days)){
    const days = p.days.slice(0,7).filter(d=>d && typeof d==='object').map(d=>({name:String(d.name||'يوم').slice(0,60), items:(Array.isArray(d.items)?d.items:[]).slice(0,20).map(cleanTrItem).filter(Boolean)})).filter(d=>d.items.length);
    if(days.length) out.program = {id: ID_RE.test(p.id||'') ? p.id : uid(), name:String(p.name||'برنامجي').slice(0,80), kind: p.kind==='custom' ? 'custom' : 'gen',
      created:num(p.created)||Date.now(), settings:cleanTrSettings(p.settings), days};
    if(out.program && trClampInt(p.v,1,99,0)) out.program.v = trClampInt(p.v,1,99,0);
  }
  out.next = out.program ? out.next % out.program.days.length : 0;
  const a = t.active;
  if(out.program && a && typeof a==='object' && Array.isArray(a.items) && a.items.length){
    const items = a.items.slice(0,25).map(it=>{ const c = cleanTrItem(it); if(!c) return null; c.log = cleanSetLog(it.log, c.type); if(it.done) c.done = true; if(Number.isInteger(it.pi) && it.pi>=0 && it.pi<25) c.pi = it.pi; if(num(it.doneMin)>0) c.doneMin = trClampInt(it.doneMin,1,600,1); return c; }).filter(Boolean);
    if(items.length) out.active = {t:num(a.t)||Date.now(), day:trClampInt(a.day,0,6,0), dayName:String(a.dayName||'تمرين').slice(0,60), i:trClampInt(a.i,0,items.length-1,0), items, cardio:{}, restEnd:0};
  }
  return out;
}
function cleanWorkouts(w){
  const out = {};
  Object.keys(w && typeof w==='object' ? w : {}).forEach(k=>{
    if(!DATE_RE.test(k) || !Array.isArray(w[k])) return;
    const a = w[k].filter(s=>s && typeof s==='object' && Array.isArray(s.items)).slice(0,10).map(s=>({
      t:num(s.t), end:num(s.end)||num(s.t), day:trClampInt(s.day,0,6,0), dayName:String(s.dayName||'').slice(0,60), kcal:Math.max(0, num(s.kcal)),
      items:s.items.slice(0,25).filter(i=>i && typeof i==='object').map(i=>{
        const ex = (typeof i.ex==='string' && EXLIB[i.ex]) ? i.ex : null, type = ['kg','bw','time','cardio'].includes(i.type) ? i.type : 'kg';
        const o = {ex, name:String(i.name || (ex ? EXLIB[ex].n : '') || 'تمرين').slice(0,80), type, sets: type==='cardio' ? [] : cleanSetLog(i.sets, type)};
        if(type==='cardio') o.min = trClampInt(i.min,0,600,0);
        return o;
      })}));
    if(a.length) out[k] = a;
  });
  return out;
}


// ================= start =================
document.getElementById('in-weight-date').value = todayKey();
document.getElementById('in-weight-date').max = todayKey();
function wdSync(){
  const el = document.getElementById('in-weight-date'), lb = document.getElementById('wd-label'); if(!el || !lb) return;
  const v = el.value, en = !!(window.I18N && I18N.en);
  if(!v || v === todayKey()){ lb.textContent = en ? 'Today' : 'اليوم'; return; }
  const [y, m, d] = v.split('-').map(Number);
  lb.textContent = new Date(y, m - 1, d).toLocaleDateString(en ? 'en-GB' : 'ar-IQ', {weekday:'short', day:'numeric', month:'long'});
}
wdSync();
document.getElementById('in-waist-date').value = todayKey();
document.getElementById('in-waist-date').max = todayKey();
load();
populateFoodList();
applyTargets();
setDay(todayKey());
syncUnits('db'); syncUnits('rc');
renderTrain();
renderWeight();
renderDraft();
window.__startedWithoutProfile = !data.profile;
if(!data.profile) switchTab('profile');
setCloudStatus('checking');
renderAchChip();
/* ============ v81–82: تنزيل هيرو على الشاشة (عربي + English) ============
   - إذا انفتح من داخل انستغرام (أو فيسبوك، تيك توك…) يطلب يفتحه بـ Safari أو Chrome، لأن هذني المتصفحات ما تنزّل التطبيق وبياناتها ما تنتقل.
   - بالآيفون يشرح «إضافة إلى الشاشة الرئيسية»، وبالأندرويد يطلع زر «نزّل هيرو» مباشرة إذا المتصفح يدعمه.
   - v82: الدليل بالإنگليزي تلقائياً إذا لغة الموبايل مو عربي، ويا زر «عربي / English».
   - يشتغل بنسخة الموقع (PWA) بس، مو بنسخة Claude. */
const INST = (function(){
  const UA = navigator.userAgent || '';
  const PWA = !!window.HERO_PWA;
  const iOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iPad = /iPad/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(UA);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Line\//i.test(UA);
  const URL_ = 'https://hurr88ai-bit.github.io/Hero/';
  const K_SEEN = 'hero_inst_seen', K_LANG = 'hero_inst_lang';
  let deferred = null, gateCont = null;
  const ls = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  const standalone = () => { try{ return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }catch(e){ return navigator.standalone === true; } };
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ar']).map(l => String(l).toLowerCase());
  let lang = (window.I18N && I18N.lang) || ls.get(K_LANG) || (langs[0].startsWith('ar') ? 'ar' : 'en');

  const SHARE = '<span class="inst-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>';
  const PLUS = '<span class="inst-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span>';

  const T = {
    ar: {
      title: 'نزّل هيرو على شاشتك 📲',
      leadSteps: 'حتى يصير هيرو على شاشتك مثل أي تطبيق، ويشتغل حتى بدون نت:',
      leadBtn: 'نزّل هيرو على شاشتك بضغطة وحدة، ويفتح مثل أي تطبيق، ويشتغل حتى بدون نت.',
      btn: '📲 نزّل هيرو',
      ios: [`ادوس زر المشاركة ${SHARE} ${iPad ? 'فوك' : 'تحت'} بالمتصفح`, `انزل شوية واختار <b>«إضافة إلى الشاشة الرئيسية»</b> ${PLUS}`, `ادوس <b>«إضافة»</b> فوك`, `افتح هيرو من الأيقونة الكحلية والذهبية على شاشتك`],
      and: [`ادوس النقاط الثلاث <b>⋮</b> فوك بـ Chrome`, `اختار <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>`, `ادوس <b>«تثبيت»</b>، وافتح هيرو من أيقونته على شاشتك`],
      iosWhy: 'لازم تكون فاتح هيرو بـ Safari. إذا فاتحه بمتصفح ثاني وما لكيت الخيار، انسخ الرابط وافتحه بـ Safari.',
      copy: '🔗 انسخ رابط هيرو',
      desk: 'افتح هذا الرابط من موبايلك (Safari بالآيفون أو Chrome بالأندرويد) حتى تنزّل هيرو على شاشتك:',
      soon: 'قريباً على App Store و Google Play. لما ينزل، ينزل عليه التحديث وبياناتك تبقى ويّاك.',
      later: 'بعدين',
      iaTitle: 'افتح هيرو بالمتصفح 🌐',
      iaLead: b => `انت فاتح هيرو من داخل انستغرام. حتى تنزّله على شاشتك وتنحفظ بياناتك، افتحه بـ ${b}:`,
      iaBtn: b => `🌐 افتح هيرو بـ ${b}`,
      iaIf: 'إذا الزر ما اشتغل:',
      iaIos: [`ادوس <b>⋯</b> فوك يمين`, `اختار <b>«فتح في المتصفح الخارجي»</b>`],
      iaAnd: [`ادوس النقاط الثلاث <b>⋮</b> فوك يمين`, `اختار <b>«فتح في Chrome»</b>`],
      iaCopy: '🔗 انسخ الرابط والصقه بالمتصفح',
      iaData: 'بياناتك (أكلك، وزنك، تمارينك) تنحفظ بالمتصفح اللي تستخدمه، فإذا كملت هنا ما تنتقل بعدين.',
      iaCont: 'كمل هنا هسه',
      copied: 'انسخ الرابط ✅ الصقه بـ Safari أو Chrome',
      done: 'تم! هيرو صار على شاشتك 🎉'
    },
    en: {
      title: 'Add HERO to your home screen 📲',
      leadSteps: 'Get HERO on your home screen like any app. It even works offline:',
      leadBtn: 'Install HERO in one tap. It opens like any app and works offline.',
      btn: '📲 Install HERO',
      ios: [`Tap the Share button ${SHARE} at the ${iPad ? 'top' : 'bottom'} of Safari`, `Scroll down and tap <b>“Add to Home Screen”</b> ${PLUS}`, `Tap <b>“Add”</b> at the top`, `Open HERO from the navy and gold icon on your home screen`],
      and: [`Tap the three dots <b>⋮</b> at the top of Chrome`, `Tap <b>“Install app”</b> or <b>“Add to Home screen”</b>`, `Tap <b>“Install”</b>, then open HERO from your home screen`],
      iosWhy: 'You need to open HERO in Safari. If you’re in another browser and can’t find the option, copy the link and open it in Safari.',
      copy: '🔗 Copy the HERO link',
      desk: 'Open this link on your phone (Safari on iPhone, Chrome on Android) to add HERO to your home screen:',
      soon: 'Coming soon to the App Store and Google Play. When it launches, your data comes with you.',
      later: 'Later',
      iaTitle: 'Open HERO in your browser 🌐',
      iaLead: b => `You opened HERO inside Instagram. To install it and keep your data safe, open it in ${b}:`,
      iaBtn: b => `🌐 Open HERO in ${b}`,
      iaIf: 'If the button doesn’t work:',
      iaIos: [`Tap <b>⋯</b> at the top right`, `Tap <b>“Open in external browser”</b>`],
      iaAnd: [`Tap the three dots <b>⋮</b> at the top right`, `Tap <b>“Open in Chrome”</b>`],
      iaCopy: '🔗 Copy the link and paste it in your browser',
      iaData: 'Your data (meals, weight, workouts) is saved in the browser you use, so if you continue here it won’t move over later.',
      iaCont: 'Continue here for now',
      copied: 'Link copied ✅ Paste it in Safari or Chrome',
      done: 'Done! HERO is on your home screen 🎉'
    }
  };
  const t = () => T[lang];
  const dirAttr = () => lang === 'en' ? ' dir="ltr" lang="en"' : ' dir="rtl" lang="ar"';
  const ol = arr => `<ol>${arr.map(x => `<li><span>${x}</span></li>`).join('')}</ol>`;
  const sw = () => `<div class="inst-lang" data-no-tr><button class="${lang === 'ar' ? 'on' : ''}" onclick="INST.lang('ar')">عربي</button><button class="${lang === 'en' ? 'on' : ''}" onclick="INST.lang('en')">English</button></div>`;

  if(PWA){
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; card(); });
    window.addEventListener('appinstalled', () => { deferred = null; ls.set('hero_installed', '1'); card(); if(typeof trCloseSheet === 'function') trCloseSheet(); if(typeof notify === 'function') notify(t().done); });
  }

  function guideHTML(){
    const L = t(); let body;
    if(android && deferred) body = `<p class="inst-lead">${L.leadBtn}</p><button class="inst-btn" onclick="INST.prompt()">${L.btn}</button>`;
    else if(android) body = `<p class="inst-lead">${L.leadSteps}</p>${ol(L.and)}`;
    else if(iOS) body = `<p class="inst-lead">${L.leadSteps}</p>${ol(L.ios)}<p class="inst-why">${L.iosWhy}</p><button class="inst-btn alt" onclick="INST.copy()">${L.copy}</button>`;
    else body = `<p class="inst-lead">${L.desk}</p><p class="inst-lead" dir="ltr" style="text-align:center;font-weight:800">hurr88ai-bit.github.io/Hero</p><button class="inst-btn alt" onclick="INST.copy()">${L.copy}</button>`;
    return `<div class="inst"${dirAttr()} data-no-tr>${sw()}${body}<p class="inst-why">${L.soon}</p><button class="inst-skip" onclick="trCloseSheet()">${L.later}</button></div>`;
  }
  function open(){ if(typeof trOpenSheet !== 'function') return; ls.set(K_SEEN, String(Date.now())); trOpenSheet(t().title, guideHTML()); }

  // تنبيه تلقائي: مرة كل 3 أيام لحد ما ينزّله، بالموبايل بس، وإذا ماكو نافذة ثانية مفتوحة
  function nudge(){
    if(!PWA || standalone() || inApp || ls.get('hero_installed')) return;
    if(!(iOS || android)) return;
    if(Date.now() - Number(ls.get(K_SEEN) || 0) < 3 * 864e5) return;
    const sh = document.getElementById('tr-sheet'), ob = document.getElementById('onboard');
    if((sh && !sh.hidden) || (ob && !ob.hidden)) return;
    open();
  }

  // داخل انستغرام: شاشة تطلب يفتحه بالمتصفح قبل ما يبدي، حتى بياناته ما تضيع
  function gateHTML(){
    const L = t(), b = iOS ? 'Safari' : 'Chrome';
    const appLink = android ? `<a class="inst-btn" href="intent://${URL_.replace('https://', '')}#Intent;scheme=https;package=com.android.chrome;end">${L.iaBtn(b)}</a>`
      : iOS ? `<a class="inst-btn" href="x-safari-${URL_}">${L.iaBtn(b)}</a>` : '';
    return `<div class="ia-box inst"${dirAttr()} data-no-tr>${sw()}
      <div class="ia-top"><div class="ia-word">${lang === 'en' ? 'HERO' : 'هيرو'}</div><h3>${L.iaTitle}</h3></div>
      <p class="inst-lead">${L.iaLead(b)}</p>${appLink}
      <p class="inst-why">${L.iaIf}</p>${ol(android ? L.iaAnd : L.iaIos)}
      <button class="inst-btn alt" onclick="INST.copy()">${L.iaCopy}</button>
      <p class="inst-why">${L.iaData}</p>
      <button class="inst-skip" onclick="INST.cont()">${L.iaCont}</button></div>`;
  }
  function gate(cont){
    if(!PWA || !inApp || standalone()) return false;
    gateCont = cont;
    const box = document.createElement('div'); box.id = 'inapp'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.innerHTML = gateHTML(); document.body.appendChild(box);
    return true;
  }
  function cont(){ const box = document.getElementById('inapp'); if(box) box.remove(); const c = gateCont; gateCont = null; c && c(); }

  function setLang(l){
    if(window.I18N){ I18N.set(l); return; }
    lang = l === 'en' ? 'en' : 'ar'; ls.set(K_LANG, lang);
    const box = document.getElementById('inapp'); if(box) box.innerHTML = gateHTML();
    const sh = document.getElementById('tr-sheet');
    if(sh && !sh.hidden && document.querySelector('#tr-sheet-body .inst')){ document.getElementById('tr-sheet-title').textContent = t().title; document.getElementById('tr-sheet-body').innerHTML = guideHTML(); }
  }

  // بطاقة بصفحة ملفي، تبين بس إذا هيرو مو منزّل
  function card(){ const c = document.getElementById('inst-card'); if(c) c.hidden = !PWA || standalone(); }

  function copy(){
    const ok = typeof fbCopy === 'function' ? fbCopy(URL_) : false;
    if(!ok && navigator.clipboard) navigator.clipboard.writeText(URL_).catch(()=>{});
    if(typeof notify === 'function') notify(t().copied);
  }
  async function prompt(){
    if(!deferred){ open(); return; }
    deferred.prompt();
    try{ const r = await deferred.userChoice; if(r && r.outcome === 'accepted') ls.set('hero_installed', '1'); }catch(e){}
    deferred = null; card(); trCloseSheet();
  }
  return { open, nudge, gate, cont, card, copy, prompt, lang: setLang, inApp, standalone };
})();

INST.card();
// ================= v88: شنو الجديد ✨ =================
// كل ميزة تطلع مرة وحدة لكل مستخدم. أحدث إعلان بأول القائمة. لإعلان جديد: ضيف عنصر هنا ونصه الإنگليزي بالقاموس.
const NEWS = [
  {id:'snap87', emoji:'📸', title:'صوّر صحنك', text:'صوّر صحنك من فوك، وهيرو يعرف الأكل ويقدّر الكمية والسعرات بثواني.', sub:'تگدر تصحّح الغرامات قبل ما تضيفها للوجبة. 5 صور باليوم.', btn:'📸 جرّبها هسه', go:()=>{ openSheet(); SNAP.open(); }},
];
function newsNotice(tries){
  tries = tries || 0;
  const K = 'hero_news_seen';
  let seen = []; try{ seen = JSON.parse(localStorage.getItem(K) || '[]'); }catch(e){}
  const n = NEWS.find(x=>!seen.includes(x.id));
  if(!n || !data.onboarded || (typeof hasConsent === 'function' && !hasConsent())) return;
  const busy = !document.getElementById('tr-sheet').hidden || !document.getElementById('sheet').hidden || document.body.classList.contains('sheet-open')
    || !document.getElementById('onboard').hidden || (document.getElementById('snap') && !document.getElementById('snap').hidden);
  if(busy){ if(tries < 8) setTimeout(()=>newsNotice(tries + 1), 4000); return; }
  try{ localStorage.setItem(K, JSON.stringify(seen.concat(n.id))); }catch(e){}
  trOpenSheet('شنو الجديد ✨', `<div class="fix-note"><div class="big">${n.emoji}</div><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p>${n.sub ? `<p class="sub">${esc(n.sub)}</p>` : ''}
    <button class="primary" onclick="newsGo('${n.id}')">${esc(n.btn)}</button><button class="ghost" onclick="trCloseSheet()">بعدين</button></div>`);
}
function newsGo(id){ const n = NEWS.find(x=>x.id===id); trCloseSheet(); if(n && n.go) setTimeout(n.go, 250); }
function fixNotice(){
  const K = 'hero_notice_ffix1'; let seen = false; try{ seen = !!localStorage.getItem(K); }catch(e){}
  if(seen || !data.profile || data.profile.sex !== 'f') return;
  try{ localStorage.setItem(K, '1'); }catch(e){}
  trOpenSheet('تحديث هيرو 🛠️', `<div class="fix-note"><div class="big">🦸‍♀️</div><h3>نعتذر عن الخلل</h3><p>تم إصلاح كابتن هيرو البنت. هسه تطلع كاملة بصفحة التمرين.</p><p class="sub">إذا بعدها ما تطلع صح عندچ، دزيلنا من «ملفي ← رأيك يهمنا» 💬</p><button class="primary" onclick="trCloseSheet()">تمام</button></div>`);
}
Promise.race([initCloud(), new Promise(r=>setTimeout(r, 4000))]).then(()=>{
  const go = ()=>{ if(!data.onboarded) openOnboard(); else if(!hasConsent()) openConsent(); else { setTimeout(fixNotice, 2600); setTimeout(newsNotice, 3000); setTimeout(INST.nudge, 3600); } achSoon(); };
  if(!INST.gate(go)) go();
});
