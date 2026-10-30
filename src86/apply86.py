"""هيرو · نسخة 86: حماية العمر والموافقة

1) شاشة التنبيه الصحي بالترحيب: الموافقة صارت «عمري 18 سنة أو أكثر» + الشروط والخصوصية
2) الموافقة تنحفظ (data.consent = {v, t}) — رقم نسخة الشروط ووقت الموافقة
3) المستخدمين القدامى (اللي خلصوا الترحيب قبل نسخة 86): تطلعلهم شاشة الموافقة مرة وحدة بس
4) ملفي يرفض أصلاً الأعمار أقل من 18 (موجود من قبل)

الاستعمال:  python3 src86/apply86.py  ثم  python3 tools/release.py 86
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


CONSENT_V = 1
ACK_OLD = 'قريت التنبيه، وأوافق على الشروط وسياسة الخصوصية'
ACK_NEW = 'قريت التنبيه، وعمري 18 سنة أو أكثر، وأوافق على الشروط وسياسة الخصوصية'
sub1(f'onchange="obSync()"> {ACK_OLD}</label>', f'onchange="obSync()"> {ACK_NEW}</label>')

# فتح الترحيب: المربع ما يتأشر تلقائياً إلا إذا الموافقة الحالية محفوظة
sub1("obStep = 0; document.getElementById('ob-ack').checked = !!data.onboarded;",
     f"obStep = 0; obConsentOnly = false; document.getElementById('ob-ack').checked = !!(data.consent && data.consent.v >= {CONSENT_V});")
sub1('let obStep = 0;\nfunction openOnboard(){',
     f'''let obStep = 0, obConsentOnly = false;
const CONSENT_V = {CONSENT_V};
function hasConsent(){{ return !!(data.consent && data.consent.v >= CONSENT_V); }}
// للمستخدمين القدامى: شاشة التنبيه والموافقة بس
function openConsent(){{
  obStep = 2; obConsentOnly = true; document.getElementById('ob-ack').checked = false;
  document.getElementById('onboard').hidden = false; document.body.classList.add('sheet-open'); obSync();
}}
function openOnboard(){{''')
sub1("""  if(obStep===2 && !document.getElementById('ob-ack').checked) return;
  if(obStep<3){ obStep++; obSync(); return; }""",
     """  if(obStep===2 && !document.getElementById('ob-ack').checked) return;
  if(obStep===2){ data.consent = {v: CONSENT_V, t: Date.now()}; save(); }
  if(obConsentOnly){ obConsentOnly = false; document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open'); return; }
  if(obStep<3){ obStep++; obSync(); return; }""")
# زر رجوع مخفي بوضع الموافقة بس، والزر يكتب «موافق»
sub1("document.getElementById('ob-back').style.visibility = obStep===0 ? 'hidden' : 'visible';\n}\nfunction obNext",
     "document.getElementById('ob-back').style.visibility = (obStep===0 || obConsentOnly) ? 'hidden' : 'visible';\n  if(obConsentOnly) next.textContent = 'موافق';\n}\nfunction obNext")
# البداية
sub1("const go = ()=>{ if(!data.onboarded) openOnboard(); else {",
     "const go = ()=>{ if(!data.onboarded) openOnboard(); else if(!hasConsent()) openConsent(); else {")
# المزامنة ما تسد شاشة الموافقة
sub1("if(data.onboarded && !document.getElementById('onboard').hidden){",
     "if(data.onboarded && hasConsent() && !obConsentOnly && !document.getElementById('onboard').hidden){")
# الموافقة تتزامن بين الأجهزة (نسخة Claude)
sub1("  out.onboarded = Math.max(num(cloud.onboarded), num(local.onboarded)) || undefined;",
     "  out.onboarded = Math.max(num(cloud.onboarded), num(local.onboarded)) || undefined;\n"
     "  { const cc = cloud.consent, lc = local.consent; out.consent = (lc && (!cc || num(lc.v) >= num(cc.v))) ? lc : cc; if(!out.consent) delete out.consent; }")

# الموافقة تنحفظ ويا التحميل والاستيراد (cleanImported كان يشيل أي مفتاح مو معروف)
sub1("  if(num(d.onboarded)>0) out.onboarded = num(d.onboarded);",
     "  if(num(d.onboarded)>0) out.onboarded = num(d.onboarded);\n"
     "  if(d.consent && num(d.consent.v)>0) out.consent = {v:num(d.consent.v), t:num(d.consent.t)};")

# الكؤوس ما تطلع فوك شاشة الموافقة؛ تنحسب بعد الموافقة
sub1("function achSoon(){ clearTimeout(achTimer);",
     "function achSoon(){ if(data.onboarded && typeof hasConsent==='function' && !hasConsent()) return; clearTimeout(achTimer);")
sub1("if(obConsentOnly){ obConsentOnly = false; document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open'); return; }",
     "if(obConsentOnly){ obConsentOnly = false; document.getElementById('onboard').hidden = true; document.body.classList.remove('sheet-open'); achSoon(); setTimeout(fixNotice, 1200); setTimeout(INST.nudge, 2400); return; }")

# «عمرك أقل من 18» ما عاد إله مكان بقائمة «راجع طبيبك»: التطبيق صار للبالغين بس
sub1("          <li>عمرك أقل من 18 سنة</li>\n", "")

NEW = {ACK_NEW: "I've read the notice, I'm 18 or older, and I agree to the Terms and Privacy Policy",
       "موافق": "I agree"}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ', '
              for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False) + ':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); en.update(NEW)
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 86 انطبقت · موافقة العمر 18+ والشروط (v%d)' % CONSENT_V)
