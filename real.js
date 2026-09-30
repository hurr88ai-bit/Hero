/* عافية · مدرب واقعي (تجربة): جسم MakeHuman (CC0) مع هيكل عظمي، وحركة سكوات متوازنة */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t), minjerk = t => { t = clamp(t, 0, 1); return t * t * t * (10 - 15 * t + 6 * t * t); };
const qx = a => new Q().setFromAxisAngle(new V3(1, 0, 0), a), qy = a => new Q().setFromAxisAngle(new V3(0, 1, 0), a);

/* ---------- تحميل الجسم (ملفات ثنائية مضغوطة) ---------- */
let SHARED = null;
export async function loadPack(sex, base) {
  base = base || '';
  const bin = t => { const s = atob(t.trim()), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  if (!SHARED) SHARED = Promise.all([fetch(base + 'body-meta.json').then(r => r.json()), fetch(base + 'body-shared.txt').then(r => r.text()).then(bin)]);
  const [meta, sh] = await SHARED, buf = await fetch(base + `body-${sex}.txt`).then(r => r.text()).then(bin);
  const nV = meta.nV, nT = meta.nT; let o = 0;
  const tris = new Uint16Array(sh, 0, nT * 3); o = nT * 6;
  const si = new Uint8Array(sh, o, nV * 4); o += nV * 4;
  const sw8 = new Uint8Array(sh, o, nV * 4); o += nV * 4;
  const zone = new Uint8Array(sh, o, nV * 4);
  const sw = new Float32Array(nV * 4);
  for (let i = 0; i < nV; i++) { let t = 0; for (let k = 0; k < 4; k++) t += sw8[i * 4 + k]; for (let k = 0; k < 4; k++) sw[i * 4 + k] = t ? sw8[i * 4 + k] / t : (k ? 0 : 1); }
  const p16 = new Int16Array(buf, 0, nV * 3), pos = Float32Array.from(p16, v => v / 100);
  const muscle = new Uint8Array(buf, nV * 6, nV * 4);
  return { sex, pos, tris, skinIndex: si, skinWeight: sw, zone, muscle, bones: meta[sex].bones, lm: meta[sex].lm, muscles: meta.muscles };
}

/* ---------- الجسم ---------- */
export function buildBody(pack, MAT) {
  const g = new THREE.BufferGeometry(), n = pack.pos.length / 3;
  if (pack.sex === 'f' && !pack.jawDone) {   // وجه البنت: نلطّف زاوية الفك شوية (أنعم وأضيق من الجوانب)
    const e = pack.lm.eye, P = pack.pos, Z = pack.zone, ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < n; i++) {
      if (Z[i * 4 + 2] < 102) continue;
      const ax = Math.abs(P[i * 3]), dy = P[i * 3 + 1] - e[1], dz = P[i * 3 + 2] - e[2];
      const f = ss(-4.5, -9.5, dy) * (1 - ss(-12.8, -14.5, dy)) * ss(-11.0, -8.0, dz) * ss(1.5, 4.5, ax);
      P[i * 3] *= 1 - 0.075 * f;
    }
    pack.jawDone = true;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pack.pos, 3));
  g.setIndex(new THREE.BufferAttribute(Uint16Array.from(pack.tris), 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(pack.skinIndex), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Float32Array.from(pack.skinWeight), 4));
  g.setAttribute('aZone', new THREE.Float32BufferAttribute(Float32Array.from(pack.zone, v => v / 255), 4));
  const mus = new Float32Array(n * 4); for (let i = 0; i < n; i++) { mus[i * 4] = pack.muscle[i * 4]; mus[i * 4 + 1] = pack.muscle[i * 4 + 1] / 255; mus[i * 4 + 2] = pack.muscle[i * 4 + 2]; mus[i * 4 + 3] = pack.muscle[i * 4 + 3] / 255; }
  g.setAttribute('aMus', new THREE.BufferAttribute(mus, 4));
  g.computeVertexNormals();
  const bones = [], byName = {}, rest = {};
  pack.bones.forEach((b, i) => {
    const bone = new THREE.Bone(); bone.name = b.name; bones.push(bone); byName[b.name] = bone;
    rest[b.name] = { head: new V3(...b.head), tail: new V3(...b.tail), parent: b.parent >= 0 ? pack.bones[b.parent].name : null, i };
  });
  pack.bones.forEach((b, i) => {
    const bone = bones[i], h = rest[b.name].head;
    if (b.parent >= 0) { const ph = rest[pack.bones[b.parent].name].head; bone.position.copy(h).sub(ph); bones[b.parent].add(bone); }
    else bone.position.copy(h);
  });
  const mesh = new THREE.SkinnedMesh(g, MAT);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, bones, byName, rest, order: pack.bones.map(b => b.name), lm: pack.lm, sex: pack.sex, pack };
}

