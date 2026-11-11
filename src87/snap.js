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
    items = body.items.map(it=>{
      const name = it.name ? exactName(it.name) : null, f = name ? findFood(name) : null;
      return {name: f ? name : null, f, seen: it.seen, grams: Math.max(1, Math.round(it.grams)), conf: it.confidence};
    });
    render();
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
        <div class="snap-top"><div class="snap-name">${esc(dn(it.name))}${it.f.src === 'E' ? ' <small>(تقديري)</small>' : ''}</div><button type="button" class="del" aria-label="حذف" onclick="SNAP.del(${i})">✕</button></div>
        ${it.conf < 0.5 ? `<div class="snap-sub">🤔 مو متأكدين: <span data-no-tr>${esc(it.seen)}</span></div>` : ''}
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

  return {open, close, photo, grams, del, oil, add, find, again};
})();
