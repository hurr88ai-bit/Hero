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
      <div class="goal-note bc-src">المعلومات من Open Food Facts (قاعدة بيانات مفتوحة يكتبها الناس)، فتأكد منها مرة وحدة. بعدها كل ما تمسحه يطلعلك فوراً حتى بدون نت.</div>`;
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
