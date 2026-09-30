/* عافية · المدرب التشريحي داخل التطبيق
   جسم MakeHuman بالعضلات (37 عضلة بكل جهة)، يتحرك من مفاصل محرك التمارين:
   الورك والركبة والكاحل، الكتف والكوع والرسغ، اتجاه الجذع والراس. الأطوال مطابقة للمحرك (نفس المقياس). */
import * as THREE from 'three';
import { loadPack, buildBody, makeRig, eyes } from './real.js';
import { loadMus, makeMuscles, bodyLayer, makeShoes, makeBun, makeDQ } from './anat.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const perp = (v, ax) => v.clone().addScaledVector(ax, -v.dot(ax));
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const qAx = (ax, a) => new Q().setFromAxisAngle(ax, a);

// وحدة المحرك لكل سنتيمتر: طول رجل المحرك (60) ÷ طول رجل الموديل (87 سم)
export const K = 0.688;

// ثني الأصابع (درجات لكل مفصل: قاعدة الإصبع، النص، الطرف) والإبهام
const CURL = {
  grip: { f: [35, 57, 38], t: [22, 34, 30] },     // مقبض رفيع (بار، دمبل): الأصابع تلف عليه بدون ما تدخل بي
  gripL: { f: [25, 50, 40], t: [18, 30, 28] },    // مقبض مطاط أعرض
  relaxed: { f: [14, 24, 14], t: [8, 10, 8] },
  flat: { f: [-6, -20, -14], t: [-18, -8, -6] },   // قيم سالبة: تعاكس ثنية الأصابع بوضع السكون، فالكف والأصابع تنبسط على الأرض
  fist: { f: [80, 98, 64], t: [30, 44, 36] },
  fistT: { f: [88, 100, 70], t: [-10, 25, 25], sw: 90, sa: 'H' },   // قبضة مسكّرة: الإبهام يلف على الأصابع
  cup: { f: [26, 58, 40], t: [18, 26, 20] },
  hook: { f: [78, 14, 6], t: [10, 24, 20] }   // مسكة حافة: الأصابع تنثني من القاعدة وتنبسط على السطح
};

// مثل المحرك: اتجاه أمامي للعظم، يتبع اتجاه الثني إذا المفصل مثني، وإلا يرجع للاحتياطي
function antBlend(bend, axis, fb) {
  const f = perp(fb, axis); if (f.lengthSq() < 1e-8) f.set(1, 0, 0).addScaledVector(axis, -axis.x); f.normalize();
  const p = perp(bend, axis), l = p.length(), w = sstep(0.06, 0.3, l / (bend.length() || 1));
  if (w <= 0) return f; p.divideScalar(l);
  const out = f.multiplyScalar(1 - w).addScaledVector(p, w);
  return out.lengthSq() < 0.04 ? p : out.normalize();
}
function ik(A, T, L1, L2, pole) {
  const dir = T.clone().sub(A); let d = dir.length(); dir.divideScalar(d || 1);
  const Lm = L1 + L2 - 0.02, sz = 0.015 * (L1 + L2);   // انفراد ناعم قرب الفرد الكامل
  if (d > Lm - sz) d = Lm - sz * Math.exp(-(d - (Lm - sz)) / sz);
  d = clamp(d, Math.abs(L1 - L2) + 0.02, Lm);
  const p = perp(pole, dir); if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(dir, -dir.z); p.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const E = A.clone().addScaledVector(dir, a).addScaledVector(p, h);
  return [E, E.clone().add(A.clone().addScaledVector(dir, d).sub(E).normalize().multiplyScalar(L2))];
}

/* ---------- معالم سطح الجسم (بالمستوى الجانبي، بوحدة المحرك) ----------
   المحرك يحتاجها حتى البار ينزل على الصدر فعلاً، ويمشي على الفخذ، ويعبر من كدام الوجه.
   كل نقطة: [لكدام، لتحت] نسبةً لمنتصف الورك بوضع السكون. الجذع قطعة وحدة، فالنقطة تلف ويا زاوية الجذع. */
