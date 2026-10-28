import json, re, hashlib, pathlib, sys
root = pathlib.Path('/home/claude/hero')
P = pathlib.Path('/home/claude/patch84')
p = root / 'index.html'
s = p.read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'expected {count}, found {n}: {old[:80]!r}')
    s = s.replace(old, new)

# ---- 1) English for the new texts, then rebuild the i18n engine in <head>
NEW = {
 'امسح الباركود': 'Scan barcode',
 'امسح باركود المنتج': 'Scan product barcode',
 'الضوء': 'Flashlight',
 'وجّه الكاميرا على الباركود (الخطوط السودة) وخليه داخل الإطار': 'Point the camera at the barcode (the black lines) and keep it inside the frame',
 'الكاميرا مقفولة على هيرو. فعّلها من إعدادات الموبايل، أو صوّر الباركود، أو اكتب الرقم تحت.': 'Camera access is blocked for HERO. Allow it in your phone settings, take a photo of the barcode, or type the number below.',
 'ما كدرنا نفتح الكاميرا هنا. صوّر الباركود، أو اكتب الرقم تحت.': "We couldn't open the camera here. Take a photo of the barcode, or type the number below.",
 'القارئ ما اشتغل. صوّر الباركود، أو اكتب الرقم تحت.': "The scanner didn't start. Take a photo of the barcode, or type the number below.",
 'دا نقرا الصورة…': 'Reading the photo…',
 'ما بان الباركود بالصورة. قرّب الموبايل وخلي الضو زين، أو اكتب الرقم تحت.': "The barcode wasn't clear in the photo. Move closer with good light, or type the number below.",
 'ما كدرنا نقرا الصورة. اكتب الرقم تحت.': "We couldn't read the photo. Type the number below.",
 'اكتب رقم الباركود كامل (الأرقام اللي تحت الخطوط)': 'Type the full barcode number (the digits under the lines)',
 '📸 صوّر الباركود': '📸 Take a photo of the barcode',
 'أو اكتب رقم الباركود': 'or type the barcode number',
 'بحث': 'Search',
 'دا ندور على المنتج…': 'Looking up the product…',
 '✅ لكينا المنتج': '✅ Product found',
 'اسم المنتج': 'Product name',
 'اكتب اسم المنتج': 'Type the product name',
 'القيم لكل 100 غم. صححها من الملصق إذا مو مضبوطة.': 'Values are per 100 g. Correct them from the label if they look off.',
 'السعرات': 'Calories',
 'بروتين (غم)': 'Protein (g)',
 'كارب (غم)': 'Carbs (g)',
 'دهون (غم)': 'Fat (g)',
 'حجم الحصة / العلبة (غم)': 'Serving / pack size (g)',
 'مثلاً 240': 'e.g. 240',
 'احفظه بمنتجاتي وسجّله': 'Save to My products and log it',
 'امسح مرة ثانية': 'Scan again',
 'المعلومات من Open Food Facts (قاعدة بيانات مفتوحة يكتبها الناس)، فتأكد منها مرة وحدة. بعدها كل ما تمسحه يطلعلك فوراً حتى بدون نت.': 'This info is from Open Food Facts (an open database written by people), so check it once. After that, every scan finds it instantly, even offline.',
 '📶 ما كدرنا ندور، تأكد من النت': "📶 Couldn't search, check your internet",
 '🔍 هذا المنتج مو موجود بعد': "🔍 This product isn't in the database yet",
 'منتجاتك المحفوظة تنقرا بدون نت، بس المنتجات الجديدة نحتاج نت حتى ندورها.': 'Your saved products scan offline, but new products need internet to look up.',
 'ضيفه مرة وحدة من الملصق (السعرات والبروتين…) والباركود ينحفظ وياه، وبعدها كل ما تمسحه يطلع فوراً.': 'Add it once from the label (calories, protein…) and the barcode is saved with it. After that, every scan finds it instantly.',
 'ضيفه من الملصق': 'Add it from the label',
 'اكتب السعرات من الملصق (لكل 100 غم)': 'Enter the calories from the label (per 100 g)',
 'عندك منتج بنفس الاسم. تستبدله؟': 'You already have a product with this name. Replace it?',
 'انحفظ بمنتجاتك ✅': 'Saved to your products ✅',
 'تم: {0}': 'Added: {0}',
 'الباركود انكتب. المنتج مو موجود بقاعدة البيانات، كمّل القيم من الملصق': "Barcode filled in. The product isn't in the database, so add the values from the label",
 'الباركود انكتب ✅': 'Barcode filled in ✅',
 'عبّينا القيم من Open Food Facts. تأكد منها ويا الملصق وبعدين احفظ': 'We filled in the values from Open Food Facts. Check them against the label, then save',
 'امسح': 'Scan',
 '📷 امسح': '📷 Scan',
 'أو امسح الباركود 📷 وندورلك عليه.': 'Or scan the barcode 📷 and we’ll look it up.',
 'نسخة تجريبية 84': 'Beta version 84',
}
enp = root / 'i18n' / 'en.json'
D0 = json.load(open(enp, encoding='utf-8'))
for k, v in NEW.items():
    if k in D0 and D0[k] != v: print('keep existing', k, '->', D0[k]); continue
    D0[k] = v
