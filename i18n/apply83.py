import json, re, hashlib, pathlib, sys
root = pathlib.Path('/home/claude/hero')
p = root / 'index.html'
s = p.read_text(encoding='utf-8')
D = json.load(open('/home/claude/i18n/en.json', encoding='utf-8'))
for k in ['هيرو', 'نسخة تجريبية 82', 'نسخة تجريبية 83']:
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

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'expected {count}, found {n}: {old[:80]!r}')
    s = s.replace(old, new)

# 1) engine in <head>, before anything renders
rep('<script>window.HERO_PWA = true;</script>', '<script>window.HERO_PWA = true;</script>\n<script>' + eng + '</script>')

# 2) language picker: welcome screen + Profile card
rep('<section class="ob-step" data-step="0">\n        <div class="ob-word">هيرو</div>',
    '<section class="ob-step" data-step="0">\n        <div class="lang-pick" data-no-tr><button type="button" class="ar" onclick="I18N.set(\'ar\')">عربي</button><button type="button" class="en" onclick="I18N.set(\'en\')">English</button></div>\n        <div class="ob-word">هيرو</div>')
rep('    <div class="card inst-card" id="inst-card" hidden>',
    '''    <div class="card lang-card">
      <h2 data-no-tr>اللغة · Language</h2>
      <div class="lang-pick" data-no-tr><button type="button" class="ar" onclick="I18N.set('ar')">عربي</button><button type="button" class="en" onclick="I18N.set('en')">English</button></div>
    </div>

    <div class="card inst-card" id="inst-card" hidden>''')

# 3) CSS
css = '''
/* ============ v83: اللغة ============ */
.lang-pick{display:flex; gap:4px; justify-content:center; margin:0 auto 14px; background:rgba(255,255,255,.12); border-radius:99px; padding:4px; width:max-content;}
.lang-card .lang-pick{background:var(--card-2); margin:6px 0 0;}
.lang-pick button{width:auto; border:0; background:none; padding:8px 20px; border-radius:99px; font:700 14px var(--f-body); color:inherit; opacity:.75; cursor:pointer;}
html[data-lang="ar"] .lang-pick .ar, html[data-lang="en"] .lang-pick .en{background:#13233f; color:#ffcf4a; opacity:1;}
.onboard .lang-pick{color:#fff;}
html[data-lang="en"] .onboard .lang-pick .en, html[data-lang="ar"] .onboard .lang-pick .ar{background:#ffcf4a; color:#13233f;}
html[dir="ltr"]{direction:ltr;}
html[dir="ltr"] .dot, html[dir="ltr"] .lg-dot, html[dir="ltr"] .lg-line, html[dir="ltr"] .mlegend .sw{margin-left:0; margin-right:6px;}
html[dir="ltr"] .macro-name .dot{margin-right:0;}
html[dir="ltr"] .result, html[dir="ltr"] .day-btn, html[dir="ltr"] .pf-head, html[dir="ltr"] .ach-pop .it, html[dir="ltr"] .ob-en, html[dir="ltr"] .ob-word, html[dir="ltr"] .ob-motto, html[dir="ltr"] .wk-row{text-align:left;}
html[dir="ltr"] .ach-ch .ct, html[dir="ltr"] .wk-val{text-align:right;}
html[dir="ltr"] button[onclick^="shiftDay"]{transform:scaleX(-1);}
html[dir="ltr"] .fab{left:auto; right:max(16px, calc(50% - 304px));}
html[dir="ltr"] .tgl span::after{right:auto; left:3px;}
html[dir="ltr"] .tgl input:checked + span::after{transform:translateX(20px);}
html[dir="ltr"] body{font-family:"IBM Plex Sans Arabic", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;}
'''
rep('.about-copy{', css + '.about-copy{')

# 4) food search in English
rep("    return {...x, key: base, hay: base + ' ' + extra.join(' ')};",
    "    const en = (window.I18N && I18N.en) ? (I18N.food(x.name) || (x.kind === 'recipe' ? I18N.t(x.name) : '')) : '';\n    const ek = en && en !== x.name ? normAr(en) : '';\n    return {...x, key: base, ek, hay: base + ' ' + extra.join(' ') + (ek ? ' ' + ek : '')};")