function landmarks(pack, r, hipC, shC, rT, L) {
  const P = pack.pos, n = P.length / 3, H = k => r[k].head;
  const c2 = v => [(v.z - hipC.z) * K, -(v.y - hipC.y) * K];
  const Fr = perp(new V3(0, 0, 1), rT).normalize(), tl = shC.distanceTo(hipC);
  // الجذع: أكثر نقطة لكدام ولورا بكل شريحة (بعرض الصدر، بدون الذراعين)
  const bins = {}, v = new V3();
  for (let i = 0; i < n; i++) {
    const x = P[i * 3]; if (Math.abs(x) > 12.5) continue;
    v.set(x, P[i * 3 + 1], P[i * 3 + 2]).sub(hipC);
    const u = v.dot(rT); if (u < -14 || u > tl + 6) continue;
    const k = Math.round(u), f = v.dot(Fr), b = bins[k] || (bins[k] = [-1e9, 1e9]);
    b[0] = Math.max(b[0], f); b[1] = Math.min(b[1], f);
  }
  const ks = Object.keys(bins).map(Number).sort((a, b) => a - b);
  // شرائح قليلة النقاط تطلع ناقصة: نعدّلها من جيرانها (الوجه أعلى قيمة، والظهر أقل قيمة)
  const nb = (arr, i, f) => f(arr[Math.max(0, i - 1)], arr[i], arr[Math.min(arr.length - 1, i + 1)]);
  const F0 = ks.map(k => bins[k][0]), B0 = ks.map(k => bins[k][1]);
  const fr = ks.map((k, i) => [k * K, nb(F0, i, Math.max) * K]), bk = ks.map((k, i) => [k * K, nb(B0, i, Math.min) * K]);
  // خط الصدر: أبرز نقطة بالصدر
  let chest = null;
  fr.forEach(p => { if (p[0] > 0.55 * tl * K && p[0] < 0.92 * tl * K && (!chest || p[1] > chest[1])) chest = p; });
  // الرقبة والراس: رؤوس العظام، ووجه الراس من الذقن للجبهة
  const neck = ['neck01', 'neck02', 'neck03', 'head'].map(k => c2(H(k)));
  const hy = H('head').y, face = [], fb = {};
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Math.abs(x) > 7 || y < hy - 12) continue;
    const k = Math.round((y - hy) / 1.5); if (!fb[k] || z > fb[k][2]) fb[k] = [x, y, z];
  }
  Object.keys(fb).map(Number).sort((a, b) => a - b).forEach(k => { const q = fb[k]; face.push(c2(new V3(0, q[1], q[2]))); });
  let top = -1e9; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3]) < 7) top = Math.max(top, P[i * 3 + 1]);
  // الرجل: وجه الفخذ والساق (الرجل اليسرى)
  const leg = (a, b, len) => {
    const d = b.clone().sub(a).normalize(), nf = perp(new V3(0, 0, 1), d).normalize(), out = {};
    for (let i = 0; i < n; i++) {
      if (P[i * 3] < 1) continue; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(a);
      const s = v.dot(d); if (s < 0 || s > len) continue;
      const q = v.clone().addScaledVector(d, -s); if (q.length() > 13) continue;
      const k = Math.round(s / 2), f = q.dot(nf); out[k] = Math.max(out[k] == null ? -1e9 : out[k], f);
    }
    const ks2 = Object.keys(out).map(Number).sort((a, b) => a - b), vs = ks2.map(k => out[k]);
    return ks2.map((k, i) => [k * 2 * K, nb(vs, i, Math.max) * K]);
  };
  // للتداخل: نص قطر كل طرف على طوله (من نقاط الجلد اللي تتبع عظم الطرف)، وعرض الجذع، وبيضة الراس
  const bn = pack.bones.map(b => b.name), SI = pack.skinIndex, SW = pack.skinWeight;
  const dom = i => { let m = -1, k = 0; for (let j = 0; j < 4; j++) if (SW[i * 4 + j] > m) { m = SW[i * 4 + j]; k = SI[i * 4 + j]; } return bn[k]; };
  const D0 = new Array(n); for (let i = 0; i < n; i++) D0[i] = dom(i);
  const limb = (a, b, names) => {
    const A = H(a), d = H(b).clone().sub(A), ln = d.length(), bins = Array.from({ length: 10 }, () => []); d.normalize();
    for (let i = 0; i < n; i++) {
      if (!names.includes(D0[i])) continue; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(A);
      const s = v.dot(d); if (s < -1 || s > ln + 1) continue;
      bins[clamp(Math.floor(s / ln * 10), 0, 9)].push(v.addScaledVector(d, -s).length());
    }
    const out = bins.map((q, k) => { q.sort((x, y) => x - y); return [(k + 0.5) / 10 * ln * K, q.length ? q[Math.floor(q.length * 0.85)] * K : 0]; });
    for (let k = 0; k < out.length; k++) if (!out[k][1]) out[k][1] = (out[k - 1] || out[k + 1] || [0, 3])[1];
    return out;
  };
  const TB = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'pelvis.L', 'pelvis.R', 'breast.L', 'breast.R', 'clavicle.L', 'clavicle.R'];
  const wb = {};
  for (let i = 0; i < n; i++) {
    if (!TB.includes(D0[i])) continue; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(hipC);
    const u = Math.round(v.dot(rT) / 2); (wb[u] || (wb[u] = [])).push(Math.abs(P[i * 3]));
  }
  const wk = Object.keys(wb).map(Number).sort((a, b) => a - b);
  const wd = wk.map(k => { const q = wb[k].sort((x, y) => x - y); return [k * 2 * K, q[Math.floor(q.length * 0.97)] * K]; });
  // الراس: صندوق نقاط فوك الرقبة
  const n3 = H('neck03'), hb = new THREE.Box3();
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y < n3.y + 1.5 || Math.abs(P[i * 3]) > 11) continue; hb.expandByPoint(v.set(P[i * 3], y, P[i * 3 + 2])); }
  const hc = hb.getCenter(new V3()), hs = hb.getSize(new V3()).multiplyScalar(0.5);
  return {
    rT: [rT.z, -rT.y], fr, bk, chest, neck, face, top: -(top - hipC.y) * K,
    thF: leg(H('upperleg01.L'), H('lowerleg01.L'), L.thigh), shF: leg(H('lowerleg01.L'), H('foot.L'), L.shin),
    thR: limb('upperleg01.L', 'lowerleg01.L', ['upperleg01.L', 'upperleg02.L']), shR: limb('lowerleg01.L', 'foot.L', ['lowerleg01.L', 'lowerleg02.L']),
    uaR: limb('upperarm01.L', 'lowerarm01.L', ['upperarm01.L', 'upperarm02.L']), faR: limb('lowerarm01.L', 'wrist.L', ['lowerarm01.L', 'lowerarm02.L']),
    wd, head: { up: (hc.y - shC.y) * K, fwd: (hc.z - shC.z) * K, r: [hs.x * K, hs.y * K, hs.z * K] }
  };
}

