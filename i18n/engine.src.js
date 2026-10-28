/* ============ v83: اللغة الإنگليزية (English) ============
   الواجهة تنكتب بالعربي، وإذا اللغة English هذا المترجم يبدّل كل النصوص اللي تطلع بالصفحة:
   تطابق كامل من القاموس، بعدين قوالب فيها أرقام {0}، بعدين كلمات معروفة داخل الجملة.
   اللغة: hero_lang بالجهاز. أول مرة: المستخدم القديم يبقى عربي، والجديد حسب لغة موبايله. */
(function(){
  'use strict';
  const LS = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  let lang = LS.get('hero_lang');
  if(lang !== 'ar' && lang !== 'en'){
    const existing = !!LS.get('hurr_tracker_v1');
    const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'ar').toLowerCase();
    lang = existing || nav.startsWith('ar') ? 'ar' : 'en';
    LS.set('hero_lang', lang);
  }
  const D = __DICT__;
  const EXTRA_P = __PATTERNS__;
  const AR = /[؀-ۿ]/;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const I18N = window.I18N = {
    lang, en: lang === 'en',
    set(l){ if(l !== 'ar' && l !== 'en') return; LS.set('hero_lang', l); if(l !== lang) location.reload(); },
    t: s => s, food: n => n, miss: new Set()
  };
  document.documentElement.setAttribute('data-lang', lang);
  if(lang !== 'en') return;

  document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr';

  // قوالب: كل مفتاح بيه {0} يصير regex
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PATS = [];
  const addPat = (k, v) => {
    // متغيرين ورا بعض {4}{5} يصيرون مجموعة وحدة، والمتغير ممكن يكون فاضي
    let kk = k, vv = v;
    for(;;){ const m = kk.match(/\{(\d+)\}\{(\d+)\}/); if(!m) break; kk = kk.replace(m[0], '{' + m[1] + '}'); vv = vv.replace('{' + m[1] + '}{' + m[2] + '}', '{' + m[1] + '}').replace('{' + m[2] + '}', ''); }
    const parts = kk.split(/\{(\d+)\}/);
    let re = '^', anchor = '', order = [];
    for(let i = 0; i < parts.length; i++){
      if(i % 2 === 0){ re += esc(parts[i]).replace(/ +/g, '\\s*'); if(parts[i].trim().length > anchor.length) anchor = parts[i].trim(); }
      else { re += '([\\s\\S]*?)'; order.push(+parts[i]); }
    }
    re += '$';
    if(!AR.test(anchor)) return;
    PATS.push({ re: new RegExp(re), v: vv, order, anchor, len: kk.replace(/\{\d+\}/g, '').length });
  };
  Object.keys(D).forEach(k => { if(/\{\d+\}/.test(k)) addPat(k, D[k]); });
  EXTRA_P.forEach(([k, v]) => addPat(k, v));
  PATS.sort((a, b) => b.len - a.len);

  // كلمات وعبارات معروفة داخل جملة أطول (بحدود الكلمة العربية)
  const SAFE1_ = new Set(['سعرة','غم','كغم','سم','مل','لتر','دقيقة','دقايق','ثانية','ثواني','جولة','جولات','عدة','عدات','يوم','أيام','حصة','وجبة','وجبات','نقطة','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت','اليوم','أمس','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','بروتين','كارب','دهون','سعرات','حبة','سنة','تقديري','مطبوخ','نيء','مشوي','مسلوق','مقلي','مرات','مرة','الصدر','الظهر','الكتف','الأرداف','البطن','الترابيس','الترايسبس','البايسبس','الساعد','السمانة','الخواصر','أرجل','ذراع','صدر','ظهر','كتف','بطن']);
  const NOFRAG = new Set(['،', 'ا', 'ب', 'و', 'ول', 'ال', 'بال', 'ج', 'غ', 'ك', 'ه', 'ي', 'د', 'ث']);
  const fragKeys = Object.keys(D).filter(k => !/\{\d+\}/.test(k) && AR.test(k) && k.length >= 2 && !NOFRAG.has(k) && (/\s/.test(k) || SAFE1_.has(k))).sort((a, b) => b.length - a.length);
  const FR = fragKeys.length ? new RegExp('(?<![\\u0621-\\u064A\\u0660-\\u0669])(' + fragKeys.map(esc).join('|') + ')(?![\\u0621-\\u064A])', 'g') : null;

  const cache = new Map();
  function full(c){   // تطابق كامل أو قالب فقط، بدون تخمين
    if(D[c] !== undefined) return D[c];
    if(D[c + '.'] !== undefined) return D[c + '.'].replace(/\.$/, '');
    if(c.endsWith('.') && D[c.slice(0, -1)] !== undefined) return D[c.slice(0, -1)] + '.';
    for(const p of PATS){
      if(p.anchor && !c.includes(p.anchor)) continue;
      const m = c.match(p.re); if(!m) continue;
      let out = p.v, ok = true;
      for(let gi = 0; gi < p.order.length; gi++){
        const g = m[gi + 1]; let gv = g;
        if(AR.test(g)){ gv = full(norm(g)); if(gv === null){ if(p.anchor.length >= 8) gv = core(norm(g)); else { ok = false; break; } } }
        out = out.split('{' + p.order[gi] + '}').join(gv);
      }
      if(ok) return out.replace(/\s{2,}/g, ' ').trim();
    }
    return null;
  }
  function core(c){
    const f = full(c); if(f !== null) return f;
    // جمل ملزوقة ببعض: نترجم كل جملة لحالها
    const parts = c.split(/(?<=[.!؟?])\s+(?=\S)/);
    if(parts.length > 1) return parts.map(x => core(x)).join(' ');
    const dots = c.split(' · ');
    if(dots.length > 1) return dots.map(x => AR.test(x) ? core(x) : x).join(' · ');
    if(FR){
      const out = c.replace(FR, w => D[w]);
      if(AR.test(out)) I18N.miss.add(c);
      return out;
    }
    I18N.miss.add(c); return c;
  }
  function tr(s){
    if(!s || !AR.test(s)) return s;
    const hit = cache.get(s); if(hit !== undefined) return hit;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], c = norm(s);
    const r = lead + core(c).replace(/←/g, '→') + trail;
    if(cache.size < 20000) cache.set(s, r);
    return r;
  }
  I18N.t = tr;
  I18N.food = n => { const e = D[String(n || '').trim()]; return e || null; };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function skipEl(el){ return !el || SKIP.has(el.nodeName) || el.isContentEditable || (el.closest && el.closest('[data-no-tr]')); }
  function skipAttr(el){ return !el || el.nodeName === 'SCRIPT' || el.nodeName === 'STYLE' || (el.closest && el.closest('[data-no-tr]')); }
  function doText(n){ if(skipEl(n.parentNode)) return; const v = n.nodeValue; if(AR.test(v)){ const r = tr(v); if(r !== v) n.nodeValue = r; } }
  function doAttrs(el){
    for(const a of ATTRS){ const v = el.getAttribute && el.getAttribute(a); if(v && AR.test(v)){ const r = tr(v); if(r !== v) el.setAttribute(a, r); } }
    if(el.nodeName === 'INPUT' && /^(button|submit)$/i.test(el.type) && AR.test(el.value)) el.value = tr(el.value);
  }
  function walk(root){
    if(root.nodeType === 3){ doText(root); return; }
    if(root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if(root.nodeType === 1){ if(!skipAttr(root)) doAttrs(root); if(skipEl(root)) return; }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while((n = tw.nextNode())){ if(n.nodeType === 3) doText(n); else if(!skipAttr(n)) doAttrs(n); }
  }
  I18N.walk = walk;
  const mo = new MutationObserver(list => {
    for(const m of list){
      if(m.type === 'childList') m.addedNodes.forEach(walk);
      else if(m.type === 'characterData') doText(m.target);
      else if(m.type === 'attributes' && !skipAttr(m.target)) doAttrs(m.target);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', () => { walk(document.body); if(AR.test(document.title)) document.title = 'HERO'; });
  const wrap = f => (m, ...r) => f.call(window, typeof m === 'string' ? tr(m) : m, ...r);
  window.alert = wrap(window.alert); window.confirm = wrap(window.confirm); window.prompt = wrap(window.prompt);
})();