function bodyMaterial(sex, lm, pack) {
  const bh = n => pack.bones.find(b => b.name === n).head, sh = bh('upperarm01.L'), el = bh('lowerarm01.L');
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xff8060) });
  const U = {
    uPri: { value: new Array(20).fill(0) }, uSec: { value: new Array(20).fill(0) }, uPulse: { value: 0 }, uMap: { value: 1 },
    uSkin: { value: new THREE.Color(sex === 'f' ? 0xc99b7c : 0xbb8c6c) }, uBottom: { value: new THREE.Color(sex === 'f' ? 0x1b1e25 : 0x1f2a44) },
    uTop: { value: new THREE.Color(0x1d4ea3) }, uHair: { value: new THREE.Color(0x16100c) }, uShoe: { value: new THREE.Color(0x2a2e36) },
    uLm: { value: new THREE.Vector4(lm.hipY, lm.kneeY, lm.ankY, lm.waist) }, uLm2: { value: new THREE.Vector4(lm.nipY, lm.clavY, lm.shY, lm.neckY) },
    uEye: { value: new V3(...lm.eye) }, uFem: { value: sex === 'f' ? 1 : 0 },
    uSh: { value: new V3(...sh) }, uEl: { value: new V3(...el) }
  };
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aZone; attribute vec4 aMus; uniform float uPri[20]; uniform float uSec[20];
      varying vec3 vRest; varying vec4 vZone; varying float vHiP; varying float vHiS;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vRest = position; vZone = aZone;
      int i1 = int(aMus.x + 0.5), i2 = int(aMus.z + 0.5);
      vHiP = max(uPri[i1] * aMus.y, uPri[i2] * aMus.w); vHiS = max(uSec[i1] * aMus.y, uSec[i2] * aMus.w);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uSkin, uBottom, uTop, uHair, uShoe, uEye, uSh, uEl; uniform vec4 uLm, uLm2; uniform float uFem, uPulse, uMap;
      varying vec3 vRest; varying vec4 vZone; varying float vHiP; varying float vHiS;
      float rgn(out float rough){
        vec3 p = vRest; float ax = abs(p.x); float legs = vZone.x, arm = vZone.y, head = vZone.z, foot = vZone.w;
        rough = 0.55;
        // shoes + socks
        if(legs > 0.5 && (foot > 0.4 || p.y < uLm.z + 2.5)){ rough = 0.6; return p.y < 2.4 ? 6.0 : 5.0; }
        if(legs > 0.5 && p.y < uLm.z + mix(9.0, 7.0, uFem)){ rough = 0.9; return 7.0; }
        // bottoms
        if(uFem < 0.5){ float hem = uLm.y + 0.40 * (uLm.x - uLm.y); if(legs > 0.6 && p.y < uLm.w && p.y > hem){ rough = 0.85; return 1.0; } }
        else if(legs > 0.6 && p.y < uLm.w + 1.0 && p.y > uLm.z + 7.0){ rough = 0.8; return 1.0; }
        // تيشيرت بنص ردن (للبنات)
        if(uFem > 0.5 && head < 0.35 && p.y > uLm.x + 7.0){
          vec3 shp = vec3(sign(p.x) * uSh.x, uSh.y, uSh.z), ad = normalize(vec3(sign(p.x) * uEl.x, uEl.y, uEl.z) - shp);
          float along = dot(p - shp, ad), armLen = distance(uSh, uEl);
          bool front = p.z > 0.0;
          float neck = uLm2.y + 2.8 - 3.2 * (1.0 - smoothstep(0.0, 6.0, ax)) * (front ? 1.0 : 0.25);
          bool sleeve = arm > 0.35 ? along < armLen * 0.42 : true;
          if(p.y < neck && sleeve){ rough = 0.82; return 2.0; }
        }
        return 0.0;
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float rr; float R = rgn(rr);
      // شعر وحواجب كطبقة ناعمة فوق الجلد
      float hairM = 0.0, browM = 0.0;
      if(vZone.z > 0.4 && R == 0.0){
        vec3 q = vRest; float ax = abs(q.x), dy = q.y - uEye.y, dz = q.z - uEye.z;
        float t = smoothstep(0.0, 1.0, clamp((-dz - 2.0) / 11.0, 0.0, 1.0));
        float hl = mix(mix(5.6, 6.0, uFem), mix(-7.0, -9.5, uFem), t) + 0.22 * sin(q.x * 1.3);
        float ear = step(6.4, ax) * step(dz, -3.5) * step(-11.5, dz) * step(dy, 2.8) * step(-6.5, dy);
        hairM = smoothstep(hl - 0.15, hl + mix(0.9, 0.6, uFem), dy) * (1.0 - ear);
        float bx = clamp((ax - 1.0) / 4.4, 0.0, 1.0), cy = 1.75 + mix(0.35, 0.55, uFem) * sin(3.1416 * pow(bx, 0.75)) - 0.25 * bx;
        float th = mix(mix(0.5, 0.34, uFem), mix(0.2, 0.12, uFem), bx);
        browM = (1.0 - smoothstep(th * 0.45, th, abs(dy - cy))) * smoothstep(0.0, 0.1, bx) * (1.0 - smoothstep(0.85, 1.0, bx)) * step(-2.2, dz);
      }
      vec3 base = uSkin;
      if(R == 1.0) base = uBottom; else if(R == 2.0) base = uTop;
      else if(R == 5.0) base = uShoe; else if(R == 6.0) base = vec3(0.86); else if(R == 7.0) base = vec3(0.9);
      float gp = 0.0, gs = 0.0;
      if(R < 3.0 && uMap > 0.5){
        float cloth = R > 0.5 ? 1.0 : 0.0;
        gp = clamp(vHiP, 0.0, 1.0) * (0.75 + 0.25 * uPulse); gs = clamp(vHiS, 0.0, 1.0);
        base = mix(base, vec3(0.80, 0.52, 0.42), gs * mix(0.45, 0.25, cloth));
        base = mix(base, vec3(0.78, 0.12, 0.07), gp * mix(0.62, 0.32, cloth));
        gp *= mix(1.0, 0.45, cloth);
      }
      float grain = 0.85 + 0.15 * sin(vRest.x * 9.0 + sin(vRest.y * 7.0) * 2.0) * sin(vRest.z * 8.0);
      base = mix(base, uHair * grain * 1.1, hairM * mix(0.9, 0.97, uFem));
      base = mix(base, uHair * 1.25, browM * 0.9);
      if(hairM > 0.5) rr = 0.78;
      diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = rr;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.55, 0.06, 0.03) * gp * (0.35 + 0.25 * uPulse) + vec3(0.35, 0.12, 0.07) * gs * 0.12;`);
  };
  return m;
}

/* ---------- الرِگ: دوران عالمي لكل عظم، وحركة من الأب للابن ---------- */
export function makeRig(B) {
  const Qw = {}, order = B.order;
  const restDir = (a, b) => b.clone().sub(a).normalize();
  function aimQ(r1, rr, d, ref) { // يطابق إطار السكون (r1, rr) على الهدف (d, ref)
    const b = (y, z) => { y = y.clone().normalize(); z = z.clone().addScaledVector(y, -z.dot(y)); if (z.lengthSq() < 1e-8) z = new V3(0, 0, 1).addScaledVector(y, -y.z); z.normalize(); const x = new V3().crossVectors(y, z); return new THREE.Matrix4().makeBasis(x, y, z); };
    const m = b(d, ref).multiply(b(r1, rr).transpose());
    return new Q().setFromRotationMatrix(m);
  }
  function world(name) { let n = name; while (n && !Qw[n]) n = B.rest[n].parent; return n ? Qw[n] : new Q(); }
  function headPos(name, rootPos) {
    // موقع رأس العظم بالعالم من سلسلة الآباء
    const chain = []; let n = name; while (n) { chain.unshift(n); n = B.rest[n].parent; }
    const p = rootPos.clone();
    for (let i = 1; i < chain.length; i++) { const par = chain[i - 1], c = chain[i]; p.add(B.rest[c].head.clone().sub(B.rest[par].head).applyQuaternion(world(par))); }
    return p;
  }
  function apply(rootPos) {
    order.forEach(n => {
      const bone = B.byName[n], par = B.rest[n].parent, qw = world(n), qp = par ? world(par) : new Q();
      bone.quaternion.copy(qp.clone().invert().multiply(qw));
    });
    B.byName[order[0]].position.copy(rootPos);
  }
  return { Qw, aimQ, world, headPos, apply, restDir, clear() { for (const k in Qw) delete Qw[k]; } };
}

/* ---------- السكوات بالبار: توازن + إيقاع ---------- */
export function makeSquat(B, rig) {
  const r = B.rest, H = n => r[n].head.clone(), T = n => r[n].tail.clone();
  const hipL0 = H('upperleg01.L'), hipR0 = H('upperleg01.R'), kneeL0 = H('lowerleg01.L'), ankL0 = H('foot.L');
  const H0 = hipL0.clone().add(hipR0).multiplyScalar(0.5), hw = hipL0.x - H0.x;
  const L1 = kneeL0.distanceTo(hipL0), L2 = ankL0.distanceTo(kneeL0);
  const S0 = H('upperarm01.L').add(H('upperarm01.R')).multiplyScalar(0.5);
  const neck0 = H('neck01');
  const barRest = neck0.clone().add(new V3(0, -4.5, -7.2));
  const alpha = 16 * R, stanceX = Math.abs(ankL0.x) + 2.5;
  // القدم: من الكعب لرؤوس الأصابع
  const pos = B.pack.pos, zone = B.pack.zone; let heel = 1e9, toe = -1e9;
  for (let i = 0; i < pos.length / 3; i++) if (zone[i * 4 + 3] > 120 && pos[i * 3] > 0) { heel = Math.min(heel, pos[i * 3 + 2]); toe = Math.max(toe, pos[i * 3 + 2]); }
  const midRel = heel + 0.43 * (toe - heel) - ankL0.z; // منتصف القدم نسبة للكاحل
  const side = [{ s: 1, n: 'L' }, { s: -1, n: 'R' }].map(o => {
    const A = new V3(o.s * stanceX, ankL0.y, ankL0.z), fwd = new V3(0, 0, 1).applyQuaternion(qy(o.s * alpha));
    return Object.assign(o, { A, fwd, qf: qy(o.s * alpha), mid: A.clone().addScaledVector(fwd, midRel) });
  });
  const zMid = (side[0].mid.z + side[1].mid.z) / 2;
  const P = { rb: 0.7, th0: 7 * R, c: 1.12 };
  function ik(a, t, l1, l2, pole) {
    const d = t.clone().sub(a); let dist = d.length(); d.normalize(); dist = clamp(dist, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    return a.clone().addScaledVector(d, x).addScaledVector(p, h);
  }
  function poseAt(yH, zH, dth) {
    const Hm = new V3(0, yH, zH), legs = side.map(o => {
      const hip = Hm.clone().add(new V3(o.s * hw, 0, 0)), pole = o.fwd.clone().add(new V3(o.s * 0.12, 0.05, 0));
      const knee = ik(hip, o.A, L1, L2, pole);
      return { o, hip, knee, pole };
    });
    const shin = legs.reduce((a, l) => a + Math.atan2(l.knee.z - l.o.A.z, l.knee.y - l.o.A.y), 0) / 2;
    const th = P.th0 + P.c * Math.max(0, shin) + (dth || 0), qt = qx(th);
    const S = Hm.clone().add(S0.clone().sub(H0).applyQuaternion(qt));
    const bar = Hm.clone().add(barRest.clone().sub(H0).applyQuaternion(qt));
    const hat = Hm.clone().add(S0.clone().sub(H0).multiplyScalar(0.626).applyQuaternion(qt));
    let mz = 0.678 * hat.z;
    legs.forEach(l => { mz += 0.1 * lerp(l.hip.z, l.knee.z, 0.433) + 0.0465 * lerp(l.knee.z, l.o.A.z, 0.433) + 0.0145 * l.o.mid.z; });
    const com = (mz + P.rb * bar.z) / (1 + P.rb);
    return { Hm, legs, shin, th, qt, S, bar, com };
  }
  function balanced(yH, dth) {
    let lo = ankL0.z - 60, hi = ankL0.z + 25;
    for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (poseAt(yH, m, dth).com > zMid) hi = m; else lo = m; }
    return poseAt(yH, (lo + hi) / 2, dth);
  }
  // أعلى: الرجل شبه مستقيمة. أسفل: الفخذ تحت الموازي بـ 6°
  const bis = (f, a, b) => { for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } return (a + b) / 2; };
  const yTop = bis(y => { const p = balanced(y); return (L1 + L2) * 0.985 - p.legs[0].hip.distanceTo(side[0].A); }, ankL0.y + 30, H0.y + 5);
  const yBot = bis(y => { const p = balanced(y); return (p.legs[0].knee.y - L1 * Math.sin(6 * R)) - p.legs[0].hip.y; }, ankL0.y + 12, yTop);
  // الإيقاع: وقفة ونفس، نزول مسيطر، وقفة قصيرة، صعود أسرع ويا نقطة صعبة، قفل وزفير
  const TT = { brace: 1.0, down: 2.1, hold: 0.18, up: 1.35, lock: 0.75 };
  const PER = TT.brace + TT.down + TT.hold + TT.up + TT.lock;
  function stepOf(t) {
    let u = ((t % PER) + PER) % PER;
    if (u < TT.brace) return 'brace'; u -= TT.brace; if (u < TT.down) return 'down'; u -= TT.down; if (u < TT.hold) return 'hold'; u -= TT.hold; if (u < TT.up) return 'up'; return 'lock';
  }
  function phase(t) {
    let u = ((t % PER) + PER) % PER, s = 0, dth = 0, breath = 0, pulse = 0;
    if (u < TT.brace) { const k = u / TT.brace; breath = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.9 + (k > 0.8 ? (k - 0.8) * 0.5 : 0); }
    else if ((u -= TT.brace) < TT.down) { s = minjerk(u / TT.down); breath = 1; pulse = 0.4; }
    else if ((u -= TT.down) < TT.hold) { s = 1 + 0.012 * Math.sin(Math.PI * u / TT.hold); breath = 1; pulse = 0.8; }
    else if ((u -= TT.hold) < TT.up) {
      const k = u / TT.up, sticky = k + 0.06 * Math.sin(2 * Math.PI * k);   // يبطأ شوية بالنص
      s = 1 - minjerk(sticky); dth = 4.5 * R * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.6)), 2); breath = 1 - 0.3 * k; pulse = 1;
    } else { u -= TT.up; breath = 0.7 * (1 - smooth(u / TT.lock)); }
    return { s: clamp(s, 0, 1.02), dth, breath, pulse, per: PER, step: stepOf(t) };
  }
  function solve(t) {
    const ph = phase(t), y = lerp(yTop, yBot, ph.s);
    const p = balanced(y, ph.dth); p.ph = ph; return p;
  }
  return { solve, side, L1, L2, H0, S0, yTop, yBot, PER, alpha, zMid, barRest };
}

export const HAND = { palm: 1.35, deep: 3.0, finger: [0.95, 0.95, 0.9, 0.8], ext: 0.2, thumbR: 1.1, thumbShift: 1.3, elbowBack: 0.3, dev: 0.9 };
const BAR_R = 1.4;
export const SHOULDER = { elev: 0.34, retr: -0.24, share: 0.42, twist: 0.25 };
export function poseSquat(B, rig, sq, p) {
  const r = B.rest, H = n => r[n].head.clone(), T = n => r[n].tail.clone(), Qw = rig.Qw, qt = p.qt, br = p.ph.breath;
  rig.clear();
  // الجذع كله يدور حول الورك (ظهر محايد)، مع صدر مرفوع ونفس
  ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'pelvis.L', 'pelvis.R'].forEach(n => Qw[n] = qt.clone());
  const ext = (-2.5 * p.ph.s - 1.8 * br) * R;
  Qw['spine01'] = qt.clone().multiply(qx(ext));
  const nk = -0.42 * p.th / 3;
  Qw['neck01'] = Qw['spine01'].clone().multiply(qx(nk)); Qw['neck02'] = Qw['neck01'].clone().multiply(qx(nk)); Qw['neck03'] = Qw['neck02'].clone().multiply(qx(nk));
  Qw['head'] = Qw['neck03'].clone().multiply(qx(-0.05 * p.th));
  ['breast.L', 'breast.R'].forEach(n => Qw[n] = Qw['spine01'].clone());
  // الأرجل
  p.legs.forEach(l => {
    const s = l.o.n;
    // مستوى الرجل (الورك، الركبة، الكاحل): الفخذ والساق يدورون بهذا المستوى بس، بدون لفّة حول نفسهم
    const nP = l.o.A.clone().sub(l.hip).cross(l.pole).normalize();
    const thD = l.knee.clone().sub(l.hip).normalize(), shD = l.o.A.clone().sub(l.knee).normalize();
    const qth = rig.aimQ(rig.restDir(H('upperleg01.' + s), H('lowerleg01.' + s)), new V3(0, 0, 1), thD, new V3().crossVectors(nP, thD));
    Qw['upperleg01.' + s] = qth; Qw['upperleg02.' + s] = qth.clone();
    const qsh = rig.aimQ(rig.restDir(H('lowerleg01.' + s), H('foot.' + s)), new V3(0, 0, 1), shD, new V3().crossVectors(nP, shD));
    Qw['lowerleg01.' + s] = qsh; Qw['lowerleg02.' + s] = qsh.clone();
    Qw['foot.' + s] = l.o.qf.clone();
  });
  // موقع الجذر
  const rootPos = p.Hm.clone().add(H('root').sub(sq.H0).applyQuaternion(qt));
  // الترقوة: الكتف لورا وفوك شوية حتى يصير رف للبار
  ['L', 'R'].forEach((s, i) => {
    const sg = i ? -1 : 1, d0 = rig.restDir(H('clavicle.' + s), T('clavicle.' + s));
    const d1 = d0.clone().add(new V3(0, SHOULDER.elev + 0.02 * br, SHOULDER.retr)).normalize();
    Qw['clavicle.' + s] = Qw['spine01'].clone().multiply(rig.aimQ(d0, new V3(0, 0, 1), d1, new V3(0, 0, 1)));
    Qw['shoulder01.' + s] = Qw['clavicle.' + s].clone();
  });
  // البار: على الترابيس، من الرقبة
  const neckW = rig.headPos('neck01', rootPos), qs = Qw['spine01'];
  const bar = neckW.clone().add(sq.barRest.clone().sub(H('neck01')).applyQuaternion(qs));
  // الإيدين: مسكة أعرض من الكتف، الرسغ تحت البار، والكوع لتحت ولورا
  const grip = Math.abs(H('upperarm01.L').x) + 17.5;
  ['L', 'R'].forEach((s, i) => {
    const sg = i ? -1 : 1;
    let Sh = rig.headPos('upperarm01.' + s, rootPos);
    const G = bar.clone().add(new V3(sg * grip, 0, 0));
    const rU = rig.restDir(H('upperarm01.' + s), H('lowerarm01.' + s)), qc = Qw['clavicle.' + s].clone();
    const up = new V3(0, 1, 0).applyQuaternion(qs), fw = new V3(0, 0, 1).applyQuaternion(qs);
    // المسكة الكاملة: الكف بخط الساعد (الرسغ مستقيم)، ورا البار ووجهه لكدام، والبار يقطع الكف مايل عند أصل الأصابع.
    // كل إصبع يلتف على البار من فوك لكدام، والإبهام يلتف من تحت ويقفل على السبابة
    const b = new V3(sg, 0, 0), R0 = BAR_R;
    const wr0 = H('wrist.' + s), m30 = H('finger3-1.' + s);
    const rH = rig.restDir(wr0, m30), rA = rig.restDir(H('finger2-1.' + s), H('finger5-1.' + s));
    const lu = H('lowerarm01.' + s).distanceTo(H('upperarm01.' + s)), lf = wr0.distanceTo(H('lowerarm01.' + s));
    let tg = up.clone().addScaledVector(fw, -0.2).addScaledVector(b, -0.35).normalize(), qh = null, W = null, E = null, n = null, t = null;
    for (let it = 0; it < 6; it++) {
      t = tg.clone();
      n = new V3().crossVectors(t, b).normalize(); if (n.dot(fw) > 0) n.negate();        // مفاصل الأصابع ورا البار
      qh = rig.aimQ(rH, rA, t, b);
      const M3 = G.clone().addScaledVector(n, R0 + HAND.palm).addScaledVector(t, HAND.deep);   // البار بقاعدة الكف، فوك الرسغ
      W = M3.clone().sub(m30.clone().sub(wr0).applyQuaternion(qh));
      const d = W.clone().sub(Sh); let dist = d.length(); d.normalize(); dist = clamp(dist, Math.abs(lu - lf) + 0.1, lu + lf - 0.1);
      const pole = up.clone().multiplyScalar(-1).addScaledVector(fw, -HAND.elbowBack).add(new V3(sg * 0.25, 0, 0));   // الكوع لتحت وورا شوية
      const pp = pole.addScaledVector(d, -pole.dot(d)).normalize();
      const x = (lu * lu - lf * lf + dist * dist) / (2 * dist);
      E = Sh.clone().addScaledVector(d, x).addScaledVector(pp, Math.sqrt(Math.max(0, lu * lu - x * x)));
      const fd = W.clone().sub(E).normalize();
      // لوح الكتف يلحق الذراع شوية (دوران الكتف لفوك)، فالمفصل ما ينضغط
      const qsw = new Q().setFromUnitVectors(rU.clone().applyQuaternion(qc).normalize(), E.clone().sub(Sh).normalize());
      Qw['shoulder01.' + s] = new Q().slerp(qsw, SHOULDER.share).multiply(qc);
      Sh = rig.headPos('upperarm01.' + s, rootPos);
      // الكف يكمّل خط الساعد، ويرجع لورا شوية (بسط خفيف للرسغ)
      // الكف يتبع ميلان الساعد للجانب (رسغ مستقيم)، بس بالأمام والخلف يبقى قريب للعمودي ويا بسط خفيف، فما ينام فوك البار
      const cu = Math.max(fd.dot(up), 0.55), cb = fd.dot(b), cf = clamp(fd.dot(fw), -0.3, 0.05) - HAND.ext;
      tg = tg.clone().lerp(up.clone().multiplyScalar(cu).addScaledVector(b, cb * HAND.dev).addScaledVector(fw, cf).normalize(), 0.6).normalize();
    }
    const rF = rig.restDir(H('lowerarm01.' + s), wr0);
    const qu = rig.aimQ(rU, rF, E.clone().sub(Sh), W.clone().sub(E));
    // لفّة العضد تتوزع: النص العلوي ياخذ جزء بسيط منها، حتى الدالية ما تنلوي
    { const qp = Qw['shoulder01.' + s], L = qp.clone().invert().multiply(qu), pu = rU.clone().multiplyScalar(L.x * rU.x + L.y * rU.y + L.z * rU.z);
      const tw = new Q(pu.x, pu.y, pu.z, L.w); if (tw.lengthSq() < 1e-9) tw.set(0, 0, 0, 1); tw.normalize();
      const swing = L.clone().multiply(tw.clone().invert());
      Qw['upperarm01.' + s] = qp.clone().multiply(swing).multiply(new Q().slerp(tw, SHOULDER.twist)); }
    Qw['upperarm02.' + s] = qu.clone();
    const qf = rig.aimQ(rF, rU.clone().negate(), W.clone().sub(E), Sh.clone().sub(E));
    const qrel = qf.clone().invert().multiply(qh), pr = rF.clone().multiplyScalar(qrel.x * rF.x + qrel.y * rF.y + qrel.z * rF.z);
    const tw = new Q(pr.x, pr.y, pr.z, qrel.w); if (tw.lengthSq() < 1e-9) tw.set(0, 0, 0, 1); tw.normalize();
    Qw['lowerarm01.' + s] = qf; Qw['lowerarm02.' + s] = qf.clone().multiply(new Q().slerp(tw, 0.5)); Qw['wrist.' + s] = qh;
    const toW = p => W.clone().add(p.clone().sub(wr0).applyQuaternion(qh));
    // دائرة حول البار: 0 ورا البار (جهة الكف)، والزاوية تزيد لفوك ثم لكدام
    const v = new V3().crossVectors(b, n); if (v.dot(t) < 0) v.negate();
    const onC = (s0, Rc, ph) => G.clone().addScaledVector(b, s0).addScaledVector(n, Rc * Math.cos(ph)).addScaledVector(v, Rc * Math.sin(ph));
    const reach = (P0, s0, Rc, L, dir) => {   // أول نقطة على الدائرة تبعد L عن P0، ماشين باتجاه dir
      let prev = null, best = null;
      for (let k = 0; k <= 240; k++) {
        const ph = dir * k * R, q = onC(s0, Rc, ph), e = q.distanceTo(P0) - L;
        if (!best || Math.abs(e) < Math.abs(best.e)) best = { ph, e };
        if (prev !== null && prev < 0 && e >= 0) return ph;   // أول عبور
        prev = e;
      }
      return best.ph;
    };
    const chain = (P0, s0, Rc, segs, dir) => {
      const pts = [P0]; let ph = reach(P0, s0, Rc, segs[0], dir); pts.push(onC(s0, Rc, ph));
      for (let k = 1; k < segs.length; k++) { ph += dir * 2 * Math.asin(Math.min(0.999, segs[k] / (2 * Rc))); pts.push(onC(s0, Rc, ph)); }
      return pts;
    };
    const len = (a, c) => H(a).distanceTo(c ? H(c) : r[a].tail);
    const aim = (bn, next, from, to, ref) => { const rest = next ? rig.restDir(H(bn), H(next)) : rig.restDir(H(bn), r[bn].tail.clone()); Qw[bn] = rig.aimQ(rest, rA, to.clone().sub(from), ref); };
    for (let f = 2; f <= 5; f++) {
      const mc = 'metacarpal' + (f - 1) + '.' + s; if (r[mc]) Qw[mc] = qh.clone();
      const bn = k => `finger${f}-${k}.${s}`;
      const P0 = toW(H(bn(1))), s0 = P0.clone().sub(G).dot(b);
      const pts = chain(P0, s0, R0 + HAND.finger[f - 2], [len(bn(1), bn(2)), len(bn(2), bn(3)), len(bn(3))], 1);
      for (let k = 1; k <= 3; k++) aim(bn(k), k < 3 ? bn(k + 1) : null, pts[k - 1], pts[k], b);
    }
    {
      // الإبهام: ينزل تحت البار من ورا، يطلع من كدام، ويقفل فوك السبابة والوسطى (مسكة كاملة)
      const bn = k => `finger1-${k}.${s}`, C = toW(H(bn(1)));
      const si = toW(H(`finger2-1.${s}`)).sub(G).dot(b);
      const T1 = onC(si - 1.8, R0 + 1.2, -75 * R), T2 = onC(si - 0.6, R0 + 1.3, -135 * R), T3 = onC(si + 0.9, R0 + 1.9, -178 * R);
      const segs = [len(bn(1), bn(2)), len(bn(2), bn(3)), len(bn(3))];
      let from = C;
      [T1, T2, T3].forEach((T, k) => {
        const to = from.clone().add(T.clone().sub(from).setLength(segs[k]));
        aim(bn(k + 1), k < 2 ? bn(k + 2) : null, from, to, b); from = to;
      });
    }
  });
  rig.apply(rootPos);
  return { bar, rootPos };
}

/* ---------- الأدوات ---------- */
export function barbell() {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.9, roughness: 0.28 });
  const add = (geo, mat, x, rz) => { const m = new THREE.Mesh(geo, mat); m.rotation.z = Math.PI / 2; m.position.x = x || 0; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(1.4, 1.4, 131, 24), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.45 }));
  const plate20 = new THREE.MeshStandardMaterial({ color: 0x1f5fb8, roughness: 0.55 }), rub = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 });
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(2.5, 2.5, 44, 24), steel, s * 88);
    add(new THREE.CylinderGeometry(3.4, 3.4, 3, 24), steel, s * 66.5);
    add(new THREE.CylinderGeometry(22.5, 22.5, 5.5, 48), plate20, s * 71);
    add(new THREE.CylinderGeometry(22.5, 22.5, 3.6, 48), rub, s * 75.6);
    add(new THREE.CylinderGeometry(6.5, 6.5, 6.4, 32), steel, s * 71);
    add(new THREE.CylinderGeometry(3.6, 3.6, 3.2, 24), rub, s * 79.2);
  }
  return g;
}
export function platform() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb58a5a, roughness: 0.72 }), rub = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.95 });
  const box = (w, h, d, m, x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, -h / 2 + 0.01, 0); b.receiveShadow = true; g.add(b); };
  box(122, 3, 244, wood, 0); box(61, 3, 244, rub, -91.5); box(61, 3, 244, rub, 91.5);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0xc9cfd8, roughness: 0.97 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.02; floor.receiveShadow = true; g.add(floor);
  return g;
}
// العين أقرب للواقع: بياض مطفي شوية وزوايا وردية، قزحية بدرجات (أفتح حول البؤبؤ وحلقة غامجة برا)، وظل الجفن الفوكاني
function eyeMat(kind, green) {
  const m = kind ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshPhysicalMaterial({ color: 0xe9e1d6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x0f0d0b });
  m.customProgramCacheKey = () => 'eye' + kind + (green ? 'g' : '');   // البياض والقزحية نفس الدالة بس برنامجين مختلفين
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, green ? { uIo: { value: new THREE.Color(0x2e5a3a) }, uIi: { value: new THREE.Color(0x86ad5c) }, uIr: { value: new THREE.Color(0x122016) } }
      : { uIo: { value: new THREE.Color(0x3d2616) }, uIi: { value: new THREE.Color(0x6e4524) }, uIr: { value: new THREE.Color(0x150e09) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEP; uniform vec3 uIo, uIi, uIr;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${kind ? `float rr = length(vEP.xy) / 0.6, an = atan(vEP.y, vEP.x);
      vec3 c = mix(uIi, uIo, smoothstep(0.3, 0.72, rr));
      c *= 0.86 + 0.14 * (1.0 - smoothstep(0.6, 1.5, fwidth(an * 26.0))) * sin(an * 26.0 + rr * 5.0);
      diffuseColor.rgb = mix(c, uIr, smoothstep(0.8, 0.98, rr));`
      : `float xx = abs(vEP.x) / 1.18;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.8, 0.76), smoothstep(0.45, 0.9, xx) * 0.55);`}
      diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.1, 0.8, vEP.y / 1.18);`);
  };
  return m;
}
export function eyes(B) {
  const g = [], white = eyeMat(0), iris = eyeMat(1, B.sex === 'f'), pup = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15 });
  const e = B.lm.eye;
  for (const s of [1, -1]) {
    const grp = new THREE.Group(), c = new V3(s * Math.abs(e[0]), e[1], e[2] - 0.35);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 16), white); grp.add(w);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 14), iris); ir.scale.set(1, 1, 0.4); ir.position.z = 0.98; grp.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 10), pup); pu.scale.set(1, 1, 0.4); pu.position.z = 1.2; grp.add(pu);
    grp.position.copy(c).sub(B.rest.head.head); grp.rotation.x = 0.08;
    B.byName.head.add(grp); g.push(grp);
  }
  return g;
}
// ذيل حصان بفيزياء بسيطة (للبنات)
export function ponytail(B, scene, col, tieCol) {
  const e = B.lm.eye, anchorRest = new V3(0, e[1] + 5.2, e[2] - 15.2), N = 9, segL = 3.3;
  const mat = new THREE.MeshStandardMaterial({ color: col || 0x1a120d, roughness: 0.62 });
  const pts = [], prev = [];
  for (let i = 0; i < N; i++) { const p = anchorRest.clone().add(new V3(0, -i * segL, -i * 0.6)); pts.push(p); prev.push(p.clone()); }
  let mesh = null; const tie = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.5, 8, 16), new THREE.MeshStandardMaterial({ color: tieCol || 0x1d4ea3, roughness: 0.5 })); scene.add(tie);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), mat); scene.add(bun);
  let first = true;
  return function update(dt) {
    const head = B.byName.head; head.updateWorldMatrix(true, false);
    const A = anchorRest.clone().sub(B.rest.head.head).applyMatrix4(head.matrixWorld);
    const back = new V3(0, 0, -1).transformDirection(head.matrixWorld);
    if (!first && A.distanceTo(pts[0]) > 6) first = true;
    if (first) { for (let i = 0; i < N; i++) { pts[i].copy(A).addScaledVector(new V3(0, -1, 0), i * segL).addScaledVector(back, i * 0.5); prev[i].copy(pts[i]); } first = false; }
    pts[0].copy(A); prev[0].copy(A);
    const g = new V3(0, -980, 0).multiplyScalar(dt * dt);
    for (let i = 1; i < N; i++) { const v = pts[i].clone().sub(prev[i]).multiplyScalar(0.94); if (v.length() > 4) v.setLength(4); prev[i].copy(pts[i]); pts[i].add(v).add(g); }
    const nc = B.byName.neck01; nc.updateWorldMatrix(true, false); const neckC = new V3().setFromMatrixPosition(nc.matrixWorld);
    for (let it = 0; it < 6; it++) {
      pts[1].copy(A).addScaledVector(back, segL * 0.9).addScaledVector(new V3(0, -1, 0), segL * 0.4).lerp(pts[1], 0.35);
      for (let i = 1; i < N; i++) { const d = pts[i].clone().sub(pts[i - 1]), l = d.length() || 1; pts[i].copy(pts[i - 1]).addScaledVector(d, segL / l); }
      for (let i = 2; i < N; i++) { const d = pts[i].clone().sub(neckC), l = d.length(); if (l < 9.5) pts[i].copy(neckC).addScaledVector(d, 9.5 / (l || 1)); }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 24, 1, 10, false), rad = geo.attributes.position, cen = [];
    // تقليل السماكة باتجاه الطرف
    for (let i = 0; i <= 24; i++) cen.push(curve.getPointAt(i / 24));
    for (let i = 0; i < rad.count; i++) { const seg = Math.floor(i / 11), c = cen[Math.min(24, seg)], k = 2.5 * (1 - 0.7 * Math.pow(seg / 24, 1.3)) * (seg < 2 ? 0.8 : 1); const p = new V3().fromBufferAttribute(rad, i); p.sub(c).multiplyScalar(k).add(c); rad.setXYZ(i, p.x, p.y, p.z); }
    geo.computeVertexNormals();
    if (mesh) { mesh.geometry.dispose(); mesh.geometry = geo; } else { mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; scene.add(mesh); }
    tie.position.copy(pts[1]).lerp(pts[0], 0.35); tie.lookAt(pts[2]); bun.position.copy(A).addScaledVector(back, -0.6);
  };
}

