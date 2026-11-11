"""هيرو · نسخة 88: نافذة «شنو الجديد ✨»

نظام ثابت للإعلان عن الميزات الجديدة داخل التطبيق:
- قائمة NEWS: كل ميزة إلها id، وتطلع مرة وحدة لكل مستخدم (تنحفظ بـlocalStorage: hero_news_seen)
- تطلع بعد ما يخلص الترحيب والموافقة، وما تطلع فوك أي نافذة ثانية مفتوحة (تنتظر وتحاول مرة ثانية)
- أول إعلان: «صوّر صحنك» ويا زر «📸 جرّبها هسه» يفتح شاشة الصورة مباشرة
- لإعلان جديد بعدين: ضيف عنصر لـNEWS (أحدث وحدة بالأول) والنص الإنگليزي للقاموس

الاستعمال:  python3 src88/apply88.py  ثم  python3 tools/release.py 88
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
EN = os.path.join(ROOT, 'i18n', 'en.json')
s = open(IDX, encoding='utf-8').read()


def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit(f'✗ لازم يطلع مرة وحدة بالضبط ({n}): {old[:80]}')
    s = s.replace(old, new)


if 'const NEWS = ' in s:
    sys.exit('✗ نسخة 88 منطبقة من قبل')

JS = r'''// ================= v88: شنو الجديد ✨ =================
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
'''
sub1('function fixNotice(){', JS + 'function fixNotice(){')
sub1("else { setTimeout(fixNotice, 2600); setTimeout(INST.nudge, 3600); }",
     "else { setTimeout(fixNotice, 2600); setTimeout(newsNotice, 3000); setTimeout(INST.nudge, 3600); }")
# بعد الموافقة (المستخدمين القدامى اللي شافوا شاشة الموافقة)
sub1("achSoon(); setTimeout(fixNotice, 1200); setTimeout(INST.nudge, 2400); return; }",
     "achSoon(); setTimeout(fixNotice, 1200); setTimeout(newsNotice, 1800); setTimeout(INST.nudge, 2400); return; }")

NEW = {
    'شنو الجديد ✨': "What's new ✨",
    'صوّر صحنك من فوك، وهيرو يعرف الأكل ويقدّر الكمية والسعرات بثواني.': 'Snap your plate from above, and HERO identifies the food and estimates the amount and calories in seconds.',
    'تگدر تصحّح الغرامات قبل ما تضيفها للوجبة. 5 صور باليوم.': 'You can correct the grams before adding them to your meal. 5 photos a day.',
    '📸 جرّبها هسه': '📸 Try it now',
    'بعدين': 'Later',
}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ', '
              for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False) + ':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); en.update(NEW)
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 88 انطبقت · شنو الجديد ✨')
