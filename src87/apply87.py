"""هيرو · نسخة 87: صوّر صحنك 📸

1) زر «صوّر صحنك» بأعلى شاشة «ضيف أكل»
2) شاشة الصورة: تصوير أو اختيار من الاستوديو ← تحليل ← قائمة الأكلات والغرامات (تتعدل) ← تنضاف للوجبة
3) التعرّف على الأكل والوزن من Claude (عن طريق سيرفر هيرو worker/snap-worker.js)،
   والسعرات تنحسب من قاعدة أكل هيرو نفسها
4) سياسة الخصوصية والشروط: فقرة الصور (تنرسل للتحليل وما تنحفظ) وتاريخ نفاذ جديد
5) القاموس الإنگليزي

الاستعمال (من جذر المستودع):  python3 src87/apply87.py  ثم  python3 tools/release.py 87
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, 'src87')
IDX = os.path.join(ROOT, 'index.html')
EN = os.path.join(ROOT, 'i18n', 'en.json')
rd = lambda p: open(p, encoding='utf-8').read()
s = rd(IDX)


def sub1(txt, old, new, what='index.html'):
    n = txt.count(old)
    if n != 1:
        sys.exit(f'✗ {what}: لازم يطلع مرة وحدة بالضبط ({n}): {old[:80]}')
    return txt.replace(old, new)


if 'const SNAP = ' in s:
    sys.exit('✗ نسخة 87 منطبقة من قبل')

# ---- 1) الزر بأعلى شاشة «ضيف أكل»
s = sub1(s, '  <div class="sheet-body">\n    <div class="add-step"><i>1</i>اكتب اسم الأكلة واختارها</div>',
         '  <div class="sheet-body">\n    <button type="button" class="snap-btn" onclick="SNAP.open()">📸 صوّر صحنك <small>وهيرو يحسب السعرات</small></button>\n'
         '    <div class="add-step"><i>1</i>اكتب اسم الأكلة واختارها</div>')
# ---- 2) الشاشة، الستايل، الكود
s = sub1(s, '<div id="sheet-backdrop" class="sheet-backdrop" hidden onclick="closeSheet()"></div>',
         rd(os.path.join(HERE, 'snap.html')).strip() + '\n\n<div id="sheet-backdrop" class="sheet-backdrop" hidden onclick="closeSheet()"></div>')
s = sub1(s, '.about-copy{', rd(os.path.join(HERE, 'snap.css')) + '.about-copy{')
s = sub1(s, '// ================= custom products =================',
         rd(os.path.join(HERE, 'snap.js')) + '\n// ================= custom products =================')
# زر «إغلاق» بالكيبورد
s = sub1(s, "document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !document.getElementById('sheet').hidden",
         "document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !document.getElementById('snap').hidden){ SNAP.close(); return; } if(e.key==='Escape' && !document.getElementById('sheet').hidden")

# ---- 3) القاموس الإنگليزي
NEW = {
    'صوّر صحنك': 'Snap your plate',
    'وهيرو يحسب السعرات': 'and HERO counts the calories',
    'صوّر الصحن من فوك، وهيرو يعرف الأكل ويقدّر الكمية والسعرات.': 'Take a photo of your plate from above, and HERO identifies the food and estimates the amount and calories.',
    'خلي الصحن كامل بالصورة، وبضو زين': 'Fit the whole plate in the photo, in good light',
    'إذا عندك ملعقة أو صمونة جنب الصحن، تساعد بتقدير الحجم': 'A spoon or a piece of bread next to the plate helps estimate the size',
    '📸 صوّر الصحن': '📸 Take a photo',
    '🖼️ اختار صورة من الاستوديو': '🖼️ Choose from gallery',
    'باقيلك اليوم:': 'Left today:',
    'صور': 'photos',
    'صور.': 'photos.',
    '🔒 الصورة تنرسل للتحليل بس، وما تنحفظ بأي مكان.': '🔒 The photo is sent only for analysis and is never stored.',
    'هيرو دا يشوف صحنك…': 'HERO is looking at your plate…',
    'هذا اللي شفناه بصحنك': "Here's what we saw on your plate",
    'تقدير من الصورة، مو وزن دقيق. صحّح الغرامات إذا تعرفها، واحذف أي شي غلط.': "This is an estimate from the photo, not an exact weight. Correct the grams if you know them, and delete anything that's wrong.",
    '🫗 الأكل مدهّن؟ ضيف ملعقة دهن': '🫗 Oily food? Add a spoon of oil',
    '+ ضيفها للوجبة': '+ Add to meal',
    'صوّر مرة ثانية': 'Take another photo',
    'السعرات محسوبة من قاعدة أكل هيرو (USDA وتقديرات الأكلات المحلية).': "Calories are calculated from HERO's food database (USDA and local-dish estimates).",
    'ما لكيناها بقاعدة الأكل': "Not found in the food database",
    '🔍 دوّر عليها': '🔍 Search for it',
    '🤔 مو متأكدين:': '🤔 Not sure:',
    '📶 تحليل الصورة يحتاج نت. تأكد من الاتصال وجرب مرة ثانية.': '📶 Photo analysis needs internet. Check your connection and try again.',
    'ما كدرنا نفتح الصورة. جرب صورة ثانية.': "We couldn't open the photo. Try another one.",
    '📶 ما وصلنا للسيرفر. تأكد من النت وجرب مرة ثانية.': "📶 We couldn't reach the server. Check your internet and try again.",
    'خلصت صور اليوم 🙏 تتجدد باچر. لحد ذاك الوقت ضيف أكلك بالبحث أو الباركود.': "You've used today's photos 🙏 They renew tomorrow. Until then, add food by search or barcode.",
    'السيرفر مشغول هسه. جرب بعد دقيقة.': 'The server is busy right now. Try again in a minute.',
    'صار خلل بالتحليل. جرب مرة ثانية، أو ضيف الأكل بالبحث.': 'Something went wrong with the analysis. Try again, or add the food by search.',
    '🍽️ ما شفنا أكل بالصورة. صوّر الصحن من فوك وهو واضح.': "🍽️ We didn't see food in the photo. Take it from above, clearly.",
    '🔍 الصورة مو واضحة. صوّر بضو زين ومن فوك الصحن.': "🔍 The photo isn't clear. Take it in good light, from above the plate.",
    'ماكو أكلة نگدر نضيفها': 'There is no food we can add',
    'انضافت للوجبة ✅ راجعها واضغط حفظ الوجبة': 'Added to the meal ✅ Review it and tap Save meal',
}
mD = re.search(r'const D = \{', s)
add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ', '
              for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False) + ':') not in s)
s = s[:mD.end()] + add + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); en.update(NEW)
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)

# ---- 4) الخصوصية والشروط
P = os.path.join(ROOT, 'privacy.html'); p = rd(P)
p = sub1(p, 'تاريخ النفاذ: 30 تشرين الأول 2026', 'تاريخ النفاذ: 11 تشرين الثاني 2026', 'privacy')
p = sub1(p, 'Effective date: 30 October 2026', 'Effective date: 11 November 2026', 'privacy')
p = sub1(p, '<li>الشي الوحيد اللي يطلع من موبايلك داخل التطبيق: <b>رقم الباركود</b> لما تمسح منتج، يروح لقاعدة Open Food Facts حتى نجيب قيمه الغذائية.</li>',
         '<li>الشي اللي يطلع من موبايلك داخل التطبيق: <b>رقم الباركود</b> لما تمسح منتج (يروح لـ Open Food Facts)، و<b>صورة الصحن</b> لما تستخدم «صوّر صحنك» (تنرسل للتحليل وما تنحفظ).</li>', 'privacy')
p = sub1(p, '<li>The only thing that leaves your device inside the app is a <b>barcode number</b> when you scan a product, sent to Open Food Facts to look up its nutrition values.</li>',
         '<li>What leaves your device inside the app: a <b>barcode number</b> when you scan a product (sent to Open Food Facts), and a <b>plate photo</b> when you use "Snap your plate" (sent for analysis and never stored).</li>', 'privacy')
p = sub1(p, '      <li><b>تنزيل التطبيق وتحديثاته:</b>',
         '      <li><b>«صوّر صحنك»:</b> بس لما تصوّر صحن أو تختار صورة بنفسك، التطبيق يصغّر الصورة ويرسلها ويا قائمة أسماء الأكلات (بدون اسمك ولا وزنك ولا أي بيانات صحية) لسيرفر هيرو على Cloudflare، وهو يرسلها لـ Anthropic (شركة Claude) حتى تتعرف على الأكل وتقدّر الكمية. الصورة <b>ما تنحفظ</b> عندنا، ومثل ما تنص شروط Anthropic التجارية، ما تُستخدم لتدريب نماذجها. حتى نحدد عدد الصور اليومي، ينحفظ بالسيرفر عدّاد يومي مرتبط برقم عشوائي للجهاز وبصمة مشفّرة لعنوان IP، وينمسح تلقائياً بعد يوم تقريباً. سياسة Anthropic: <a href="https://www.anthropic.com/legal/privacy" rel="noopener">anthropic.com/legal/privacy</a>، وCloudflare: <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">cloudflare.com/privacypolicy</a>.</li>\n'
         '      <li><b>تنزيل التطبيق وتحديثاته:</b>', 'privacy')
p = sub1(p, '      <li><b>Downloading the app and updates:</b>',
         '      <li><b>"Snap your plate":</b> only when you take or choose a photo yourself, the app shrinks it and sends it, together with the list of food names (never your name, weight or any health data), to HERO\'s server on Cloudflare, which forwards it to Anthropic (the maker of Claude) to identify the food and estimate the amount. We <b>do not store</b> the photo, and under Anthropic\'s commercial terms it is not used to train their models. To enforce the daily photo limit, the server keeps a daily counter tied to a random device number and a hashed fingerprint of your IP address, deleted automatically after about a day. Anthropic\'s policy: <a href="https://www.anthropic.com/legal/privacy" rel="noopener">anthropic.com/legal/privacy</a>; Cloudflare: <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">cloudflare.com/privacypolicy</a>.</li>\n'
         '      <li><b>Downloading the app and updates:</b>', 'privacy')
p = sub1(p, '<li><b>الكاميرا:</b> بس لقراءة الباركود، وبس لما تضغط زر المسح. الصورة تنقرا داخل الجهاز، وما تنحفظ وما تنرسل لأي جهة.</li>',
         '<li><b>الكاميرا:</b> لقراءة الباركود (الصورة تنقرا داخل الجهاز وما تنرسل)، ولـ«صوّر صحنك» (الصورة اللي تختارها تنرسل للتحليل بس، مثل ما بالفقرة 3). ما نفتح الكاميرا إلا لما تضغط الزر.</li>', 'privacy')
p = sub1(p, '<li><b>Camera:</b> only to read barcodes, and only when you tap Scan. Frames are processed on the device and are never stored or sent anywhere.</li>',
         '<li><b>Camera:</b> to read barcodes (processed on the device, never sent) and for "Snap your plate" (the photo you choose is sent only for analysis, as in section 3). The camera opens only when you tap the button.</li>', 'privacy')
p = sub1(p, '<li>ما نستخدم موقعك (GPS)، ولا جهات الاتصال، ولا الصور، ولا المايكروفون.</li>',
         '<li>ما نستخدم موقعك (GPS)، ولا جهات الاتصال، ولا المايكروفون، وما نوصل لصورك إلا الصورة اللي تختارها بنفسك.</li>', 'privacy')
p = sub1(p, "<li>We don't use your location, contacts, photos or microphone.</li>",
         "<li>We don't use your location, contacts or microphone, and we never access your photos except the one you pick yourself.</li>", 'privacy')
open(P, 'w', encoding='utf-8').write(p)

T = os.path.join(ROOT, 'terms.html'); t = rd(T)
t = sub1(t, 'تاريخ النفاذ: 30 تشرين الأول 2026', 'تاريخ النفاذ: 11 تشرين الثاني 2026', 'terms')
t = sub1(t, 'Effective date: 30 October 2026', 'Effective date: 11 November 2026', 'terms')
t = sub1(t, 'هيرو ما يتحقق من مسببات الحساسية.</p>',
         'هيرو ما يتحقق من مسببات الحساسية.</p>\n    <p>«صوّر صحنك» يعطي <b>تقدير تقريبي</b> بالذكاء الاصطناعي: ممكن يغلط بنوع الأكلة أو بالكمية (خصوصاً الدهن والأكل المخفي تحت غيره). راجع النتيجة وصحّحها قبل ما تحفظها، ولا تعتمد عليها لحالها بقرارات صحية أو طبية. عدد الصور باليوم محدود، وممكن نغيّر الحد أو نوقف الخاصية بأي وقت.</p>', 'terms')
t = sub1(t, 'HERO does not check for allergens.</p>',
         'HERO does not check for allergens.</p>\n    <p>"Snap your plate" gives an <b>AI estimate</b>: it can get the food or the amount wrong (especially fat and food hidden under other food). Review and correct the result before saving it, and don\'t rely on it alone for health or medical decisions. The number of photos per day is limited, and we may change the limit or stop the feature at any time.</p>', 'terms')
open(T, 'w', encoding='utf-8').write(t)

print('✓ نسخة 87 انطبقت · صوّر صحنك 📸 ·', len(NEW), 'نص جديد بالقاموس')