json.dump(D0, open(enp, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

D = dict(D0)
for k in ['هيرو', 'نسخة تجريبية 82', 'نسخة تجريبية 83', 'نسخة تجريبية 84']:
    D.pop(k, None)
D = {re.sub(r'\s+', ' ', k).strip(): v for k, v in D.items()}
_split = lambda t: [x for x in re.split(r'(?<=[.!؟?])\s+(?=\S)', t) if x]
for k, v in list(D.items()):
    ka, va = _split(k), _split(v)
    if len(ka) > 1 and len(ka) == len(va):
        for x, y in zip(ka, va):
            if '{' not in x: D.setdefault(x, y)
            xs = x.rstrip('.'); ys = y.rstrip('.')
            if '{' not in xs and xs != x: D.setdefault(xs, ys)
EXTRA = [['نسخة تجريبية {0}', 'Beta version {0}'], ['طبختي: {0}', 'My dish: {0}'], ['{0} · نسخة تجريبية {1}', '{0} · beta version {1}'], ['{0}غ', '{0} g'], ['{0} د', '{0} min'], ['{0} ث', '{0} s'], ['{0} مرات', '{0} times'], ['{0} مرة', '{0} time'], ['{0} يوم', '{0} days'], ['{0} أيام', '{0} days'], ['{0}غم', '{0} g'], ['{0} غم', '{0} g']]
eng = pathlib.Path('/home/claude/i18n/engine.js').read_text(encoding='utf-8')
eng = eng.replace('__DICT__', json.dumps(D, ensure_ascii=False)).replace('__PATTERNS__', json.dumps(EXTRA, ensure_ascii=False))
a = s.index('<script>/* ============ v83: اللغة')
b = s.index('</script>', a)
s = s[:a] + '<script>' + eng + s[b:]

# ---- 2) scan button inside the food search box
rep('''      <input type="search" id="db-food" autocomplete="off" enterkeyhint="search" aria-label="ابحث عن أكلة" placeholder="مثلاً: رز، بيض، راشي، دجاج…" oninput="onFoodSearch('db')" onkeydown="onFoodKey(event,'db')">''',
    '''      <input type="search" id="db-food" autocomplete="off" enterkeyhint="search" aria-label="ابحث عن أكلة" placeholder="مثلاً: رز، بيض، راشي، دجاج…" oninput="onFoodSearch('db')" onkeydown="onFoodKey(event,'db')">
      <button type="button" class="bc-btn" onclick="BC.open('food')" aria-label="امسح باركود المنتج" title="امسح باركود المنتج"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16.5 8v8"/></svg></button>''')
rep('<div class="search-hint" id="db-hint">اكتب أول حرفين وتطلعلك الأكلات، واضغط على اللي تريدها.</div>',
    '<div class="search-hint" id="db-hint">اكتب أول حرفين وتطلعلك الأكلات، واضغط على اللي تريدها. أو امسح الباركود 📷 وندورلك عليه.</div>')
# scan button next to the barcode field in "new product"
rep('<div class="field"><label>الباركود (اختياري)</label><input type="text" id="cf-barcode" placeholder="رقم الباركود إن وجد"></div>',
    '<div class="field"><label for="cf-barcode">الباركود (اختياري)</label><div class="cf-bc"><input type="text" id="cf-barcode" inputmode="numeric" placeholder="رقم الباركود إن وجد"><button type="button" onclick="BC.open(\'cf\')" aria-label="امسح الباركود">📷 امسح</button></div></div>')

# ---- 3) scanner screen, CSS, module
rep('<div id="sheet-backdrop" class="sheet-backdrop" hidden onclick="closeSheet()"></div>',
    (P / 'bc.html').read_text(encoding='utf-8').strip() + '\n\n<div id="sheet-backdrop" class="sheet-backdrop" hidden onclick="closeSheet()"></div>')
rep('.about-copy{', (P / 'bc.css').read_text(encoding='utf-8') + '.about-copy{')
rep('// ================= custom products =================',
    (P / 'bc.js').read_text(encoding='utf-8') + '\n// ================= custom products =================')

# ---- 4) version
rep("const HERO_VER = '83'", "const HERO_VER = '84'")
rep('نسخة تجريبية 83', 'نسخة تجريبية 84')
p.write_text(s, encoding='utf-8')

sw = root / 'sw.js'; t = sw.read_text(encoding='utf-8')
h = hashlib.sha1(s.encode()).hexdigest()[:8]
t2 = re.sub(r"const CACHE = 'hero-83-[0-9a-f]+';", f"const CACHE = 'hero-84-{h}';", t); assert t2 != t
# the barcode reader (~1 MB) is saved on first use, not at install
old = "  if (url.origin === location.origin) { e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req))); return; }"
assert old in t2
t2 = t2.replace(old, """  if (url.origin === location.origin && url.pathname.includes('/vendor/zxing/')) {   // قارئ الباركود: ينحفظ أول مرة ينستعمل
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
""" + old)
sw.write_text(t2, encoding='utf-8')
print('ok', h, 'dict', len(D), 'size', len(s))
