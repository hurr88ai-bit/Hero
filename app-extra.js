
/* ============ عافية · محرك المدرب ثلاثي الأبعاد (نموذج مؤقت) ============
   window.Coach3D: يحمّل three.js عند الحاجة فقط، ويرسم جسم تشريحي يسوي التمرين.
   الحركة: منحنيات بالمستوى الجانبي + حركة عكسية ثلاثية الأبعاد. */
window.Coach3D = (function () {
  'use strict';
  const THREE_URL = window.COACH_THREE_URL || new URL('./vendor/three.module.min.js', location.href).href;
  // الجسم التشريحي (MakeHuman بالعضلات): وحدة منفصلة تتحمل ويا بياناتها بس لما يفتح المشغّل. إذا فشلت، يرجع الجسم البسيط
  const MH_URL = window.COACH_MH_URL || './coach-mh.js', MH_BASE = window.COACH_MH_BASE || '';
  let THREE = null, loading = null, MH = null; const FIGS = {}, FIGP = {};

  /* ---------- رياضيات 2D ---------- */
  const R = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const len = a => Math.hypot(a[0], a[1]);
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dirv = d => [Math.cos(d * R), Math.sin(d * R)];
  const angOf = v => Math.atan2(v[1], v[0]) / R;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const smooth = t => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const front = T => [-T[1], T[0]];
  const at = (o, T, F, u, v) => [o[0] + T[0] * u + F[0] * v, o[1] + T[1] * u + F[1] * v];
  function ik2(a, target, L1, L2, bend) {
    const v = sub(target, a), d = len(v);
    const dd = clamp(d, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
    const base = Math.atan2(v[1], v[0]);
    const A = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));
    const th = base + bend * A, mid = [a[0] + L1 * Math.cos(th), a[1] + L1 * Math.sin(th)];
    return [mid, add(mid, mul(unit(sub(target, mid)), L2))];
  }
  const BODY = {
    m: { thigh: 31, shin: 29, torso: 36, neck: 15, upper: 22, fore: 20, foot: 12.5, heel: 3.5, ankleH: 3, chest: 10.2, r: { hip: 7.4, wr: 2.7 } },
    f: { thigh: 29.5, shin: 27.5, torso: 34, neck: 14.2, upper: 20.5, fore: 18.6, foot: 11.5, heel: 3.2, ankleH: 2.8, chest: 11.4, r: { hip: 7.6, wr: 2.4 } }
  };
  const FY = 140;
  const REACH = B => B.upper + B.fore;
  // عدّة: نزول (سلبي) أبطأ وصعود (إيجابي) أسرع، مع وقفة قصيرة
  function rep(t, per) {
    const s = ((t / per) % 1 + 1) % 1;
    if (s < 0.1) return 0;
    if (s < 0.5) return easeIO((s - 0.1) / 0.4);
    if (s < 0.6) return 1;
    if (s < 0.9) return 1 - easeIO((s - 0.6) / 0.3);
    return 0;
  }
  const wave = (t, per) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t / per);
  const legIK = (hip, ank, s, B, bend) => { const r = ik2(hip, ank, B.thigh, B.shin, bend == null ? -1 : bend); return { hip, knee: r[0], ank: r[1], s }; };
  const legFK = (hip, a1, a2, B, s) => { const knee = add(hip, mul(dirv(a1), B.thigh)); return { hip, knee, ank: add(knee, mul(dirv(a2), B.shin)), s: s || dirv(a2 - 90) }; };
  const armIK = (sh, wr, B, bend, hint) => { const r = ik2(sh, wr, B.upper, B.fore, bend == null ? 1 : bend); return { sh, el: hint || r[0], wr: r[1], hd: unit(sub(r[1], r[0])) }; };
  const armFK = (sh, a1, a2, B) => { const el = add(sh, mul(dirv(a1), B.upper)); return { sh, el, wr: add(el, mul(dirv(a2), B.fore)), hd: dirv(a2) }; };
  // جسم نايم على ظهره وأعلى الظهر مثني بزاوية c (الكرنش): أسفل الظهر لاصق، والفقرات تنثني بالتدريج مثل الجسم الحقيقي
  const CURLW = [0.3, 0.65, 1];
  function curlBody(hip, c, B, uDeg) {
    const sp = B.spine; if (!sp) return Object.assign(body(hip, 180 + c, B, uDeg), { cr: 0 });
    const T = dirv(180), F = front(T), P = uv => add(add(hip, mul(T, uv[0])), mul(F, uv[1])), seg = (a, b) => sub(P(b), P(a));
    const q3 = P(sp.s3), q2 = add(q3, rot2(seg(sp.s3, sp.s2), c * CURLW[0])), q1 = add(q2, rot2(seg(sp.s2, sp.s1), c * CURLW[1])), sh = add(q1, rot2(seg(sp.s1, sp.sh), c * CURLW[2]));
    return { hip, T, F, sh, Uh: dirv(uDeg), cr: c, Tu: rot2(T, c) };
  }
  function body(hip, tDeg, B, uDeg) {
    const T = dirv(tDeg), F = front(T);
    return { hip, T, F, sh: add(hip, mul(T, B.torso)), Uh: dirv(uDeg == null ? tDeg : uDeg) };
  }
  function bodyT(hip, T, B, Uh) { T = unit(T); return { hip, T, F: front(T), sh: add(hip, mul(T, B.torso)), Uh: Uh || T }; }
  const standHip = (B, x) => [x == null ? 95 : x, FY - B.ankleH - (B.thigh + B.shin) * 0.995];
  const hang = (sh, B, k) => [sh[0] + 1, sh[1] + REACH(B) * (k || 0.97)];
  const seatedLegs = (hip, B, fwd) => { const l = legIK(hip, [hip[0] + (fwd || 30), FY - B.ankleH], [1, 0], B, -1); return [l, l]; };
  function solveAngle(fn, target, lo, hi) { // bisection on monotone fn
    let a = lo, b = hi;
    for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (fn(m) > target) a = m; else b = m; }
    return (a + b) / 2;
  }
  const bisect = (f, a, b, n) => { const fa = f(a) > 0; for (let i = 0; i < (n || 30); i++) { const m = (a + b) / 2; if ((f(m) > 0) === fa) a = m; else b = m; } return (a + b) / 2; };

  /* ---------- الإيقاع: وقفة، نزول مسيطر، وقفة قصيرة، صعود أسرع ويا نقطة صعبة بالنص ----------
     T: h0 وقفة عند 0، to1 من 0 لـ 1، h1 وقفة عند 1، to0 رجعة لـ 0. pull: الصعود (0→1) هو الجهد (سحب)، وإلا الرجعة هي الجهد (دفع) */
  const minjerk = t => { t = clamp(t, 0, 1); return t * t * t * (10 - 15 * t + 6 * t * t); };
  function tempo(t, T) {
    const per = T.h0 + T.to1 + T.h1 + T.to0; let u = ((t % per) + per) % per;
    const st = k => k + (T.st || 0) * Math.sin(2 * Math.PI * k);
    if (u < T.h0) return 0; u -= T.h0;
    if (u < T.to1) { const k = u / T.to1; return minjerk(T.pull ? st(k) : k); } u -= T.to1;
    if (u < T.h1) return 1; u -= T.h1;
    const k = u / T.to0; return 1 - minjerk(T.pull ? k : st(k));
  }
  const TEMPO = {
    squat: { h0: 0.55, to1: 1.55, h1: 0.12, to0: 1.05, st: 0.06 },
    hinge: { h0: 0.5, to1: 1.6, h1: 0.2, to0: 1.1, st: 0.03 },
    bench: { h0: 0.45, to1: 1.4, h1: 0.15, to0: 0.95, st: 0.07 },
    ohp: { h0: 0.5, to1: 1.3, h1: 0.15, to0: 1.2, st: 0.06 },
    fly: { h0: 0.4, to1: 1.6, h1: 0.15, to0: 1.15 },
    row: { h0: 0.35, to1: 0.95, h1: 0.35, to0: 1.4, pull: true, st: 0.04 },
    pullup: { h0: 0.45, to1: 1.3, h1: 0.3, to0: 1.6, pull: true, st: 0.05 },
    split: { h0: 0.45, to1: 1.45, h1: 0.12, to0: 1.0, st: 0.05 },
    abs: { h0: 0.35, to1: 1.0, h1: 0.4, to0: 1.4, pull: true },   // بطن: شد وثبات بالأعلى ونزول بطيء
    mPush: { h0: 0.4, to1: 1.4, h1: 0.15, to0: 1.0, st: 0.05 },   // مكائن: الجهد بالرجعة لـ 0
    mPull: { h0: 0.35, to1: 1.0, h1: 0.35, to0: 1.4, pull: true, st: 0.04 }   // مكائن: الجهد بالطريق لـ 1
  };

  /* ---------- معالم سطح الجسم ----------
     من الجسم التشريحي (B.lm)، ولو ماكو نقرّبها للجسم البسيط. نقاط الجذع بإطار الجذع: [على طول الجذع من الورك، لكدام] */
  function LM(B) {
    if (B.lm) return B.lm;
    const s = B.torso / 36, T = B.torso, N = B.neck;
    return (B.lm = {
      rT: [0, -1], fr: [[-9, 7.5], [0, 7.5], [14 * s, 7.8], [22 * s, 9.5], [27 * s, 9.6], [32 * s, 8], [T + 2, 4]],
      bk: [[-9, -8], [0, -8], [14 * s, -6.5], [24 * s, -8.8], [32 * s, -8], [T + 2, -5]],
      chest: [26 * s, 9.6], neck: [[0, -T], [0.3, -T - 3], [0.8, -T - 6], [1.2, -T - 9]],
      face: [[2.5, -T - N + 5], [5.5, -T - N + 3.5], [6.6, -T - N + 1], [6.8, -T - N - 2], [5.8, -T - N - 5], [3, -T - N - 7]],
      top: -T - N - 7.7, thF: [[0, 6], [B.thigh * 0.5, 6.2], [B.thigh, 3.8]], shF: [[0, 3], [B.shin * 0.5, 2.6], [B.shin, 2]],
      thR: [[0, 6.2], [B.thigh * 0.5, 5.6], [B.thigh, 3.9]], shR: [[0, 3.8], [B.shin * 0.4, 3.6], [B.shin, 2.3]],
      uaR: [[0, 3.6], [B.upper, 2.8]], faR: [[0, 2.7], [B.fore, 1.9]],
      wd: [[-8, 12], [0, 12.5], [12 * s, 10.4], [24 * s, 13.4], [32 * s, 13], [T + 2, 9]], head: { up: N, fwd: 0.6, r: [6.3, 7.7, 7] }
    });
  }
  function prof(arr, u) {
    if (u <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) if (u <= arr[i][0]) { const a = arr[i - 1], b = arr[i]; return lerp(a[1], b[1], (u - a[0]) / ((b[0] - a[0]) || 1)); }
    return arr[arr.length - 1][1];
  }
  const rot2 = (v, a) => { const c = Math.cos(a * R), s = Math.sin(a * R); return [c * v[0] - s * v[1], s * v[0] + c * v[1]]; };
  const chestPt = (b, B, u, off) => at(b.hip, b.T, b.F, u, prof(LM(B).fr, u) + (off || 0));   // نقطة على وجه الجذع
  const backPt = (b, B, u, off) => at(b.hip, b.T, b.F, u, prof(LM(B).bk, u) - (off || 0));    // نقطة على الظهر
  function facePts(b, B, nk) {   // نقاط الوجه (من الذقن للجبهة) بعد لف الجذع والرقبة والراس
    const lm = LM(B), aT = angOf(b.T) - angOf(lm.rT), aH = angOf(b.Uh || b.T) + 90, n = lm.neck, k = nk || 0;
    let p = add(b.hip, rot2(n[0], aT));
    [[0.3, 0.5], [0.55, 0.85], [0.8, 1]].forEach(([w, kk], i) => { p = add(p, rot2(sub(n[i + 1], n[i]), lerp(aT, aH, w) + k * kk)); });
    return lm.face.map(f => add(p, rot2(sub(f, n[3]), aH)));
  }
  function legFront(leg, B) {    // نقاط على وجه الفخذ والساق
    const lm = LM(B), out = [];
    const seg = (a, c, pr) => { const d = unit(sub(c, a)), nf = [d[1], -d[0]]; pr.forEach(([s, v]) => out.push(add(add(a, mul(d, s)), mul(nf, v)))); };
    seg(leg.hip, leg.knee, lm.thF); seg(leg.knee, leg.ank, lm.shF); return out;
  }
  function surfX(pts, y) {       // أبعد نقطة لكدام على خط السطح عند الارتفاع y
    let m = -1e9;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i]; if ((a[1] - y) * (c[1] - y) > 0) continue;
      const k = Math.abs(c[1] - a[1]) < 1e-6 ? 0 : (y - a[1]) / (c[1] - a[1]); m = Math.max(m, lerp(a[0], c[0], k));
    }
    return m;
  }
  function clearX(pts, y, r) {   // أقل x لمركز دائرة نصف قطرها r حتى ما تدخل بالسطح
    let m = -1e9;
    for (let k = -4; k <= 4; k++) { const dy = r * k / 4, x = surfX(pts, y + dy); if (x > -1e8) m = Math.max(m, x + Math.sqrt(Math.max(0, r * r - dy * dy))); }
    return m;
  }
  const midfoot = (B, ank) => ank[0] - B.heel + 0.43 * (B.foot + B.heel);
  // مركز الثقل (x فقط): الجذع والراس، الذراعين، الأفخاذ، السيقان، القدمين، والحمل [x، الوزن نسبةً للجسم]
  function comX(b, legs, arms, B, load) {
    let m = 0.578 * at(b.hip, b.T, b.F, 0.626 * B.torso, 0)[0], w = 0.578;
    arms.forEach(a => { m += 0.05 * (a.sh[0] + a.el[0] + a.wr[0]) / 3; w += 0.05; });
    legs.forEach(l => { m += 0.1 * lerp(l.hip[0], l.knee[0], 0.433) + 0.0465 * lerp(l.knee[0], l.ank[0], 0.433) + 0.0145 * midfoot(B, l.ank); w += 0.161; });
    if (load) { m += load[0] * load[1]; w += load[1]; }
    return m / w;
  }
  // الرسغ من مكان المقبض: المقبض على بعد g من الرسغ باتجاه الساعد (من الكوع للرسغ)
  function gripArm(sh, handle, B, g, hint, bend) {
    const side = w => { if (!hint) return bend == null ? 1 : bend; const e1 = ik2(sh, w, B.upper, B.fore, 1)[0], e2 = ik2(sh, w, B.upper, B.fore, -1)[0]; return len(sub(e1, hint)) <= len(sub(e2, hint)) ? 1 : -1; };
    let wr = handle.slice();
    for (let k = 0; k < 4; k++) { const r = ik2(sh, wr, B.upper, B.fore, side(wr)); wr = sub(handle, mul(unit(sub(r[1], r[0])), g)); }
    return armIK(sh, wr, B, side(wr), hint);
  }
  // ارتفاع العقلة: الرجلين ما توصل الأرض بالتعليق الكامل
  function hangBar(B) {
    const drop = REACH(B) * 0.985 + 2 + (B.hangDrop || 0) + B.torso + B.thigh * Math.sin(86 * R) + B.shin * Math.sin(100 * R) + B.ankleH;
    return [96, FY - 15 - drop];
  }

  /* ---------- قوالب الحركة ---------- */
  const M = {};
  // السكوات: مركز الثقل (ويا الحمل) يبقى فوك منتصف القدم، والجذع يميل ويا ميلان الساق. بالسميث: البار يمشي عمودي والرجلين كدام شوية
  const SQC = {};
  M.squat = (B, t, P) => {
    const hold = P.hold || 'bw', smith = !!P.smith, lm = LM(B), q = tempo(t, TEMPO.squat);
    const ank = [smith ? 100 : 97, FY - B.ankleH], mf = midfoot(B, ank);
    const cfg = { bar: [0.7, 6, 1.1, 6], goblet: [0.22, 2, 0.68, 8], dbs: [0.32, 4, 0.85, 1], bw: [0, 5, 1.05, 6] }[hold];
    const [rb, lean0, lk, below] = smith ? [0.7, 1, 0.55, 3] : cfg;
    const barU = B.torso + 2.2, barV = prof(lm.bk, barU) + 0.8;   // البار على الترابيس فوك لوح الكتف، غاطس شوية
    function pose(hip) {
      const leg = legIK(hip, ank, [1, 0], B, -1), sa = angOf(sub(leg.knee, ank)) + 90;
      const th = lean0 + lk * Math.max(0, sa), b = body(hip, -90 + th, B, -90 + th * 0.45);
      let arm, load = null;
      if (hold === 'bar') { const bar = at(b.hip, b.T, b.F, barU, barV); arm = gripArm(b.sh, bar, B, 2, at(b.sh, b.T, b.F, -16, -6)); load = [bar[0], rb]; b.bar = bar; }
      else if (hold === 'goblet') { const u = lm.chest[0] + 1.5, c = at(b.hip, b.T, b.F, u, prof(lm.fr, u) + 6.2); arm = armIK(b.sh, at(c, b.T, b.F, 4.75, 0.5), B, 1, at(b.sh, b.T, b.F, -20, 7)); load = [c[0], rb]; }
      else if (hold === 'dbs') { arm = armIK(b.sh, hang(b.sh, B), B, 1); load = [arm.wr[0], rb]; }
      else { const d = dirv(lerp(4, 0, clamp(sa / 30, 0, 1))); arm = armIK(b.sh, add(b.sh, mul(d, REACH(B) * 0.97)), B, 1); arm.tgt2 = add(b.sh, mul(d, REACH(B) + 3)); }
      if (hold === 'bw') {   // الإيدين مادّة كدام ومتراكبة: اليسرى فوك اليمنى
        const armT = Object.assign({}, arm, { tgt2: add(arm.tgt2, [0, -1.3]) }), armB = Object.assign({}, arm, { tgt2: add(arm.tgt2, [0, 1.3]) });
        return { b, leg, arm, arms2: [armT, armB], load, sa };
      }
      return { b, leg, arm, load, sa };
    }
    const key = B.torso + hold + smith;
    const at_ = y => {   // الورك بهذا الارتفاع، ومكانه لكدام/لورا حسب التوازن (أو خط البار بالسميث)
      const f = x => { const o = pose([x, y]); return smith ? o.b.bar[0] - SQC[key].bx : comX(o.b, [o.leg, o.leg], [o.arm, o.arm], B, o.load) - mf; };
      return pose([bisect(f, ank[0] - 45, ank[0] + 14, 26), y]);
    };
    if (!SQC[key]) {
      SQC[key] = { bx: mf - 7 };
      const LL = (B.thigh + B.shin) * 0.985;
      const yTop = bisect(y => { const o = at_(y); return LL - len(sub(o.b.hip, ank)); }, ank[1] - LL - 6, ank[1] - LL * 0.6, 24);
      const yBot = bisect(y => { const o = at_(y); return (o.leg.knee[1] + B.thigh * Math.sin(below * R)) - o.b.hip[1]; }, ank[1] - LL * 0.18, yTop, 24);
      Object.assign(SQC[key], { yTop, yBot });
    }
    const c = SQC[key], o = at_(lerp(c.yTop, c.yBot, q));
    return Object.assign(o.b, { p: q, legs: [o.leg, o.leg], arms: o.arms2 || [o.arm, o.arm] });
  };
  // انحناء من الورك (رومانيان، وسحب منحني): الركبة مثنية شوية وثابتة، الورك يرجع لورا حتى يبقى الثقل فوك منتصف القدم،
  // والبار نازل من الكتف ويمشي ملاصق لوجه الفخذ والساق
  function hingePose(B, th, sa, rb, R0, g, headUp) {
    const ank = [97, FY - B.ankleH], mf = midfoot(B, ank), kn = add(ank, mul(dirv(-90 + sa), B.shin)), A = REACH(B) * 0.985;
    function pose(phi) {
      const hip = add(kn, mul(dirv(-90 - phi), B.thigh)), b = body(hip, -90 + th, B, -90 + th - headUp);
      const leg = { hip, knee: kn, ank, s: [1, 0] }, pts = legFront(leg, B);
      let bar = [b.sh[0], b.sh[1] + A + g];
      for (let k = 0; k < 5; k++) { const bx = Math.max(b.sh[0], clearX(pts, bar[1], R0)), dx = bx - b.sh[0]; bar = [bx, b.sh[1] + Math.sqrt(Math.max(1, (A + g) * (A + g) - dx * dx))]; }
      const wr = add(b.sh, mul(unit(sub(bar, b.sh)), A)), arm = armIK(b.sh, wr, B, 1);
      return { b, leg, arm, bar };
    }
    const f = phi => { const o = pose(phi); return comX(o.b, [o.leg, o.leg], [o.arm, o.arm], B, [o.bar[0], rb]) - mf; };
    return pose(bisect(f, -20, 75, 26));
  }
  M.hinge = (B, t, P) => {
    const q = tempo(t, TEMPO.hinge), db = P.hold === 'dbs';
    const o = hingePose(B, lerp(3, 72, q), lerp(2, 9, q), db ? 0.3 : 0.55, db ? 5.5 : 1.35, db ? 2.8 : 2, lerp(0, 12, q));
    return Object.assign(o.b, { p: q, legs: [o.leg, o.leg], arms: [o.arm, o.arm] });
  };
  // اللنجز: واقف، خطوة لكدام (الكعب ينزل أول)، نزول لحد ما الركبة الخلفية تقرب من الأرض، دفعة من الرجل الكدامية ورجعة لنفس المكان.
  // البلغاري: الرجل الخلفية على البنج، نزول عمودي لحد ما الفخذ الكدامي يوازي الأرض
  const LUNC = {};
  function lungeGeo(B) {
    const k = B.torso + '_' + B.thigh;
    if (LUNC[k]) return LUNC[k];
    const pitchB = 52, ankFy = FY - B.ankleH;
    const ankF = [0, ankFy], knF = add(ankF, mul(dirv(-90 + 7), B.shin));          // الساق الكدامية شبه عمودية
    const hipB = add(knF, mul(dirv(180 + 4), B.thigh));                            // الفخذ الكدامي تقريباً موازي
    const knY = FY - 5.5, dyK = knY - hipB[1];                                     // الركبة الخلفية قريبة من الأرض
    const knB = [hipB[0] - Math.sqrt(Math.max(1, B.thigh * B.thigh - dyK * dyK)), knY];
    const ankBy = FY - B.ankleH - Math.sin(pitchB * R) * (B.foot - 1) * 0.85, dyA = ankBy - knY;
    const ankB = [knB[0] - Math.sqrt(Math.max(1, B.shin * B.shin - dyA * dyA)), ankBy];
    const stride = ankF[0] - ankB[0];
    return (LUNC[k] = { stride, hipBx: hipB[0] - ankB[0], hipBy: hipB[1], pitchB });
  }
  M.lunge = (B, t, P) => {
    const bul = P.kind === 'bulgarian';
    let legB, legF, hip, q, lean;
    if (bul) {
      q = tempo(t, TEMPO.split);
      const ankF = [116, FY - B.ankleH], ankB = [60, FY - 30 - 2.5], sB = unit([-1, 0.12]);
      hip = lerpP([93, FY - 54], [92, FY - 34], q); lean = lerp(2, 8, q);
      legF = legIK(hip, ankF, [1, 0], B, -1); legB = legIK(hip, ankB, sB, B, -1);
    } else {
      const G = lungeGeo(B), per = 3.6, u = ((t / per) % 1 + 1) % 1, x0 = 70, ankY = FY - B.ankleH;
      const seg = (a, b) => minjerk((u - a) / (b - a));
      // مراحل: وقفة | خطوة | نزول | وقفة | صعود | رجعة | وقفة
      const step = u < 0.1 ? 0 : u < 0.3 ? seg(0.1, 0.3) : u < 0.76 ? 1 : u < 0.93 ? 1 - seg(0.76, 0.93) : 0;
      const down = u < 0.24 ? 0 : u < 0.5 ? seg(0.24, 0.5) : u < 0.55 ? 1 : u < 0.76 ? 1 - seg(0.55, 0.76) : 0;
      q = down;
      const xF = x0 + G.stride * step, airF = u > 0.1 && u < 0.3 ? Math.sin(Math.PI * seg(0.1, 0.3)) : u > 0.76 && u < 0.93 ? Math.sin(Math.PI * seg(0.76, 0.93)) : 0;
      const pitchF = u > 0.1 && u < 0.3 ? lerp(0, -14, smoothstep(0.35, 0.9, seg(0.1, 0.3))) * (1 - smoothstep(0.93, 1, seg(0.1, 0.3))) : u > 0.76 && u < 0.93 ? 18 * Math.sin(Math.PI * seg(0.76, 0.93)) : 0;
      const ankF = [xF, ankY - 5.5 * airF - (pitchF < 0 ? Math.sin(-pitchF * R) * B.heel : Math.sin(pitchF * R) * (B.foot - 1) * 0.85) * (airF > 0 ? 1 : 0)];
      const pB = G.pitchB * Math.max(down, 0.55 * smoothstep(0.15, 0.3, u) * (1 - smoothstep(0.8, 0.93, u)) * step, 0);
      const ankB = [x0, ankY - Math.sin(pB * R) * (B.foot - 1) * 0.85];
      const LL = B.thigh + B.shin, standY = ankY - LL * 0.99;
      const hx = lerp(x0 + 3 + G.stride * 0.42 * step, x0 + G.hipBx, down), hy = lerp(standY + 1.5 * step, G.hipBy, down);
      // الورك ينزل بقدر ما تحتاج الرجلين حتى توصل الأرض (الخلفية دائماً، والكدامية كل ما تقرب تنزل)
      const reachY = a => a[1] - Math.sqrt(Math.max(0, Math.pow(LL * 0.985, 2) - Math.pow(hx - a[0], 2)));
      let hyR = Math.max(hy, reachY(ankB)); hyR = Math.max(hyR, lerp(hyR, reachY([xF, ankY]), step * step));
      hip = [hx, hyR]; lean = lerp(1, 6, down);
      legF = legIK(hip, ankF, dirv(pitchF), B, -1); legB = legIK(hip, ankB, dirv(pB), B, -1);
    }
    const b = body(hip, -90 + lean, B, -90 + lean * 0.4);
    const arm = P.hold === 'dbs' ? armIK(b.sh, hang(b.sh, B), B, 1) : armIK(b.sh, [hip[0] + 1, hip[1] - 8], B, 1, add(b.sh, [-6, 14]));
    return Object.assign(b, { p: q, legs: [legB, legF], arms: [arm, arm] });
  };
  M.bridge = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), th = P.kind === 'thrust';
    const anchor = th ? [52, FY - 29] : [48, FY - 2.6 + backV(B) - 0.4];   // الظهر على وجه البساط
    const hip = lerpP(th ? [81, FY - 11] : [84, matHip(B, 84, 180) - 1.5], th ? [88, FY - 30] : [86, FY - 24.6], p);
    let T = unit(sub(anchor, hip));
    if (th) {   // أعلى الظهر (تحت لوح الكتف) مسنود على حافة البنج: سطح الظهر يلمس الحافة، مو العمود الفقري يعبر من البنج
      const C = [58, FY - 28.3], bv = backV(B) - 0.3, d = sub(C, hip), a0 = angOf(T);
      const f = a => { const F2 = front(dirv(a)); return d[0] * F2[0] + d[1] * F2[1] - bv; };
      let lo = a0 - 50, hi = a0 + 50; const s0 = Math.sign(f(lo));
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === s0) lo = m; else hi = m; }
      T = dirv((lo + hi) / 2);
    }
    const b = bodyT(hip, T, B, th ? dirv(angOf(T) + 22) : dirv(180));
    const leg = legIK(hip, [th ? 113 : 110, FY - (th ? 0 : 2.6) - B.ankleH], [1, 0], B, -1);
    let arm;
    if (P.hold === 'bar') arm = armIK(b.sh, at(hip, b.T, b.F, -1, prof(LM(B).fr, 1) + 4.2), B, 1);
    else { arm = floorArm(b, B); arm.hd = [1, 0]; }
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.legpress = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), hip = [78, FY - 36], LL = B.thigh + B.shin;
    const b = bodyT(hip, dirv(-138), B, dirv(-120));
    const d = dirv(-38), dist = lerp(LL * 0.94, LL * 0.46, p);
    const leg = legIK(hip, add(hip, mul(d, dist)), dirv(-128), B, -1);
    const arm = armIK(b.sh, [hip[0] + 6, hip[1] + 4], B, 1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], plate: add(hip, mul(d, dist)), pd: d });
  };
  M.legext = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = [95, FY - 47];
    const b = body(hip, -100, B, -92), kn = add(hip, mul(dirv(3), B.thigh)), sa = lerp(96, 8, p);
    const leg = { hip, knee: kn, ank: add(kn, mul(dirv(sa), B.shin)), s: dirv(sa - 90) };
    const arm = armIK(b.sh, [hip[0] + 5, hip[1] + 3], B, 1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], sa });
  };
  M.legcurl = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), top = FY - 30, hip = [80, top - 7];
    const b = body(hip, -2, B, -14), kn = add(hip, mul(dirv(181), B.thigh)), sa = lerp(182, 292, p);
    const leg = { hip, knee: kn, ank: add(kn, mul(dirv(sa), B.shin)), s: dirv(sa - 90) };
    const arm = armIK(b.sh, [b.sh[0] + 10, top + 6], B, 1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], sa });
  };
  M.calf = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), pitch = 36 * p;
    const ank = [97, FY - B.ankleH - Math.sin(pitch * R) * B.foot * 0.8];
    const hip = [95.5, ank[1] - (B.thigh + B.shin) * 0.995];
    const b = body(hip, -90, B, -90), leg = legIK(hip, ank, dirv(pitch), B, -1);
    const arm = P.hold === 'dbs' ? armIK(b.sh, hang(b.sh, B), B, 1) : armIK(b.sh, [hip[0] + 1, hip[1] - 8], B, 1, add(b.sh, [-6, 14]));
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  // نايم على بنج مستوي: أعلى الظهر والأرداف لازقة بالبنج (الصدر مرفوع شوية = قوس خفيف)، وبدون ما يطوف أو يغطس
  function benchLie(B, x, seatTop, tilt) {
    const lm = LM(B), T = dirv(-(180 - tilt)), F = front(T); let low = -1e9;
    lm.bk.forEach(([u, v]) => { if (u < -9 || u > B.torso + 2) return; low = Math.max(low, u * T[1] + v * F[1]); });
    return { hip: [x, seatTop + 0.3 - low], T, F };
  }
  // نايم على البساط: أوطى نقطة بالظهر (أو البطن إذا منبطح) لازقة على وجه البساط
  const MATC = {};
  function matHip(B, x, tDeg) {
    const k = B.torso + '_' + tDeg; if (MATC[k] != null) return MATC[k];
    const lm = LM(B), T = dirv(tDeg), F = front(T), prone = F[1] > 0, pr = prone ? lm.fr : lm.bk; let low = -1e9;
    pr.forEach(([u, v]) => { if (u < -8 || u > B.torso + 1) return; low = Math.max(low, u * T[1] + v * F[1]); });
    return (MATC[k] = FY - 2.6 + 0.4 - low);
  }
  // الإيد ممدودة على البساط جنب الجسم والكف على الأرض
  function floorArm(b, B) {
    const wy = FY - 2.6 - 1.5, dy = wy - b.sh[1], A = REACH(B) * 0.985, dx = Math.sqrt(Math.max(1, A * A - dy * dy));
    const a = armIK(b.sh, [b.sh[0] + dx, wy], B, 1); a.tgt2 = [b.sh[0] + dx + 2, wy]; return a;
  }
  function headRest(B, sh, T, seatTop) {   // الراس ينزل لحد ما قفاه يلمس البنج
    const hd = LM(B).head, f = a => { const U = dirv(angOf(T) + a), c = add(add(sh, mul(U, hd.up)), mul(front(U), hd.fwd)); return add(c, mul(front(U), -hd.r[2]))[1] - (seatTop + 0.2); };
    return dirv(angOf(T) + bisect(f, -30, 12, 20));
  }
  const backV = B => { let m = 0; LM(B).bk.forEach(([u, v]) => { if (u > 6 && u < B.torso + 1) m = Math.min(m, v); }); return m; };
  // البنج: فوك = البار فوك مفصل الكتف والإيد مفرودة، تحت = البار يلمس أسفل الصدر (خط الحلمة)، والطريق شكل J.
  // الدمبل: ينزل لمستوى الصدر جنبه والكوع تحت، ويطلع يتقارب فوك الكتف. المائل: ينزل للصدر العلوي ويطلع عمودي
  M.press = (B, t, P) => {
    const q = tempo(t, TEMPO.bench), inc = P.inc || 0, seatTop = 110, bar = P.hold === 'bar', lm = LM(B);
    const bl = inc ? { hip: [104, seatTop - B.r.hip * 0.9], T: dirv(-(180 - inc)) } : benchLie(B, 110, seatTop, 5.5), hip = bl.hip, T = bl.T, F = front(T);
    const sh = add(hip, mul(T, B.torso)), Uh = inc ? dirv(angOf(T) + 10) : headRest(B, sh, T, seatTop), b = { hip, T, F, sh, Uh };   // بالمستوي الراس نازل على البنج
    const leg = legIK(hip, [hip[0] + (inc ? 37 : 30), FY - B.ankleH], [1, 0], B, -1);
    const g = bar ? 2 : 2.8, lat = bar ? 7 : 1, A = REACH(B) * 0.985, up = [0, -1];
    // فوك: الرسغ فوك الكتف (بالعالم، عمودي)
    const topY = sh[1] - Math.sqrt(Math.max(1, A * A - lat * lat));
    const hTop = [sh[0] + (inc ? 2.5 : 1.5), topY - g];
    const uB = inc ? lm.chest[0] + 3.2 : lm.chest[0] - (bar ? 1.2 : 0.5);
    const hBot = bar ? chestPt(b, B, uB, 1.1 + 0.3) : chestPt(b, B, uB, inc ? -0.6 : -1.4);
    const s1 = bar ? Math.sin(q * Math.PI / 2) : q;                                   // البار يمشي لجهة البطن أول النزول
    const handle = [lerp(hTop[0], hBot[0], s1), lerp(hTop[1], hBot[1], q)];
    const arm = armIK(sh, sub(handle, mul(up, g)), B, 1);
    return { p: q, hip, T, F, sh, Uh, legs: [leg, leg], arms: [arm, arm], seatTop };
  };
  // جهاز الصدر: المقبض على قوس حول محور فوك الكتف وورا شوية، يبدي جنب الصدر ويندفع لكدام لحد ما الذراع تنفرد تقريباً
  const CPC = {};
  M.chestpress = (B, t, P) => {
    const q = tempo(t, TEMPO.bench), hip = [92, FY - 36], b = body(hip, -100, B, -92), lm = LM(B), g = 2.5;
    const piv = add(b.sh, [8, -60]), hb = add(chestPt(b, B, lm.chest[0] + 1, 0), [2.5, 0]), Rr = len(sub(hb, piv)), a0 = angOf(sub(hb, piv)), key = B.torso + '';
    if (!CPC[key]) CPC[key] = bisect(a => len(sub(add(piv, mul(dirv(a), Rr)), b.sh)) - (REACH(B) * 0.96 + g), a0 - 70, a0, 26);
    const lev = lerp(CPC[key], a0, q), h = add(piv, mul(dirv(lev), Rr));
    const arm = gripArm(b.sh, h, B, g, add(b.sh, [lerp(12, -6, q), 12]), 1);
    return Object.assign(b, { p: q, legs: seatedLegs(hip, B, 28), arms: [arm, arm], piv, lev, a0, aTop: CPC[key], Rr });
  };
  M.fly = (B, t, P) => {
    const q = tempo(t, TEMPO.fly), seatTop = 110, bl = benchLie(B, 110, seatTop, 5.5), hip = bl.hip;
    const T = bl.T, F = front(T), sh = add(hip, mul(T, B.torso));
    const leg = legIK(hip, [hip[0] + 30, FY - B.ankleH], [1, 0], B, -1);
    const k = REACH(B) * 0.92, ph = lerp(4, 78, q), dx = lerp(2.5, 7, q);
    const arm = armIK(sh, [sh[0] + dx, sh[1] - k * Math.cos(ph * R)], B, 1, [sh[0] + 1, sh[1] + 4]);
    return { p: q, hip, T, F, sh, Uh: headRest(B, sh, T, seatTop), legs: [leg, leg], arms: [arm, arm], latK: k * Math.sin(ph * R), seatTop };
  };
  // ضغط الكتف واقف: البار يبدي على الترقوة والكوع كدامه شوية، يطلع بخط شبه عمودي فوك منتصف القدم.
  // الجسم يميل لورا شوية والراس يرجع لورا حتى البار يعبر الوجه، وبعدها الراس والجسم يدخلون تحت البار بالقفلة
  const OHPC = {};
  M.ohp = (B, t, P) => {
    const q = tempo(t, TEMPO.ohp), seated = !!P.seated;
    // فوك: الذراع مفرودة كلها (الهدف أبعد من طول الذراع شوية، ومحسوب معه ارتفاع لوح الكتف)
    const upX = (B.riseUp || 0) + 1.5;
    if (seated) {
      const hip = [95, FY - 36], b = body(hip, -93, B, -90);
      if (P.machine) {   // جهاز الكتف: المقبض يمشي على قوس حول محور ورا الراس
        const piv = add(b.sh, [-30, -16]), hb = add(b.sh, [3.5, -4]), Rr = len(sub(hb, piv)), a0 = angOf(sub(hb, piv)), key = 'm' + B.torso + '_' + upX.toFixed(2);
        if (!OHPC[key]) OHPC[key] = { aTop: bisect(a => len(sub(add(piv, mul(dirv(a), Rr)), b.sh)) - (REACH(B) * 0.985 + 2.5 + upX), a0 - 85, a0, 26) };
        const lev = lerp(OHPC[key].aTop, a0, q), h = add(piv, mul(dirv(lev), Rr));
        const arm = gripArm(b.sh, h, B, 2.5, add(b.sh, [6, 14]), 1); arm.tgt2 = [h[0], h[1] + 2.5];
        return Object.assign(b, { p: q, legs: seatedLegs(hip, B, 30), arms: [arm, arm], piv, lev, a0, aTop: OHPC[key].aTop, Rr });
      }
      const wTop = [b.sh[0] + 1, b.sh[1] - REACH(B) * 0.985 - upX], wBot = [b.sh[0] + 3, b.sh[1] - 4], w = lerpP(wTop, wBot, q);
      const arm = armIK(b.sh, w, B, 1, add(b.sh, [6, 14])); arm.tgt2 = w;   // الكوع دائماً لتحت وكدام شوية (والجانب من عرض الكوع)
      return Object.assign(b, { p: q, legs: seatedLegs(hip, B, 30), arms: [arm, arm] });
    }
    const lm = LM(B), ank = [97, FY - B.ankleH], mf = midfoot(B, ank), LL = (B.thigh + B.shin) * 0.995, A = REACH(B) * 0.985, g = 2, R0 = 1.1;
    const lean = 7 * smoothstep(0.12, 0.42, q), nk = -15 * smoothstep(0.14, 0.34, q), headF = 5 * (1 - smoothstep(0.02, 0.25, q));
    function pose(lean, barX) {    // الورك يتقدم بقدر ما يتوازن الجسم ويا البار
      const f = dx => { const hip = [ank[0] + dx, ank[1] - Math.sqrt(LL * LL - dx * dx)], b = body(hip, -90 - lean, B, -90 - lean + headF + lean * 0.5);
        const leg = legIK(hip, ank, [1, 0], B, -1), arm = armIK(b.sh, [b.sh[0], b.sh[1] + 20], B, 1);
        return comX(b, [leg, leg], [arm, arm], B, [barX == null ? b.sh[0] : barX, 0.35]) - mf; };
      const dx = bisect(f, -8, 12, 22), hip = [ank[0] + dx, ank[1] - Math.sqrt(LL * LL - dx * dx)];
      return { hip, b: body(hip, -90 - lean, B, -90 - lean + headF + lean * 0.5), leg: legIK(hip, ank, [1, 0], B, -1) };
    }
    const key = B.torso + '_' + B.neck;
    if (!OHPC[key]) {
      const top = pose(0), lat = 5;
      const lockX = top.b.sh[0] + 0.4, lockY = top.b.sh[1] - Math.sqrt(Math.pow(A + upX, 2) - lat * lat) - g;
      let bot = pose(7), rack = chestPt(bot.b, B, B.torso - 0.6, R0 + 0.35);
      bot = pose(7, rack[0]); rack = chestPt(bot.b, B, B.torso - 0.6, R0 + 0.35);
      OHPC[key] = { lockX, lockY, rack };
    }
    const c = OHPC[key], o = pose(lean, lerp(c.lockX, c.rack[0], q)), b = o.b;
    let bar = [lerp(c.lockX, c.rack[0], q), lerp(c.lockY, c.rack[1], q)];
    if (q > 0.02) { const face = facePts(b, B, nk); bar[0] = Math.max(bar[0], clearX(face, bar[1], R0 + 0.5)); }
    const arm = gripArm(b.sh, bar, B, g, add(b.sh, [lerp(3, 8, q), lerp(-18, 14, q)]), 1);
    if (len(sub([bar[0], bar[1] + g], b.sh)) > A) arm.tgt2 = [bar[0], bar[1] + g];
    return Object.assign(b, { p: q, nk, legs: [o.leg, o.leg], arms: [arm, arm] });
  };
  M.pike = (B, t, P) => {
    // بايك: الإيدين ثابتة، بالقمة الذراع مفرودة على خط الجذع (شكل ^)، وبالنزول الراس ينزل لكدام الإيدين والكوع ينثني لورا
    const p = tempo(t, TEMPO.bench), wr = [113, FY - 2.6 - B.r.wr - 0.6], ank = [44, FY - 2.6 - B.foot * 0.8 * Math.sin(40 * R) - 5.6], LL = (B.thigh + B.shin) * 0.985, A = REACH(B);
    const hipOn = sh => { const d = sub(sh, ank), L = len(d), a = (LL * LL - B.torso * B.torso + L * L) / (2 * L), h = Math.sqrt(Math.max(0, LL * LL - a * a)), u = unit(d); return add(add(ank, mul(u, a)), mul([u[1], -u[0]], h)); };
    const top = (() => { let best = null; for (let m = -20; m <= 40; m += 0.5) { const sh = add(wr, mul(dirv(-122 - m), A * 0.985)), hp = hipOn(sh); let d = angOf(sub(sh, hp)) - angOf(sub(wr, sh)); d = Math.abs(((d + 540) % 360) - 180); if (!best || d < best.d) best = { d, sh }; } return best.sh; })();   // الذراع على خط الجذع
    const bot = [wr[0] - 6, FY - 2.6 - B.upper * 0.95 - 6];
    const sh = lerpP(top, bot, p), hip = hipOn(sh), b = bodyT(hip, sub(sh, hip), B, dirv(angOf(sub(sh, hip)) + lerp(8, 30, p)));
    const arm = armIK(b.sh, wr, B, 1, add(lerpP(b.sh, wr, 0.5), [-8, -2])); arm.hd = [1, 0];
    const leg = legIK(hip, ank, dirv(40), B, -1);   // واكف على مشط القدم
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.latraise = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = standHip(B), b = body(hip, -90, B, -90);
    const k = REACH(B) * 0.95, ph = lerp(10, 86, p);
    const arm = armIK(b.sh, [b.sh[0] + 4, b.sh[1] + k * Math.cos(ph * R)], B, 1, [b.sh[0] + 2, b.sh[1] + B.upper * Math.cos(ph * R)]);
    const leg = legIK(hip, [97, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], latK: k * Math.sin(ph * R) });
  };
  M.rearfly = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), ank = [97, FY - B.ankleH];
    const kn = add(ank, mul([Math.sin(14 * R), -Math.cos(14 * R)], B.shin));
    const hip = add(kn, mul([-Math.sin(28 * R), -Math.cos(28 * R)], B.thigh));
    const b = body(hip, -24, B, -40), k = REACH(B) * 0.94, ph = lerp(6, 80, p);
    const arm = armIK(b.sh, [b.sh[0] + 2, b.sh[1] + k * Math.cos(ph * R)], B, 1, [b.sh[0], b.sh[1] + B.upper * Math.cos(ph * R)]);
    const leg = legIK(hip, ank, [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], latK: k * Math.sin(ph * R) });
  };
  M.pulldown = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = [92, FY - 40], b = body(hip, lerp(-98, -106, p), B, lerp(-96, -100, p));
    const wTop = [b.sh[0] + 3, b.sh[1] - REACH(B) * 0.92], wBot = [b.sh[0] + 8, b.sh[1] - 2];
    const arm = armIK(b.sh, lerpP(wTop, wBot, p), B, 1, lerpP(add(b.sh, [2, -20]), add(b.sh, [-4, 14]), p));
    return Object.assign(b, { p, legs: seatedLegs(hip, B, 24), arms: [arm, arm] });
  };
  M.bandpull = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = standHip(B), b = body(hip, -86, B, -92);
    const wTop = [b.sh[0] + 14, b.sh[1] - REACH(B) * 0.86], wBot = [b.sh[0] + 6, b.sh[1] + 2];
    const arm = armIK(b.sh, lerpP(wTop, wBot, p), B, 1, lerpP(add(b.sh, [8, -18]), add(b.sh, [-4, 14]), p));
    const leg = legIK(hip, [97, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  // العقلة: تبدي معلق والإيد مفرودة، تسحب لحد ما الذقن يعبر العقلة، والصدر يطلع لجهة العقلة (ميلان خفيف لورا)، والنزول أبطأ
  // العقلة: تبدي معلّق والذراع مفرودة كلها، تسحب والكوع ينزل لتحت ولكدام شوية، الصدر يطلع والجسم يميل لورا شوية،
  // والذقن يعبر العقلة بـ 2 والرقبة والصدر ورا العقلة بدون ما يلمسونها. النزول أبطأ
  function hangPose(B, sh, T, Uh) { const b = { sh, T, F: front(T), Uh }; b.hip = sub(sh, mul(T, B.torso)); return b; }
  const PUC = {};
  M.pullup = (B, t, P) => {
    const q = tempo(t, TEMPO.pullup), bar = hangBar(B), A = REACH(B) * 0.985, g = 2, R0 = 1.3 + 0.9;
    const T = dirv(lerp(-91, -100, q)), Uh = dirv(lerp(-91, -96, q)), grip = [bar[0], bar[1] + g];
    const key = B.torso + '_' + (B.hangDrop || 0);
    if (!PUC[key]) {
      const sh0 = [bar[0] - 1, bar[1] + A + g + (B.hangDrop || 0)], Tt = dirv(-100), Ut = dirv(-96);
      const bt = hangPose(B, sh0, Tt, Ut), face = facePts(bt, B, 0), chin = face.reduce((m, p) => p[1] > m[1] ? p : m, face[0]);
      const topY = bar[1] - 2 - (chin[1] - sh0[1]);
      // الوجه والرقبة والصدر ورا العقلة: نرجّع الجسم لورا لحد ما كلها تبعد عن العقلة
      const b1 = hangPose(B, [sh0[0], topY], Tt, Ut), pts = facePts(b1, B, 0);
      for (let u = B.torso - 12; u <= B.torso + 3; u += 1) pts.push(chestPt(b1, B, u, 0));
      pts.sort((a, c) => a[1] - c[1]);
      const cx = clearX(pts, bar[1], R0), topX = Math.min(sh0[0], sh0[0] - (cx - bar[0]));
      PUC[key] = { sh0, top: [topX, topY] };
    }
    const c = PUC[key], k = q * q * (3 - 2 * q) * 0.35 + q * 0.65;   // الجسم يرجع لورا أكثر بآخر السحبة
    const sh = [lerp(c.sh0[0], c.top[0], k), lerp(c.sh0[1], c.top[1], q)];
    { // الوجه والرقبة والصدر ورا العقلة طول الطريق (مو بس فوك): إذا قربت، الجسم يرجع لورا
      const bt = hangPose(B, sh, T, Uh), pts = facePts(bt, B, 0);
      for (let u = B.torso - 12; u <= B.torso + 3; u += 1) pts.push(chestPt(bt, B, u, 0));
      pts.sort((a, c2) => a[1] - c2[1]); const cx = clearX(pts, bar[1], R0); if (cx > bar[0]) sh[0] -= cx - bar[0];
    }
    const b = hangPose(B, sh, T, Uh);
    const arm = armIK(sh, grip, B, 1, [sh[0] + lerp(-1, 3, q), sh[1] + lerp(-18, 10, q)]); arm.tgt2 = grip;
    const leg = legFK(b.hip, lerp(86, 78, q), lerp(100, 98, q), B);
    return Object.assign(b, { p: q, legs: [leg, leg], arms: [arm, arm], barY: bar[1], barX: bar[0] });
  };
  // السحب المنحني: الجذع ثابت على ميلان ~35° عن الأرض، البار يطلع ملاصق للفخذ لحد أسفل البطن، والكوع لورا
  const ROWC = {};
  M.row = (B, t, P) => {
    const style = P.style || 'cable', q = tempo(t, TEMPO.row);
    if (style === 'bent') {
      const db = !!P.db, key = B.torso + (db ? 'd' : 'b');
      if (!ROWC[key]) ROWC[key] = hingePose(B, db ? 52 : 56, 12, db ? 0.3 : 0.5, db ? 0.2 : 1.35, db ? 2.8 : 2, 18);
      const o = ROWC[key], b = Object.assign({}, o.b), g = db ? 2.8 : 2, A = REACH(B) * 0.985 + g;
      // آخر السحبة: البار على أسفل البطن، والدمبل جنب الخصر
      const u1 = db ? 0.4 * B.torso : 0.33 * B.torso, end = db ? at(b.hip, b.T, b.F, u1, 1.5) : chestPt(b, B, u1, 1.1 + 0.35);
      const pts = legFront(o.leg, B);
      let bar = lerpP(o.bar, end, q);
      bar = add(bar, mul(b.T, -3.5 * Math.sin(Math.PI * q)));                      // قوس خفيف: البار يمشي لورا ويا الفخذ
      if (!db) bar[0] = Math.max(bar[0], clearX(pts, bar[1], 1.35));
      if (len(sub(bar, b.sh)) > A) bar = add(b.sh, mul(unit(sub(bar, b.sh)), A));
      const arm = gripArm(b.sh, bar, B, g, at(b.sh, b.T, b.F, -8, -12), 1);
      return Object.assign(b, { p: q, legs: [o.leg, o.leg], arms: [arm, arm] });
    }
    // الكيبل الأرضي: ميلان خفيف لكدام بالمدّة، والجذع يعدل بالسحبة، والمقبض يوصل للبطن
    const floor = style === 'band';
    const hip = floor ? [70, FY - 7] : [70, FY - 26], b = body(hip, lerp(-76, -93, q), B, lerp(-80, -91, q));
    const u1 = 0.42 * B.torso, end = chestPt(b, B, u1, 2.9);
    const ext = add(b.sh, mul(unit([1, 0.28]), REACH(B) * 0.99)), wr = lerpP(ext, sub(end, [2.5, 0]), q);   // بالرجعة الذراع تنفرد كلها
    const arm = armIK(b.sh, wr, B, 1, lerpP(add(b.sh, [14, 10]), add(b.sh, [-12, 12]), q));
    if (!floor) arm.tgt2 = add(b.sh, mul(unit(sub(wr, b.sh)), len(sub(wr, b.sh)) + 5 * (1 - smoothstep(0, 0.7, q))));
    const leg = floor ? legFK(hip, 1, 2, B, dirv(-88)) : legIK(hip, [hip[0] + 50, FY - 18], dirv(-86), B, -1);
    return Object.assign(b, { p: q, legs: [leg, leg], arms: [arm, arm] });
  };
  const INV = {};
  M.invrow = (B, t, P) => {
    const p = tempo(t, TEMPO.row), heel = [150, FY - B.ankleH], W = [67.1, FY - 52 + 6.6];   // الرسغ تحت الحافة: الكف على وجه الحافة والأصابع تلف فوك الطاولة
    const shAt = beta => { const d = dirv(180 + beta); return add(heel, mul(d, B.shin + B.thigh + B.torso)); };
    if (!INV[B.torso]) {
      INV[B.torso] = { b0: solveAngle(bt => len(sub(shAt(bt), W)), REACH(B) * 0.97, 0, 40), b1: solveAngle(bt => len(sub(shAt(bt), W)), 17, 0, 60) };
    }
    const beta = lerp(INV[B.torso].b0, INV[B.torso].b1, p), d = dirv(180 + beta);
    const kn = add(heel, mul(d, B.shin)), hip = add(kn, mul(d, B.thigh)), b = bodyT(hip, d, B, dirv(180 + beta - 12));
    const arm = armIK(b.sh, W, B, 1, add(b.sh, [lerp(0, -8, p), lerp(-10, 6, p)]));
    const leg = { hip, knee: kn, ank: heel, s: dirv(-70) };
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.curl = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = standHip(B), b = body(hip, -90, B, -90);
    const arm = armFK(b.sh, 91, lerp(86, -60, p), B);
    const leg = legIK(hip, [97, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.pushdown = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), hip = standHip(B, 94), b = body(hip, -84, B, -86);
    const arm = armFK(b.sh, 92, lerp(-14, 86, p), B);
    const leg = legIK(hip, [97, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.ohtri = (B, t, P, D) => {
    const p = tempo(t, TEMPO.mPush), hip = standHip(B), b = body(hip, -90, B, -88);
    // العضد عمودي جنب الراس والكوع للسقف وثابت طول الحركة (بس الساعد يتحرك)؛ الساعد ينزل ورا الراس لحد ما يعبر الموازي شوية، والدمبل عمودي معلّق من الكفين
    const sw = D ? D.sw : 14.8, dx = Math.min(sw - 3.2, B.fore * 0.9), Lp = Math.sqrt(B.fore * B.fore - dx * dx);
    const el = add(b.sh, mul(dirv(-96), B.upper)), fa = lerp(-100, -226, p), arm = { sh: b.sh, el, wr: add(el, mul(dirv(fa), Lp)), hd: dirv(fa), rel: 1, elLat: sw };
    const leg = legIK(hip, [97, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.dips = (B, t, P) => {
    const p = tempo(t, TEMPO.bench), W = [70, FY - 32];
    const sh = lerpP([72, W[1] - REACH(B) * 0.95], [76, W[1] - 20], p);
    const b = { sh, T: dirv(-93), F: front(dirv(-93)), Uh: dirv(-88) };
    b.hip = sub(sh, mul(b.T, B.torso));
    const arm = armIK(sh, W, B, 1, add(sh, [lerp(-3, -14, p), 12]));
    arm.hd = [1, 0];
    const leg = legIK(b.hip, [148, FY - B.ankleH], dirv(-78), B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  function pushBody(B, beta, pivot, knees) {
    const D = [Math.cos(beta * R), -Math.sin(beta * R)], s = front(D), nu = [s[1], -s[0]];
    if (knees) { const kn = pivot, hip = add(kn, mul(D, B.thigh)), sh = add(hip, mul(D, B.torso)); return { D, kn, hip, sh, ank: add(kn, mul(dirv(179), B.shin)), s: dirv(176) }; }   // الساق والقدم على البساط   // القدم ممدودة ويا خط الساق، الباطن للسقف
    const ank = add(sub(pivot, mul(s, B.foot - 1)), mul(nu, B.ankleH));
    const kn = add(ank, mul(D, B.shin)), hip = add(kn, mul(D, B.thigh)), sh = add(hip, mul(D, B.torso));
    return { D, s, ank, kn, hip, sh };
  }
  const PUSH = {};
  M.pushup = (B, t, P) => {
    const p = tempo(t, TEMPO.bench), fy = 137, knees = !!P.knees, pivot = knees ? [62, fy - 4.8] : [30, fy], wy = fy - B.r.wr;
    const key = B.torso + (knees ? 'k' : '');
    if (!PUSH[key]) {
      const f = bt => -pushBody(B, bt, pivot, knees).sh[1];
      const bTop = solveAngle(bt => pushBody(B, bt, pivot, knees).sh[1], wy - Math.sqrt(Math.pow(REACH(B) * 0.975, 2) - 32), 0, 60);
      const bBot = solveAngle(bt => pushBody(B, bt, pivot, knees).sh[1], fy - (B.chest + (knees ? 6.4 : 3.2)), 0, 60);
      PUSH[key] = { bTop, bBot, wx: pushBody(B, bTop, pivot, knees).sh[0] - 4 };
    }
    const c = PUSH[key], pb = pushBody(B, lerp(c.bTop, c.bBot, p), pivot, knees);
    const T = pb.D, F = front(T), arm = armIK(pb.sh, [c.wx, wy], B, 1); arm.hd = [1, 0];
    const leg = { hip: pb.hip, knee: pb.kn, ank: pb.ank, s: pb.s };
    return { p, hip: pb.hip, T, F, sh: pb.sh, Uh: dirv(angOf(T) - 5), legs: [leg, leg], arms: [arm, arm] };
  };
  M.plank = (B, t, P) => {
    const fy = 137, pivot = [30, fy], bob = 0.4 * Math.sin(t * 2.2);
    const key = 'pl' + B.torso;
    if (!PUSH[key]) PUSH[key] = { b: solveAngle(bt => pushBody(B, bt, pivot).sh[1], fy - 6 - B.upper * 0.98, 0, 40) };
    const pb = pushBody(B, PUSH[key].b + bob * 0.3, pivot), T = pb.D, F = front(T);
    const el = [pb.sh[0] + 1, fy - 6.2], wr = [el[0] + B.fore * 0.98, fy - 5.6];   // الساعد فوك البساط مو داخل بي
    const arm = { sh: pb.sh, el, wr, hd: [1, 0] };
    const leg = { hip: pb.hip, knee: pb.kn, ank: pb.ank, s: pb.s };
    return { p: 0.5 + 0.5 * Math.sin(t * 2.2), hip: pb.hip, T, F, sh: pb.sh, Uh: dirv(angOf(T) + 8), legs: [leg, leg], arms: [arm, arm] };
  };
  M.crunch = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), hip = [96, matHip(B, 96, 180)], b = curlBody(hip, lerp(0, 36, p), B, lerp(180, 232, p));   // أسفل الظهر يبقى على البساط، بس الكتف ولوح الكتف يرتفعون
    const leg = legIK(hip, [122, FY - 2.6 - B.ankleH], [1, 0], B, -1);
    // الإيدين ورا الراس: الرسغ ورا الأذن والأصابع تلف على مؤخرة الراس (ماسكته، مو داخلة بي)، والكوع مفتوح لبرّه — الإيدين تمشي ويا الراس، ما تسحبه
    const hd = LM(B).head, U = b.Uh, Fu = front(U), ear = add(add(b.sh, mul(U, hd.up - 1)), mul(Fu, hd.fwd - 1.5));
    const arm = armIK(b.sh, ear, B, 1, add(add(b.sh, mul(U, 6)), mul(Fu, 1)));
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.deadbug = (B, t, P) => {
    const hip = [96, matHip(B, 96, 180)], b = body(hip, 180, B, 180), per = 3.2;
    const u = (((t / per) % 1) + 1) % 1 * 2, sw = x => Math.pow(Math.sin(Math.PI * x), 2), eA = u < 1 ? sw(u) : 0, eB = u < 1 ? 0 : sw(u - 1);   // كل جهة تنفتح وترجع بنعومة (بلا بداية مفاجئة)
    const legAt = e => Object.assign(legFK(hip, lerp(-88, -8, e), lerp(2, -8, e), B), { pf: 1 });
    const armAt = e => { const a = lerp(-88, -172, e); return armFK(b.sh, a, a, B); };
    return Object.assign(b, { p: Math.max(eA, eB), legs: [legAt(eB), legAt(eA)], arms: [armAt(eA), armAt(eB)] });
  };
  M.legraise = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), hip = [92, matHip(B, 92, 180)], b = body(hip, 180, B, 180), la = lerp(-3, -84, p);
    const leg = legFK(hip, la, la, B);
    const arm = floorArm(b, B); arm.hd = [1, 0];
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  // بلانك جانبي: نبنيه كأنه نايم على ظهره (الجسم خط مستقيم)، وبعدين المحرك يقلبه على جنبه (sideRoll): الساعد تحت الكتف والرجلين فوك بعض
  M.sideplank = (B, t, P) => {
    const hip = [96, 100], b = body(hip, 180, B, 180 + 0.6 * Math.sin(2 * Math.PI * t / 4)), leg = legFK(hip, 0, 0, B);
    const arm = armFK(b.sh, 0, 0, B);
    return Object.assign(b, { p: 0, legs: [leg, leg], arms: [arm, arm], side: 1, breath: Math.sin(2 * Math.PI * t / 4) });
  };
  // كرنش الدراجة: الكتف مرفوع والإيدين ورا الراس، رجل تنثني للصدر والثانية تنفرد مايلة (ما تلمس الأرض)، والجذع يلف حتى الكوع يروح للركبة المعاكسة
  M.bicycle = (B, t, P) => {
    const per = 2.4, ph = 2 * Math.PI * t / per, eL = 0.5 + 0.5 * Math.cos(ph), eR = 1 - eL;
    const hip = [96, matHip(B, 96, 180)], b = curlBody(hip, 32, B, 226);
    const legAt = e => legFK(hip, lerp(-34, -114, e), lerp(-22, -14, e), B);
    const hd = LM(B).head, U = b.Uh, Fu = front(U), ear = add(add(b.sh, mul(U, hd.up - 1)), mul(Fu, hd.fwd - 1.5));
    const arm = armIK(b.sh, ear, B, 1, add(add(b.sh, mul(U, 6)), mul(Fu, 1)));
    return Object.assign(b, { p: eL, legs: [legAt(eL), legAt(eR)], arms: [arm, arm], tw: 52 * (eL - eR) });
  };
  M.superman = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), hip = [80, matHip(B, 80, -2)], b = body(hip, lerp(-2, -16, p), B, lerp(-8, -26, p)), la = lerp(182, 194, p);
    // الذراعين مفرودات لقدّام فوك الراس (مو مثنيات)، بالبداية الكفوف على البساط وبالقمة ترتفع ويا الصدر
    const L = REACH(B) * 0.985, a0 = Math.asin(clamp((FY - 2.6 - 5.8 - b.sh[1]) / L, -1, 1)) / R, aa = lerp(a0, -26, p);
    const leg = legFK(hip, la, la, B, dirv(la - 6));   // القدم ممدودة لورا، الأصابع ما تغطس بالبساط
    const arm = armFK(b.sh, aa, aa, B); arm.tgt2 = add(b.sh, mul(dirv(aa), L + 16));   // أبعد من المدى: الكوع ينفرد تمامًا
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  const BELT = { gr: Math.tan(5.7 * R), bx0: 24, by0: 136 };
  M.walk = (B, t, P) => {
    const tread = !!P.tread, per = tread ? 1.2 : 1.05, ph = ((t / per) % 1 + 1) % 1;
    const gr = tread ? BELT.gr : 0, by0 = tread ? BELT.by0 : FY, bx0 = BELT.bx0;
    const groundY = x => by0 - (x - bx0) * gr;
    const hx = 90, LL = B.thigh + B.shin, stride = (tread ? 12.5 : 15) * B.thigh / 31;
    const bob = 1.1 * Math.cos(4 * Math.PI * (ph - 0.3)), hip = [hx, groundY(hx) - B.ankleH - LL * 0.962 - bob];
    const b = body(hip, tread ? -84 : -87, B, -87);
    const legAt = q => {
      q = ((q % 1) + 1) % 1;
      let x, lift = 0, pitch, u;
      if (q < 0.6) { u = q / 0.6; x = hx + stride - 2 * stride * u; pitch = u < 0.1 ? lerp(-12, 0, u / 0.1) : (u > 0.72 ? lerp(0, 30, (u - 0.72) / 0.28) : 0); }
      else { u = (q - 0.6) / 0.4; x = hx - stride + 2 * stride * smooth(u); lift = 6.5 * Math.sin(Math.PI * u); pitch = lerp(30, -12, smooth(u)); }
      const ank = [x, groundY(x) - B.ankleH - lift];
      if (pitch > 0) ank[1] -= Math.sin(pitch * R) * (B.foot - 1) * 0.85;
      if (pitch < 0) ank[1] -= Math.sin(-pitch * R) * B.heel;
      const r = ik2(hip, ank, B.thigh, B.shin, -1);
      return { hip, knee: r[0], ank: r[1], s: dirv(pitch - (tread ? 5.7 : 0)) };
    };
    const armAt = q => { const a1 = 90 + (tread ? 21 : 26) * Math.cos(2 * Math.PI * q); return armFK(b.sh, a1, a1 - (tread ? 40 : 50), B); };
    return Object.assign(b, { p: ph, legs: [legAt(ph + 0.5), legAt(ph)], arms: [armAt(ph + 0.5), armAt(ph)], belt: t * 2 * stride / (0.6 * per) });
  };
  M.bike = (B, t, P) => {
    const per = 1.1, th = 2 * Math.PI * t / per, hip = [88, FY - 66], b = body(hip, -58, B, -70);
    const crank = [104, FY - 24], cr = 11;
    const legAt = a => { const pd = add(crank, [cr * Math.cos(a), cr * Math.sin(a)]); return legIK(hip, add(pd, [-1, -B.ankleH]), dirv(12 * Math.sin(a)), B, -1); };
    const arm = armIK(b.sh, [130, FY - 84], B, 1);
    return Object.assign(b, { p: (th / (2 * Math.PI)) % 1, legs: [legAt(th + Math.PI), legAt(th)], arms: [arm, arm], crank: th });
  };
  M.jacks = (B, t, P) => {
    // قفزة خفيفة: الرجلين تطلع من الأرض بنص الحركة وتنزل على أطراف الأصابع، والركبة تنثني شوية بالهبوط
    const p = wave(t, 1.1), lift = 3.2 * Math.pow(Math.sin(2 * Math.PI * t / 1.1), 2), hip0 = standHip(B), hip = [hip0[0], hip0[1] + 1.8 * (1 - Math.pow(Math.sin(2 * Math.PI * t / 1.1), 2)) - lift];
    const b = body(hip, -90, B, -90), k = REACH(B) * 0.96, ph = lerp(12, 168, p);
    const arm = armIK(b.sh, [b.sh[0] + 2, b.sh[1] + k * Math.cos(ph * R)], B, 1, [b.sh[0], b.sh[1] + B.upper * Math.cos(ph * R)]);
    const legSpread = p, pitch = 22 * Math.min(1, lift / 2), ank = [97, FY - B.ankleH - lift - Math.sin(pitch * R) * (B.foot - 1) * 0.8];
    const leg = legIK(hip, ank, dirv(pitch), B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], latK: k * Math.sin(ph * R), spread: legSpread });
  };
  M.march = (B, t, P) => {
    const per = 1.3, ph = ((t / per) % 1 + 1) % 1, hip = standHip(B), b = body(hip, -89, B, -89);
    const legAt = q => { const lift = Math.max(0, Math.sin(2 * Math.PI * q)); return legFK(hip, lerp(89, 10, lift), lerp(91, 96, lift), B, [1, 0]); };
    const armAt = q => { const a1 = 90 - 32 * Math.sin(2 * Math.PI * q); return armFK(b.sh, a1, a1 - 70, B); };
    const L = legAt(ph + 0.5), Rr = legAt(ph);
    const fix = l => { if (l.ank[1] > FY - B.ankleH) l.ank[1] = FY - B.ankleH; return l; };
    return Object.assign(b, { p: ph, legs: [fix(L), fix(Rr)], arms: [armAt(ph), armAt(ph + 0.5)] });
  };

  // ---- مكائن وكيبل ----
  M.seatabd = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), hip = [95, FY - 44], b = body(hip, -97, B, -91);
    const kn = add(hip, mul(dirv(4), B.thigh)), ank = add(kn, mul(dirv(94), B.shin));
    const leg = { hip, knee: kn, ank, s: dirv(8) };
    const arm = armIK(b.sh, [hip[0] + 3, hip[1] + 1], B, 1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], open: P.add ? p : 1 - p });
  };
  M.kickback = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), ank = [96, FY - B.ankleH];
    const hip = [91, ank[1] - (B.thigh + B.shin) * 0.985], b = body(hip, -66, B, -74);
    const sup = legIK(hip, ank, [1, 0], B, -1);
    const a1 = lerp(142, 84, p), work = legFK(hip, a1, a1 + 10, B, dirv(a1 - 70));
    const arm = armIK(b.sh, [b.sh[0] + REACH(B) * 0.8, b.sh[1] + 12], B, 1);
    return Object.assign(b, { p, legs: [sup, work], arms: [arm, arm] });
  };
  M.donkey = (B, t, P) => {
    const p = tempo(t, TEMPO.mPull), MT = 2.6, kn = [80, FY - MT - 3.4], hip = [kn[0] + 1, kn[1] - B.thigh];   // على البساط (سمكه 2.6)
    const shY = FY - MT - B.r.wr - 0.6 - REACH(B) * 0.97, ty = clamp((shY - hip[1]) / B.torso, -0.8, 0.8);
    const T = [Math.sqrt(1 - ty * ty), ty], b = bodyT(hip, T, B, dirv(angOf(T) + 16));
    const arm = armIK(b.sh, [b.sh[0] + 1.5, FY - MT - B.r.wr - 0.6], B, 1); arm.hd = [1, 0];
    const sup = { hip, knee: kn, ank: add(kn, mul(dirv(180), B.shin)), s: dirv(176) };
    const a1 = lerp(186, 93, p), work = legFK(hip, a1, a1 + 90 - 3 * p, B, dirv(a1 - 4 + 85 * p));   // القدم مثنية (أصابع لتحت الساق) والباطن للسقف بالقمة
    return Object.assign(b, { p, legs: [sup, work], arms: [arm, arm] });
  };
  M.seatcalf = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), hip = [92, FY - 46], b = body(hip, -86, B, -84), pitch = lerp(28, -14, p);
    const kn0 = add(hip, mul(dirv(0), B.thigh)), baseY = kn0[1] + B.shin;
    const ank = [kn0[0] - 1, baseY - Math.sin(pitch * R) * B.foot * 0.8];
    const leg = legIK(hip, ank, dirv(pitch), B, -1);
    const arm = armIK(b.sh, add(leg.knee, [-5, -11.2]), B, 1);   // الكف على وجه وسادة الركبة من فوك
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm], blockY: baseY + B.ankleH });
  };
  M.pecdeck = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), rev = !!P.rev, hip = [92, FY - 38], b = body(hip, rev ? -84 : -97, B, rev ? -86 : -92);
    const k = REACH(B) * 0.93, ph = rev ? lerp(84, -14, p) : lerp(-16, 80, p);
    const wr = [b.sh[0] + k * Math.cos(ph * R), b.sh[1] + 4];
    const arm = armIK(b.sh, wr, B, 1, add(lerpP(b.sh, wr, 0.5), [0, 5]));
    return Object.assign(b, { p, legs: seatedLegs(hip, B, 28), arms: [arm, arm], latK: k * Math.sin(ph * R) });
  };
  // جهاز السحب: الصدر على المسند، المقبض على قوس حول محور كدام وفوك، يرجع لجنب الأضلاع والكوع لورا
  const MRC = {};
  M.mrow = (B, t, P) => {
    const q = tempo(t, TEMPO.mPull), hip = [90, FY - 38], b = body(hip, -92, B, -90), g = 2.5;
    const piv = add(b.sh, [20, -56]), hf = add(b.sh, [REACH(B) * 0.86 + g, 8]), Rr = len(sub(hf, piv)), a0 = angOf(sub(hf, piv)), key = B.torso + '';
    if (!MRC[key]) MRC[key] = bisect(a => add(piv, mul(dirv(a), Rr))[0] - (b.sh[0] + 6), a0, a0 + 80, 26);
    const lev = lerp(a0, MRC[key], q), h = add(piv, mul(dirv(lev), Rr));
    const arm = gripArm(b.sh, h, B, g, add(b.sh, [lerp(14, -14, q), lerp(9, 12, q)]), 1);
    return Object.assign(b, { p: q, legs: seatedLegs(hip, B, 26), arms: [arm, arm], piv, lev, a0, aTop: MRC[key], Rr });
  };
  M.facepull = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), hip = standHip(B, 92), b = body(hip, -93, B, -90);
    const wF = [b.sh[0] + REACH(B) * 0.9, b.sh[1] - 8], wB = [b.sh[0] + 6, b.sh[1] - 15];
    const arm = armIK(b.sh, lerpP(wB, wF, p), B, 1, lerpP(add(b.sh, [-4, -14]), add(b.sh, [18, -6]), p));
    const leg = legIK(hip, [95, FY - B.ankleH], [1, 0], B, -1);
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  const HYC = {};
  M.hyper = (B, t, P) => {
    const p = tempo(t, TEMPO.mPush), dL = dirv(-45), ank = [58, FY - 24], fL = front(dL);
    const kn = add(ank, mul(dL, B.shin)), hip = add(kn, mul(dL, B.thigh));
    // المسند على الفخذ تحت الورك؛ الجذع ينطوي لحد ما يوصل لحافة المسند وبس (ما يدخل بيه)
    const padC = at(hip, dL, fL, -21, prof(LM(B).thF, 20) + 3.2), key = 'hy' + B.torso;
    if (!HYC[key]) {
      const inside = a => { const bb = body(hip, a, B, a); for (let u = 2; u <= B.torso; u += 1.5) { const q = sub(chestPt(bb, B, u, 0), padC), la = q[0] * dL[0] + q[1] * dL[1], lb = q[0] * fL[0] + q[1] * fL[1]; if (Math.abs(la) < 9.3 && Math.abs(lb) < 3.3) return 1; } return -1; };
      HYC[key] = inside(60) < 0 ? 60 : bisect(inside, -47, 60, 22) - 2;
    }
    const b = body(hip, lerp(-47, HYC[key], p), B, lerp(-44, HYC[key] - 8, p));
    const arm = armIK(b.sh, at(b.sh, b.T, b.F, -8, 6.5), B, 1, at(b.sh, b.T, b.F, -14, 1));
    const leg = { hip, knee: kn, ank, s: front(dL) };
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  // ---- بطن ----
  M.kcrunch = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), kn = [96, FY - 4], hip = add(kn, mul(dirv(-100), B.thigh)), ank = add(kn, mul(dirv(179), B.shin));
    const b = body(hip, lerp(-66, 10, p), B, lerp(-58, 55, p));
    // الإيدين ماسكات الحبل جنب الجبهة (فوك الأذن وكدامها شوية) وتمشي ويا الراس، فالحبل يطلع من كدام الجبهة مو من داخل الراس
    // نص الحبل (مكان ربطه بالكيبل) ورا الرقبة، والحبل يلف على جنبين الراس، والإيدين ماسكات أطرافه جنب الوجه/الفك
    const hd = LM(B).head, U = b.Uh, Fu = front(U), hp = add(add(b.sh, mul(U, hd.up - 5)), mul(Fu, hd.fwd + 0.5));
    const arm = armIK(b.sh, hp, B, 1, add(add(b.sh, mul(U, -2)), mul(Fu, 10)));
    const leg = { hip, knee: kn, ank, s: dirv(175) };
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.hangknee = (B, t, P) => {
    const up = tempo(t, TEMPO.abs), bar = hangBar(B), grip = [bar[0], bar[1] + 2];
    const sh = [bar[0] - 1, bar[1] + REACH(B) * 0.985 + 2 + (B.hangDrop || 0)], T = dirv(lerp(-93, -100, up));
    const b = { sh, T, F: front(T), Uh: dirv(-92) }; b.hip = sub(sh, mul(T, B.torso));
    const arm = armIK(sh, grip, B, 1, [sh[0] - 1, sh[1] - 18]); arm.tgt2 = grip;
    const a1 = lerp(95, -6, up), leg = legFK(b.hip, a1, lerp(99, 88, up), B);
    return Object.assign(b, { p: up, legs: [leg, leg], arms: [arm, arm], barY: bar[1], barX: bar[0] });
  };
  M.abmach = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), hip = [92, FY - 44], b = body(hip, lerp(-95, -62, p), B, lerp(-93, -40, p));
    const arm = armIK(b.sh, at(b.sh, b.T, b.F, -3, prof(LM(B).fr, B.torso - 3) + 7), B, 1, at(b.sh, b.T, b.F, -14, 8));   // المقابض كدام الكتف بمستوى أعلى الصدر
    const legs = seatedLegs(hip, B, 24);
    return Object.assign(b, { p, legs, arms: [arm, arm] });
  };
  M.captain = (B, t, P) => {
    const up = tempo(t, TEMPO.abs), sh = [92, FY - 118], T = dirv(lerp(-91, -97, up));
    const b = { sh, T, F: front(T), Uh: dirv(lerp(-91, -94, up)) }; b.hip = sub(sh, mul(T, B.torso));
    const arm = armFK(sh, 90, 0, B);
    const leg = legFK(b.hip, lerp(93, -6, up), lerp(97, 92, up), B);
    return Object.assign(b, { p: up, legs: [leg, leg], arms: [arm, arm] });
  };
  M.revcrunch = (B, t, P) => {
    const p = tempo(t, TEMPO.abs), shF = [92 - B.torso - 1, matHip(B, 92, 180) - 0.5];
    const h0 = matHip(B, 92, 180), hip = lerpP([92, h0], [91, h0 - 8], smoothstep(0.4, 1, p));
    const b = bodyT(hip, sub(shF, hip), B, dirv(180));
    const a1 = lerp(-62, -118, p), leg = legFK(hip, a1, a1 + 92, B);
    const arm = floorArm(b, B); arm.hd = [1, 0];
    return Object.assign(b, { p, legs: [leg, leg], arms: [arm, arm] });
  };
  M.climber = (B, t, P) => {
    const fy = 137, pivot = [30, fy], wy = fy - B.r.wr;
    if (!PUSH[B.torso + '']) M.pushup(B, 0, {});
    const c = PUSH[B.torso + ''], pb = pushBody(B, c.bTop, pivot);
    const T = pb.D, F = front(T), arm = armIK(pb.sh, [c.wx, wy], B, 1); arm.hd = [1, 0];
    const ph = ((t / 1.0) % 1 + 1) % 1, fwd = [pb.hip[0] - 1, fy - 14];
    const legAt = q => { const e = 0.5 - 0.5 * Math.cos(2 * Math.PI * q), ank = lerpP(pb.ank, fwd, e); ank[1] -= 3 * Math.sin(Math.PI * e); return legIK(pb.hip, ank, pb.s, B, -1); };
    return { p: 0.5 - 0.5 * Math.cos(2 * Math.PI * ph), hip: pb.hip, T, F, sh: pb.sh, Uh: dirv(angOf(T) - 5), legs: [legAt(ph), legAt(ph + 0.5)], arms: [arm, arm] };
  };
  // ---- أجهزة كارديو ----
  M.ellip = (B, t, P) => {
    const per = 1.3, th = 2 * Math.PI * t / per, c = [94, FY - 24], A = 13, Bv = 4.5;
    const ped = a => [c[0] + A * Math.cos(a), c[1] + Bv * Math.sin(a)];
    const pA = ped(th), pB = ped(th + Math.PI), avgY = (pA[1] + pB[1]) / 2;
    const hip = [90, avgY - B.ankleH - 1.2 - (B.thigh + B.shin) * 0.955];
    const b = body(hip, -86, B, -88);
    const legAt = pd => legIK(hip, [pd[0], pd[1] - B.ankleH - 1.2], dirv(4), B, -1);
    // المقابض تتمرجح حول محور واطي قدام الجسم؛ الإيد تمسك العمود بمستوى الصدر والكوع مثني وتحت
    const hm = [b.sh[0] + 17, b.sh[1] + 15], piv = [hm[0] + 22, FY - 32], v = sub(hm, piv), Lh = len(v), a0 = angOf(v);
    const handAt = a => { const w = add(piv, mul(dirv(a0 - 8 * Math.cos(a)), Lh)); return armIK(b.sh, w, B, 1, add(lerpP(b.sh, w, 0.5), [-2, 9])); };
    b.hpiv = piv; b.eth = th;
    return Object.assign(b, { p: ((th / (2 * Math.PI)) % 1 + 1) % 1, legs: [legAt(pA), legAt(pB)], arms: [handAt(th + Math.PI), handAt(th)] });
  };
  // جهاز التجذيف: السحبة (40%) رجلين ← ظهر ← إيدين، والرجعة (60%) بالعكس: إيدين ← ظهر ← رجلين. الكاحل ثابت على الدوّاسة المايلة والمقعد يزحلق على السكة
  const ERG = { ax: 128, ay: FY - 23, sy: FY - 33, fan: [172, FY - 42], per: 2.6 };
  M.erg = (B, t, P) => {
    const { ax, ay, sy, fan, per } = ERG, u = ((t / per) % 1 + 1) % 1, ss = smoothstep;
    let Lg, K, A;
    // Concept2: السحبة رجلين ← ظهر ← إيدين، والرجعة إيدين (تنفرد كاملة) ← ظهر ← رجلين، ووقت الرجعة ضعف وقت السحبة تقريباً
    const DR = 1 / 3;
    if (u < DR) { const d = u / DR; Lg = ss(0, 0.62, d); K = ss(0.3, 0.82, d); A = ss(0.6, 1, d); }
    else { const r = (u - DR) / (1 - DR); A = 1 - ss(0, 0.25, r); K = 1 - ss(0.2, 0.5, r); Lg = 1 - ss(0.45, 1, r); }
    const LL = B.thigh + B.shin, dy = ay - sy, f = lerp(0.52, 0.985, Lg) * LL, hip = [ax - Math.sqrt(Math.max(1, f * f - dy * dy)), sy];
    const b = body(hip, lerp(-60, -110, K), B, lerp(-74, -98, K));
    const leg = legIK(hip, [ax, ay], dirv(-40), B, -1);
    const g = 2, reachP = add(b.sh, mul(unit(sub(fan, b.sh)), REACH(B) + g + 1)), rib = chestPt(b, B, 0.42 * B.torso, 3.5);
    const h = lerpP(reachP, rib, A), hint = lerpP(add(lerpP(b.sh, h, 0.5), [0, 9]), at(b.sh, b.T, b.F, -14, -12), A);
    const arm = gripArm(b.sh, h, B, g, hint, 1);
    return Object.assign(b, { p: u < DR ? u / DR : 1 - (u - DR) / (1 - DR), legs: [leg, leg], arms: [arm, arm], ergH: h });
  };
  const STAIR = { h: 14, d: 18, yTop: FY - 44, xTop: 106, per: 1.5 };
  M.stairs = (B, t, P) => {
    const { h, d, yTop, xTop, per } = STAIR, s = 2 * t / per, ph = ((t / per) % 1 + 1) % 1;
    const footAt = q => {
      q = ((q % 1) + 1) % 1; let x, y, pitch = 0;
      if (q < 0.5) { const u = q / 0.5; x = xTop - d * u; y = yTop + h * u; }
      else { const u = smooth((q - 0.5) / 0.5); x = xTop - d + d * u; y = yTop + h - h * u - 7 * Math.sin(Math.PI * u); pitch = 18 * Math.sin(Math.PI * u); }
      return { ank: [x - d * 0.5, y - B.ankleH - Math.sin(pitch * R) * B.heel], s: dirv(-pitch) };
    };
    const fA = footAt(ph), fB = footAt(ph + 0.5), LL = B.thigh + B.shin;
    const hip = [88, yTop + h - B.ankleH - LL * 0.975 + 1.2 * Math.cos(4 * Math.PI * ph)];
    const b = body(hip, -80, B, -86);
    const legs = [fA, fB].map(f => legIK(hip, f.ank, f.s, B, -1));
    // الإيدين ماسكات القطعة العمودية القدّامية من المسكات الجانبية (مكان ثابت بالجهاز، الذراع تمتص نطّة الجسم)
    const sh0 = add([88, yTop + h - B.ankleH - LL * 0.975], mul(dirv(-80), B.torso)), gp = [sh0[0] + 21, sh0[1] + 22];
    const arm = armIK(b.sh, gp, B, 1, add(lerpP(b.sh, gp, 0.5), [-3, 8]));
    return Object.assign(b, { p: ph, legs, arms: [arm, arm], stairS: s });
  };

  /* ---------- التمارين ثلاثية الأبعاد ---------- */
  // lat(p, D, M): مواقع جانبية (بعد عن منتصف الجسم) — equip: أجهزة
  const L = (o) => () => o;
  const EX = {
    bb_squat: { m: 'squat', P: { hold: 'bar' }, lat: (p, D) => ({ ankle: D.hw + 5.5, knee: .5, toe: 18, wrist: D.sw + 8, flare: .3 }), equip: ['bar'] },
    goblet: { m: 'squat', P: { hold: 'goblet' }, lat: (p, D) => ({ ankle: D.hw + 5.8, knee: .55, toe: 20, wrist: 2.4, flare: .35 }), equip: ['dbV'] },
    bw_squat: { m: 'squat', P: { hold: 'bw' }, lat: (p, D) => ({ ankle: D.hw + 5.5, knee: .5, toe: 18, wrist: 0.6, flare: .05 }) },
    db_squat: { m: 'squat', P: { hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 3, knee: .2, toe: 12, wrist: D.sw + 10, flare: .1 }), equip: ['dbZ'] },
    leg_press: { m: 'legpress', P: {}, lat: (p, D) => ({ ankle: D.hw + 3, knee: .35, toe: 12, wrist: D.sw + 5, flare: .3 }), equip: ['legpress'], yaw: -65 },
    rdl_bb: { m: 'hinge', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 6, wrist: D.sw + 5, flare: .08 }), equip: ['bar'], yaw: -60 },
    rdl_db: { m: 'hinge', P: { hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 6, wrist: D.sw + 3.5, flare: .1 }), equip: ['dbX'], yaw: -60 },
    lunge_db: { m: 'lunge', P: { hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 5, wrist: D.sw + 4.5, flare: .1 }), equip: ['dbZ'], yaw: -60 },
    lunge_bw: { m: 'lunge', P: { hold: 'bw' }, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 5, wrist: D.hw + 9, flare: 1 }), yaw: -60 },
    bulgarian: { m: 'lunge', P: { kind: 'bulgarian', hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 5, wrist: D.sw + 4.5, flare: .1 }), equip: ['dbZ', 'benchBack'], yaw: -60 },
    bulgarian_bw: { m: 'lunge', P: { kind: 'bulgarian', hold: 'bw' }, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 5, wrist: D.hw + 9, flare: 1 }), equip: ['benchBack'], yaw: -60 },
    glute_bridge: { m: 'bridge', P: {}, lat: (p, D) => ({ ankle: D.hw + 3, knee: .25, toe: 8, wrist: D.sw + 2, flare: .2 }), flat: true, equip: ['mat'], yaw: -62 },
    hip_thrust: { m: 'bridge', P: { kind: 'thrust', hold: 'bar' }, lat: (p, D) => ({ ankle: D.hw + 4, knee: .3, toe: 10, wrist: D.hw + 10, flare: .5 }), equip: ['bar', 'benchCross'], yaw: -62 },
    leg_ext: { m: 'legext', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 3, wrist: D.sw + 6, flare: .3 }), equip: ['legext'], yaw: -62 },
    leg_curl: { m: 'legcurl', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.8, knee: .05, toe: 0, wrist: D.sw + 1, flare: .6 }), equip: ['legcurl'], yaw: -62 },
    calf_raise: { m: 'calf', P: { hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 1, knee: 0, toe: 5, wrist: D.sw + 4.5, flare: .1 }), equip: ['dbZ'], yaw: -60 },
    calf_bw: { m: 'calf', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: 0, toe: 5, wrist: D.hw + 9, flare: 1 }), yaw: -60 },
    bench_bb: { m: 'press', P: { hold: 'bar' }, lat: (p, D) => ({ ankle: D.hw + 6, knee: .3, toe: 12, wrist: D.sw + 7, flare: .8 }), equip: ['bar', 'benchFlat'], yaw: -50 },
    bench_db: { m: 'press', P: { hold: 'dbs' }, lat: (p, D) => ({ ankle: D.hw + 6, knee: .3, toe: 12, wrist: lerp(D.sw - 1, D.sw + 3, p), flare: .95 }), equip: ['dbX', 'benchFlat'], yaw: -50 },
    incline_db: { m: 'press', P: { hold: 'dbs', inc: 32 }, lat: (p, D) => ({ ankle: D.hw + 6, knee: .3, toe: 12, wrist: lerp(D.sw - 1, D.sw + 3, p), flare: .95 }), equip: ['dbX', 'benchIncline'], yaw: -50 },
    chest_press: { m: 'chestpress', P: {}, lat: (p, D) => ({ ankle: D.hw + 4, knee: .2, toe: 10, wrist: D.sw + 4, flare: .8 }), equip: ['chestpress'], yaw: -55 },
    pushup: { m: 'pushup', P: {}, lat: (p, D) => ({ ankle: D.hw - 1.2, knee: 0, toe: 0, wrist: D.sw + 4, flare: .75 }), flat: true, equip: ['mat'], yaw: -62 },
    knee_pushup: { m: 'pushup', P: { knees: true }, lat: (p, D) => ({ ankle: D.hw - 0.5, knee: 0, toe: 0, wrist: D.sw + 4, flare: .75 }), flat: true, equip: ['mat'], yaw: -62 },
    db_fly: { m: 'fly', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 6, knee: .3, toe: 12, wrist: Math.max(4, D.sw * 0.25 + m.latK), flare: 1 }), equip: ['dbX', 'benchFlat'], yaw: -30 },
    ohp_db: { m: 'ohp', P: { seated: true }, lat: (p, D) => ({ ankle: D.hw + 5, knee: .3, toe: 12, wrist: lerp(D.sw - 1, D.sw + 6, p), flare: .9 }), equip: ['dbX', 'benchUpright'], yaw: -35 },
    ohp_bb: { m: 'ohp', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .1, toe: 8, wrist: D.sw + 5, flare: .6 }), equip: ['bar'], yaw: -40 },
    pike_pushup: { m: 'pike', P: {}, lat: (p, D) => ({ ankle: D.hw, knee: 0, toe: 0, wrist: D.sw + 3, flare: .6 }), flat: true, equip: ['mat'], yaw: -62 },
    lat_raise: { m: 'latraise', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw * 0.9 + m.latK, flare: 1 }), equip: ['dbZ'], yaw: -20 },
    band_lat_raise: { m: 'latraise', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw * 0.9 + m.latK, flare: 1 }), equip: ['bandFeet'], yaw: -20 },
    rear_fly: { m: 'rearfly', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 2, knee: .15, toe: 6, wrist: D.sw * 0.7 + m.latK, flare: 1 }), equip: ['dbZ'], yaw: -150 },
    lat_pulldown: { m: 'pulldown', P: {}, lat: (p, D) => ({ ankle: D.hw + 3, knee: .2, toe: 8, wrist: D.sw + 12, flare: .8 }), equip: ['pulldown'], yaw: -150 },
    band_pulldown: { m: 'bandpull', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .05, toe: 6, wrist: D.sw + 8, flare: .8 }), equip: ['bandTop'], yaw: -140 },
    pullup: { m: 'pullup', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.5, knee: .1, toe: 4, wrist: D.sw + 9, flare: .8 }), equip: ['pullbar'], yaw: -150 },
    cable_row: { m: 'row', P: { style: 'cable' }, lat: (p, D) => ({ ankle: D.hw + 3, knee: .3, toe: 5, wrist: 4.5, flare: .6 }), equip: ['cableLow', 'benchLow'], yaw: -60 },
    db_row: { m: 'row', P: { style: 'bent', db: true }, lat: (p, D) => ({ ankle: D.hw + 2, knee: .12, toe: 6, wrist: D.sw + 2.5, flare: .3 }), equip: ['dbZ'], yaw: -120 },
    bb_row: { m: 'row', P: { style: 'bent' }, lat: (p, D) => ({ ankle: D.hw + 2.5, knee: .15, toe: 6, wrist: D.hw + 9, flare: .3 }), equip: ['bar'], yaw: -120 },
    band_row: { m: 'row', P: { style: 'band' }, lat: (p, D) => ({ ankle: D.hw + 1, knee: .05, toe: 0, wrist: 5, flare: .15 }), equip: ['bandFront', 'mat'], yaw: -60 },
    inv_row: { m: 'invrow', P: {}, lat: (p, D) => ({ ankle: D.hw, knee: .02, toe: 0, wrist: D.sw + 5, flare: .6 }), equip: ['table'], yaw: -60 },
    db_curl: { m: 'curl', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw + 0.5, flare: .05 }), equip: ['dbX'], yaw: -40 },
    hammer: { m: 'curl', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw + 0.5, flare: .05 }), equip: ['dbH'], yaw: -40 },
    bb_curl: { m: 'curl', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw - 1, flare: .08 }), equip: ['bar'], yaw: -40 },
    band_curl: { m: 'curl', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw + 0.5, flare: .05 }), equip: ['bandFeet'], yaw: -40 },
    tri_push: { m: 'pushdown', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .05, toe: 6, wrist: D.sw - 3, flare: .25 }), equip: ['cableHigh'], yaw: -72 },
    oh_tri: { m: 'ohtri', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .05, toe: 6, wrist: 3.2, flare: 1.1, fbz: 0.4 }), equip: ['dbV'], yaw: -60 },
    bench_dip: { m: 'dips', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: .05, toe: 0, wrist: D.sw - 1, flare: .15 }), flat: true, equip: ['benchBack'], yaw: -55 },
    plank: { m: 'plank', P: {}, lat: (p, D) => ({ ankle: D.hw - 1, knee: 0, toe: 0, wrist: D.sw - 3, flare: .1 }), flat: true, equip: ['mat'], yaw: -62 },
    crunch: { m: 'crunch', P: {}, lat: (p, D) => ({ ankle: D.hw + 3, knee: .25, toe: 8, wrist: D.head * 7.7, flare: 1.4 }), equip: ['mat'], yaw: -62 },
    dead_bug: { m: 'deadbug', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 0, wrist: D.sw - 1, flare: .05 }), equip: ['mat'], yaw: -50 },
    leg_raise: { m: 'legraise', P: {}, lat: (p, D) => ({ ankle: D.fem ? 3.6 : 3.3, knee: 0, toe: 0, wrist: D.sw + 2, flare: .1 }), flat: true, equip: ['mat'], yaw: -62 },
    side_plank: { m: 'sideplank', P: {}, lat: (p, D) => ({ ankle: 3.4, knee: 0, toe: 0, wrist: D.sw, flare: .2 }), equip: ['mat'], yaw: 80 },
    bicycle: { m: 'bicycle', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: .05, toe: 0, wrist: D.head * 7.7, flare: 1.0 }), equip: ['mat'], yaw: -55 },
    superman: { m: 'superman', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: 0, toe: 0, wrist: D.sw - 4.5, flare: .05 }), equip: ['mat'], yaw: -62 },
    tread: { m: 'walk', P: { tread: true }, G: 146, lat: (p, D) => ({ ankle: D.hw + 0.6, knee: .05, toe: 5, wrist: D.sw + 2.2, flare: .15 }), equip: ['treadmill'], yaw: -50 },
    walk: { m: 'walk', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.6, knee: .05, toe: 5, wrist: D.sw + 2.2, flare: .15 }), yaw: -50 },
    bike: { m: 'bike', P: {}, lat: (p, D) => ({ ankle: D.hw + 3, knee: .1, toe: 4, wrist: D.sw + 3, flare: .3 }), equip: ['bike'], yaw: -55 },
    jacks: { m: 'jacks', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 1 + 13 * m.spread, knee: .3, toe: 12, wrist: D.sw * 0.6 + m.latK, flare: 1 }), yaw: -20 },
    march: { m: 'march', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: .05, toe: 5, wrist: D.sw + 2, flare: .15 }), yaw: -45 },
    smith_squat: { m: 'squat', P: { hold: 'bar', smith: true }, lat: (p, D) => ({ ankle: D.hw + 5, knee: .5, toe: 16, wrist: D.sw + 8, flare: .3 }), equip: ['bar', 'smith'], yaw: -45 },
    hip_abd: { m: 'seatabd', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 2 + 17 * m.open, knee: .15 + 1.2 * m.open, toe: 3, wrist: D.sw + 6, flare: .3 }), equip: ['abductor'], yaw: -20 },
    hip_add: { m: 'seatabd', P: { add: true }, lat: (p, D, m) => ({ ankle: D.hw + 2 + 17 * m.open, knee: .15 + 1.2 * m.open, toe: 3, wrist: D.sw + 6, flare: .3 }), equip: ['adductor'], yaw: -20 },
    kickback: { m: 'kickback', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.2, knee: .05, toe: 5, wrist: D.sw + 4, flare: .3 }), equip: ['cableAnkle'], yaw: -95 },
    donkey: { m: 'donkey', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.5, knee: .02, toe: 0, wrist: D.sw - 1, flare: .1 }), flat: true, equip: ['mat'], yaw: -70 },
    seated_calf: { m: 'seatcalf', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .1, toe: 5, wrist: D.hw + 5, flare: .3 }), equip: ['seatcalf'], yaw: -60 },
    pec_deck: { m: 'pecdeck', P: {}, lat: (p, D, m) => ({ ankle: D.hw + 4, knee: .2, toe: 10, wrist: Math.max(3.5, D.sw + m.latK), flare: .9 }), equip: ['pecdeck'], yaw: -25 },
    rev_pec: { m: 'pecdeck', P: { rev: true }, lat: (p, D, m) => ({ ankle: D.hw + 4, knee: .2, toe: 10, wrist: Math.max(3.5, D.sw + m.latK), flare: .9 }), equip: ['revpec'], yaw: -150 },
    shoulder_press_m: { m: 'ohp', P: { seated: true, machine: true }, lat: (p, D) => ({ ankle: D.hw + 5, knee: .3, toe: 12, wrist: lerp(D.sw + 2, D.sw + 6, p), flare: .9 }), equip: ['benchUpright', 'smp'], yaw: -35 },
    machine_row: { m: 'mrow', P: {}, lat: (p, D) => ({ ankle: D.hw + 4, knee: .2, toe: 10, wrist: D.sw + 1, flare: .15 }), equip: ['rowmachine'], yaw: -120 },
    cable_curl: { m: 'curl', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .05, toe: 6, wrist: D.sw - 1, flare: .05 }), equip: ['cableCurl'], yaw: -60 },
    face_pull: { m: 'facepull', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .05, toe: 6, wrist: lerp(D.sw + 8, 4, p), flare: 1 }), equip: ['cableFace'], yaw: -140 },
    back_ext: { m: 'hyper', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: 0, toe: 0, wrist: 4, flare: .4 }), equip: ['hyper'], yaw: -70 },
    cable_crunch: { m: 'kcrunch', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 0, wrist: D.head * 7.4, flare: .9 }), equip: ['cableKneel', 'mat'], yaw: -70 },
    hanging_knee: { m: 'hangknee', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.5, knee: .1, toe: 4, wrist: D.sw + 8, flare: .8 }), equip: ['pullbar'], yaw: -60 },
    ab_machine: { m: 'abmach', P: {}, lat: (p, D) => ({ ankle: D.hw + 2, knee: .2, toe: 6, wrist: D.sw - 2, flare: .25 }), equip: ['abmach'], yaw: -42 },
    captain_chair: { m: 'captain', P: {}, lat: (p, D) => ({ ankle: D.hw + 0.8, knee: .1, toe: 4, wrist: D.sw + 1.5, flare: .05 }), equip: ['captain'], yaw: -32 },
    rev_crunch: { m: 'revcrunch', P: {}, lat: (p, D) => ({ ankle: D.hw + 1, knee: .1, toe: 0, wrist: D.sw + 2, flare: .1 }), flat: true, equip: ['mat'], yaw: -62 },
    climber: { m: 'climber', P: {}, lat: (p, D) => ({ ankle: D.hw - 0.5, knee: .12, toe: 0, wrist: D.sw + 4, flare: .75 }), flat: true, equip: ['mat'], yaw: -62 },
    elliptical: { m: 'ellip', P: {}, lat: (p, D) => ({ ankle: D.hw + 2.5, knee: .15, toe: 3, wrist: D.sw + 1, flare: .25 }), equip: ['elliptical'], yaw: -55 },
    rower: { m: 'erg', P: {}, lat: (p, D) => ({ ankle: D.hw + 2.2, knee: .3, toe: 6, wrist: D.sw + 0.5, flare: .4 }), equip: ['erg'], yaw: -62 },
    stairs: { m: 'stairs', P: {}, lat: (p, D) => ({ ankle: D.hw + 1.5, knee: .1, toe: 5, wrist: D.sw + 6, flare: .3 }), equip: ['stairs'], yaw: -55 }
  };


  /* ---------- مسكة الإيد (للجسم التشريحي) ----------
     th: اتجاه الإبهام على المقبض، n: اتجاه باطن الكف، g: بعد مركز المقبض عن الرسغ باتجاه الكف، style: grip / flat / fist / relaxed */
  const HAND = { cableAnkle: 'pro',
    bar: 'pro', dbX: 'pro', dbZ: 'neu', dbH: 'ham', smith: 'pro', pullbar: 'pro', pulldown: 'pro', cableHigh: 'pro', cableCurl: 'sup',
    chestpress: 'vert', smp: 'pro', rowmachine: 'vert', pecdeck: 'vert', revpec: 'vert', cableLow: 'vert', bandFront: 'vert', bandTop: 'pro', bandFeet: 'neu',
    cableFace: 'vert', cableKneel: 'vert', abmach: 'vert', table: 'pro', bike: 'pro', elliptical: 'vert', treadmill: 'rel', stairs: 'vert', erg: 'pro'
  };
  const HAND_EX = {   // تمارين إلها مسكة خاصة
    bb_curl: 'sup', db_curl: 'sup', band_curl: 'sup', cable_curl: 'sup', goblet: 'cup', oh_tri: 'cup', db_fly: 'neuT',
    pushup: 'flat', knee_pushup: 'flat', pike_pushup: 'flat', plank: 'fist', bench_dip: 'flat', glute_bridge: 'flat', leg_raise: 'flat', rev_crunch: 'flat',
    donkey: 'flat', climber: 'flat', inv_row: 'hook', seated_calf: 'padTop', bw_squat: 'flatD', superman: 'fwd', dead_bug: 'rel', crunch: 'head', bicycle: 'head', side_plank: 'sidep', back_ext: 'head',
    lunge_bw: 'hips', bulgarian_bw: 'hips', calf_bw: 'hips', jacks: 'rel', march: 'rel', walk: 'rel', tread: 'rel', leg_press: 'side', leg_ext: 'side', leg_curl: 'side',
    hip_abd: 'side', hip_add: 'side', kickback: 'pro', captain_chair: 'vert', hanging_knee: 'pro', band_lat_raise: 'neu'
  };
  const HOFF = { cableAnkle: 2, bar: 2, smith: 2, dbX: 2.8, dbZ: 2.8, dbH: 2.8, dbV: null, pullbar: 2, pulldown: 0, cableHigh: 2.5, cableLow: 0, cableCurl: 2.5, chestpress: 2.5, smp: 2.5,
    rowmachine: 2.5, pecdeck: 2.5, revpec: 2.5, bandFront: 2.5, bandTop: 2.5, bandFeet: 2.5, cableFace: 2, cableKneel: 2, abmach: 2.5, table: 2, elliptical: 0, bike: 1, stairs: 0, erg: 2, legext: 0, captain: 0, abmach: 0 };
  // نص قطر المقبض (وحدة المحرك): البار والدمبل رفيعين، المقابض المطاط أعرض
  const GR = { erg: 1.6, elliptical: 1.9, stairs: 1.9, captain: 1.6, legext: 1.6, legpress: 1.6, abductor: 1.4, adductor: 1.4, bike: 1.7, cableLow: 1.6, abmach: 1.6 };
  function handSpec(exId) {
    const ex = EX[exId], eq = ex.equip || [], V3 = THREE.Vector3;
    const e0 = eq.find(e => HAND[e]), kind = HAND_EX[exId] || (e0 && HAND[e0]) || 'rel', g = e0 && HOFF[e0] != null ? HOFF[e0] : null, gr = (e0 && GR[e0]) || (eq.find(e => GR[e]) && GR[eq.find(e => GR[e])]) || 1.1;
    return (i, J) => {
      const sg = i ? -1 : 1, a = J.arms[i];
      switch (kind) {
        case 'pro': return { style: 'grip', th: new V3(-sg, 0, 0), g, gr };
        case 'sup': return { style: 'grip', th: new V3(sg, 0, 0), g, gr };
        case 'neu': return { style: 'grip', th: perp(new V3(0, 0, 1), a.hd).lengthSq() > 0.05 ? new V3(0, 0, 1) : J.T3.clone(), g, gr };
        case 'ham': return { style: 'grip', th: new V3().crossVectors(a.hd, new V3(1, 0, 0)), g, gr };
        case 'vert': return { style: 'grip', th: new V3(0, 1, 0), g, gr };
        case 'neuT': return { style: 'grip', th: J.T3.clone(), g, gr };
        case 'cup': return exId === 'goblet' ? { style: 'cup', g: 0, hr: 0, n: J.T3.clone().addScaledVector(new V3(-sg, 0, 0), 0.25), hd: J.F3.clone().addScaledVector(new V3(sg, 0, 0), 0.35) }
          : { style: 'cup', n: new V3(0, 1, 0), hd: J.F3.clone().multiplyScalar(-0.75).add(new V3(-sg * 0.66, 0, 0)).normalize(), g: 0, hr: 0 };   // الكفين لفوك تحت القرص الفوكاني
        case 'flatD': return { style: 'flat', n: new V3(0, -1, 0) };
        case 'flat': return { style: 'flat', n: new V3(0, -1, 0) };
        case 'hook': return { style: 'hook', n: new V3(0, 0, -1), hd: new V3(0, 1, 0).addScaledVector(J.F3, 0).normalize() };   // مسكة حافة الطاولة
        case 'padTop': return { style: 'relaxed', n: new V3(0, -1, 0), hd: J.F3.clone().setY(0).normalize().add(new V3(0, -0.12, 0)).normalize() };   // الكف مبسوط على الوسادة والأصابع لكدام
        case 'fist': return { style: 'fist', n: new V3(-sg, 0, 0) };
        case 'fwd': return { style: 'fistT', n: new V3(0, -1, 0), bend: 1 };
        case 'sidep': return i ? { style: 'flat', n: J.F3.clone() } : { style: 'fist', n: new V3(0, -1, 0).addScaledVector(J.T3, 0.001) };
        case 'head': return exId === 'crunch' || exId === 'bicycle' ? { style: 'relaxed', hd: J.Fh3.clone().multiplyScalar(-0.78).add(new V3(-sg * 0.62, 0, 0)), n: new V3(-sg * 0.78, 0, 0).addScaledVector(J.Fh3, 0.62) } : { style: 'relaxed', n: J.F3.clone().negate() };
        case 'hips': return { style: 'relaxed', n: new V3(-sg, 0, 0), bend: 0.3 };
        case 'side': return { style: 'grip', th: new V3(0, 0, 1), gr };
        default: return { style: 'relaxed', n: new V3(-sg, 0, 0) };
      }
    };
  }

  /* =============== ثلاثي الأبعاد (يتفعّل بعد التحميل) =============== */
  let S = null; // scene state
  function load() {
    if (!loading) loading = import(THREE_URL).then(m => { THREE = m; return import(MH_URL).then(x => { MH = x; }, e => { console.warn('coach-mh', e); }); });
    return loading;
  }
  function figure(sex) {
    if (!MH) return Promise.resolve(null);
    if (!FIGP[sex]) FIGP[sex] = MH.createFigure(sex, MH_BASE).then(f => (FIGS[sex] = f), e => { console.warn('coach-mh body', e); FIGS[sex] = null; return null; });
    return FIGP[sex];
  }
  function has(id) { return !!EX[id]; }
  const GLERR = [];
  function gpuName(gl) { try { const x = gl.getExtension('WEBGL_debug_renderer_info'); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 80); } catch (e) { return ''; } }
  // فحص بعد أول كم إطار: نقارن بكسلات مكان الجسم وياه وبدونه. إذا ما تغير شي، الجسم ما انرسم بهذا الجهاز (مثل الشاشة اللي بيها بس حذاء وعيون)، فنحوّل لنسخة خفيفة تنرسم بكل الأجهزة
  function visCheck() {
    const rig = S.rig, B = rig.mh.B, gl = S.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, bn = B.byName || {};
    const names = ['spine05', 'spine03', 'spine01', 'neck01', 'upperleg02.L', 'upperleg02.R', 'lowerleg01.L', 'lowerleg01.R', 'upperarm02.L', 'upperarm02.R', 'pelvis.L', 'pelvis.R'];
    const pts = names.filter(n => bn[n]).map(n => { const v = bn[n].getWorldPosition(new THREE.Vector3()).project(S.camera); return [Math.round((v.x * 0.5 + 0.5) * W), Math.round((v.y * 0.5 + 0.5) * H)]; })
      .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
    if (pts.length < 3 || W < 50 || H < 50) return false;
    const px = new Uint8Array(4), read = () => pts.map(([x, y]) => { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px); });
    const a = read(), meshes = [B.mesh, B.mus && B.mus.mesh].filter(Boolean), was = meshes.map(m => m.visible);
    meshes.forEach(m => m.visible = false); S.renderer.render(S.scene, S.camera); const b = read();
    meshes.forEach((m, i) => m.visible = was[i]);
    const diff = a.filter((c, i) => Math.abs(c[0] - b[i][0]) + Math.abs(c[1] - b[i][1]) + Math.abs(c[2] - b[i][2]) + Math.abs(c[3] - b[i][3]) > 12).length;
    S.renderer.render(S.scene, S.camera);
    if (diff === 0) liteBody(gl);
    return true;
  }
  function liteBody(gl) {
    const fig = S.rig.mh, B = fig.B; if (fig.lite) return;
    // ألوان بسيطة لكل منطقة (بشرة، شعر، بلوزة/تيشيرت، ليغنز/شورت) من نفس ألوان النسخة الكاملة
    const LU = (B.layer && B.layer.userData && B.layer.userData.U) || {}, C = (u, d) => (u && u.value && u.value.isColor) ? u.value.clone() : new THREE.Color(d);
    const skin = C(LU.uSkin, 0xe9bfa0), hair = C(LU.uHair, 0x3a2a22), top = C(LU.uTop, 0x1d4ea3), bot = C(LU.uBottom, 0x1f2633), shoe = new THREE.Color(0x22252b), fem = fig.sex === 'f';
    try {
      const g = B.mesh.geometry, P = g.attributes.position, Z = g.attributes.aZone, eye = (B.lm && B.lm.eye) || [0, 160, 8], n = P.count, cols = new Float32Array(n * 3);
      let yHip = 0, yKnee = 0; for (let i = 0; i < n; i++) { if (Z && Z.getX(i) > 0.5) yHip = Math.max(yHip, P.getY(i)); } yKnee = yHip * 0.55;
      for (let i = 0; i < n; i++) {
        const y = P.getY(i), z = P.getZ(i), legs = Z ? Z.getX(i) : 0, arm = Z ? Z.getY(i) : 0, head = Z ? Z.getZ(i) : 0, foot = Z ? Z.getW(i) : 0;
        let c = skin;
        if (foot > 0.4 || (legs > 0.5 && y < 9)) c = shoe;
        else if (head > 0.4) c = (y > eye[1] + 3 || (z < eye[2] - 7 && y > eye[1] - 6)) ? hair : skin;
        else if (legs > 0.5) c = fem ? (y > 12 ? bot : skin) : (y > yKnee ? bot : skin);
        else if (arm > 0.35) c = fem ? top : (y > eye[1] - 40 ? top : skin);
        else c = top;
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      B.mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 });
    } catch (e) { B.mesh.material = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62 }); }
    B.mesh.customDepthMaterial = undefined;
    if (B.mus && B.mus.mesh) B.mus.mesh.visible = false;
    const sc = fig.setClothes; fig.setClothes = v => { sc(v); if (B.mus && B.mus.mesh) B.mus.mesh.visible = false; };
    fig.lite = true;
    try { localStorage.setItem('hero_3d_lite', JSON.stringify({ gpu: gpuName(gl), err: GLERR.slice(-2).join(' | ').slice(0, 300), at: Date.now() })); } catch (e) {}
    S.renderer.render(S.scene, S.camera);
  }

  function setup(canvas, stage) {
    const V3 = THREE.Vector3;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.debug.onShaderError = (gl, prog, vs, fs) => {   // نسجل خطأ الشيدر (يفيدنا إذا جهاز ما يرسم الجسم)
      try { GLERR.push(((gl.getShaderInfoLog(vs) || '') + ' ' + (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getProgramInfoLog(prog) || '')).trim().slice(0, 300)); } catch (e) {}
    };
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 5, 4000);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb4bccb, 1.15); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(90, 220, 140); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -140, right: 140, top: 160, bottom: -120, near: 50, far: 700 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.6; scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55); fill.position.set(-150, 70, -30); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.75); rim.position.set(-40, 110, -190); scene.add(rim);
    const tex = (w, h, draw, rx, ry) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const fiber = tex(256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(70,40,30,${0.04 + r() * 0.08})`; g.fillRect(x, 0, 1.3, h); } }, 3, 1);
    const beltTex = tex(64, 256, (g, w, h) => { g.fillStyle = '#2a2f39'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a404c'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 5); }, 1, 6);
    const std = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
    const MAT = {
      muscle: std(0xdcd5ce, 0.62, { map: fiber }), primary: std(0xdf3f2a, 0.5, { map: fiber, emissive: 0x7a1406, emissiveIntensity: 0.2 }),
      secondary: std(0xf2a07f, 0.55, { map: fiber }), base: std(0xc6bdb4, 0.72), skin: std(0xd8d0c8, 0.6), top: std(0x0f7a62, 0.8), hair: std(0x3a2a22, 0.85),
      steel: std(0xaab2bf, 0.35, { metalness: 0.6 }), rubber: std(0x2c313b, 0.7), pad: std(0x1f2126, 0.78), frame: std(0xc3c8cf, 0.32, { metalness: 0.65 }), shroud: std(0x3a3e45, 0.55, { metalness: 0.2 }),
      mat: std(0x55627d, 0.92), deck: std(0x3b414d, 0.7), belt: std(0xffffff, 0.9, { map: beltTex }), band: std(0x1f9d6b, 0.6), wood: std(0xb08a60, 0.8),
      cable: std(0x1b1f27, 0.5), floor: std(0xdfe4ee, 0.95)
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(130, 72), MAT.floor); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const syncTheme = () => { try { MAT.floor.color.set((getComputedStyle(document.documentElement).getPropertyValue('--floor-3d') || '#dfe4ee').trim() || '#dfe4ee'); } catch (e) {} };
    syncTheme();
    S = { lights: { hemi, key, fill, rim }, clothes: false, renderer, scene, camera, canvas, stage, MAT, fiberTex: fiber, beltTex, V3, rig: null, sex: null, exId: null, equip: null, fit: null,
      cam: { yaw: -40 * R, pitch: 12 * R, zoom: 1, ty: -40 * R, tp: 12 * R, easing: false }, t: 0, speed: 1, playing: true, spin: false, running: false, last: 0, syncTheme,
      primary: new Set(), secondary: new Set() };
    // تحكم باللمس
    const pointers = new Map();
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); S.cam.easing = false; S.spin = false; if (S.onInteract) S.onInteract(); });
    canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
      if (pointers.size === 1) { S.cam.yaw -= (cur.x - prev.x) * 0.009; S.cam.pitch = clamp(S.cam.pitch + (cur.y - prev.y) * 0.007, -35 * R, 85 * R); }
      else if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (d0 > 0 && d1 > 0) S.cam.zoom = clamp(S.cam.zoom * d0 / d1, 0.45, 1.8);
      }
      pointers.set(e.pointerId, cur);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => canvas.addEventListener(n, e => pointers.delete(e.pointerId)));
    canvas.addEventListener('wheel', e => { e.preventDefault(); S.cam.zoom = clamp(S.cam.zoom * (1 + e.deltaY * 0.0012), 0.45, 1.8); if (S.onInteract) S.onInteract(); }, { passive: false });
    canvas.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowLeft') S.cam.yaw += 0.15; else if (k === 'ArrowRight') S.cam.yaw -= 0.15;
      else if (k === 'ArrowUp') S.cam.pitch = clamp(S.cam.pitch + 0.12, -35 * R, 85 * R);
      else if (k === 'ArrowDown') S.cam.pitch = clamp(S.cam.pitch - 0.12, -35 * R, 85 * R);
      else return;
      e.preventDefault(); S.cam.easing = false; if (S.onInteract) S.onInteract();
    });
    new ResizeObserver(resize).observe(stage);
    resize();
  }
  function resize() {
    if (!S) return;
    const w = S.stage.clientWidth, h = S.stage.clientHeight; if (!w || !h) return;
    S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  }

  /* ---------- الجسم ---------- */
  const DIMS = {
    m: { hw: 6.6, sw: 15, bulk: 1, leg: 1, glute: 1, waist: 1, rib: 1, head: 1, fem: false },
    f: { hw: 7.2, sw: 13, bulk: 0.8, leg: 0.9, glute: 1.12, waist: 0.86, rib: 0.92, head: 0.94, fem: true }
  };
  const GEO = { sphere: null, spindle: {} };
  function spindleGeo(peak) {
    const k = peak.toFixed(2); if (GEO.spindle[k]) return GEO.spindle[k];
    const pts = [], n = 18;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = t < peak ? 0.5 * t / peak : 0.5 + 0.5 * (t - peak) / (1 - peak);
      let r = 0.2 + 0.8 * Math.pow(Math.sin(Math.PI * u), 0.55); if (i === 0 || i === n) r = 0;
      pts.push(new THREE.Vector2(r, t));
    }
    const g = new THREE.LatheGeometry(pts, 20); g.computeVertexNormals(); return (GEO.spindle[k] = g);
  }
  function buildRig(sex) {
    const V3 = THREE.Vector3, MAT = S.MAT, B = BODY[sex], D = DIMS[sex];
    if (!GEO.sphere) GEO.sphere = new THREE.SphereGeometry(1, 26, 18);
    const root = new THREE.Group(), bones = {}, muscles = [];
    ['torso', 'head', 'uArmL', 'fArmL', 'handL', 'uArmR', 'fArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].forEach(n => { const g = new THREE.Group(); root.add(g); bones[n] = g; });
    const place = (bone, mesh, group, mat) => { mesh.castShadow = true; mesh.material = group ? MAT.muscle : MAT[mat || 'base']; if (group) { mesh.userData.group = group; muscles.push(mesh); } bone.add(mesh); return mesh; };
    function sp(bone, a, b, rx, rz, peak, group, mat) {
      const A = new V3(...a), Bv = new V3(...b), Y = Bv.clone().sub(A), Ln = Y.length(); Y.normalize();
      const Z = new V3(0, 0, 1).addScaledVector(Y, -Y.z); if (Z.lengthSq() < 1e-6) Z.set(1, 0, 0); Z.normalize();
      const X = new V3().crossVectors(Y, Z), mesh = new THREE.Mesh(spindleGeo(peak));
      mesh.matrixAutoUpdate = false; mesh.matrix.makeBasis(X.multiplyScalar(rx), Y.multiplyScalar(Ln), Z.multiplyScalar(rz)).setPosition(A);
      return place(bone, mesh, group, mat);
    }
    function pd(bone, c, r, rot, group, mat) {
      const mesh = new THREE.Mesh(GEO.sphere); mesh.position.set(...c); mesh.scale.set(...r);
      if (rot) mesh.rotation.set(rot[0] * R, rot[1] * R, rot[2] * R);
      return place(bone, mesh, group, mat);
    }
    const k = D.bulk, q = D.leg, g = D.glute, t = bones.torso;
    pd(t, [0, 0.5, -0.8], [12 * (D.fem ? 1.08 : 1), 7.5, 8.2], null, null, 'base');
    pd(t, [0, 12, -0.3], [10.4 * D.waist, 9.8, 7.4 * D.waist], null, null, 'base');
    pd(t, [0, 25, -0.6], [13.4 * D.rib, 11.5, 8.8 * D.rib], null, null, 'base');
    pd(t, [0, 33, -1.2], [D.sw * 0.95, 4.2, 6.4], null, null, 'base');
    const absZ = [6.75, 7.1, 7.2, 7.3].map(z => z - (1 - D.waist) * 6.5);
    [[4.0, 3.0], [9.2, 2.3], [14.2, 2.3], [19.2, 2.3]].forEach(([y, h], i) => { for (const Sg of [1, -1]) pd(t, [Sg * 2.8 * D.waist, y, absZ[i]], [2.5 * D.waist, h, 1.15 * k + 0.1], null, 'abs'); });
    for (const Sg of [1, -1]) {
      pd(t, [Sg * D.sw, 32.6, -0.6], [4.6 * k + 0.4, 4.6 * k + 0.4, 4.6 * k + 0.4], null, null, 'base');
      pd(t, [Sg * D.hw, -0.5, 0], [6.2 * q, 6.2 * q, 6.2 * q], null, null, 'base');
      pd(t, [Sg * 8.9 * D.waist, 11.5, 1.8 * D.waist], [3.0, 7.8, 4.8 * D.waist], [0, 0, -Sg * 8], 'obliques');
      for (let i = 0; i < 3; i++) pd(t, [Sg * 10.2 * D.rib, 20.4 + i * 2.6, 4.6 * D.rib], [1.4, 1.1, 2.0], [0, 0, Sg * 25], 'serratus');
      pd(t, [Sg * 5.8 * D.rib, 26.2, 7.9 * D.rib], [6.4 * k, 4.5 * k, 2.4 * k], [0, 0, Sg * 14], 'pecLower');
      pd(t, [Sg * 6.4 * D.rib, 30.2, 6.6 * D.rib], [5.4 * k, 2.7 * k, 2.0 * k], [0, 0, -Sg * 8], 'pecUpper');
      pd(t, [Sg * 5.4, 34.3, -2.4], [5.2 * k, 2.4 * k, 2.8 * k], [0, 0, -Sg * 22], 'traps');
      pd(t, [Sg * 9.8 * D.rib, 21, -5.6 * D.rib], [4.4 * k, 9.4, 3.4 * k], [0, 0, -Sg * 12], 'lats');
      sp(t, [Sg * 2.6, 1, -7.2], [Sg * 2.6, 25, -8.6 * D.rib], 2.3, 2.0, 0.35, 'erectors');
      pd(t, [Sg * 5.6 * (D.fem ? 1.08 : 1), -1.6, -7.4], [6.4 * g, 6.0 * g, 3.3 * g], [0, 0, Sg * 6], 'glutes');
      pd(t, [Sg * 10.0 * (D.fem ? 1.07 : 1), 3.5, -3.4], [3.0, 4.2, 2.6], [0, 0, -Sg * 12], 'glutes');
      if (D.fem) pd(t, [Sg * 4.8, 25.2, 8.4], [4.3, 4.1, 3.4], null, null, 'top');
    }
    pd(t, [0, 27.5, -8.8 * D.rib], [8 * k, 8.6, 1.6 * k], null, 'traps');
    if (D.fem) pd(t, [0, 22.6, -0.5], [12.1, 2.2, 8.7], null, null, 'top');
    const h = bones.head, hs = D.head, N = B.neck;
    sp(h, [0, 0.5, -1.0], [0, N - 5.5, 0.2], 4.6 * (D.fem ? 0.86 : 1), 4.4 * (D.fem ? 0.86 : 1), 0.5, null, 'base');
    for (const Sg of [1, -1]) { sp(h, [Sg * 3.6 * hs, N - 3, -1.2], [Sg * 1.3, 2.0, 3.6], 1.3, 1.3, 0.5, 'neck'); pd(h, [Sg * 6.1 * hs, N - 0.4, -0.6], [0.9, 1.9, 1.3], null, null, 'skin'); }
    pd(h, [0, N, 0.4], [6.3 * hs, 7.7 * hs, 7.0 * hs], null, null, 'skin');
    pd(h, [0, N - 4.4 * hs, 2.0 * hs], [4.6 * hs, 3.4 * hs, 4.4 * hs], null, null, 'skin');
    pd(h, [0, N - 0.5, 7.0 * hs], [0.8, 1.5, 1.1], null, null, 'skin');
    if (D.fem) pd(h, [0, N + 3.8, -6.6], [2.9, 2.9, 2.9], null, null, 'hair');
    for (const s of ['L', 'R']) {
      const lat = s === 'L' ? -1 : 1;
      const u = bones['uArm' + s], LU = B.upper;
      sp(u, [0, -1, 0], [0, LU, 0], 3.5 * k + 0.2, 3.6 * k + 0.2, 0.4, null, 'base');
      pd(u, [lat * 0.9 * k, 2.8, 3.2 * k], [3.3 * k, 5.6 * k, 2.5 * k], [-8, 0, 0], 'deltFront');
      pd(u, [lat * 3.0 * k, 3.2, 0], [2.4 * k, 6.0 * k, 3.6 * k], null, 'deltSide');
      pd(u, [lat * 0.9 * k, 3.2, -3.2 * k], [3.3 * k, 5.4 * k, 2.4 * k], [8, 0, 0], 'deltRear');
      sp(u, [-lat * 0.2, 5.5, 2.9 * k], [0, LU - 1.5, 2.1 * k], 2.9 * k, 2.8 * k, 0.55, 'biceps');
      sp(u, [lat * 2.3 * k, LU * 0.5, 1.0], [lat * 1.5 * k, LU - 1.5, 1.2], 1.6 * k, 1.6 * k, 0.5, 'biceps');
      sp(u, [-lat * 0.6, 4, -3.0 * k], [0, LU - 1, -2.2 * k], 2.9 * k, 3.0 * k, 0.45, 'triceps');
      sp(u, [lat * 2.6 * k, 5, -1.4 * k], [lat * 1.3 * k, LU * 0.78, -2.2 * k], 1.8 * k, 1.8 * k, 0.45, 'triceps');
      pd(u, [0, LU, 0], [2.8 * k + 0.2, 2.8 * k + 0.2, 2.8 * k + 0.2], null, null, 'base');
      const f = bones['fArm' + s], LF = B.fore;
      sp(f, [0, 0, 0], [0, LF, 0], 2.7 * k + 0.1, 2.3 * k + 0.1, 0.25, null, 'base');
      sp(f, [lat * 2.2 * k, 0.5, 0.8], [lat * 1.0, LF * 0.8, 0.2], 2.4 * k, 2.2 * k, 0.28, 'forearm');
      sp(f, [-lat * 1.4 * k, 0.8, 1.3], [-lat * 0.4, LF * 0.85, 0.7], 2.3 * k, 2.1 * k, 0.3, 'forearm');
      pd(f, [0, LF, 0], [1.9 * k + 0.2, 1.5, 1.4 * k + 0.2], null, null, 'base');
      const hd = bones['hand' + s], kh = D.fem ? 0.88 : 1;
      pd(hd, [0, 3.2 * kh, 0], [2.4 * kh, 3.5 * kh, 1.25], null, null, 'skin');
      pd(hd, [0, 6.8 * kh, 0.5], [2.2 * kh, 2.5 * kh, 1.2], [18, 0, 0], null, 'skin');
      pd(hd, [-lat * 2.1 * kh, 2.4, 1.0], [0.9, 2.1, 0.9], [0, 0, lat * 25], null, 'skin');
      const th = bones['thigh' + s], LT = B.thigh;
      sp(th, [0, -2, 0], [0, LT, 0], 6.0 * q, 6.2 * q, 0.3, null, 'base');
      sp(th, [0, 3, 4.9 * q], [0, LT - 2.5, 3.9 * q], 2.9 * q, 2.4 * q, 0.45, 'quads');
      sp(th, [lat * 4.6 * q, 4, 0.8], [lat * 3.3 * q, LT - 2.5, 1.6], 3.0 * q, 3.9 * q, 0.5, 'quads');
      sp(th, [-lat * 2.8 * q, LT * 0.45, 2.6 * q], [-lat * 2.6 * q, LT - 1.5, 3.0 * q], 3.1 * q, 2.7 * q, 0.7, 'quads');
      sp(th, [-lat * 3.6 * q, 0, 0.2], [-lat * 2.8 * q, LT * 0.6, 0.4], 2.9 * q, 3.8 * q, 0.3, 'adductors');
      sp(th, [lat * 2.4 * q, 3, -4.4 * q], [lat * 2.8 * q, LT - 2.5, -3.0 * q], 2.8 * q, 2.7 * q, 0.45, 'hamstrings');
      sp(th, [-lat * 1.8 * q, 3, -4.5 * q], [-lat * 2.4 * q, LT - 2.5, -2.8 * q], 2.8 * q, 2.7 * q, 0.45, 'hamstrings');
      pd(th, [0, LT - 0.2, 3.6 * q], [2.1 * q, 2.3 * q, 1.2], null, null, 'skin');
      pd(th, [0, LT, 0], [3.9 * q, 3.9 * q, 3.9 * q], null, null, 'base');
      const sh = bones['shin' + s], LS = B.shin;
      sp(sh, [0, 0, 0], [0, LS, 0], 3.5 * q, 3.8 * q, 0.28, null, 'base');
      sp(sh, [-lat * 1.9 * q, 1.2, -3.2 * q], [-lat * 1.2 * q, LS * 0.55, -2.9 * q], 2.9 * q, 3.3 * q, 0.35, 'calves');
      sp(sh, [lat * 1.7 * q, 1.2, -3.0 * q], [lat * 1.2 * q, LS * 0.48, -2.7 * q], 2.6 * q, 2.9 * q, 0.35, 'calves');
      sp(sh, [0, LS * 0.3, -1.8 * q], [0, LS * 0.86, -2.0 * q], 3.0 * q, 2.2 * q, 0.45, 'calves');
      sp(sh, [0, LS * 0.76, -2.2 * q], [0, LS + 0.5, -2.8 * q], 1.0, 1.0, 0.5, null, 'base');
      sp(sh, [lat * 1.7 * q, 2, 2.4 * q], [lat * 0.6, LS * 0.8, 1.9 * q], 1.8 * q, 1.7 * q, 0.35, 'tibialis');
      pd(sh, [0, LS, 0], [2.3, 2.3, 2.3], null, null, 'base');
      const ft = bones['foot' + s], fs = B.foot / 12.5;
      pd(ft, [0, 4.6 * fs, -1.3], [3.1 * fs, 7.3 * fs, 2.0], null, null, 'skin');
      pd(ft, [0, -1.6, -1.5], [2.2, 2.5, 2.2], null, null, 'skin');
    }
    return { root, bones, muscles, B, D, sex };
  }

  // معايرة: لوح الكتف بالجسم التشريحي يرتفع لما الإيد فوك الراس، فنقيس قديش يرتفع حتى التعليق والقفلة تطلع الإيد مفرودة صدك
  function calibrate(rig) {
    const B = rig.B; if (B.cal) return; B.cal = true; B.hangDrop = 0; B.riseUp = 0;
    const J = solve('pullup', rig, 0), inf = rig.mh.pose(J, handSpec('pullup'));
    B.riseUp = inf.Sh[0].clone().sub(J.arms[0].sh).dot(J.T3);
    B.hangDrop = Math.max(0, inf.Lmax - inf.Sh[0].distanceTo(inf.W[0]) - 0.1);
  }
  function mhRig(sex, fig) {
    const B = Object.assign({}, BODY[sex], fig.dims.B, { r: Object.assign({}, BODY[sex].r, fig.dims.B.r) });
    const D = Object.assign({}, DIMS[sex], fig.dims.D);
    B.lm = fig.dims.lm;
    return { root: fig.root, bones: {}, muscles: [], B, D, sex, mh: fig };
  }
  const LIGHTS = {
    old: { hemi: [0xffffff, 0xb4bccb, 1.15], key: [0xffffff, 1.7], fill: [0xdfe8ff, 0.55], rim: [0xffffff, 0.75], exp: 1.05 },
    mh: { hemi: [0xffffff, 0x8a8f98, 0.45], key: [0xfff1e2, 2.3], fill: [0xffffff, 0.45], rim: [0xdce6ff, 1.2], exp: 1.0 }
  };
  function setLights(mh) {
    const L = LIGHTS[mh ? 'mh' : 'old'], l = S.lights;
    l.hemi.color.set(L.hemi[0]); l.hemi.groundColor.set(L.hemi[1]); l.hemi.intensity = L.hemi[2];
    ['key', 'fill', 'rim'].forEach(k => { l[k].color.set(L[k][0]); l[k].intensity = L[k][1]; });
    S.renderer.toneMappingExposure = L.exp;
  }

  /* ---------- حل الوضعية 3D ---------- */
  function ik3(A, Tg, L1, L2, pole) {
    const V3 = THREE.Vector3, dir = Tg.clone().sub(A); let dist = dir.length(); dir.divideScalar(dist || 1);
    const Lm = L1 + L2 - 0.01, sz = 0.015 * (L1 + L2);   // انفراد ناعم: آخر شوية قبل الفرد الكامل تتباطأ، فالكوع ما يطك
    if (dist > Lm - sz) dist = Lm - sz * Math.exp(-(dist - (Lm - sz)) / sz);
    dist = clamp(dist, Math.abs(L1 - L2) + 0.01, Lm);
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(dir, -dir.z); p.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const mid = A.clone().addScaledVector(dir, a).addScaledVector(p, hh);
    return [mid, mid.clone().add(Tg.clone().sub(mid).normalize().multiplyScalar(L2))];
  }
  const perp = (v, ax) => v.clone().addScaledVector(ax, -v.dot(ax));
  function antBlend(bend, axis, fb) {
    const f = perp(fb, axis); if (f.lengthSq() < 1e-8) f.set(1, 0, 0); f.normalize();
    const p = perp(bend, axis), l = p.length(), w = smoothstep(0.06, 0.3, l / (bend.length() || 1));
    if (w <= 0) return f; p.divideScalar(l);
    const out = f.multiplyScalar(1 - w).addScaledVector(p, w);
    return out.lengthSq() < 0.04 ? p : out.normalize();
  }
  /* ---------- التداخل: الجسم كأسطوانات وبيضات مأخوذة من شكل الجسم ----------
     الدمبلز تنفحص نقطة نقطة (حواف الأقراص)، وإذا دخلت بالفخذ أو الساق أو الجذع أو الراس أو الأرض، الإيد تنزاح لبرّه بقدر الدخول */
  function capPush(p, a, b, pr, ref, planar) {   // ref: مركز الجسم المحمول، حتى الدفع يكون لجهته. planar: البار ما ينزاح على طوله
    const ab = b.clone().sub(a), L = ab.length(); ab.divideScalar(L || 1);
    const s = p.clone().sub(a).dot(ab), sc = clamp(s, 0, L), r = prof(pr, sc) + 0.35, q = a.clone().addScaledVector(ab, sc), pp = p.clone().sub(q), dl = pp.length();
    if (dl >= r) return null;   // كبسولة كاملة (أطرافها نص كرة)، فالدفع يتغير بسلاسة
    let d = ref ? ref.clone().sub(q) : pp.clone(); if (s >= 0 && s <= L) d.addScaledVector(ab, -d.dot(ab)); if (planar) d.x = 0;
    if (d.lengthSq() < 1e-6) d = pp.lengthSq() > 1e-8 ? pp.clone() : new THREE.Vector3(1, 0, 0); d.normalize();
    const pd = pp.dot(d), disc = pd * pd - dl * dl + r * r; if (disc < 0) return null; const tt = -pd + Math.sqrt(disc);
    return d.multiplyScalar(tt);
  }
  function torsoPush(p, J, lm, planar, extra) {
    const V3 = THREE.Vector3, X = new V3().crossVectors(J.T3, J.F3).normalize(), d = p.clone().sub(J.pelvis);
    const u = d.dot(J.T3); if (u < lm.wd[0][0] || u > lm.wd[lm.wd.length - 1][0]) return null;
    const ex = extra || 0, x = d.dot(X), v = d.dot(J.F3), W = prof(lm.wd, u) + 0.3 + ex, F = prof(lm.fr, u) + 0.3 + ex, Bk = prof(lm.bk, u) - 0.3 - ex, c = (F + Bk) / 2, h = Math.max(1, (F - Bk) / 2), e = 2.6;
    const f = Math.pow(Math.abs(x) / W, e) + Math.pow(Math.abs(v - c) / h, e); if (f >= 1) return null;
    const k = Math.max(0.15, Math.pow(f, 1 / e));
    if (planar) { const need = c + Math.sign(v - c || 1) * h * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / W, e)), 1 / e); return J.F3.clone().multiplyScalar(need - v); }
    return X.multiplyScalar(x / k - x).addScaledVector(J.F3, (v - c) / k - (v - c));
  }
  function headPush(p, J, lm) {
    const V3 = THREE.Vector3, hd = lm.head, X = new V3().crossVectors(J.Uh3, J.Fh3).normalize();
    const c = J.neck.clone().addScaledVector(J.Uh3, hd.up).addScaledVector(J.Fh3, hd.fwd).addScaledVector(J.F3, Math.sin((J.nk || 0) * R) * hd.up * 0.75), d = p.clone().sub(c);
    const a = [d.dot(X) / (hd.r[0] + 0.3), d.dot(J.Uh3) / (hd.r[1] + 0.3), d.dot(J.Fh3) / (hd.r[2] + 0.3)], f = Math.hypot(...a); if (f >= 1) return null;
    const k = Math.max(0.15, f); return d.multiplyScalar(1 / k - 1);
  }
  function bodyPush(p, J, lm, ref, planar) {   // أكبر إزاحة تطلع النقطة من الجسم (والأرض)
    let best = null; const take = v => { if (v && (!best || v.lengthSq() > best.lengthSq())) best = v; };
    J.legs.forEach(l => { take(capPush(p, l.hip, l.kn, lm.thR, ref, planar)); take(capPush(p, l.kn, l.an, lm.shR, ref, planar)); });
    take(torsoPush(p, J, lm, planar)); const hp = headPush(p, J, lm); if (hp && planar) hp.x = 0; take(hp);
    if (p.y < 0.4) take(new THREE.Vector3(0, 0.4 - p.y, 0));
    return best;
  }
  function dbAxis(kind, a, J, exId) {
    const V3 = THREE.Vector3;
    if (exId === 'db_fly') return perp(J.T3, a.hd).normalize();
    if (kind === 'dbX') return new V3(1, 0, 0);
    if (kind === 'dbZ') { const z = perp(new V3(0, 0, 1), a.hd); return z.lengthSq() > 1e-4 ? z.normalize() : new V3(0, 0, 1); }
    return new V3().crossVectors(a.hd, new V3(1, 0, 0)).normalize();
  }
  function dbPoints(c, ax) {      // حواف أقراص الدمبل (نص قطر 5.2، على بعد 6.4 من النص، سمك 2.8)
    const V3 = THREE.Vector3, u = perp(new V3(0, 1, 0), ax); if (u.lengthSq() < 1e-4) u.set(0, 0, 1).addScaledVector(ax, -ax.z); u.normalize();
    const w = new V3().crossVectors(ax, u), pts = [];
    for (const sg of [-1, 1]) for (const f of [-1.3, 1.3]) {
      const pc = c.clone().addScaledVector(ax, sg * 6.4 + f); pts.push(pc.clone());
      for (let k = 0; k < 12; k++) { const t = k / 12 * 2 * Math.PI; pts.push(pc.clone().addScaledVector(u, 5.2 * Math.cos(t)).addScaledVector(w, 5.2 * Math.sin(t))); }
    }
    return pts;
  }
  function armSolve(a, tgt, B) { const [elb, wr] = ik3(a.sh, tgt, B.upper, B.fore, a.pole); a.el = elb; a.wr = wr; a.tgt = tgt; a.hd = a.flatHd || wr.clone().sub(elb).normalize(); return a; }
  // الأوزان اللي بالإيد: الدمبلز (كل إيد وحدها) والبار والمقابض بين الإيدين (سوا). ترجع الإزاحة اللازمة لكل إيد حتى ما تدخل بالجسم ولا بالأرض
  const HELD_BAR = { bar: 2, cableCurl: 2.5, cableHigh: 2.5 };
  function heldPush(J, lm, actual) {
    if (J.exId === 'hip_thrust') return null;   // البار مسنود على الورك عن قصد
    const V3 = THREE.Vector3, ex = EX[J.exId], eq = ex.equip || [], WR = a => actual && a.gd ? a.tgt.clone().add(a.gd) : a.wr.clone();
    const dbk = eq.find(e => e === 'dbX' || e === 'dbZ' || e === 'dbH'), bk = eq.find(e => HELD_BAR[e] != null && !eq.includes('smith'));
    const deepest = (pts, ref, planar) => { let best = null; pts.forEach(p => { const v = bodyPush(p, J, lm, ref, planar); if (v && (!best || v.lengthSq() > best.lengthSq())) best = v; }); return best; };
    if (dbk) return J.arms.map(a => {
      const c = WR(a).addScaledVector(a.hd, 2.8), ax = dbAxis(dbk, a, J, J.exId), tot = new V3();
      for (let k = 0; k < 4; k++) { const cc = c.clone().add(tot), b = deepest(dbPoints(cc, ax), cc); if (!b || b.lengthSq() < 0.0025) break; tot.add(b.multiplyScalar(1.1)); }
      return tot.lengthSq() > 0.0025 ? tot : null;
    });
    if (bk) {
      const g = HELD_BAR[bk], m = WR(J.arms[0]).add(WR(J.arms[1])).multiplyScalar(0.5).add(J.arms[0].hd.clone().add(J.arms[1].hd).multiplyScalar(g / 2)), tot = new V3();
      const half = Math.min(19, Math.abs(WR(J.arms[0]).x - WR(J.arms[1]).x) / 2 - 3);
      for (let k = 0; k < 4; k++) {
        const pts = []; for (let x = -half; x <= half + 1e-6; x += 1.5) pts.push(m.clone().add(tot).add(new V3(x, 0, 0)));
        if (bk === 'bar') for (const sx of [-1, 1]) pts.push(m.clone().add(tot).add(new V3(sx * 42, -12.2, 0)));   // الأقراص ما تنزل تحت الأرض
        const b = deepest(pts, m.clone().add(tot), true); if (!b || b.lengthSq() < 0.0025) break; tot.add(b.multiplyScalar(1.1));
      }
      return tot.lengthSq() > 0.0025 ? [tot, tot.clone()] : null;
    }
    return null;
  }
  function armsOut(J, B) {   // الكوع والعضد ما يدخلون بالجذع: الكوع يطلع لبرّه لحد ما يبعد
    const lm = LM(B), V3 = THREE.Vector3;
    J.arms.forEach((a, i) => {
      const sg = i ? -1 : 1;
      for (let k = 0; k < 5; k++) {   // الإزاحة بقدر الدخول (تدريجية)، فما يصير قفز
        let d = 0; [a.el, a.sh.clone().lerp(a.el, 0.6), a.el.clone().lerp(a.wr, 0.3)].forEach(p => { const v = torsoPush(p, J, lm, false, 2.6); if (v) d = Math.max(d, v.length()); });
        if (d < 0.02) break;
        a.pole = a.pole.clone().add(new V3(sg * Math.min(0.8, d * 0.18), 0, 0)).normalize(); armSolve(a, a.tgt, B);
      }
    });
  }
  function resolveHeld(J, rig, actual) {
    const lm = LM(rig.B); let moved = false;
    for (let it = 0; it < 4; it++) {
      const push = heldPush(J, lm, actual); if (!push || push.every(v => !v)) break;
      J.arms.forEach((a, i) => {
        if (!push[i]) return;
        // الإيد تنزاح، بس ما تبعد عن الكتف أكثر من قبل (إذا الذراع مفرودة، تدور حول الكتف بدل ما تمد لبرّه)
        const d0 = a.tgt.distanceTo(a.sh), lim = Math.max(d0, (rig.B.upper + rig.B.fore) * 0.97);
        let tg = a.tgt.clone().add(push[i].clampLength(0, 8)); const d1 = tg.distanceTo(a.sh);
        if (d1 > lim) tg = a.sh.clone().add(tg.sub(a.sh).setLength(lim));
        armSolve(a, tg, rig.B);
      });
      moved = true;
      if (actual) { const inf = rig.mh.pose(J, S && S.hand); J.arms.forEach((a, i) => { a.gd = inf.Wr[i].clone().sub(inf.W[i]); }); }
    }
    return moved;
  }
  // يقلب الوضعية على الجنب (للبلانك الجانبي): لفّة ٩٠° حول طول الجسم، بعدين ميلان حتى الكتف يصير فوك الكوع والقدم التحتانية على البساط
  function sideRoll(J, B, Mo) {
    const V3 = THREE.Vector3, Q = THREE.Quaternion, top = 2.6, pts = [J.pelvis, J.neck], dirs = [J.T3, J.F3, J.Uh3, J.Fh3];
    J.legs.forEach(l => { pts.push(l.hip, l.kn, l.an); dirs.push(l.sole); });
    J.arms.forEach(a => { pts.push(a.sh, a.el, a.wr, a.tgt); dirs.push(a.pole, a.hd); });
    const turn = (q, c) => { pts.forEach(p => p.sub(c).applyQuaternion(q).add(c)); dirs.forEach(d => d.applyQuaternion(q)); };
    turn(new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2), J.pelvis.clone());
    const an = J.legs[0].an.clone(), sh = J.arms[0].sh, v = sh.clone().sub(an), r = Math.hypot(v.y, v.z);
    const yA = top + 4.3, yS = top + 3.9 + B.upper + 0.4 * (Mo.breath || 0), th = Math.atan2(v.y, v.z), s = clamp((yS - yA) / r, -1, 1), th2 = v.z >= 0 ? Math.asin(s) : Math.PI - Math.asin(s);
    turn(new Q().setFromAxisAngle(new V3(1, 0, 0), th - th2), an);
    const dy = yA - J.legs[0].an.y; pts.forEach(p => { p.y += dy; });
    // الإيد التحتانية: الكوع تحت الكتف بالضبط والساعد على البساط لقدّام. الفوكانية: مفرودة للسقف
    const a0 = J.arms[0], fw = J.F3.clone().setY(0).normalize(), el = a0.sh.clone().add(new V3(0, -B.upper, 0)), w0 = el.clone().addScaledVector(fw, B.fore).add(new V3(0, 1.8, 0));
    a0.pole = el.clone().sub(a0.sh.clone().lerp(w0, 0.5)).normalize(); armSolve(a0, w0, B);
    const a1 = J.arms[1]; a1.pole = J.F3.clone(); armSolve(a1, a1.sh.clone().add(new V3(0, (B.upper + B.fore) * 1.3, 0)), B);
  }
  function solve(exId, rig, t) {
    const V3 = THREE.Vector3, ex = EX[exId], B = rig.B, D = rig.D, G = ex.G || FY, C = 95;
    const Mo = M[ex.m](B, t, ex.P || {}, D), lc = ex.lat(Mo.p, D, Mo);
    const v3 = (p, x) => new V3(x, G - p[1], p[0] - C), d3 = v => new V3(0, -v[1], v[0]).normalize();
    const J = { Mo, legs: [], arms: [], v3, nk: Mo.nk || 0 };
    J.pelvis = v3(Mo.hip, 0); J.T3 = d3(Mo.T); J.F3 = d3(Mo.F);
    J.neck = Mo.cr ? v3(Mo.sh, 0) : J.pelvis.clone().addScaledVector(J.T3, B.torso); J.Uh3 = d3(Mo.Uh); J.Fh3 = d3(front(Mo.Uh)); J.cr = Mo.cr || 0;
    const qtw = Mo.tw ? new THREE.Quaternion().setFromAxisAngle(Mo.Tu ? d3(Mo.Tu) : J.T3, Mo.tw * R) : null; J.tw = Mo.tw || 0;   // لفّة الجذع: الكتفين والراس يلفون حول محور العمود الفقري
    if (qtw) { J.Uh3.applyQuaternion(qtw); J.Fh3.applyQuaternion(qtw); }
    const twP = p => qtw ? p.clone().sub(J.neck).applyQuaternion(qtw).add(J.neck) : p;
    [[0, 1], [1, -1]].forEach(([i, Sg]) => {
      const lg = Mo.legs[i], hip = J.pelvis.clone().add(new V3(Sg * D.hw, 0, 0)), ankT = v3(lg.ank, Sg * lc.ankle);
      const kp = sub(lg.knee, lerpP(lg.hip, lg.ank, 0.5)), kl = len(kp);
      const kpole = kl > 0.5 && !lg.pf ? new V3(Sg * lc.knee, -kp[1] / kl, kp[0] / kl) : J.F3.clone().add(new V3(Sg * lc.knee, 0, 0));   // pf: الركبة دايمًا لجهة الصدر (حتى ما ترجف لما تنفرد)
      const [kn, an] = ik3(hip, ankT, B.thigh, B.shin, kpole);
      const sole = new V3(Sg * Math.sin((lc.toe || 0) * R), -lg.s[1], lg.s[0]).normalize();
      J.legs.push({ hip, kn, an, sole });
      const am = Mo.arms[i], shJ = twP(J.neck.clone().add(new V3(Sg * D.sw, 0, 0))), wrT = twP(v3(am.tgt2 || am.wr, Sg * lc.wrist));
      const ep = sub(am.el, lerpP(am.sh, am.wr, 0.5)), el = len(ep), wq = smoothstep(0.25, 2.5, el);   // مزج ناعم، حتى الكوع ما يقفز لما الذراع تنفرد
      const fb = new V3(Sg * lc.flare, 0, 0).addScaledVector(J.F3, lc.fbz != null ? lc.fbz : -0.3), pole = el > 1e-4 ? fb.multiplyScalar(1 - wq).add(new V3(Sg * lc.flare, -ep[1] / el, ep[0] / el).multiplyScalar(wq)) : fb;
      if (am.elLat != null) { const E3 = v3(am.el, Sg * am.elLat), m3 = shJ.clone().add(wrT).multiplyScalar(0.5); pole.copy(E3.sub(m3)).normalize(); }   // كوع محدد بالضبط
      if (qtw) pole.applyQuaternion(qtw);
      J.arms.push(armSolve({ sh: shJ, pole, flatHd: ex.flat ? d3(am.hd) : null, rel: am.rel || 0 }, wrT, B));
    });
    J.exId = exId; if (!qtw && !J.cr) armsOut(J, B); resolveHeld(J, rig, false);
    if (Mo.side) sideRoll(J, B, Mo);
    return J;
  }
  const _m = () => new THREE.Matrix4();
  let MT = null;
  function orient(obj, pos, y, zRef) {
    const V3 = THREE.Vector3; if (!MT) MT = { m: _m(), x: new V3(), y: new V3(), z: new V3() };
    MT.y.copy(y).normalize(); MT.z.copy(zRef).addScaledVector(MT.y, -zRef.dot(MT.y));
    if (MT.z.lengthSq() < 1e-8) { MT.z.set(0, 0, 1).addScaledVector(MT.y, -MT.y.z); if (MT.z.lengthSq() < 1e-8) MT.z.set(1, 0, 0); }
    MT.z.normalize(); MT.x.crossVectors(MT.y, MT.z).normalize();
    MT.m.makeBasis(MT.x, MT.y, MT.z); obj.quaternion.setFromRotationMatrix(MT.m); obj.position.copy(pos);
  }
  function applyPose(rig, J) {
    if (rig.mh) {   // الجسم التشريحي يوصل بإيده لأبعد ما يكدر، والأوزان تمشي ويا إيده الحقيقية
      const inf = rig.mh.pose(J, S && S.hand);
      if (inf) J.arms.forEach((a, i) => { a.gd = inf.Wr[i].clone().sub(inf.W[i]); });
      if (J.exId) resolveHeld(J, rig, true);
      return;
    }
    const b = rig.bones;
    orient(b.torso, J.pelvis, J.T3, J.F3); orient(b.head, J.neck, J.Uh3, J.Fh3);
    ['L', 'R'].forEach((s, i) => {
      const a = J.arms[i], l = J.legs[i];
      const ua = a.el.clone().sub(a.sh).normalize(), fa = a.wr.clone().sub(a.el).normalize();
      const antU = antBlend(a.wr.clone().sub(a.el), ua, J.F3), antF = antBlend(a.sh.clone().sub(a.el), fa, antU);
      orient(b['uArm' + s], a.sh, ua, antU); orient(b['fArm' + s], a.el, fa, antF); orient(b['hand' + s], a.wr, a.hd, antF);
      const ta = l.kn.clone().sub(l.hip).normalize(), sa = l.an.clone().sub(l.kn).normalize();
      orient(b['thigh' + s], l.hip, ta, antBlend(l.kn.clone().sub(l.an), ta, J.F3));
      orient(b['shin' + s], l.kn, sa, perp(l.sole, sa));
      orient(b['foot' + s], l.an, l.sole, l.kn.clone().sub(l.an));
    });
  }

  /* ---------- الأجهزة ---------- */
  function buildEquip(exId, rig) {
    const V3 = THREE.Vector3, MAT = S.MAT, ex = EX[exId], g = new THREE.Group(), ups = [];
    const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const box = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
    const cyl = (r, h, mat, seg) => mesh(new THREE.CylinderGeometry(r, r, h, seg || 16), mat);
    const rod = (a, b, r, mat) => { const m = cyl(r, 1, mat, 12); const set = (a, b) => { m.scale.set(1, Math.max(0.01, a.distanceTo(b)), 1); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); }; set(a, b); m.userData.set = set; return m; };
    const J0 = solve(exId, rig, 0), J1 = solve(exId, rig, 1.4), v3 = J0.v3, D = rig.D;
    const orientBox = (m, xAxis, yAxis, zAxis) => m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    function dumbbell(handleLen, plateR) {
      const d = new THREE.Group();
      const hnd = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, handleLen, 12), MAT.steel); hnd.rotation.z = Math.PI / 2; hnd.castShadow = true; d.add(hnd);
      for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR, 2.8, 6), MAT.rubber); pl.rotation.z = Math.PI / 2; pl.position.x = s * (handleLen / 2 + 0.9); pl.castShadow = true; d.add(pl); }
      g.add(d); return d;
    }
    function barbell() {
      const d = new THREE.Group(), L = 118;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, L, 12), MAT.steel); bar.rotation.z = Math.PI / 2; bar.castShadow = true; d.add(bar);
      for (const s of [-1, 1]) for (const [r, x, w] of [[12, 42, 3.2], [9, 45.6, 2.6]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), MAT.rubber); pl.rotation.z = Math.PI / 2; pl.position.x = s * x; pl.castShadow = true; d.add(pl); }
      g.add(d); return d;
    }
    const WR = a => a.gd ? a.tgt.clone().add(a.gd) : a.wr.clone();   // مكان الرسغ الحقيقي
    // مركز القبضة الحقيقي ومحورها من عظام إيد الجسم (المقبض يمر من داخل الأصابع المسكّرة، مو من الرسغ ولا من ظهر الإيد)
    const fistAt = (J, i, gR) => {
      const a = J.arms[i], ax0 = new V3(0, 1, 0).addScaledVector(a.hd, -a.hd.y).normalize();
      const bn = rig.mh && rig.mh.B && rig.mh.B.byName, s2 = i ? 'R' : 'L';
      if (!bn || !bn['finger3-3.' + s2]) return { c: WR(a), ax: ax0 };
      const gp = n => bn[n + '.' + s2].getWorldPosition(new V3()), w = gp('wrist'), m1 = gp('finger3-1'), k2 = gp('finger2-1'), k5 = gp('finger5-1');
      const hl = w.distanceTo(m1), hd = m1.clone().sub(w).normalize(), ax = k5.sub(k2).normalize(); let n = new V3().crossVectors(ax, hd).normalize(); if (gp('finger3-3').sub(m1).dot(n) < 0) n.negate();
      const R = gR || 1.6, c = w.clone().addScaledVector(hd, (R > 1.35 ? 0.86 : 0.87) * hl).addScaledVector(n, 1.25 * hl / 7.8 + R);   // نفس حلقة الأصابع اللي تنحسب بالجسم
      return { c, ax };
    };
    const mid = J => WR(J.arms[0]).add(WR(J.arms[1])).multiplyScalar(0.5);
    const Bb = rig.B, bvB = backV(Bb);
    // برج أوزان: عمودين، أدلة، ١٢ قرص، والأقراص الفوكانية ترتفع بقدر ما ينسحب الكيبل
    function stackTower(z, h, sx0) {
      const x0 = sx0 || 0, face = [];
      // برج أوزان بستايل الصالات: قاعدة، عمودين فضيين برّه الغطا، غطا جانبي بحافات فضية، راس فوك بيه بكرة، والأوزان وأدلتها تبين من قدّام وورا
      const foot = box(32, 3, 26, MAT.frame); foot.position.set(x0, 1.5, z);
      for (const sx of [-1, 1]) { const up = box(3.2, h, 4.2, MAT.frame); up.position.set(x0 + sx * 14.2, h / 2, z); rod(new V3(x0 + sx * 6, 3, z), new V3(x0 + sx * 6, h - 6, z), 0.55, MAT.steel); }
      const head = box(32, 7, 16, MAT.shroud); head.position.set(x0, h + 1.5, z); const hc = box(32.4, 1.2, 16.4, MAT.frame); hc.position.set(x0, h + 5.3, z);
      for (const sz of [-1, 1]) { const pw = cyl(3.6, 2.2, MAT.steel, 18); pw.rotation.z = Math.PI / 2; pw.position.set(x0, h - 3, z + sz * 5); }
      rod(new V3(x0 - 10, 1.5, z), new V3(x0 + 10, 1.5, z), 1.8, MAT.frame);
      const plates = Array.from({ length: 12 }, (_, k) => { const m = box(15, 2.5, 9, k % 2 ? MAT.rubber : MAT.deck); m.position.set(x0, 3.4 + k * 2.7, z); return m; });
      const top = box(4, 5, 4, MAT.steel);
      for (const sx of [-1, 1]) { const sh2 = box(1.2, h - 14, 14, MAT.shroud); sh2.position.set(x0 + sx * 12, h / 2 + 2, z); for (const sz of [-1, 1]) { const tr = box(1.6, h - 14, 1, MAT.frame); tr.position.set(x0 + sx * 12, h / 2 + 2, z + sz * 7); } }   // غطا جانبي بحافات فضية
      return { plates, set(lift) { const L = clamp(lift, 0, h - 45); plates.forEach((m, j) => { m.position.y = 3.4 + j * 2.7 + (j >= 8 ? L : 0); }); top.position.set(x0, 3.4 + 12 * 2.7 + L + 1, z); return top.position.clone(); } };
    }
    const pullLen = (a, b) => a.distanceTo(b);
    function leverMachine(J0, axis) {   // محور، هيكل، ذراعين تنزل للمقابض، وبرج أوزان ورا
      const Mo = J0.Mo, pv = v3(Mo.piv, 0), xl = rig.D.sw + 10, xp = rig.D.sw + 15, xs = xp + 16, top = pv.y + 6;
      for (const sx of [-1, 1]) { rod(new V3(sx * xp, 0, pv.z), new V3(sx * xp, pv.y + 6, pv.z), 2.4, MAT.frame); rod(new V3(sx * xp, 1.2, pv.z + 26), new V3(sx * xp, 1.2, pv.z - 34), 2.2, MAT.frame); }
      rod(new V3(-xp, pv.y + 6, pv.z), new V3(xp, pv.y + 6, pv.z), 2, MAT.frame); rod(new V3(xp, pv.y + 6, pv.z), new V3(xs, top, pv.z), 2, MAT.frame); rod(new V3(xp, 1.2, pv.z), new V3(xs, 1.2, pv.z), 2, MAT.frame);
      rod(new V3(-xp, pv.y, pv.z), new V3(xp + 3, pv.y, pv.z), 1.7, MAT.steel);
      const st = stackTower(pv.z, top, xs), levers = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.7, MAT.frame)), cons = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame)), cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
      const grips = [0, 1].map(() => { const c = cyl(1.5, 13, MAT.rubber); if (axis === 'x') c.rotation.z = Math.PI / 2; return c; });
      ups.push(J => {
        const M2 = J.Mo, k = clamp((M2.a0 - M2.lev) / ((M2.a0 - M2.aTop) || 1), 0, 1);
        J.arms.forEach((a, i) => {
          const sx = i ? -1 : 1, hp = WR(a).addScaledVector(a.hd, 2.5), end = new V3(sx * xl, hp.y + (axis === 'y' ? 6.5 : 0), hp.z);
          grips[i].position.copy(hp); cons[i].userData.set(axis === 'y' ? hp.clone().add(new V3(0, 6.5, 0)) : new V3(sx * (Math.abs(hp.x) + 6.5), hp.y, hp.z), end);
          levers[i].userData.set(new V3(sx * xl, pv.y, pv.z), end);
        });
        const tp = st.set(Math.abs(k) * 14); cab.userData.set(new V3(xs, pv.y, pv.z), tp);
      });
    }
    const hdm = J => J.arms[0].hd.clone().add(J.arms[1].hd).multiplyScalar(0.5);
    for (const e of (ex.equip || [])) {
      if (e === 'dbX' || e === 'dbZ' || e === 'dbH') {
        const dbs = [dumbbell(11, 5.2), dumbbell(11, 5.2)];
        ups.push(J => J.arms.forEach((a, i) => {
          dbs[i].position.copy(WR(a)).addScaledVector(a.hd, 2.8);
          if (exId === 'db_fly') dbs[i].quaternion.setFromUnitVectors(new V3(1, 0, 0), perp(J.T3, a.hd).normalize());
          else if (e === 'dbX') dbs[i].quaternion.identity();
          else if (e === 'dbZ') dbs[i].quaternion.setFromUnitVectors(new V3(1, 0, 0), perp(new V3(0, 0, 1), a.hd).normalize());
          else dbs[i].quaternion.setFromUnitVectors(new V3(1, 0, 0), new V3().crossVectors(a.hd, new V3(1, 0, 0)).normalize());
        }));
      } else if (e === 'dbV') {
        const d = dumbbell(11, 5.6);
        ups.push(J => {
          if (exId === 'oh_tri') { const hb = J.F3.clone().multiplyScalar(-1); d.position.copy(mid(J)).addScaledVector(hb, 2.2).add(new V3(0, -4.4, 0)); d.quaternion.setFromUnitVectors(new V3(1, 0, 0), new V3(0, 1, 0)); }   // الدمبل عمودي: القرص الفوكاني على الكفين
          else { d.position.copy(mid(J)).addScaledVector(J.T3, -4.75).addScaledVector(J.F3, -0.5); d.quaternion.setFromUnitVectors(new V3(1, 0, 0), J.T3); }
        });
      } else if (e === 'bar') {
        const bb = barbell(); ups.push(J => { bb.position.copy(mid(J)).add(hdm(J).multiplyScalar(2)); });
      } else if (e === 'mat') {
        const hip = J0.pelvis, m = box(34, 2.6, 170, MAT.mat); m.position.set(0, 1.3, hip.z + (['pushup', 'knee_pushup', 'plank', 'climber'].includes(exId) ? 5 : 0));
        m.receiveShadow = true;
      } else if (e === 'benchFlat' || e === 'benchIncline' || e === 'benchUpright') {
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3, bv = backV(rig.B), seatY = e === 'benchFlat' && J0.Mo.seatTop != null ? (ex.G || FY) - J0.Mo.seatTop : hip.y - 6.2;
        if (e === 'benchFlat') {
          const pad = box(17, 4.2, 84, MAT.pad); pad.position.set(0, seatY - 2.1, hip.z - 27);
          for (const z of [hip.z + 8, hip.z - 60]) { const leg = box(12, seatY - 4.2, 3, MAT.frame); leg.position.set(0, (seatY - 4.2) / 2, z); }
        } else {
          const seat = box(17, 4.2, 26, MAT.pad); seat.position.set(0, seatY - 2.1, hip.z + 4);
          const back = box(17, 4.2, e === 'benchUpright' ? 56 : 64, MAT.pad);
          back.position.copy(hip).addScaledVector(T3, e === 'benchUpright' ? 22 : 30).addScaledVector(F3, bv + 0.3 - 2.1);
          orientBox(back, new V3(-1, 0, 0), F3, T3);
          rod(new V3(0, seatY - 4.2, hip.z + 4), new V3(0, 1.5, hip.z + 4), 1.6, MAT.frame);
          const base = box(10, 2.4, 60, MAT.frame); base.position.set(0, 1.2, hip.z - 10);
          rod(hip.clone().addScaledVector(T3, 22).addScaledVector(F3, bv - 4.3), new V3(0, 2.4, hip.z - 36), 1.4, MAT.frame);
        }
      } else if (e === 'benchBack') {
        const z0 = (exId === 'bench_dip' ? 58 : 50) - 95, top = 30;
        const pad = box(38, 4, 30, MAT.pad); pad.position.set(0, top - 2, z0);
        for (const sx of [-1, 1]) for (const dz of [-11, 11]) { const lg = box(3, top - 4, 3, MAT.frame); lg.position.set(sx * 15, (top - 4) / 2, z0 + dz); }
      } else if (e === 'benchCross') {
        const pad = box(64, 5, 18, MAT.pad); pad.position.set(0, 25.5, 50 - 95);   // بنج واطي (~٤٠ سم) مثل بنج الهيب ثرست
        for (const sx of [-1, 1]) { const lg = box(3, 23, 12, MAT.frame); lg.position.set(sx * 26, 11.5, 50 - 95); }
      } else if (e === 'legpress') {
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3;
        const back = box(18, 4, 58, MAT.pad); back.position.copy(hip).addScaledVector(T3, 22).addScaledVector(F3, bvB + 0.3 - 2); orientBox(back, new V3(-1, 0, 0), F3, T3);
        const seat = box(18, 4, 22, MAT.pad); seat.position.set(0, hip.y - 9, hip.z + 4); seat.rotation.x = -0.25;
        const d = new V3(0, Math.sin(38 * R), Math.cos(38 * R)), n = new V3(0, -d.z, d.y).negate();
        // ليغ بريس ٤٥° بستايل الصالات: قاعدة بزلاقتين، سكتين مايلات على عمودين ورا، عربة (سلد) تزحلق عليهن وبيها قرون الأقراص، ومقابض جنب المقعد
        const plate = box(40, 34, 3, MAT.frame); const railA = hip.clone().addScaledVector(d, 20).add(new V3(0, -10, 0)), railB = railA.clone().addScaledVector(d, 86);
        const orient = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 0, 1), b.clone().sub(a).normalize()); };
        for (const sx of [-1, 1]) {
          const rl = box(4, 4, 1, MAT.frame); rl.scale.z = railA.distanceTo(railB); orient(rl, railA.clone().setX(sx * 21), railB.clone().setX(sx * 21));
          const sk = box(6, 4, 1, MAT.frame); sk.scale.z = railB.z - hip.z + 40; orient(sk, new V3(sx * 26, 2, hip.z - 30), new V3(sx * 26, 2, railB.z + 10));
          const po = box(5, railB.y, 5, MAT.frame); po.position.set(sx * 21, railB.y / 2, railB.z);
          rod(new V3(sx * 21, 2, railA.z + 6), railA.clone().setX(sx * 21), 2, MAT.frame);
        }
        for (const z of [hip.z - 28, railB.z + 8]) { const cb = box(58, 4, 5, MAT.frame); cb.position.set(0, 2, z); }
        const sfr = box(24, hip.y - 14, 26, MAT.shroud); sfr.position.set(0, (hip.y - 14) / 2 + 2, hip.z + 2);
        const sled = box(48, 7, 26, MAT.shroud), bear = [0, 1].map(() => box(8, 6, 12, MAT.frame));
        { const hgs = [0, 1].map(() => { const g2 = cyl(1.6, 11, MAT.rubber); return g2; }), hps = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.4, MAT.frame));
          ups.push(J => J.arms.forEach((a, i) => { const f = fistAt(J, i), ax = f.ax.z < 0 ? f.ax.negate() : f.ax; hgs[i].position.copy(f.c); hgs[i].quaternion.setFromUnitVectors(new V3(0, 1, 0), ax); const b0 = f.c.clone().addScaledVector(ax, -5.5); hps[i].userData.set(b0, new V3((i ? -1 : 1) * 13, J.pelvis.y - 12, J.pelvis.z + 2)); })); }
        const horns = [-1, 1].map(sx => { const g2 = new THREE.Group(); const h = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 12), MAT.steel); h.rotation.z = Math.PI / 2; g2.add(h);
          for (let k = 0; k < 2; k++) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(11 - k * 2.5, 11 - k * 2.5, 2.4, 28), MAT.rubber); pl.rotation.z = Math.PI / 2; pl.position.x = sx * (2 + k * 2.6); pl.castShadow = true; g2.add(pl); }
          g.add(g2); return { g2, sx }; });
        ups.push(J => { const a = J.legs[0].an.clone().add(J.legs[1].an).multiplyScalar(0.5); plate.position.copy(a).addScaledVector(d, 4); orientBox(plate, new V3(1, 0, 0), new V3().crossVectors(d, new V3(1, 0, 0)).negate(), d);
          const sc = plate.position.clone().addScaledVector(d, 7); sled.position.copy(sc); orientBox(sled, new V3(1, 0, 0), new V3().crossVectors(d, new V3(1, 0, 0)).negate(), d);
          bear.forEach((bb, i) => { const on = railA.clone().setX((i ? -1 : 1) * 21), t2 = sc.clone().sub(railA).dot(d); bb.position.copy(on).addScaledVector(d, t2); orientBox(bb, new V3(1, 0, 0), new V3().crossVectors(d, new V3(1, 0, 0)).negate(), d); });
          horns.forEach(h => h.g2.position.copy(plate.position).addScaledVector(d, 8).add(new V3(h.sx * 27, -6, 0))); });
      } else if (e === 'legext' || e === 'legcurl') {
        const hip = J0.pelvis;
        if (e === 'legext') {
          const seat = box(20, 4, 30, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 13);
          const back = box(20, 44, 4, MAT.pad); back.position.copy(hip).addScaledVector(J0.T3, 20).addScaledVector(J0.F3, bvB + 0.3 - 2); orientBox(back, new V3(1, 0, 0), J0.T3, J0.F3);
          rod(new V3(0, hip.y - 10, hip.z + 13), new V3(0, 1, hip.z + 13), 2, MAT.frame);
          const base = box(14, 2.4, 60, MAT.frame); base.position.set(0, 1.2, hip.z + 10);
        } else {
          const pad = box(22, 5, 104, MAT.pad); pad.position.set(0, (140 - (FY - 30)) - 2.5, hip.z + 12);
          for (const z of [hip.z + 50, hip.z - 36]) rod(new V3(0, 110 - 140 + 140 - 110 + 25, z), new V3(0, 1, z), 2, MAT.frame);
        }
        const roll = cyl(3.2, 30, MAT.pad, 18); roll.rotation.z = Math.PI / 2;
        // محور الجهاز على خط الركبة بالجنب، ذراع تنزل للبكرة، وبرج أوزان جانبي موصول بكيبل
        const kn0 = J0.legs[0].kn, px = 19, pv = new V3(px, kn0.y, kn0.z), hub = cyl(3.4, 4, MAT.steel, 18); hub.rotation.z = Math.PI / 2; hub.position.copy(pv);
        const cam = cyl(6, 2.4, MAT.shroud, 24); cam.rotation.z = Math.PI / 2; cam.position.copy(pv).add(new V3(2.6, 0, 0));
        rod(new V3(px, 1, pv.z + (e === 'legext' ? 8 : 0)), pv, 2.4, MAT.frame); rod(new V3(px, 1.2, pv.z - 30), new V3(px, 1.2, pv.z + 20), 2, MAT.frame);
        const tz = e === 'legext' ? pv.z - 24 : pv.z - 40, st = stackTower(tz, 120, 48); rod(new V3(px, 1.2, tz), new V3(33, 1.2, tz), 2, MAT.frame);
        const lev = rod(new V3(), new V3(0, 1, 0), 1.8, MAT.frame), bar = rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame), cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), cab2 = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
        if (e === 'legext') { const hgs = [0, 1].map(() => { const g2 = cyl(1.6, 11, MAT.rubber); g2.rotation.x = Math.PI / 2; return g2; }), hps = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame));   // مقابض جنب المقعد: القبضة لكدام وتمر من وسط الكف
          ups.push(J => J.arms.forEach((a, i) => { const f = fistAt(J, i), ax = f.ax.z < 0 ? f.ax.negate() : f.ax; hgs[i].position.copy(f.c); hgs[i].quaternion.setFromUnitVectors(new V3(0, 1, 0), ax); const b0 = f.c.clone().addScaledVector(ax, -5.5); hps[i].userData.set(b0, new V3(b0.x, J.pelvis.y - 10, b0.z - 4)); })); }
        else { const hgs = [0, 1].map(() => cyl(1.6, 10, MAT.rubber)), hps = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.4, MAT.frame));   // مقابض قدّام تحت الوسادة، بمكان القبضة الحقيقي
          ups.push(J => J.arms.forEach((a, i) => { const f = fistAt(J, i), ax = f.ax.z < 0 ? f.ax.negate() : f.ax; hgs[i].position.copy(f.c); hgs[i].quaternion.setFromUnitVectors(new V3(0, 1, 0), ax); const b0 = f.c.clone().addScaledVector(ax, -5); hps[i].userData.set(b0, new V3(b0.x, 1, b0.z - 2)); })); }
        ups.push(J => {
          const a = J.legs[0].an.clone().add(J.legs[1].an).multiplyScalar(0.5), s = J.legs[0].sole;
          const off = e === 'legext' ? s.clone().multiplyScalar(4.5) : s.clone().multiplyScalar(-4.5);
          roll.position.copy(a).add(off).addScaledVector(J.legs[0].kn.clone().sub(J.legs[0].an).normalize(), 2);
          const re = roll.position.clone().setX(px); lev.userData.set(pv, re); bar.userData.set(re, re.clone().setX(15));
          const ang = Math.atan2(re.y - pv.y, re.z - pv.z), lift = Math.abs(ang - Math.atan2(J0.legs[0].an.y - pv.y, J0.legs[0].an.z - pv.z)) * 10;
          const tp = st.set(lift); const cp = pv.clone().add(new V3(3, 6, 0)); cab.userData.set(cp, new V3(48, 122, tz)); cab2.userData.set(new V3(48, 122, tz), tp);
        });
      } else if (e === 'chestpress') {
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3;
        const seat = box(20, 4, 24, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 6);
        const back = box(20, 48, 4, MAT.pad); back.position.copy(hip).addScaledVector(T3, 22).addScaledVector(F3, bvB + 0.3 - 2); orientBox(back, new V3(1, 0, 0), T3, F3);
        rod(new V3(0, hip.y - 10, hip.z + 6), new V3(0, 1, hip.z + 6), 2, MAT.frame);
        leverMachine(J0, 'y');
      } else if (e === 'pulldown' || e === 'cableHigh' || e === 'cableLow' || e === 'pullbar') {
        const hip = J0.pelvis;
        if (e === 'pulldown') {
          const seat = box(20, 4, 24, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 4);
          rod(new V3(0, hip.y - 10, hip.z + 4), new V3(0, 1, hip.z + 4), 2, MAT.frame);
          const kp = cyl(3, 26, MAT.pad, 16); kp.rotation.z = Math.PI / 2; kp.position.set(0, hip.y + 3, hip.z + 24);
          const st = stackTower(hip.z + 40, 176);
          rod(new V3(0, 172, hip.z + 40), new V3(0, 172, hip.z + 8), 2, MAT.frame);
          const pa = cyl(2.6, 3, MAT.steel, 18); pa.rotation.z = Math.PI / 2; pa.position.set(0, 172, hip.z + 8);
          const pb = cyl(2.6, 3, MAT.steel, 18); pb.rotation.z = Math.PI / 2; pb.position.set(0, 172, hip.z + 40);
          const bar = cyl(1.1, 70, MAT.steel); bar.rotation.z = Math.PI / 2;
          const cab = rod(new V3(0, 172, hip.z + 8), new V3(0, 100, hip.z + 8), 0.35, MAT.cable), cab2 = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
          const Lmin = Math.min(pullLen(new V3(0, 172, hip.z + 8), mid(J0)), pullLen(new V3(0, 172, hip.z + 8), mid(J1)));
          ups.push(J => { const m = mid(J); bar.position.copy(m); cab.userData.set(new V3(0, 172, hip.z + 8), m.clone().add(new V3(0, 1, 0)));
            cab2.userData.set(new V3(0, 170, hip.z + 40), st.set((pullLen(new V3(0, 172, hip.z + 8), m) - Lmin) * 0.5)); });
        } else if (e === 'pullbar') {
          const y = (ex.G || FY) - J0.Mo.barY, bz = J0.Mo.barX - 95;
          const bar = cyl(1.3, 90, MAT.steel); bar.rotation.z = Math.PI / 2; bar.position.set(0, y, bz);
          for (const sx of [-1, 1]) { rod(new V3(sx * 45, y, bz), new V3(sx * 45, y, bz - 21), 1.8, MAT.frame); rod(new V3(sx * 45, y + 2, bz - 21), new V3(sx * 45, 0, bz - 21), 2.2, MAT.frame); }
        } else {
          const high = e === 'cableHigh', zc = high ? J0.neck.z + 34 : hip.z + 66, py = high ? J0.neck.y + 26 : 20, th = Math.max(high ? py + 12 : 150, 150);
          const st = stackTower(zc + 8, th), top = new V3(0, th - 3, zc + 2);
          const pul = cyl(2.6, 3, MAT.steel, 18); pul.rotation.z = Math.PI / 2; pul.position.set(0, py, zc);
          const pt = cyl(2.6, 3, MAT.steel, 18); pt.rotation.z = Math.PI / 2; pt.position.copy(top);
          rod(new V3(0, py, zc + 1), new V3(0, py, zc + 8), 1.4, MAT.frame);
          const hnd = cyl(1.2, high ? 38 : 10, high ? MAT.steel : MAT.rubber); hnd.rotation.z = Math.PI / 2; hnd.visible = high;
          // السحب الأرضي: مقبض V (مسكة متقابلة): قبضتين مطاط تمر من وسط الكف، وتتلاقى كدام بنقطة الكيبل
          const vg = high ? null : [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.6, MAT.rubber)), vb = high ? null : [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.1, MAT.steel)), vt = high ? null : [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.1, MAT.steel));
          const cab = rod(new V3(0, py, zc), new V3(0, py - 5, zc - 5), 0.35, MAT.cable), cab2 = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), cab3 = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
          const L0 = pullLen(new V3(0, py, zc), mid(J0).add(J0.arms[0].hd.clone().add(J0.arms[1].hd).multiplyScalar(1.25))), L1 = pullLen(new V3(0, py, zc), mid(J1).add(J1.arms[0].hd.clone().add(J1.arms[1].hd).multiplyScalar(1.25))), Lmin = Math.min(L0, L1);
          ups.push(J => { let m = mid(J).add(J.arms[0].hd.clone().add(J.arms[1].hd).multiplyScalar(1.25)); hnd.position.copy(m);
            if (vg) { const toP = new V3(0, py, zc).sub(mid(J)).normalize(), apex = mid(J).setX(0).addScaledVector(toP, 9);
              J.arms.forEach((a, i) => { const w = WR(a), ax = new V3(0, 1, 0).addScaledVector(a.hd, -a.hd.y).normalize(), lo = w.clone().addScaledVector(ax, -5.5), hi = w.clone().addScaledVector(ax, 5.5);
                vg[i].userData.set(lo, hi); vb[i].userData.set(lo, apex); vt[i].userData.set(hi, apex); }); m = apex; }
            cab.userData.set(new V3(0, py, zc), m);
            const tp = st.set((pullLen(new V3(0, py, zc), m) - Lmin) * 0.5); cab2.userData.set(new V3(0, py, zc + 1), top); cab3.userData.set(top, tp); });
          if (!high) { const plat = box(26, 16, 3, MAT.frame); plat.position.set(0, 9, hip.z + 52); }
        }
      } else if (e === 'benchLow') {
        const hip = J0.pelvis, pad = box(18, 4, 60, MAT.pad); pad.position.set(0, hip.y - 8, hip.z + 14);
        for (const z of [hip.z - 8, hip.z + 36]) { const lg = box(12, hip.y - 10, 3, MAT.frame); lg.position.set(0, (hip.y - 10) / 2, z); }
      } else if (e === 'bandFeet' || e === 'bandTop' || e === 'bandFront') {
        if (e === 'bandFront') {   // الحبل ملفوف حول باطن القدمين: من الإيد، على جنب القدم، يلف على الباطن، ويعبر للقدم الثانية
          const segs = Array.from({ length: 9 }, () => rod(new V3(), new V3(0, 1, 0), 0.62, MAT.band)), B_ = rig.B;
          ups.push(J => {
            const foot = i => { const l = J.legs[i], out = new V3(i ? -1 : 1, 0, 0), up = perp(l.kn.clone().sub(l.an), l.sole).normalize(), dn = up.clone().negate();
              const ball = l.an.clone().addScaledVector(l.sole, B_.foot * 0.6).addScaledVector(dn, B_.ankleH * 0.55);
              return { top: ball.clone().addScaledVector(out, 3.4).addScaledVector(up, 1.6), side: ball.clone().addScaledVector(out, 3.6).addScaledVector(dn, 1.4), sole: ball.clone().addScaledVector(dn, 2.1).addScaledVector(out, 1.6), mid: ball.clone().addScaledVector(dn, 2.3).addScaledVector(out, -1.2) }; };
            const L = foot(0), Rf = foot(1), hL = WR(J.arms[0]).addScaledVector(J.arms[0].hd, 2.2), hR = WR(J.arms[1]).addScaledVector(J.arms[1].hd, 2.2);
            const pts = [hL, L.top, L.side, L.sole, L.mid, Rf.mid, Rf.sole, Rf.side, Rf.top, hR];
            segs.forEach((m, k) => m.userData.set(pts[k], pts[k + 1]));
          });
        } else if (e === 'bandFeet') {   // واكف على نص الحبل: الحبل يمر تحت باطن القدمين (بنص القدم) ويطلع من الجنب للإيدين
          const segs = Array.from({ length: 5 }, () => rod(new V3(), new V3(0, 1, 0), 0.7, MAT.band)), B_ = rig.B;
          ups.push(J => {
            const mf = i => { const l = J.legs[i], out = new V3(i ? -1 : 1, 0, 0), m = l.an.clone().addScaledVector(l.sole, B_.foot * 0.42); m.y = 0.45; return { in: m.clone().addScaledVector(out, -2.6), out: m.clone().addScaledVector(out, 4.4) }; };
            const L = mf(0), Rf = mf(1), hL = fistAt(J, 0).c, hR = fistAt(J, 1).c;
            const pts = [hL, L.out, L.in, Rf.in, Rf.out, hR]; segs.forEach((m, k) => m.userData.set(pts[k], pts[k + 1]));
          });
        } else {
        const lines = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 0.7, MAT.band));
        ups.push(J => J.arms.forEach((a, i) => {
          let anc;
          if (e === 'bandFeet') anc = J.legs[i].an.clone().add(new V3(0, -2.4, 3));
          else if (e === 'bandFront') anc = J.legs[i].an.clone().addScaledVector(J.legs[i].sole, 9);
          else anc = new V3(0, J.neck.y + 55, J.neck.z + 40);
          lines[i].userData.set(anc, WR(a).addScaledVector(a.hd, 2.5));
        }));
        if (e === 'bandTop') { const door = box(40, 4, 4, MAT.wood); door.position.set(0, J0.neck.y + 56, J0.neck.z + 41); }
        }
      } else if (e === 'table') {
        const top = 140 - (FY - 52), z0 = 66 - 95 - 22;
        const slab = box(70, 3, 44, MAT.wood); slab.position.set(0, top + 1.5, z0);
        for (const sx of [-1, 1]) for (const dz of [-18, 18]) { const lg = box(3, top, 3, MAT.wood); lg.position.set(sx * 32, top / 2, z0 + dz); }
      } else if (e === 'treadmill') {
        const { gr, bx0, by0 } = BELT, ang = Math.atan(gr), G = ex.G || FY;
        const yAt = x => G - (by0 - (x - bx0) * gr), x0 = 24, x1 = 176, zc = (x0 + x1) / 2 - 95, yc = (yAt(x0) + yAt(x1)) / 2;
        const deck = new THREE.Group(); deck.position.set(0, yc, zc); deck.rotation.x = -ang; g.add(deck);
        const Ln = (x1 - x0) / Math.cos(ang);
        const bd = new THREE.Mesh(new THREE.BoxGeometry(38, 6, Ln + 4), MAT.deck); bd.position.y = -3.2; bd.castShadow = bd.receiveShadow = true; deck.add(bd);
        const belt = new THREE.Mesh(new THREE.PlaneGeometry(30, Ln), MAT.belt); belt.rotation.x = -Math.PI / 2; belt.position.y = 0.05; belt.receiveShadow = true; deck.add(belt);
        // تردمل بستايل الصالات: ألواح جانبية للوكفة، غطا الماتور قدّام، عمودين عريضين، شاشة كبيرة مايلة، ومسكات جانبية بمطاط
        for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, Ln), MAT.shroud); r.position.set(s * 18.5, 0.4, 0); r.castShadow = r.receiveShadow = true; deck.add(r);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, Ln + 4), MAT.frame); cap.position.set(s * 22.2, -2.2, 0); deck.add(cap); }
        const hood = new THREE.Mesh(new THREE.BoxGeometry(44, 11, 24), MAT.shroud); hood.position.set(0, 2.5, Ln / 2 - 8); hood.castShadow = true; deck.add(hood);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 38, 18), MAT.frame); roll.rotation.z = Math.PI / 2; roll.position.set(0, -3.2, -Ln / 2 - 1); deck.add(roll);
        const zF = x1 - 12 - 95, yF = yAt(x1 - 12) + 6;
        for (const s of [-1, 1]) { const up = box(5, 1, 7, MAT.frame), a0 = new V3(s * 19, yF, zF), a1 = new V3(s * 19, 96, 72); up.scale.y = a0.distanceTo(a1); up.position.copy(a0).add(a1).multiplyScalar(0.5); up.quaternion.setFromUnitVectors(new V3(0, 1, 0), a1.clone().sub(a0).normalize());
          rod(new V3(s * 21, 66, 70), new V3(s * 21, 62, 24), 1.3, MAT.frame); const gr = rod(new V3(s * 21, 64.5, 58), new V3(s * 21, 62.5, 34), 1.8, MAT.rubber); rod(new V3(s * 19, 66, 72), new V3(s * 21, 66, 70), 1.3, MAT.frame); }
        const con = box(50, 18, 8, MAT.deck); con.position.set(0, 102, 76); con.rotation.x = -0.5;
        const scr = box(34, 11, 0.6, MAT.rubber); scr.position.set(0, 102.6, 72.2); scr.rotation.x = -0.5;
        rod(new V3(-14, 88, 70), new V3(14, 88, 70), 1.4, MAT.rubber);
        ups.push(J => { if (J.Mo.belt != null) S.beltTex.offset.y = -(J.Mo.belt / Ln) * 6; });
      } else if (e === 'bike') {
        const crank = v3([104, FY - 24], 0), seat = v3([86, FY - 59], 0), hb = v3([130, FY - 84], 0);
        rod(new V3(0, 1, crank.z - 30), new V3(0, 1, crank.z + 36), 2.4, MAT.frame);
        rod(new V3(0, 1, crank.z + 26), crank.clone().add(new V3(0, 0, 14)), 2.4, MAT.frame);
        rod(crank, seat.clone().add(new V3(0, -2, 0)), 2.2, MAT.frame);
        rod(new V3(0, 1, crank.z - 24), crank, 2.2, MAT.frame);
        const sad = box(12, 3, 18, MAT.pad); sad.position.copy(seat);
        // المقود يمر من وسط القبضة (مو من الرسغ): عمود + قطعة عرضية، ومقابض مطاط بطرفينها تنحني لقدّام شوية
        const hbar = rod(crank.clone().add(new V3(0, 0, 18)), hb, 2, MAT.frame), cross = rod(new V3(), new V3(0, 1, 0), 1.4, MAT.frame), hg = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.7, MAT.rubber)), hn = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.4, MAT.frame));
        ups.push(J => { const w = J.arms.map((a, i) => fistAt(J, i, 1.7).c), c = w[0].clone().add(w[1]).multiplyScalar(0.5); hbar.userData.set(crank.clone().add(new V3(0, 0, 18)), c.clone().add(new V3(0, -1, -3)));
          cross.userData.set(w[1].clone().setX(w[1].x + 5), w[0].clone().setX(w[0].x - 5)); cross.position.add(new V3(0, 0, 0));
          w.forEach((q, i) => { const sx = i ? -1 : 1; hg[i].userData.set(q.clone().setX(q.x - sx * 5), q.clone().setX(q.x + sx * 5)); hn[i].userData.set(q.clone().setX(q.x + sx * 5), q.clone().add(new V3(sx * 7, -3, 6))); }); });
        const fly = cyl(16, 5, MAT.deck, 28); fly.rotation.z = Math.PI / 2; fly.position.copy(crank).add(new V3(0, 6, 20));
        const cranks = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.1, MAT.steel));
        ups.push(J => J.legs.forEach((l, i) => { const pd = l.an.clone().add(new V3(0, -3, 1)); cranks[i].userData.set(crank.clone().add(new V3((i ? -1 : 1) * 7, 0, 0)), pd.clone().setX((i ? -1 : 1) * 7)); }));
      }
    }
    const d3 = v => new V3(0, -v[1], v[0]).normalize();
    const handles = (n) => [0, 1].map(() => cyl(1.5, n || 15, MAT.rubber));
    const links = () => [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame));
    for (const e of (ex.equip || [])) {
      if (e === 'smith') {
        const zc = (mid(J0).z + mid(J1).z) / 2 + 2.2;
        // سميث بستايل الصالات: هيكل مستطيل بأربع أعمدة، قاعدة وسقف، أدلة فولاذ يزحلق عليها البار، مصدّات أمان، ومسامير تعليق على الأعمدة
        const H = 205;
        for (const sx of [-1, 1]) { for (const sz of [-1, 1]) { const up = box(6, H, 6, MAT.frame); up.position.set(sx * 58, H / 2, zc + sz * 22); for (let k = 0; k < 9; k++) { const pg = rod(new V3(sx * 55, 60 + k * 14, zc + sz * 22), new V3(sx * 51, 60 + k * 14, zc + sz * 22), 0.6, MAT.steel); } }
          const bs = box(8, 4, 60, MAT.frame); bs.position.set(sx * 58, 2, zc); const tp = box(6, 5, 50, MAT.frame); tp.position.set(sx * 58, H - 2, zc);
          rod(new V3(sx * 50, 4, zc), new V3(sx * 50, H - 4, zc), 1.2, MAT.steel); rod(new V3(sx * 58, H - 4, zc), new V3(sx * 50, H - 4, zc), 1.6, MAT.frame); rod(new V3(sx * 58, 4, zc), new V3(sx * 50, 4, zc), 1.6, MAT.frame);
          const stop = box(5, 3, 5, MAT.rubber); stop.position.set(sx * 50, 44, zc); }
        for (const sz of [-1, 1]) { const bb = box(122, 4, 6, MAT.frame); bb.position.set(0, 2, zc + sz * 22); const tb = box(122, 5, 6, MAT.frame); tb.position.set(0, H - 2, zc + sz * 22); }
        const sl = [0, 1].map(() => box(6, 11, 6, MAT.shroud));
        ups.push(J => { const m = mid(J).add(hdm(J).multiplyScalar(2)); sl.forEach((b, i) => b.position.set((i ? -1 : 1) * 50, m.y, zc)); });
      } else if (e === 'abductor' || e === 'adductor') {
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3, inside = e === 'adductor';
        const seat = box(22, 4, 30, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 8);
        const back = box(22, 46, 4, MAT.pad); back.position.copy(hip).addScaledVector(T3, 22).addScaledVector(F3, bvB + 0.3 - 2); orientBox(back, new V3(1, 0, 0), T3, F3);
        rod(new V3(0, hip.y - 10, hip.z + 6), new V3(0, 1, hip.z + 6), 2.2, MAT.frame);
        const base = box(16, 2.4, 70, MAT.frame); base.position.set(0, 1.2, hip.z + 16);
        const pads = [0, 1].map(() => box(3.2, 13, 12, MAT.pad)), arms = links(), pegs = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.1, MAT.steel));
        { const tz = hip.z - 34, st = stackTower(tz, 132); st.set(inside ? 6 : 10); rod(new V3(0, 1.2, tz), new V3(0, 1.2, hip.z + 6), 2.4, MAT.frame);   // برج أوزان ورا المسند وهيكل يوصل للمقعد
          rod(new V3(0, hip.y + 26, tz + 6), back.position.clone().add(new V3(0, 10, -3)), 2, MAT.frame); const cv = box(10, 16, 18, MAT.shroud); cv.position.set(0, 9, hip.z + 2); }
        ups.push(J => J.legs.forEach((l, i) => {
          const Sg = i ? -1 : 1, out = new V3(Sg * (inside ? -1 : 1), 0, 0), ta = l.kn.clone().sub(l.hip); ta.y = 0; ta.normalize();
          const c = l.kn.clone().lerp(l.hip, 0.2).addScaledVector(out, prof(LM(rig.B).thR, rig.B.thigh * 0.8) + 2.4);   // الوسادة على سطح الفخذ مو داخلة بي
          pads[i].position.copy(c); orientBox(pads[i], new V3().crossVectors(new V3(0, 1, 0), ta), new V3(0, 1, 0), ta);
          arms[i].userData.set(c.clone().add(new V3(0, -6, 0)), new V3(Sg * 3, 8, hip.z + 20));
          pegs[i].userData.set(l.an.clone().add(new V3(0, -3.4, -2)), l.an.clone().add(new V3(0, -3.4, 9)));
        }));
        { const hg = [0, 1].map(() => { const c = cyl(1.4, 11, MAT.rubber); c.rotation.x = Math.PI / 2; return c; }), hr = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame));
          ups.push(J => J.arms.forEach((a, i) => { const sx = i ? -1 : 1, f = fistAt(J, i), ax = f.ax.z < 0 ? f.ax.negate() : f.ax; hg[i].position.copy(f.c); hg[i].quaternion.setFromUnitVectors(new V3(0, 1, 0), ax); const b0 = f.c.clone().addScaledVector(ax, -5.5); hr[i].userData.set(b0, new V3(sx * 12, hip.y - 9, hip.z - 2)); })); }
      } else if (e === 'cableAnkle') {
        const hz = J0.arms[0].wr.z, hy = J0.arms[0].wr.y, zc = hz + 10;
        const st = stackTower(zc + 8, 160), Lmin = pullLen(new V3(-5, 10, zc - 1), J0.legs[1].an);
        ups.push(J => st.set((pullLen(new V3(-5, 10, zc - 1), J.legs[1].an) - Lmin) * 0.5));
        { const kb = cyl(1.3, 44, MAT.rubber); kb.rotation.z = Math.PI / 2; const kl = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame));
          ups.push(J => { const m = mid(J).add(J.arms[0].hd.clone().add(J.arms[1].hd).multiplyScalar(1)); kb.position.copy(m); kl.forEach((r, i) => r.userData.set(m.clone().setX((i ? -1 : 1) * 20), new V3((i ? -1 : 1) * 9, m.y, zc + 8))); }); }
        const pul = cyl(2.6, 3, MAT.steel, 18); pul.rotation.z = Math.PI / 2; pul.position.set(-5, 10, zc - 1);
        const cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), strap = cyl(3.1, 3, MAT.rubber, 16);
        ups.push(J => { const l = J.legs[1], a = l.an; cab.userData.set(new V3(-5, 10, zc - 1), a); strap.position.copy(a).addScaledVector(l.kn.clone().sub(a).normalize(), 1.8); strap.quaternion.setFromUnitVectors(new V3(0, 1, 0), l.kn.clone().sub(a).normalize()); });
      } else if (e === 'seatcalf') {
        const hip = J0.pelvis, a0 = J0.legs[0].an, by = 140 - J0.Mo.blockY;
        const seat = box(22, 4, 28, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 2);
        rod(new V3(0, hip.y - 10, hip.z + 2), new V3(0, 1, hip.z + 2), 2.2, MAT.frame);
        const blk = box(36, by, 8, MAT.frame); blk.position.set(0, by / 2, a0.z + 8);
        rod(new V3(0, 1, hip.z - 10), new V3(0, 1, a0.z + 18), 2.2, MAT.frame);
        const kp = box(32, 4, 12, MAT.pad), col = rod(new V3(), new V3(0, 1, 0), 2, MAT.frame);
        // ذراع بأقراص: المحور قدّام تحت، الذراع يمر فوك الركب، وقرن الأقراص ورا
        const k0 = J0.legs[0].kn, pvC = new V3(0, 12, k0.z + 22); rod(new V3(0, 1, pvC.z), pvC, 2.4, MAT.frame);
        const horn = rod(new V3(), new V3(0, 1, 0), 1.4, MAT.steel), plates = [0, 1].map(() => { const pl = cyl(9.5, 3, MAT.rubber, 28); pl.rotation.z = Math.PI / 2; return pl; }), lev = rod(new V3(), new V3(0, 1, 0), 2.2, MAT.frame);
        ups.push(J => { const k = J.legs[0].kn.clone().add(J.legs[1].kn).multiplyScalar(0.5); kp.position.set(0, k.y + 5.8, k.z - 3); col.userData.set(new V3(0, k.y + 5.8, k.z + 4), pvC);
          const tip = new V3(0, k.y + 6, k.z + 11); lev.userData.set(pvC, tip); horn.userData.set(tip.clone().add(new V3(-29, 0, 0)), tip.clone().add(new V3(29, 0, 0))); plates.forEach((pl, i) => pl.position.copy(tip).add(new V3((i ? -1 : 1) * 26, 0, 0))); });
      } else if (e === 'pecdeck' || e === 'revpec') {   // بيك دك: محورين عموديين فوك الكتفين، الذراعين تلف حولهم، ومقابض عمودية، وبرج أوزان
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3, rev = e === 'revpec', sh = J0.neck, lm = LM(Bb);
        const seat = box(22, 4, 26, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 4);
        rod(new V3(0, hip.y - 10, hip.z + 4), new V3(0, 1, hip.z + 4), 2.2, MAT.frame);
        const base = box(16, 2.4, 80, MAT.frame); base.position.set(0, 1.2, hip.z + (rev ? 18 : -8));
        const pad = box(20, rev ? 30 : 50, 4, MAT.pad);
        if (rev) { const uc = Bb.torso - 10; pad.position.copy(hip).addScaledVector(T3, uc).addScaledVector(F3, prof(lm.fr, uc) + 0.2 + 2); }
        else pad.position.copy(hip).addScaledVector(T3, 22).addScaledVector(F3, bvB + 0.3 - 2);
        orientBox(pad, new V3(1, 0, 0), T3, F3);
        const tz = rev ? sh.z + 40 : hip.z - 26, yT = sh.y + 24, st = stackTower(tz, yT + 10);
        rod(pad.position.clone().addScaledVector(F3, rev ? 2 : -2), new V3(0, pad.position.y, tz), 2, MAT.frame);
        const pz = sh.z + (rev ? 0 : 0), px = D.sw;
        for (const sx of [-1, 1]) { const ax = cyl(1.8, 8, MAT.steel, 14); ax.position.set(sx * px, yT - 2, pz); rod(new V3(sx * px, yT, pz), new V3(sx * 12, yT, tz), 2.2, MAT.frame); }
        rod(new V3(-12, yT, tz), new V3(12, yT, tz), 2, MAT.frame);
        const arms = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.6, MAT.frame)), drops = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.4, MAT.frame)), hs = handles(13);
        const cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), open0 = Math.abs(WR(J0.arms[0]).x);
        ups.push(J => {
          J.arms.forEach((a, i) => { const sx = i ? -1 : 1, hp = WR(a).addScaledVector(a.hd, 2.5), topP = new V3(hp.x, yT - 4, hp.z);
            hs[i].position.copy(hp); arms[i].userData.set(new V3(sx * px, yT - 4, pz), topP); drops[i].userData.set(topP, hp.clone().add(new V3(0, 6.5, 0))); });
          const w = Math.abs(WR(J.arms[0]).x), lift = rev ? (w - open0) : (open0 - w);
          cab.userData.set(new V3(0, yT, tz), st.set(8 + lift * 0.6));
        });
      } else if (e === 'smp' || e === 'rowmachine') {
        const hip = J0.pelvis, sh = J0.neck, row = e === 'rowmachine';
        if (row) {
          const seat = box(22, 4, 26, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 2);
          rod(new V3(0, hip.y - 10, hip.z + 2), new V3(0, 1, hip.z + 2), 2.2, MAT.frame);
          const uc = Bb.torso - 12, cp = box(22, 26, 5, MAT.pad); cp.position.copy(J0.pelvis).addScaledVector(J0.T3, uc).addScaledVector(J0.F3, prof(LM(Bb).fr, uc) + 0.2 + 2.5); orientBox(cp, new V3(1, 0, 0), J0.T3, J0.F3);
          rod(cp.position.clone().addScaledVector(J0.F3, 2.5), new V3(0, cp.position.y - 20, cp.position.z + 18), 2, MAT.frame); rod(new V3(0, cp.position.y - 20, cp.position.z + 18), new V3(0, 1, cp.position.z + 18), 2, MAT.frame);
          const base = box(14, 2.4, 70, MAT.frame); base.position.set(0, 1.2, hip.z + 12);
          leverMachine(J0, 'y');
        } else {   // جهاز ضغط الكتف
          const Mo = J0.Mo, pv = v3(Mo.piv, 0), xl = D.sw + 9, xp = D.sw + 14, top = pv.y + 12, zs = pv.z - 16;
          for (const sx of [-1, 1]) {
            rod(new V3(sx * xp, 0, pv.z), new V3(sx * xp, top, pv.z), 2.4, MAT.frame);                 // عمود الجانب
            rod(new V3(sx * xp, 1.2, pv.z + 26), new V3(sx * xp, 1.2, zs - 12), 2.2, MAT.frame);        // رجل القاعدة
            rod(new V3(sx * xp, top, pv.z), new V3(sx * 9, top, zs), 2, MAT.frame);                    // للبرج
            rod(new V3(sx * 9, 0, zs), new V3(sx * 9, top, zs), 1.8, MAT.frame);                       // برج الأوزان
            rod(new V3(sx * 7, 3, zs), new V3(sx * 7, top - 4, zs), 0.6, MAT.steel);                  // دليل الأوزان
          }
          rod(new V3(-xp, pv.y, pv.z), new V3(xp, pv.y, pv.z), 1.7, MAT.steel);                        // المحور
          rod(new V3(-xp, top, pv.z), new V3(xp, top, pv.z), 2, MAT.frame); rod(new V3(-9, top, zs), new V3(9, top, zs), 2, MAT.frame);
          const plates = Array.from({ length: 14 }, (_, k) => { const m = box(16, 2.5, 10, k % 2 ? MAT.rubber : MAT.deck); m.position.set(0, 3.2 + k * 2.7, zs); return m; });
          const pul = cyl(2.4, 2.6, MAT.steel, 18); pul.rotation.z = Math.PI / 2; pul.position.set(0, top - 2.5, zs);
          const cab = [rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable)];
          const levers = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.7, MAT.frame)), cons = links(), grips = [0, 1].map(() => { const c = cyl(1.5, 13, MAT.rubber); c.rotation.z = Math.PI / 2; return c; });
          const cross = rod(new V3(), new V3(0, 1, 0), 1.5, MAT.frame);
          ups.push(J => {
            const M2 = J.Mo, k = clamp((M2.a0 - M2.lev) / ((M2.a0 - M2.aTop) || 1), 0, 1), ends = [];
            J.arms.forEach((a, i) => {
              const sx = i ? -1 : 1, hp = WR(a).addScaledVector(a.hd, 2.5), inner = sx * (Math.abs(hp.x) - 6.5), end = new V3(sx * xl, hp.y, hp.z);
              grips[i].position.set((inner + sx * (Math.abs(hp.x) + 6.5)) / 2, hp.y, hp.z);
              cons[i].userData.set(new V3(sx * (Math.abs(hp.x) + 6.5), hp.y, hp.z), end);
              levers[i].userData.set(new V3(sx * xl, pv.y, pv.z), end); ends.push(end);
            });
            const lp = new V3(0, pv.y, pv.z).lerp(ends[0].clone().setX(0), 0.3); cross.userData.set(lp.clone().setX(-xl), lp.clone().setX(xl));
            const lift = 13 * k; plates.forEach((m, j) => { m.position.y = 3.2 + j * 2.7 + (j >= 9 ? lift : 0); });
            cab[0].userData.set(new V3(0, 3.2 + 13 * 2.7 + lift + 1.2, zs), new V3(0, top - 2.5, zs)); cab[1].userData.set(new V3(0, top - 1.5, zs + 1.5), lp);
          });
        }

      } else if (e === 'cableCurl') {
        const zc = J0.pelvis.z + 42, st = stackTower(zc + 8, 160), top = new V3(0, 157, zc + 2);
        const pul = cyl(2.6, 3, MAT.steel, 18); pul.rotation.z = Math.PI / 2; pul.position.set(0, 9, zc);
        const pt = cyl(2.6, 3, MAT.steel, 18); pt.rotation.z = Math.PI / 2; pt.position.copy(top);
        rod(new V3(0, 9, zc + 1), new V3(0, 9, zc + 8), 1.4, MAT.frame);
        const bar = cyl(1.2, 34, MAT.steel); bar.rotation.z = Math.PI / 2;
        const cab = rod(new V3(0, 9, zc), new V3(0, 8, zc - 5), 0.35, MAT.cable), cab2 = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
        const Lmin = pullLen(new V3(0, 9, zc), mid(J0));
        ups.push(J => { const m = mid(J).add(J.arms[0].hd.clone().add(J.arms[1].hd).multiplyScalar(1.25)); bar.position.copy(m); cab.userData.set(new V3(0, 9, zc), m); cab2.userData.set(top, st.set((pullLen(new V3(0, 9, zc), m) - Lmin) * 0.5)); });
      } else if (e === 'cableFace' || e === 'cableKneel') {
        const hr0 = LM(rig.B).head, nape0 = J0.neck.clone().addScaledVector(J0.Uh3, hr0.up - 6).addScaledVector(J0.Fh3, hr0.fwd - 7);
        const kneel = e === 'cableKneel', zc = kneel ? nape0.z + 4 : mid(J1).z + 16, py = kneel ? 178 : mid(J1).y + 2, arm = kneel ? 40 : 8, th = Math.max(py + 14, 150);
        const st = stackTower(zc + arm, th);   // بالكرنش: البكرة على ذراع طالع من البرج فوك الرقبة تقريبًا، فالكيبل ينزل عمودي ورا الراس
        const pul = cyl(2.6, 3, MAT.steel, 18); pul.rotation.z = Math.PI / 2; pul.position.set(0, py, zc);
        rod(new V3(0, py, zc + 1), new V3(0, py, zc + arm), 1.4, MAT.frame);
        const cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable), ropes = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.25, MAT.rubber));
        const tails = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.25, MAT.rubber)), wraps = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.25, MAT.rubber)), balls = [0, 1].map(() => { const m = new THREE.Mesh(GEO.sphere || (GEO.sphere = new THREE.SphereGeometry(1, 26, 18)), MAT.rubber); m.scale.setScalar(2.3); m.castShadow = true; g.add(m); return m; });
        const Lmin = Math.min(pullLen(new V3(0, py, zc), mid(J0)), pullLen(new V3(0, py, zc), mid(J1)));
        const hr = LM(rig.B).head;
        // الحبل ما يدخل بالجسم: كبسولات تقريبية للراس والرقبة والترابيس من عظام الجسم، ونقطة الربط والحبل ينزاحون لبرّاها
        const segClose = (a, b, c, d) => { const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c), A = u.dot(u), Bq = u.dot(v), C = v.dot(v), Dd = u.dot(w), E = v.dot(w), den = A * C - Bq * Bq;
          let sN = den > 1e-6 ? clamp((Bq * E - C * Dd) / den, 0, 1) : 0, tN = C > 1e-6 ? clamp((Bq * sN + E) / C, 0, 1) : 0; sN = A > 1e-6 ? clamp((Bq * tN - Dd) / A, 0, 1) : 0;
          return [a.clone().addScaledVector(u, sN), c.clone().addScaledVector(v, tN), sN]; };
        const caps = J => { const bn = rig.mh && rig.mh.B && rig.mh.B.byName, hc = J.neck.clone().addScaledVector(J.Uh3, hr.up).addScaledVector(J.Fh3, hr.fwd);
          const list = [[hc.clone().addScaledVector(J.Uh3, -1), hc.clone().addScaledVector(J.Uh3, 2.5), Math.max(hr.r[0], hr.r[2]) + 0.6]];
          if (bn && bn['neck01'] && bn['upperarm01.L']) { const gp = n => bn[n].getWorldPosition(new V3()), nk = gp('neck01'), hd2 = gp('head');
            list.push([nk, hd2, hr.r[0] * 0.78 + 0.6], [gp('upperarm01.L'), nk, 5.2], [gp('upperarm01.R'), nk, 5.2], [hd2.clone().addScaledVector(J.Uh3, 4).addScaledVector(J.Fh3, 1), hd2.clone().addScaledVector(J.Uh3, 10.5).addScaledVector(J.Fh3, 1), Math.max(hr.r[0], hr.r[2]) + 0.3]); }
          return list; };
        const pushOut = (p, list, m) => { for (let k = 0; k < 4; k++) list.forEach(([a, b, r]) => { const [q] = segClose(p, p, a, b).slice(1), d = p.clone().sub(q), l = d.length(); if (l < r + m) p.addScaledVector(l > 1e-4 ? d.divideScalar(l) : J0.F3.clone().negate(), r + m - l); }); return p; };
        const clearSeg = (a, p, list, m, move) => { for (let k = 0; k < 6; k++) list.forEach(([c0, c1, r]) => { const [ps, pc, sN] = segClose(a, p, c0, c1), d = ps.clone().sub(pc), l = d.length(); if (l < r + m && sN > 0.02) move(d.lengthSq() > 1e-8 ? d.normalize() : J0.F3.clone().negate(), (r + m - l) / Math.max(sN, 0.25)); }); };
        ups.push(J => { const pp = new V3(0, py, zc), hc = J.neck.clone().addScaledVector(J.Uh3, hr.up).addScaledVector(J.Fh3, hr.fwd), cl = kneel ? caps(J) : null;
            const knot = kneel ? pushOut(hc.clone().addScaledVector(J.Uh3, -6).addScaledVector(J.Fh3, -8), cl, 1.6) : mid(J).lerp(pp, 0.14);
            if (kneel) clearSeg(pp, knot, cl, 1.6, (dir, amt) => knot.addScaledVector(dir, amt));
            cab.userData.set(pp, knot);
          J.arms.forEach((a, i) => { const c = WR(a).addScaledVector(a.hd, 2.2), up = perp(new V3(0, 1, 0), a.hd).normalize(), topP = c.clone().addScaledVector(up, 3.2), bot = c.clone().addScaledVector(up, -3.6);
            if (kneel) {   // الحبل يلف على جنب الرقبة من برّه (مو يعبر من داخلها)
              const lat = new V3().crossVectors(J.Uh3, J.Fh3).normalize().multiplyScalar(i ? -1 : 1); if (lat.x * (i ? -1 : 1) < 0) lat.negate();
              const wp = pushOut(hc.clone().addScaledVector(J.Uh3, -6.5).addScaledVector(J.Fh3, -3).addScaledVector(lat, hr.r[0] * 0.9 + 2.4), cl, 1.6);
              clearSeg(knot, wp, cl, 1.6, (dir, amt) => wp.addScaledVector(dir, amt)); clearSeg(topP, wp, cl, 1.6, (dir, amt) => wp.addScaledVector(dir, amt));
              ropes[i].userData.set(knot, wp); wraps[i].userData.set(wp, topP); wraps[i].visible = true;
            } else { ropes[i].userData.set(knot, topP); wraps[i].visible = false; }
            tails[i].userData.set(topP, bot); balls[i].position.copy(bot).addScaledVector(up, -1.6); });   // الحبل يعبر من القبضة والكرة تحتها
          st.set((pullLen(pp, mid(J)) - Lmin) * 0.5); });
      } else if (e === 'hyper') {
        const Mo = J0.Mo, dL = dirv(-45), fL = front(dL), B = rig.B;
        const padV = prof(LM(B).thF, 20) + 3.2, padC = v3(at(Mo.hip, dL, fL, -21, padV), 0), pad = box(28, 18, 6, MAT.pad); pad.position.copy(padC); orientBox(pad, new V3(1, 0, 0), d3(dL), d3(fL));
        const ank = Mo.legs[0].ank, plC = v3(at(ank, dL, fL, -(B.ankleH + 1.6), 4), 0), pl = box(26, 14, 3, MAT.frame); pl.position.copy(plC); orientBox(pl, new V3(1, 0, 0), d3(fL), d3(dL).negate());
        const fp = padC.clone().addScaledVector(d3(fL), 4), bp = plC.clone().addScaledVector(d3(dL), -2);
        rod(fp, new V3(0, 1, fp.z), 2.2, MAT.frame); rod(bp, new V3(0, 1, bp.z), 2.2, MAT.frame); rod(fp, bp, 2, MAT.frame);
        const base = box(14, 2.4, Math.abs(fp.z - bp.z) + 30, MAT.frame); base.position.set(0, 1.2, (fp.z + bp.z) / 2);
        const roll = cyl(2.6, 26, MAT.pad, 16); roll.rotation.z = Math.PI / 2; roll.position.copy(v3(at(ank, dL, fL, 3, -4.5), 0));
      } else if (e === 'abmach') {
        const hip = J0.pelvis, T3 = J0.T3, F3 = J0.F3;
        const seat = box(22, 4, 28, MAT.pad); seat.position.set(0, hip.y - 8, hip.z + 5);
        rod(new V3(0, hip.y - 10, hip.z + 5), new V3(0, 1, hip.z + 5), 2.2, MAT.frame);
        const base = box(16, 2.4, 80, MAT.frame); base.position.set(0, 1.2, hip.z + 10);
        const back = box(22, 30, 4, MAT.pad); back.position.copy(hip).addScaledVector(T3, 12).addScaledVector(F3, bvB + 0.3 - 2); orientBox(back, new V3(1, 0, 0), T3, F3);
        stackTower(hip.z - 28, 150);
        const a0 = J0.legs[0].an, roll = cyl(3, 26, MAT.pad, 16); roll.rotation.z = Math.PI / 2; roll.position.set(0, a0.y + 5.5, a0.z + 1);
        rod(new V3(0, a0.y + 5.5, a0.z + 1), new V3(0, 1, a0.z - 2), 1.8, MAT.frame);
        // ذراع الجهاز يلف حول محور على خط الورك بالجنب: يطلع بمحاذاة الجذع لمستوى الصدر، وسادتين على أعلى الصدر، ومقبضين عموديين كدام الكتف
        const lm = LM(Bb), px = D.sw + 11, hubs = [-1, 1].map(sx => { const h2 = cyl(3.4, 4, MAT.steel, 18); h2.rotation.z = Math.PI / 2; h2.position.set(sx * px, hip.y, hip.z); rod(new V3(sx * px, 1, hip.z), new V3(sx * px, hip.y, hip.z), 2.4, MAT.frame); return h2; });
        const up = links(), cr = links(), pads = [0, 1].map(() => box(9, 11, 4, MAT.pad)), hg = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.6, MAT.rubber)), hb = links(), cab = rod(new V3(), new V3(0, 1, 0), 0.35, MAT.cable);
        ups.push(J => { const T = J.T3, F = J.F3, uc = Bb.torso - 7, pc = J.pelvis.clone().addScaledVector(T, uc).addScaledVector(F, prof(lm.fr, uc) + 2.2);
          J.arms.forEach((a, i) => { const sx = i ? -1 : 1, hp = new V3(sx * px, J.pelvis.y, J.pelvis.z), top = hp.clone().addScaledVector(T, uc).addScaledVector(F, prof(lm.fr, uc) + 5);
            up[i].userData.set(hp, top); const pd = pc.clone().setX(sx * 7); cr[i].userData.set(top, pd.clone().addScaledVector(F, 2.5)); pads[i].position.copy(pd); orientBox(pads[i], new V3(1, 0, 0), T, F);
            const w = WR(a), ax = new V3(0, 1, 0).addScaledVector(a.hd, -a.hd.y).normalize(); hg[i].userData.set(w.clone().addScaledVector(ax, -5), w.clone().addScaledVector(ax, 5)); hb[i].userData.set(w.clone().addScaledVector(ax, -5), pd.clone().addScaledVector(F, 2.5)); });
          cab.userData.set(new V3(px, hip.y + 4, hip.z - 4), new V3(12, 148, hip.z - 28)); });
      } else if (e === 'captain') {
        const T3 = J0.T3, F3 = J0.F3, nk = J0.neck, pel = J0.pelvis;
        const back = box(24, 46, 5, MAT.pad); back.position.copy(pel).addScaledVector(T3, 20).addScaledVector(F3, bvB + 0.3 - 2.5); orientBox(back, new V3(1, 0, 0), T3, F3);
        const bz = back.position.z - 5;
        for (const sx of [-1, 1]) {
          const a = J0.arms[sx > 0 ? 0 : 1], el = a.el, wr = a.wr;
          const pad = box(8, 3.4, 30, MAT.pad); pad.position.set(el.x, el.y - 4.2, (el.z + wr.z) / 2 - 2);
          const hd = rod(new V3(), new V3(0, 1, 0), 1.6, MAT.rubber), hdb = rod(new V3(), new V3(0, 1, 0), 1.3, MAT.frame), ai = sx > 0 ? 0 : 1;
          ups.push(J => { const f = fistAt(J, ai), ax = f.ax.y < 0 ? f.ax.negate() : f.ax, lo = f.c.clone().addScaledVector(ax, -6); hd.userData.set(lo, f.c.clone().addScaledVector(ax, 5)); hdb.userData.set(lo, new V3(lo.x, el.y - 5.5, lo.z)); });
          rod(new V3(sx * (D.sw + 6), el.y - 5.5, bz), new V3(sx * (D.sw + 6), el.y - 5.5, wr.z + 4), 1.6, MAT.frame);
          rod(new V3(sx * 20, 0, bz), new V3(sx * 20, nk.y + 16, bz), 2.4, MAT.frame);
          rod(new V3(sx * (D.sw + 6), el.y - 5.5, bz), new V3(sx * 20, el.y - 5.5, bz), 1.6, MAT.frame);
          const ft = box(8, 3, 50, MAT.frame); ft.position.set(sx * 20, 1.5, bz + 16);
        }
        rod(new V3(-20, nk.y + 16, bz), new V3(20, nk.y + 16, bz), 2, MAT.frame);
        const step = box(34, 4, 14, MAT.deck); step.position.set(0, 7, bz + 9);
        for (const sx of [-1, 1]) rod(new V3(sx * 15, 7, bz + 4), new V3(sx * 15, 1, bz + 4), 1.4, MAT.frame);
      } else if (e === 'stairs') {
        // ستيبمل (درج دوّار): درجات تنزل على إطار مايل بغطاء جانبي، برج قدّامي بشاشة، ومسكات جانبية قطعتها القدّامية عمودية تمر من وسط القبضة
        const { h, d, yTop, xTop } = STAIR, steps = [0, 1, 2, 3, 4, 5, 6].map(() => box(46, h, d, MAT.deck));
        const slope = Math.atan2(h, d), mid2 = [xTop - 2.1 * d, yTop + 2.1 * h + 7], L = Math.hypot(4.1 * d, 4.1 * h), zT = xTop - 95;
        for (const sx of [-1, 1]) { const st = box(3, 26, L + 8, MAT.shroud); st.position.copy(v3(mid2, sx * 25)); st.rotation.x = -slope;
          const tr = box(2, 3, L + 8, MAT.frame); tr.position.copy(v3(mid2, sx * 25)).add(new V3(0, 13, 0)); tr.rotation.x = -slope; }
        const bs = box(56, 5, 104, MAT.shroud); bs.position.set(0, 2.5, zT - 40);
        const tw = box(54, FY - yTop + 16, 18, MAT.shroud); tw.position.set(0, (FY - yTop + 16) / 2, zT + 12);
        const twc = box(54.4, 3, 18.4, MAT.frame); twc.position.set(0, FY - yTop + 16, zT + 12);
        const colB = new V3(0, FY - yTop + 16, zT + 14), colT = new V3(0, 128, zT + 22); rod(colB, colT, 3.4, MAT.frame);
        const con = box(38, 22, 5, MAT.deck); con.position.set(0, 134, zT + 21); con.rotation.x = -0.5;
        const scr = box(26, 13, 0.6, MAT.rubber); scr.position.set(0, 134.5, zT + 18.3); scr.rotation.x = -0.5;
        const Jr = J0; if (rig.mh) { rig.mh.pose(Jr, S && S.hand); rig.mh.root.updateMatrixWorld(true); }
        const rails = Jr.arms.map((a, i) => {
          const sx = i ? -1 : 1, fa = fistAt(Jr, i, 1.9), w = fa.c, ax = fa.ax.y < 0 ? fa.ax.negate() : fa.ax;
          const lo = w.clone().addScaledVector(ax, -12), hi = w.clone().addScaledVector(ax, 12), top = new V3(sx * 12, hi.y + 4, colT.z - 4);
          rod(new V3(lo.x, lo.y, -62), lo, 1.6, MAT.frame); rod(new V3(lo.x, 0, -62), new V3(lo.x, lo.y, -62), 1.8, MAT.frame);   // المسكة الجانبية لورا وعمودها
          rod(lo, new V3(lo.x, FY - yTop + 16, lo.z + 4), 1.6, MAT.frame);
          const gr = rod(lo.clone().addScaledVector(ax, 4), hi, 1.9, MAT.rubber); rod(hi, top, 1.5, MAT.frame); rod(top, colT.clone().setY(top.y), 1.5, MAT.frame);
          return gr;
        });
        ups.push(J => { const s = J.Mo.stairS, k0 = Math.floor(s) - 4; steps.forEach((m, j) => { const u = s - (k0 + j), yT = yTop + h * Math.max(0, u), xF = xTop - d * u; m.visible = u > -1.2 && u < 3.3 && yT < FY - 1; m.position.copy(v3([xF - d / 2, yT + h / 2], 0)); }); });
      } else if (e === 'erg') {
        // جهاز تجذيف بستايل الصالات: سكة وحدة طويلة على رجلين، مقعد يزحلق، دوّاسات مايلة بأحزمة، حاضنة مروحة قدّام، سلسلة للمقبض، وشاشة على ذراع
        const an0 = J0.legs.map(l => l.an), sole = J0.legs[0].sole, zA = (an0[0].z + an0[1].z) / 2, yA = (an0[0].y + an0[1].y) / 2;
        const fan = v3(ERG.fan, 0), zR0 = J0.pelvis.z - 70, yR = 19;
        const rail = box(9, 4, fan.z - zR0 - 6, MAT.frame); rail.position.set(0, yR, (fan.z + zR0) / 2 - 3);
        const rtop = box(6, 0.6, fan.z - zR0 - 14, MAT.steel); rtop.position.set(0, yR + 2.3, (fan.z + zR0) / 2 - 7);
        const rl = box(6, yR - 2, 5, MAT.frame); rl.position.set(0, yR / 2, zR0 + 4); const rf = box(46, 3, 7, MAT.frame); rf.position.set(0, 1.5, zR0 + 4);
        for (const sx of [-1, 1]) { const ft = box(7, 2, 9, MAT.rubber); ft.position.set(sx * 21, 1, zR0 + 4); }
        const ff = box(54, 3, 8, MAT.frame); ff.position.set(0, 1.5, fan.z + 4); for (const sx of [-1, 1]) { const ft = box(7, 2, 10, MAT.rubber); ft.position.set(sx * 25, 1, fan.z + 4); }
        rod(new V3(0, 2, fan.z + 4), new V3(0, yR, fan.z - 10), 3, MAT.frame);
        const hs = cyl(19, 14, MAT.shroud, 40); hs.rotation.z = Math.PI / 2; hs.position.set(0, fan.y, fan.z + 4);
        for (const sx of [-1, 1]) { const cap = cyl(15, 1, MAT.deck, 36); cap.rotation.z = Math.PI / 2; cap.position.set(sx * 7.3, fan.y, fan.z + 4); }
        const dmp = box(3, 6, 3, MAT.rubber); dmp.position.set(7.8, fan.y + 8, fan.z + 4);
        const exitP = new V3(0, fan.y + 2, fan.z - 13); const mouth = box(8, 5, 4, MAT.deck); mouth.position.copy(exitP);
        // دوّاسات مايلة تحت الرجلين، وحزام فوك مشط القدم
        const s2 = new V3(0, sole.y, sole.z).normalize(), nn = new V3(0, s2.z, -s2.y); if (nn.y > 0) nn.negate();
        for (let i = 0; i < 2; i++) {
          const sx = i ? -1 : 1, c = J0.legs[i].an.clone().addScaledVector(s2, 5).addScaledVector(nn, rig.B.ankleH + 1.3); c.x = sx * Math.max(6.5, Math.abs(c.x));
          const pl = box(11, 1.6, 27, MAT.deck); pl.position.copy(c); pl.quaternion.setFromUnitVectors(new V3(0, 0, 1), s2);
          const st = box(12, 0.8, 5, MAT.rubber); st.position.copy(c).addScaledVector(s2, 6).addScaledVector(nn, -(rig.B.ankleH + 4.2)); st.quaternion.copy(pl.quaternion);
          rod(c.clone().addScaledVector(nn, 1.5).setX(sx * 2), new V3(sx * 2, yR, c.z + 4), 1.6, MAT.frame);
        }
        rod(new V3(0, fan.y + 16, fan.z + 2), new V3(0, fan.y + 40, fan.z - 12), 1.4, MAT.frame);
        const mon = box(17, 13, 3, MAT.deck); mon.position.set(0, fan.y + 44, fan.z - 14); mon.rotation.x = -0.35;
        const scr = box(12, 8, 0.6, MAT.rubber); scr.position.set(0, fan.y + 44.3, fan.z - 15.6); scr.rotation.x = -0.35;
        const seat = box(24, 4, 26, MAT.pad), car = box(16, 3, 18, MAT.shroud), handle = rod(new V3(), new V3(0, 1, 0), 1.6, MAT.rubber), hbar = rod(new V3(), new V3(0, 1, 0), 1.0, MAT.frame), chain = rod(new V3(), new V3(0, 1, 0), 0.4, MAT.cable);
        ups.push(J => {
          seat.position.set(0, Math.max(yR + 5, J.pelvis.y - 8), J.pelvis.z + 1); car.position.set(0, seat.position.y - 3.4, seat.position.z);
          const w = J.arms.map((a, i) => fistAt(J, i, 1.6).c), c = w[0].clone().add(w[1]).multiplyScalar(0.5);
          handle.userData.set(w[1].clone().setX(w[1].x - 5), w[0].clone().setX(w[0].x + 5)); hbar.userData.set(w[1].clone().setX(Math.min(w[1].x, -4)), w[0].clone().setX(Math.max(w[0].x, 4)));
          chain.userData.set(c, exitP);
        });
      } else if (e === 'elliptical') {
        // كروس ترينر بالدفع الخلفي (ستايل الجيم): حاضنة الفلاي ويل ورا، ذراعين الدواسات لقدّام على سكة، عمود قدّامي بشاشة، والمقابض المتحركة تتمرجح حول محور بالعمود
        const cz = -44, cy = 24, cr = 10, C3 = new V3(0, cy, cz), zF = 58;
        const base = box(10, 4, zF - cz + 14, MAT.frame); base.position.set(0, 2, (zF + cz) / 2);
        for (const zz of [cz - 6, zF]) { const st = box(62, 4, 7, MAT.frame); st.position.set(0, 2, zz); for (const sx of [-1, 1]) { const ft = box(7, 2, 9, MAT.rubber); ft.position.set(sx * 29, 1, zz); } }
        const hs = cyl(21, 18, MAT.shroud, 36); hs.rotation.z = Math.PI / 2; hs.position.set(0, cy, cz);
        for (const sx of [-1, 1]) { const cap = cyl(12, 1.2, MAT.frame, 32); cap.rotation.z = Math.PI / 2; cap.position.set(sx * 9.4, cy, cz); }
        const hb = box(18, 16, 22, MAT.shroud); hb.position.set(0, 9, cz - 4);
        for (const sx of [-1, 1]) { const rl = box(4, 3, 36, MAT.steel); rl.position.set(sx * 9, 6, 40); }   // سكة البكرات
        const top = new V3(0, 124, 38), foot = new V3(0, 4, zF - 2); rod(foot, top, 3.2, MAT.frame);
        const cover = box(12, 30, 10, MAT.shroud); cover.position.copy(foot.clone().lerp(top, 0.18)); cover.quaternion.setFromUnitVectors(new V3(0, 1, 0), top.clone().sub(foot).normalize());
        const con = box(36, 22, 5, MAT.deck); con.position.set(0, 131, 36); con.rotation.x = -0.55;
        const scr = box(24, 13, 0.6, MAT.rubber); scr.position.set(0, 131.5, 33.2); scr.rotation.x = -0.55;
        rod(new V3(-13, 108, 33), new V3(13, 108, 33), 1.4, MAT.rubber);   // المقبض الثابت (حساسات النبض)
        for (const sx of [-1, 1]) rod(new V3(sx * 13, 108, 33), new V3(sx * 3, 104, 42), 1.3, MAT.frame);
        const pv0 = v3(J0.Mo.hpiv, 0), hub = cyl(3, 16, MAT.steel, 16); hub.rotation.z = Math.PI / 2; hub.position.copy(pv0);
        rod(pv0.clone(), new V3(0, pv0.y, foot.z + (top.z - foot.z) * (pv0.y - foot.y) / (top.y - foot.y)), 2.4, MAT.frame);   // ذراع يشيل محور المقابض
        const peds = [0, 1].map(() => box(12, 2.4, 30, MAT.rubber)), armR = links(), armF = links(), crk = links(), up = links(), grip = [0, 1].map(() => rod(new V3(), new V3(0, 1, 0), 1.9, MAT.rubber)), low = links(), lnk = links(), rol = [0, 1].map(() => { const r = cyl(2.6, 3, MAT.rubber, 16); r.rotation.z = Math.PI / 2; return r; });
        ups.push(J => {
          const th = J.Mo.eth || 0, pv = v3(J.Mo.hpiv, 0);
          J.legs.forEach((l, i) => {
            const sx = i ? -1 : 1, a = th + (i ? Math.PI : 0), pc = l.an.clone().add(new V3(0, -(rig.B.ankleH + 1.4), 4)); peds[i].position.copy(pc);
            const cp = new V3(sx * 11, cy - cr * Math.sin(a), cz + cr * Math.cos(a)), rp = new V3(sx * 9, 9, pc.z + 40), pa = pc.clone().add(new V3(0, -2.2, 0)).setX(sx * 9);
            crk[i].userData.set(C3.clone().setX(sx * 11), cp); armR[i].userData.set(cp, pa); armF[i].userData.set(pa, rp); rol[i].position.copy(rp);
            const fa = fistAt(J, i, 1.9), w = fa.c, ax = fa.ax.y < 0 ? fa.ax.negate() : fa.ax;   // محور القبضة من عظام الإيد
            const hp = pv.clone().setX(sx * 7), b0 = w.clone().addScaledVector(ax, -10);
            up[i].userData.set(hp, b0); grip[i].userData.set(b0, w.clone().addScaledVector(ax, 12));
            const dn = hp.clone().sub(b0).setX(0).normalize(), le = hp.clone().addScaledVector(dn, 12);
            low[i].userData.set(hp, le); lnk[i].userData.set(le, rp);
          });
        });
      }
    }
    return { group: g, update: J => ups.forEach(f => f(J)) };
  }

  /* ---------- واجهة المحرك ---------- */
  function colorMuscles() {
    if (!S || !S.rig) return;
    if (S.rig.mh) { S.rig.mh.setMuscles([...S.primary], [...S.secondary]); return; }
    S.rig.muscles.forEach(m => { const k = m.userData.group; m.material = S.primary.has(k) ? S.MAT.primary : S.secondary.has(k) ? S.MAT.secondary : S.MAT.muscle; });
  }
  function fitCamera() {
    const V3 = THREE.Vector3, box = new THREE.Box3();
    [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach(t => { const J = solve(S.exId, S.rig, t); applyPose(S.rig, J); if (S.equip) S.equip.update(J);
      if (S.rig.mh) {
        const pts = [J.pelvis, J.neck, J.neck.clone().addScaledVector(J.Uh3, 25)];
        J.legs.forEach(l => pts.push(l.hip, l.kn, l.an, l.an.clone().addScaledVector(l.sole, 14)));
        J.arms.forEach(a => pts.push(a.sh, a.el, a.wr, a.wr.clone().addScaledVector(a.hd, 8)));
        const bx = new THREE.Box3().setFromPoints(pts).expandByScalar(7); box.union(bx);
      } else { S.rig.root.updateMatrixWorld(true); box.expandByObject(S.rig.root); } if (S.equip) { S.equip.group.updateMatrixWorld(true); box.expandByObject(S.equip.group); } });
    const sph = box.getBoundingSphere(new THREE.Sphere());
    S.fit = { target: sph.center.clone(), dist: sph.radius / Math.sin(15 * R) * 0.98 };
    S.fit.target.y = Math.max(S.fit.target.y, 18);
  }
  function show(exId, sex, primary, secondary) {
    if (!S || !EX[exId]) return false;
    if (MH && FIGS[sex] === undefined) {   // الجسم التشريحي لهذا الجنس بعده يتحمل
      S.pending = [exId, sex, primary, secondary];
      figure(sex).then(() => { if (S.pending && S.pending[1] === sex) { const p = S.pending; S.pending = null; show(...p); } });
      return true;
    }
    S.pending = null;
    const fig = FIGS[sex] || null;
    if (!S.rig || S.sex !== sex || !!S.rig.mh !== !!fig) {
      if (S.rig) S.scene.remove(S.rig.root);
      S.rig = fig ? mhRig(sex, fig) : buildRig(sex); S.sex = sex; S.scene.add(S.rig.root); setLights(!!fig);
      if (fig) calibrate(S.rig);
    }
    if (S.rig.mh) S.rig.mh.setClothes(S.clothes);
    S.hand = fig ? handSpec(exId) : null;
    S.primary = new Set(primary || []); S.secondary = new Set(secondary || []); colorMuscles();
    if (S.equip) { S.scene.remove(S.equip.group); S.equip.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    S.exId = exId; S.equip = buildEquip(exId, S.rig); S.scene.add(S.equip.group); S.t = 0;
    fitCamera(); setView('angle');
    S.cam.yaw = S.cam.ty; S.cam.pitch = S.cam.tp; S.cam.easing = false;
    return true;
  }
  const VIEWS = { angle: null, front: [0, 8], side: [-90, 6], back: [180, 10] };
  function setView(name) {
    if (!S) return;
    const v = name === 'angle' ? [(EX[S.exId] && EX[S.exId].yaw) || -40, 12] : VIEWS[name]; if (!v) return;
    let ty = v[0] * R; while (ty - S.cam.yaw > Math.PI) ty -= 2 * Math.PI; while (ty - S.cam.yaw < -Math.PI) ty += 2 * Math.PI;
    S.cam.ty = ty; S.cam.tp = v[1] * R; S.cam.easing = true; S.spin = false;
  }
  function frame(now) {
    if (!S || !S.running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (document.hidden || !S.exId) return;
    if (S.playing) S.t += dt * S.speed;
    if (S.spin) S.cam.yaw -= dt * 0.55;
    if (S.cam.easing) { const k = 1 - Math.pow(0.001, dt); S.cam.yaw += (S.cam.ty - S.cam.yaw) * k; S.cam.pitch += (S.cam.tp - S.cam.pitch) * k; if (Math.abs(S.cam.ty - S.cam.yaw) < 0.002 && Math.abs(S.cam.tp - S.cam.pitch) < 0.002) S.cam.easing = false; }
    const J = solve(S.exId, S.rig, S.t); applyPose(S.rig, J); S.equip.update(J); if (S.rig.mh) S.rig.mh.update();
    S.MAT.primary.emissiveIntensity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(S.t * 4));
    const d = S.fit.dist * S.cam.zoom, tg = S.fit.target, c = S.cam;
    S.camera.position.set(tg.x + d * Math.cos(c.pitch) * Math.sin(c.yaw), tg.y + d * Math.sin(c.pitch), tg.z + d * Math.cos(c.pitch) * Math.cos(c.yaw));
    S.camera.lookAt(tg); S.renderer.render(S.scene, S.camera);
    if (S.rig && S.rig.mh && !S.rig.mh.lite && !S.rig.visDone && (S.rig.visN = (S.rig.visN || 0) + 1) >= 6) { try { if (visCheck() !== false) S.rig.visDone = true; } catch (e) { S.rig.visDone = true; console.warn('visCheck', e); } }
    if (S.onFrame) { const f = S.onFrame; S.onFrame = null; f(); }
  }
  async function mount(canvas, stage, opts) {
    await load();
    if (opts && opts.sex) await figure(opts.sex);
    if (!S || S.canvas !== canvas) setup(canvas, stage);
    S.onInteract = opts && opts.onInteract;
    S.syncTheme(); resize();
    if (!S.running) { S.running = true; S.last = performance.now(); requestAnimationFrame(frame); }
    return true;
  }
  function stop() { if (S) S.running = false; }
  function resume() { if (S && !S.running) { S.running = true; S.last = performance.now(); requestAnimationFrame(frame); } }
  return {
    load, mount, show, setView, stop, resume, has, resize,
    setClothes: v => { if (S) { S.clothes = !!v; if (S.rig && S.rig.mh) S.rig.mh.setClothes(S.clothes); } }, hasBody: () => !!(S && S.rig && S.rig.mh), isLite: () => !!(S && S.rig && S.rig.mh && S.rig.mh.lite), _liteBody: () => { if (S && S.rig && S.rig.mh) liteBody(S.renderer.getContext()); },
    setSpeed: v => { if (S) S.speed = v; }, setPlaying: v => { if (S) S.playing = v; }, setSpin: v => { if (S) { S.spin = v; if (v) S.cam.easing = false; } },
    _debug: () => S, _three: () => THREE, _setT: t => { if (S) S.t = t; }, ids: () => Object.keys(EX), _solve: (id, t) => solve(id, S.rig, t), _pose: J => applyPose(S.rig, J), _int: () => ({ M, LM, comX, SQC, OHPC, ROWC, facePts, legFront, clearX, tempo, TEMPO, EX, bodyPush, dbPoints, dbAxis }),
    _render: () => { if (!S) return; const was = S.running; S.running = true; S.last = performance.now(); frame(S.last); S.running = was; }
  };
})();