/* ---------- المشهد ---------- */
export async function start(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe3ea); scene.fog = new THREE.Fog(0xdfe3ea, 420, 1000);
  const setTheme = (bg, fl) => { scene.background.set(bg); scene.fog.color.set(bg); if (FLOOR) FLOOR.material.color.set(fl); };
  let FLOOR = null;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4); key.position.set(160, 300, 220); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -150, right: 150, top: 230, bottom: -30, near: 50, far: 900 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.6; scene.add(key);
  const rim = new THREE.DirectionalLight(0xdce6ff, 1.25); rim.position.set(-220, 200, -260); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.35));
  const plat = platform(); scene.add(plat); FLOOR = plat.children[plat.children.length - 1];
  if (opts.theme) setTheme(...opts.theme);
  const cam = new THREE.PerspectiveCamera(30, 1, 5, 4000);
  const S = { yaw: -34 * R, pitch: 10 * R, zoom: 1, t: 0, speed: 1, playing: true, map: true, body: null, sex: null };
  const bar = barbell(); scene.add(bar);
  let hair = null;
  async function setSex(sex) {
    if (S.sex === sex) return; S.sex = sex;
    const pack = opts.packs[sex] || (opts.packs[sex] = await opts.load(sex));
    if (S.body) { scene.remove(S.body.mesh); }
    scene.children.filter(o => o.userData.hair).forEach(o => scene.remove(o));
    const mat = bodyMaterial(sex, pack.lm, pack), B = buildBody(pack, mat);
    B.mat = mat; B.rig = makeRig(B); B.sq = makeSquat(B, B.rig); B.eyes = eyes(B);
    scene.add(B.mesh); S.body = B;
    // الساكوات: الأساسية الفخذ الأمامي والأرداف، والمساعدة الفخذ الداخلي وأسفل الظهر والبطن
    const M = pack.muscles, U = mat.userData.U;
    U.uPri.value = M.map(m => ['quads', 'glutes'].includes(m) ? 1 : 0); U.uSec.value = M.map(m => ['adductors', 'erectors', 'abs', 'hamstrings'].includes(m) ? 1 : 0);
    const before = new Set(scene.children);
    hair = sex === 'f' ? ponytail(B, scene) : null;
    scene.children.forEach(o => { if (!before.has(o)) o.userData.hair = 1; });
  }
  await setSex(opts.sex || 'm');
  function frame(dt) {
    const B = S.body; if (!B) return;
    if (S.playing) S.t += dt * S.speed;
    const p = B.sq.solve(S.t), out = poseSquat(B, B.rig, B.sq, p);
    bar.position.copy(out.bar);
    B.mat.userData.U.uPulse.value = p.ph.pulse; B.mat.userData.U.uMap.value = S.map ? 1 : 0;
    B.mesh.updateMatrixWorld(true);
    if (hair) hair(Math.min(dt, 1 / 30) * (S.playing ? S.speed : 0) || 1e-4);
    const hf = Math.atan(Math.tan(15 * R) * cam.aspect), tg = S.tg || new V3(0, 92, 8), d = Math.max(430, 122 / Math.tan(hf)) * S.zoom;
    if (opts.onPhase) opts.onPhase(p.ph);
    cam.position.set(tg.x + d * Math.cos(S.pitch) * Math.sin(S.yaw), tg.y + d * Math.sin(S.pitch), tg.z + d * Math.cos(S.pitch) * Math.cos(S.yaw)); cam.lookAt(tg);
    renderer.render(scene, cam);
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas); resize();
  // تحكم
  const ptr = new Map();
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return; const a = ptr.get(e.pointerId), b = { x: e.clientX, y: e.clientY };
    if (ptr.size === 1) { S.yaw -= (b.x - a.x) * 0.009; S.pitch = clamp(S.pitch + (b.y - a.y) * 0.006, -20 * R, 80 * R); }
    else { const o = [...ptr.entries()].find(([id]) => id !== e.pointerId)[1], d0 = Math.hypot(a.x - o.x, a.y - o.y), d1 = Math.hypot(b.x - o.x, b.y - o.y); if (d0 && d1) S.zoom = clamp(S.zoom * d0 / d1, 0.35, 1.8); }
    ptr.set(e.pointerId, b);
  });
  ['pointerup', 'pointercancel'].forEach(n => canvas.addEventListener(n, e => ptr.delete(e.pointerId)));
  canvas.addEventListener('wheel', e => { e.preventDefault(); S.zoom = clamp(S.zoom * (1 + e.deltaY * 0.001), 0.35, 1.8); }, { passive: false });
  let last = performance.now(), running = !opts.manual;
  const loop = now => { if (!running) return; requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!document.hidden) frame(dt); };
  if (running) requestAnimationFrame(loop);
  return {
    settle(t) { const B = S.body; if (!hair) return; for (let k = 60; k >= 0; k--) { const tt = t - k / 50; const p = B.sq.solve(tt); poseSquat(B, B.rig, B.sq, p); B.mesh.updateMatrixWorld(true); hair(1 / 50); } },
    setTheme, S, setSex, frame, setTarget: (x, y, z) => { S.tg = x == null ? null : new V3(x, y, z); }, render: (t, yaw, pitch, zoom) => { S.t = t; if (yaw != null) S.yaw = yaw * R; if (pitch != null) S.pitch = pitch * R; if (zoom) S.zoom = zoom; S.playing = false; frame(0); S.playing = true; },
    view(v) { const V = { angle: [-34, 10], front: [0, 6], side: [-74, 4], back: [180, 12] }[v]; if (V) { S.yaw = V[0] * R; S.pitch = V[1] * R; } },
    info: () => ({ yTop: S.body.sq.yTop, yBot: S.body.sq.yBot, per: S.body.sq.PER })
  };
}
