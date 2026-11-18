"""هيرو · نسخة 104: بطاقة ملخص الأسبوع للمشاركة + «تحدّي هيرو»

نقاط الأسبوع من 100 (تسجيل الأكل 25، التمارين 25، الماي 20، الأكل ضمن الهدف 15، النوم 15)،
وبطاقة ستوري 1080×1920 بيها النقاط وأرقام الالتزام (بدون وزن أو سعرات) + #تحدي_هيرو و@heroapp.iq.

الاستعمال:  python3 src104/apply104.py  ثم  python3 tools/release.py 104
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
if 'function weekScore' in s: sys.exit('✗ نسخة 104 منطبقة من قبل')

CSS = r"""
/* ============ v104: نقاط الأسبوع + المشاركة ============ */
.ws-score{display:flex; align-items:center; gap:14px; background:linear-gradient(135deg, #1d3a6e, #13233f); color:#fff; border-radius:18px; padding:14px 16px; margin-bottom:10px;}
.ws-ring{--p:0; width:84px; height:84px; flex:0 0 auto; border-radius:50%; display:grid; place-items:center; background:conic-gradient(#ffc94d calc(var(--p)*1%), rgba(255,255,255,.14) 0);}
.ws-ring b{width:66px; height:66px; border-radius:50%; background:#13233f; display:grid; place-items:center; font-family:var(--f-display); font-size:26px; font-weight:800; line-height:1;}
.ws-score div{flex:1; min-width:0;}
.ws-score strong{display:block; font-size:16px; color:#ffc94d;}
.ws-score span{font-size:12.5px; opacity:.8; line-height:1.5;}
.ws-share{display:flex; gap:8px; margin:12px 0 4px;}
.ws-share button{flex:1;}
.ws-ch{font-size:13px; line-height:1.6; color:var(--muted); text-align:center; margin-top:6px;}
.ws-how{font-size:12px; color:var(--muted); margin-top:10px;}
.ws-how summary{cursor:pointer;}
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

# ---------- الإحصاءات: أيام ضمن الهدف، ليالي 7+، هدف التمارين ----------
sub1("""  return {keys, startK, endK, logged:logged.length, avgCal, avgPro, workouts, waterDays, avgSleep, sleepN:sl.length, dW};
}""", """  const hasT = !!data.profile && !TRACK;
  const calDays = hasT ? tot.filter(x=>x.cal >= CAL_MIN*0.9 && x.cal <= CAL_MAX).length : 0;
  const sleepGood = sl.filter(h=>h>=7).length;
  const prog = trPlan(), trainGoal = prog ? Math.max(2, Math.min(prog.days.length, 6)) : 3;
  return {keys, startK, endK, logged:logged.length, avgCal, avgPro, workouts, waterDays, avgSleep, sleepN:sl.length, dW, hasT, calDays, sleepGood, trainGoal};
}
function weekScore(S){
  const pts = S.logged/7*25 + Math.min(1, S.workouts/S.trainGoal)*25 + S.waterDays/7*20 + S.sleepGood/7*15 + (S.hasT ? S.calDays : S.logged)/7*15;
  return Math.max(0, Math.min(100, Math.round(pts)));
}
function weekScoreMsg(sc){ return sc >= 85 ? 'أسبوع أبطال 🏆' : sc >= 65 ? 'أسبوع قوي 💪' : sc >= 40 ? 'بداية زينة، نكدر أحسن' : 'الأسبوع الجاي نشدّ حيلنا'; }""")

sub1("""  trOpenSheet('ملخص الأسبوع', `<div class="ws-head"><img src="media/hero-face.webp" alt=""><div class="ob-bubble2">${hello}</div></div>
    <div class="ws-range">${range}</div>
    <div class="ws-grid">${grid}</div>
    <div class="ws-tip"><b>💡 نصيحتي للأسبوع الجاي</b>${tip}</div>`);""",
"""  const sc = weekScore(S);
  WEEK_END = endK;
  trOpenSheet('ملخص الأسبوع', `<div class="ws-head"><img src="media/hero-face.webp" alt=""><div class="ob-bubble2">${hello}</div></div>
    <div class="ws-range">${range}</div>
    <div class="ws-score"><div class="ws-ring" style="--p:${sc}"><b>${sc}</b></div><div><strong>${weekScoreMsg(sc)}</strong><span>نقاط أسبوعك من 100</span></div></div>
    <div class="ws-grid">${grid}</div>
    <div class="ws-tip"><b>💡 نصيحتي للأسبوع الجاي</b>${tip}</div>
    <div class="ws-share"><button class="primary" onclick="shareOpen('week')">📤 شارك بطاقة أسبوعك</button></div>
    <div class="ws-ch">🏆 <b>تحدّي هيرو:</b> كل جمعة نزّل بطاقة أسبوعك ستوري، وسوّي تاگ <b dir="ltr">@heroapp.iq</b> ووياه أصدقائك. الأعلى نقاط يفوز.</div>
    <details class="ws-how"><summary>شلون تنحسب النقاط؟</summary>تسجيل الأكل 25 · التمارين 25 (حسب أيام برنامجك) · الماي 20 · الأكل ضمن هدفك 15 · النوم 7 ساعات أو أكثر 15. النقاط على الالتزام، مو على الوزن، حتى يكون التحدّي عادل للكل.</details>`);""")

# ---------- المشاركة: نوع «week» ----------
sub1("""async function shareOpen(kind, extra){
  const d = shareData(kind, extra);""", """let WEEK_END = null;
function weekShareData(){
  const S = weekStats(WEEK_END || todayKey());
  return {S, sc: weekScore(S), streak: achStats().streak || 0};
}
async function shareDrawWeek(d){
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), en = shareEn(), S = d.S;
  try{ await Promise.all(['40px HeroCun', '40px Lalezar', '700 40px "IBM Plex Sans Arabic"', '500 40px "IBM Plex Sans Arabic"'].map(f=>document.fonts.load(f, f.includes('HeroCun') ? '\\u{12049}' : 'هيرو'))); }catch(e){}
  const g = x.createRadialGradient(W/2, H*.4, 60, W/2, H*.4, H*.8); g.addColorStop(0, '#244273'); g.addColorStop(1, '#0f1c34');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const PH = '\\u{12049} \\u{1213F}\\u{12328} \\u{1230B}\\u{12326} \\u{1212D}\\u{12292}';
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
  x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 34px "IBM Plex Sans Arabic"'; x.fillText('/ 100', W/2, cy + 82); x.restore();
  x.fillStyle = '#ffc94d'; x.font = '700 54px "IBM Plex Sans Arabic"';
  const msg = weekScoreMsg(d.sc); x.fillText(en && I18N.t ? I18N.t(msg) : msg, W/2, 1065);
  // المربعات
  const tiles = [
    ['📝', `${S.logged}/7`, en ? 'days logged' : 'أيام سجلت أكلي'],
    S.hasT ? ['🎯', `${S.calDays}/7`, en ? 'days on target' : 'أيام ضمن هدفي'] : ['🔥', String(d.streak), en ? 'day streak' : 'يوم ورا بعض'],
    ['🏋️', `${S.workouts}`, en ? 'workouts' : 'حصص تمرين'],
    ['💧', `${S.waterDays}/7`, en ? 'water goal days' : 'أيام هدف الماي'],
    ['😴', `${S.sleepGood}/7`, en ? 'nights 7h+' : 'ليالي 7 ساعات+'],
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
  const d = kind === 'week' ? weekShareData() : shareData(kind, extra);""")
sub1("""  SHARE.blob = await shareDraw(d); if(SHARE.url)""", """  SHARE.blob = await (kind === 'week' ? shareDrawWeek(d) : shareDraw(d)); if(SHARE.url)""")
sub1("""  SHARE.text = shareEn() ? 'BE YOUR OWN HERO 💪 @heroapp.iq' : 'BE YOUR OWN HERO 💪 تابعوا @heroapp.iq';""",
     """  SHARE.text = kind === 'week' ? (shareEn() ? 'My HERO week 💪 #HeroChallenge @heroapp.iq' : 'أسبوعي ويا هيرو 💪 #تحدي_هيرو @heroapp.iq')
    : shareEn() ? 'BE YOUR OWN HERO 💪 @heroapp.iq' : 'BE YOUR OWN HERO 💪 تابعوا @heroapp.iq';""")

NEW = {
 'أسبوع أبطال 🏆': 'A champion week 🏆', 'أسبوع قوي 💪': 'A strong week 💪', 'بداية زينة، نكدر أحسن': 'Good start, we can do better',
 'الأسبوع الجاي نشدّ حيلنا': 'Next week we push harder', 'نقاط أسبوعك من 100': 'Your weekly score out of 100',
 '📤 شارك بطاقة أسبوعك': '📤 Share your weekly card', 'تحدّي هيرو:': 'HERO Challenge:',
 'كل جمعة نزّل بطاقة أسبوعك ستوري، وسوّي تاگ': 'Every Friday post your weekly card as a story and tag',
 'ووياه أصدقائك. الأعلى نقاط يفوز.': 'along with your friends. Highest score wins.',
 'شلون تنحسب النقاط؟': 'How is the score calculated?',
 'تسجيل الأكل 25 · التمارين 25 (حسب أيام برنامجك) · الماي 20 · الأكل ضمن هدفك 15 · النوم 7 ساعات أو أكثر 15. النقاط على الالتزام، مو على الوزن، حتى يكون التحدّي عادل للكل.':
   'Food logging 25 · Workouts 25 (based on your program days) · Water 20 · Eating within your target 15 · Sleeping 7+ hours 15. Points reward consistency, not weight, so the challenge is fair for everyone.',
}
mD = re.search(r'const D = \{', s); head = s[mD.end():mD.end()+900000]
s = s[:mD.end()] + ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in head) + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 104 انطبقت')