export async function createFigure(sex, base) {
  const [pack, mdata] = await Promise.all([loadPack(sex, base), loadMus(sex, base)]);
  const B = buildBody(pack, new THREE.MeshBasicMaterial());
  B.DQ = makeDQ(B.mesh.skeleton, B.mesh);
  B.layer = bodyLayer(B, sex, B.DQ, mdata.corBody, mdata.bone);
  B.eyes = eyes(B); B.shoes = makeShoes(B);
  B.mus = makeMuscles(B, mdata, B.DQ);
  if (sex === 'f') B.bun = makeBun(B, 0xb8904f);
  const rig = makeRig(B), root = new THREE.Group();
  root.scale.setScalar(K); root.add(B.mesh); root.add(B.mus.mesh);

  /* ---------- أبعاد السكون ---------- */
  const r = B.rest, H = n => r[n].head.clone(), TL = n => r[n].tail.clone(), dir = (a, b) => b.clone().sub(a).normalize();
  const hipC = mid(H('upperleg01.L'), H('upperleg01.R')), shC = mid(H('upperarm01.L'), H('upperarm01.R'));
  const rTorso = dir(hipC, shC), len = (a, b) => H(a).distanceTo(H(b));
  const L = { thigh: len('upperleg01.L', 'lowerleg01.L'), shin: len('lowerleg01.L', 'foot.L'), upper: len('upperarm01.L', 'lowerarm01.L'),
    fore: len('lowerarm01.L', 'wrist.L'), hand: len('wrist.L', 'finger3-1.L') };
  const P = pack.pos, Z = pack.zone, nV = P.length / 3, ank = H('foot.L');
  let heel = 0, toe = 0;
  for (let i = 0; i < nV; i++) if (P[i * 3] > 3 && Z[i * 4 + 3] > 77) { const dz = P[i * 3 + 2] - ank.z; heel = Math.min(heel, dz); toe = Math.max(toe, dz); }
  const fem = sex === 'f';
  const dims = {
    B: { thigh: L.thigh * K, shin: L.shin * K, torso: shC.distanceTo(hipC) * K, neck: (B.lm.eye[1] + 5 - shC.y) * K, upper: L.upper * K, fore: L.fore * K,
      foot: toe * K, heel: -heel * K, ankleH: ank.y * K, chest: (fem ? 11.5 : 12) * K, r: { hip: (fem ? 10 : 9.5) * K, wr: 2.6 * K } },
    D: { hw: Math.abs(H('upperleg01.L').x) * K, sw: Math.abs(H('upperarm01.L').x) * K }
  };
  dims.lm = landmarks(pack, r, hipC, shC, rTorso, L);
  { // فقرات الظهر بوضع السكون (على طول الجذع، لكدام) — المحرك يحتاجها حتى يثني أعلى الظهر بس (الكرنش) وأسفل الظهر يبقى لاصق
    const F0 = perp(new V3(0, 0, 1), rTorso).normalize(), sp = p => { const d = p.clone().sub(hipC); return [d.dot(rTorso) * K, d.dot(F0) * K]; };
    dims.B.spine = { s3: sp(H('spine03')), s2: sp(H('spine02')), s1: sp(H('spine01')), sh: sp(shC) };
  }
  const S2 = { L: 1, R: -1 }, RS = {};
  ['L', 'R'].forEach(s => {
    const sg = S2[s], rU = dir(H('upperarm01.' + s), H('lowerarm01.' + s)), rF = dir(H('lowerarm01.' + s), H('wrist.' + s));
    const rH = dir(H('wrist.' + s), H('finger3-1.' + s)), rA = dir(H('finger2-1.' + s), H('finger5-1.' + s));
    const pn0 = new V3().crossVectors(rA, rH).multiplyScalar(sg).normalize();   // باطن الكف بالسكون
    let aU = perp(rF, rU); aU = aU.lengthSq() > 0.01 ? aU.normalize() : perp(new V3(0, 0, 1), rU).normalize();
    let aF = perp(rU.clone().negate(), rF); aF = aF.lengthSq() > 0.01 ? aF.normalize() : aU.clone();
    const fing = {};
    for (let f = 1; f <= 5; f++) {
      const v = dir(H(`finger${f}-1.${s}`), H(`finger${f}-2.${s}`));
      const ref = f === 1 ? pn0.clone().add(rA.clone().multiplyScalar(0.5)).normalize() : pn0;   // الإبهام ينثني لجهة الكف ويعبر لجهة الخنصر
      fing[f] = new V3().crossVectors(v, ref).normalize(); if (f === 1) fing.tv = v;
    }
    const sole = TL('foot.' + s).sub(H('foot.' + s)); sole.y = 0; sole.normalize();
    RS[s] = { sg, rU, rF, rH, rA, pn0, aU, aF, fing, thigh: dir(H('upperleg01.' + s), H('lowerleg01.' + s)), shin: dir(H('lowerleg01.' + s), H('foot.' + s)), sole };
  });

  /* ---------- الوضعية من مفاصل المحرك ---------- */
  const toL = p => p.clone().divideScalar(K);
  const TORSO = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'pelvis.L', 'pelvis.R'];
  const palmAlong = 0.6 * L.hand * K, palmOff = (fem ? 1.25 : 1.45) * K;
  function pose(J, handOf) {
    rig.clear(); const Qw = rig.Qw;
    const T3 = J.T3.clone().normalize(), F3 = J.F3.clone().normalize();
    const qt = rig.aimQ(rTorso, new V3(0, 0, 1), T3, F3);
    TORSO.forEach(n => Qw[n] = qt.clone());
    if (J.cr || J.tw) { // ثني أعلى الظهر (الكرنش) ولفّة الجذع تتوزع على الفقرات؛ أسفل الظهر يبقى ويا الحوض
      const lat = new V3().crossVectors(T3, F3).normalize(), CW = { spine03: 0.3, spine02: 0.65, spine01: 1 }, TW = { spine04: 0.12, spine03: 0.35, spine02: 0.65, spine01: 1 };
      ['spine04', 'spine03', 'spine02', 'spine01'].forEach(n => { const qc = new Q().setFromAxisAngle(lat, (J.cr || 0) * R * (CW[n] || 0)), ax = T3.clone().applyQuaternion(qc);
        Qw[n] = new Q().setFromAxisAngle(ax, (J.tw || 0) * R * TW[n]).multiply(qc).multiply(qt); });
    }
    const qtop = Qw['spine01'];
    const qhd = rig.aimQ(new V3(0, 1, 0), new V3(0, 0, 1), J.Uh3, J.Fh3);
    // الرقبة بين الجذع والراس، ويمكن ترجع لورا (J.nk بالدرجات، سالب = الراس لورا) حتى البار يعبر من كدام الوجه
    const nk = (J.nk || 0) * R, qn = w => new Q().setFromAxisAngle(new V3(1, 0, 0), nk * w);
    Qw['neck01'] = qn(0.5).multiply(qtop.clone().slerp(qhd, 0.3)); Qw['neck02'] = qn(0.85).multiply(qtop.clone().slerp(qhd, 0.55)); Qw['neck03'] = qn(1).multiply(qtop.clone().slerp(qhd, 0.8)); Qw['head'] = qhd;
    ['breast.L', 'breast.R'].forEach(n => { if (r[n]) Qw[n] = Qw['spine02'].clone(); });
    const rootPos = toL(J.pelvis).add(H('root').sub(hipC).applyQuaternion(qt));

    // الأرجل: الورك من الموديل، والكاحل من المحرك، والركبة باتجاه ركبة المحرك
    ['L', 'R'].forEach((s, i) => {
      const lg = J.legs[i], rs = RS[s], hip = rig.headPos('upperleg01.' + s, rootPos), an = toL(lg.an);
      let pole = toL(lg.kn).sub(mid(hip, an)); if (pole.lengthSq() < 1e-6) pole = F3.clone();
      const [kn, a2] = ik(hip, an, L.thigh, L.shin, pole);
      const ta = kn.clone().sub(hip).normalize(), sa = a2.clone().sub(kn).normalize(), sole = lg.sole.clone().normalize();
      const qth = rig.aimQ(rs.thigh, new V3(0, 0, 1), ta, antBlend(kn.clone().sub(a2), ta, sole));
      Qw['upperleg01.' + s] = qth; Qw['upperleg02.' + s] = qth.clone();
      let antS = perp(sole, sa); if (antS.lengthSq() < 1e-4) antS = perp(F3, sa);
      const qsh = rig.aimQ(rs.shin, new V3(0, 0, 1), sa, antS);
      Qw['lowerleg01.' + s] = qsh; Qw['lowerleg02.' + s] = qsh.clone();
      let up = perp(kn.clone().sub(a2), sole); if (up.lengthSq() < 1e-6) up = new V3(0, 1, 0);
      Qw['foot.' + s] = rig.aimQ(rs.sole, new V3(0, 1, 0), sole, up);
    });

    // الإيدين: الرسغ يوصل لمكان المسكة، الكوع باتجاه كوع المحرك، ولوح الكتف يلحق الذراع
    const qs = Qw['spine01'], info = { W: [], Wr: [], Sh: [], Lmax: (L.upper + L.fore) * K - 0.04 };
    ['L', 'R'].forEach((s, i) => {
      const am = J.arms[i], rs = RS[s], sg = rs.sg, h = (handOf && handOf(i, J)) || {};
      const hd = (h.hd || am.hd).clone().normalize();
      let n, across;
      if (h.th) { across = perp(h.th.clone().negate(), hd).normalize(); n = new V3().crossVectors(across, hd).multiplyScalar(sg).normalize(); }
      else { n = perp(h.n || new V3(-sg, 0, 0), hd); if (n.lengthSq() < 1e-6) n = perp(F3.clone().negate(), hd); n.normalize(); across = new V3().crossVectors(hd, n).multiplyScalar(sg).normalize(); }
      const style = h.style || 'relaxed';
      let W = (am.tgt || am.wr).clone(), W0 = null;   // الهدف قبل القص: إذا بعيد، الذراع تنفرد كلها وتوصل لأبعد ما تكدر
      const gR = h.gr || 1.1, gBig = gR > 1.35;
      if (h.g != null && style === 'grip') { const hl = L.hand * K, sc = hl / 7.8, rr = (am.tgt || am.wr).distanceTo(am.sh) / ((L.upper + L.fore) * K);
        const along = (gBig ? 0.86 : 0.87) * hl, ext = (along - palmAlong) * sstep(0.9, 0.985, rr);
        W.addScaledVector(hd, h.g - along).addScaledVector(n, -(1.25 * sc + gR));
        W0 = W.clone(); const sd = W.clone().sub(am.sh).normalize(); if (ext > 0 && sd.y < -0.5) W.addScaledVector(sd, ext * sstep(0.5, 0.8, -sd.y)); }   // بس للأوزان المعلّقة (الذراع لتحت)   // الذراع ممدودة (أوزان معلّقة): الهدف يبعد، فالكوع يبقى مفرود والمقبض بنص القبضة   // مركز المقبض داخل حلقة الأصابع (مقاسة من عظام الإيد)
      else if (h.g != null) W.addScaledVector(hd, h.g - palmAlong).addScaledVector(n, -(palmOff + (h.hr != null ? h.hr : 1.1)));
      const Wl = toL(W), E0 = toL(am.el), S0 = toL(am.sh);
      let pole = E0.clone().sub(mid(S0, toL(am.wr))); if (pole.lengthSq() < 1e-6) pole = T3.clone().negate();
      const uaE = E0.clone().sub(S0).normalize();
      const elev = Math.acos(clamp(uaE.dot(T3.clone().negate()), -1, 1));
      const lift = sstep(70 * R, 178 * R, elev) * 0.3, prot = clamp(uaE.dot(F3), 0, 1) * sstep(35 * R, 95 * R, elev) * 0.16;
      const d0 = dir(H('clavicle.' + s), TL('clavicle.' + s)), d1 = d0.clone().add(new V3(0, lift, prot)).normalize();
      const qc = qs.clone().multiply(rig.aimQ(d0, new V3(0, 0, 1), d1, new V3(0, 0, 1)));
      Qw['clavicle.' + s] = qc; Qw['shoulder01.' + s] = qc.clone();
      const relW = S => am.rel ? Wl.clone().sub(S0).add(S) : Wl;   // الهدف نسبةً للكتف الحقيقي (حتى الكوع يبقى ثابت لما الكتف يرتفع)
      let Sh = rig.headPos('upperarm01.' + s, rootPos), [E, Wr] = ik(Sh, relW(Sh), L.upper, L.fore, pole);
      const qsw = new Q().setFromUnitVectors(rs.rU.clone().applyQuaternion(qc).normalize(), E.clone().sub(Sh).normalize());
      Qw['shoulder01.' + s] = new Q().slerp(qsw, 0.28).multiply(qc);
      Sh = rig.headPos('upperarm01.' + s, rootPos); [E, Wr] = ik(Sh, relW(Sh), L.upper, L.fore, pole);
      const ua = E.clone().sub(Sh).normalize(), fa = Wr.clone().sub(E).normalize();
      const antU = antBlend(Wr.clone().sub(E), ua, pole.clone().negate()), antF = antBlend(Sh.clone().sub(E), fa, antU);
      const qu = rig.aimQ(rs.rU, rs.aU, ua, antU);
      { // لفّة العضد تتوزع: النص العلوي ياخذ ربعها
        const qp = Qw['shoulder01.' + s], Lq = qp.clone().invert().multiply(qu), pu = rs.rU.clone().multiplyScalar(Lq.x * rs.rU.x + Lq.y * rs.rU.y + Lq.z * rs.rU.z);
        const tw = new Q(pu.x, pu.y, pu.z, Lq.w); if (tw.lengthSq() < 1e-9) tw.set(0, 0, 0, 1); tw.normalize();
        Qw['upperarm01.' + s] = qp.clone().multiply(Lq.clone().multiply(tw.clone().invert())).multiply(new Q().slerp(tw, 0.25));
      }
      Qw['upperarm02.' + s] = qu.clone();
      const qf = rig.aimQ(rs.rF, rs.aF, fa, antF);
      const hdir = h.bend ? hd.clone().lerp(fa, h.bend).normalize() : hd;
      const qh = rig.aimQ(rs.rH, rs.rA, hdir, across);
      { // لفّة الساعد (كب وبطح): نصها بالنص الثاني من الساعد
        const qrel = qf.clone().invert().multiply(qh), pr = rs.rF.clone().multiplyScalar(qrel.x * rs.rF.x + qrel.y * rs.rF.y + qrel.z * rs.rF.z);
        const tw = new Q(pr.x, pr.y, pr.z, qrel.w); if (tw.lengthSq() < 1e-9) tw.set(0, 0, 0, 1); tw.normalize();
        Qw['lowerarm01.' + s] = qf; Qw['lowerarm02.' + s] = qf.clone().multiply(new Q().slerp(tw, 0.5));
      }
      Qw['wrist.' + s] = qh;
      info.W[i] = W0 ? W0.clone() : Wl.clone().multiplyScalar(K); info.Wr[i] = Wr.clone().multiplyScalar(K); info.Sh[i] = Sh.clone().multiplyScalar(K);
      const c = (style === 'grip' && gBig ? CURL.gripL : CURL[style]) || CURL.relaxed;
      for (let f = 1; f <= 5; f++) {
        const ang = f === 1 ? c.t : c.f, ax = f === 1 && c.tx ? new V3().crossVectors(rs.fing.tv, rs.pn0.clone().addScaledVector(rs.rA, c.tx).normalize()).normalize() : rs.fing[f];
        if (f > 1) { const mc = 'metacarpal' + (f - 1) + '.' + s; if (r[mc]) Qw[mc] = qh.clone(); }
        let a = 0;
        for (let k = 1; k <= 3; k++) { a += ang[k - 1] * R; const bn = `finger${f}-${k}.${s}`; if (r[bn]) Qw[bn] = f === 1 && c.sw ? qh.clone().multiply(qAx(c.sa === 'H' ? rs.rH : rs.pn0, c.sw * R * sg)).multiply(qAx(ax, a)) : qh.clone().multiply(qAx(ax, a)); }
      }
    });
    rig.apply(rootPos);
    return info;
  }

  /* ---------- الألوان والعرض ---------- */
  const U = B.mus.mat.userData.U, LU = B.layer.userData.U;
  U.uMap.value = 1; LU.uMap.value = 1;
  function setMuscles(pri, sec) {
    const P1 = new Set(pri || []), S1 = new Set(sec || []);
    U.uPri.value = mdata.grp.map(m => P1.has(m) ? 1 : 0); U.uSec.value = mdata.grp.map(m => S1.has(m) ? 1 : 0);
    LU.uPri.value = pack.muscles.map(m => P1.has(m) ? 1 : 0); LU.uSec.value = pack.muscles.map(m => S1.has(m) ? 1 : 0);
  }
  function setClothes(v) { LU.uMode.value = v ? 1 : 0; B.mus.mesh.visible = !v; }
  function update() { root.updateMatrixWorld(true); B.DQ.update(); }
  function dispose() {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); });
  }
  setClothes(false);
  return { root, B, dims, sex, pose, setMuscles, setClothes, update, dispose, K, CURL, palm: { palmAlong, palmOff } };
}