rep("  if(['خضار','خضروات','خضره','خضرة','خضراوات'].map(normAr).includes(nq))",
    "  if(['خضار','خضروات','خضره','خضرة','خضراوات','vegetables','vegetable','veggies','veg'].map(normAr).includes(nq))")
rep("  if(['فواكه','فواكة','فاكهة','فاكهه','فواكهه','ميوه'].map(normAr).includes(nq))",
    "  if(['فواكه','فواكة','فاكهة','فاكهه','فواكهه','ميوه','fruit','fruits'].map(normAr).includes(nq))")
rep("    if(!toks.every(t=>x.hay.includes(t) && (' ' + x.hay).match(new RegExp(' (ال|بال|ب|و|ول)?' + t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'))))) return;\n    let score = 0;\n    if(x.key===nq) score += 100;\n    if(x.key.startsWith(nq)) score += 50;\n    if(x.key.split(' ').some(w=>w.startsWith(toks[0]))) score += 20;\n    if(x.key.includes(nq)) score += 10;",
    "    if(!toks.every(t=>x.hay.includes(t) && (' ' + x.hay).match(new RegExp(' (ال|بال|ب|و|ول)?' + t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'))))) return;\n    const K = x.ek && /[a-z]/.test(nq) ? x.ek : x.key;\n    let score = 0;\n    if(K===nq) score += 100;\n    if(K.startsWith(nq)) score += 50;\n    if(K.split(' ').some(w=>w.startsWith(toks[0]))) score += 20;\n    if(K.includes(nq)) score += 10;")


# 4b) picked food shows its English name in the box, and English names map back to the stored Arabic key
rep("  document.getElementById(s.input).value = x.name;\n  s.hits = []; renderSearch(c);",
    "  document.getElementById(s.input).value = (x.ek && window.I18N && I18N.en) ? (I18N.food(x.name) || I18N.t(x.name)) : x.name;\n  s.hits = []; renderSearch(c);")
rep("  const hit = SEARCH_INDEX.find(x=>x.key===normAr(name));\n  return hit ? hit.name : name;",
    "  const nn = normAr(name), hit = SEARCH_INDEX.find(x=>x.key===nn) || SEARCH_INDEX.find(x=>x.ek && x.ek===nn);\n  return hit ? hit.name : name;")
rep("  const hit = SEARCH_INDEX.find(x=>x.key===n);\n  return hit ? hit.f : null;",
    "  const hit = SEARCH_INDEX.find(x=>x.key===n) || SEARCH_INDEX.find(x=>x.ek && x.ek===n);\n  return hit ? hit.f : null;")

# 5) install guide follows the app language
rep("  let lang = ls.get(K_LANG) || (langs[0].startsWith('ar') ? 'ar' : 'en');",
    "  let lang = (window.I18N && I18N.lang) || ls.get(K_LANG) || (langs[0].startsWith('ar') ? 'ar' : 'en');")
rep("  function setLang(l){\n    lang = l === 'en' ? 'en' : 'ar'; ls.set(K_LANG, lang);",
    "  function setLang(l){\n    if(window.I18N){ I18N.set(l); return; }\n    lang = l === 'en' ? 'en' : 'ar'; ls.set(K_LANG, lang);")
rep("const sw = () => `<div class=\"inst-lang\">", "const sw = () => `<div class=\"inst-lang\" data-no-tr>")
rep("    return `<div class=\"inst\"${dirAttr()}>", "    return `<div class=\"inst\"${dirAttr()} data-no-tr>")
rep("    return `<div class=\"ia-box inst\"${dirAttr()}>", "    return `<div class=\"ia-box inst\"${dirAttr()} data-no-tr>")

# 6) version
rep("const HERO_VER = '82'", "const HERO_VER = '83'")
rep('نسخة تجريبية 82', 'نسخة تجريبية 83')
p.write_text(s, encoding='utf-8')
sw = root / 'sw.js'; t = sw.read_text(encoding='utf-8')
h = hashlib.sha1(s.encode()).hexdigest()[:8]
t2 = re.sub(r"const CACHE = 'hero-82-[0-9a-f]+';", f"const CACHE = 'hero-83-{h}';", t); assert t2 != t
sw.write_text(t2, encoding='utf-8')
print('ok', h, 'dict', len(D), 'size', len(s))
