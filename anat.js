/* عافية · المدرب التشريحي
   - الجسم يتحرك بـ Dual Quaternion Skinning: المفاصل تنثني بدون ما ينضغط الحجم أو ينطوي (الركبة، الورك، الكتف)
   - العضلات قطع منفصلة من سطح الجسم بينها أخاديد، الأساسية حمرة والمساعدة أفتح
   - تحت العضلات طبقة عميقة أغمق تبين بالأخاديد */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildBody, makeRig, makeSquat, poseSquat, barbell, platform, ponytail, eyes } from './real.js';

const V3 = THREE.Vector3, R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- Dual quaternion skinning ---------- */
export function makeDQ(skel, mesh) {   // mesh: إذا الجسم داخل مجموعة مكبّرة/مصغّرة، نحسب العظام نسبةً للجسم حتى يبقى الدوران صافي
  const n = skel.bones.length, r = new Float32Array(n * 4), d = new Float32Array(n * 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const U = { uDQr: { value: r }, uDQd: { value: d } };
  function update() {
    skel.bones.forEach((b, i) => {
      m.multiplyMatrices(b.matrixWorld, skel.boneInverses[i]); if (mesh) m.premultiply(mesh.bindMatrixInverse);
      q.setFromRotationMatrix(m).normalize();
      const e = m.elements, tx = e[12], ty = e[13], tz = e[14];
      r[i * 4] = q.x; r[i * 4 + 1] = q.y; r[i * 4 + 2] = q.z; r[i * 4 + 3] = q.w;
      d[i * 4] = 0.5 * (tx * q.w + ty * q.z - tz * q.y);
      d[i * 4 + 1] = 0.5 * (-tx * q.z + ty * q.w + tz * q.x);
      d[i * 4 + 2] = 0.5 * (tx * q.y - ty * q.x + tz * q.w);
      d[i * 4 + 3] = -0.5 * (tx * q.x + ty * q.y + tz * q.z);
    });
  }
  return { U, update, n };
}
function dqsVertex(src, nB, withNormal) {
  if (typeof location !== 'undefined' && /[?&]lbs/.test(location.search)) return src.replace('#include <common>', `#include <common>
    uniform vec4 uDQr[${nB}]; uniform vec4 uDQd[${nB}];`);
  src = src.replace('#include <common>', `#include <common>
    uniform vec4 uDQr[${nB}]; uniform vec4 uDQd[${nB}]; attribute vec3 aCor;
    vec3 dqRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }`)
    .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
    vec4 r0 = uDQr[int(skinIndex.x)], r1 = uDQr[int(skinIndex.y)], r2 = uDQr[int(skinIndex.z)], r3 = uDQr[int(skinIndex.w)];
    vec4 d0 = uDQd[int(skinIndex.x)], d1 = uDQd[int(skinIndex.y)], d2 = uDQd[int(skinIndex.z)], d3 = uDQd[int(skinIndex.w)];
    float w1 = dot(r0, r1) < 0.0 ? -skinWeight.y : skinWeight.y, w2 = dot(r0, r2) < 0.0 ? -skinWeight.z : skinWeight.z, w3 = dot(r0, r3) < 0.0 ? -skinWeight.w : skinWeight.w;
    vec4 bR = r0 * skinWeight.x + r1 * w1 + r2 * w2 + r3 * w3, bD = d0 * skinWeight.x + d1 * w1 + d2 * w2 + d3 * w3;
    float bl = length(bR); bR /= bl; bD /= bl;
    vec3 bT = 2.0 * (bR.w * bD.xyz - bD.w * bR.xyz + cross(bR.xyz, bD.xyz));`)
    .replace('#include <skinning_vertex>', `
    // مركز الدوران: ينحرك بالطريقة العادية، والنقطة تدور حوله بالدوران المخلوط
    vec4 cb = bindMatrix * vec4(aCor, 1.0);
    vec4 cs = boneMatX * cb * skinWeight.x + boneMatY * cb * skinWeight.y + boneMatZ * cb * skinWeight.z + boneMatW * cb * skinWeight.w;
    transformed = dqRot(bR, transformed - aCor) + (bindMatrixInverse * cs).xyz;`);
  if (withNormal) src = src.replace('#include <skinnormal_vertex>', `objectNormal = dqRot(bR, objectNormal);
    #ifdef USE_TANGENT
    objectTangent = dqRot(bR, objectTangent);
    #endif`);
  return src;
}
function depthFor(DQ, extra) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, DQ.U, extra ? extra.U : {}); let v = dqsVertex(sh.vertexShader, DQ.n, false); if (extra) v = extra.vert(v); sh.vertexShader = v; };
  return m;
}

/* خط الشعر: ارتفاعه فوك مستوى العين حسب الزاوية حول الراس (0 كدام، 90 الإذن، 180 ورا). مشترك بين الرسم وحجم الشعر */
const HAIR = `
      float hairline(float p){   // ارتفاع خط الشعر فوك مستوى العين، حسب الزاوية حول الراس
        const float K[11] = float[11](0.0, 30.0, 50.0, 62.0, 68.0, 74.0, 82.0, 100.0, 118.0, 140.0, 180.0);
        const float Mv[11] = float[11](5.5, 5.2, 4.4, 2.8, -1.8, -1.8, 2.6, 2.3, -1.0, -4.5, -7.0);
        const float Fv[11] = float[11](5.3, 4.9, 3.7, 1.6, -0.4, -0.9, 1.0, 1.0, -1.5, -5.5, -8.5);
        float h = mix(Mv[10], Fv[10], uFem);
        for(int i = 0; i < 10; i++){
          if(p >= K[i] && p <= K[i + 1]){ float t = (p - K[i]) / (K[i + 1] - K[i]); t = t * t * (3.0 - 2.0 * t); h = mix(mix(Mv[i], Mv[i + 1], t), mix(Fv[i], Fv[i + 1], t), uFem); }
        }
        return h;
      }
      float hairMask(vec3 q){
        float ax = abs(q.x), dy = q.y - uEye.y, dz = q.z - uEye.z;
        float phi = degrees(atan(ax, q.z - uHeadC.z));
        float hl = hairline(phi) + 0.07 * sin(q.x * 1.7 + q.z * 0.9);
        float ear = (1.0 - smoothstep(0.85, 1.15, length(vec2((dz - mix(-8.2, -7.0, uFem)) / 2.6, (dy - mix(-1.5, -1.4, uFem)) / mix(3.6, 3.3, uFem))))) * smoothstep(5.5, 6.3, ax);
        return smoothstep(hl - 0.3, hl + mix(0.8, 0.6, uFem), dy) * (1.0 - ear);
      }`;

// 0 بشرة، 1 تحت، 2 فوك، 5 حذاء، 6 نعل، 7 جوراب. p: موقع السكون، z: مناطق الجسم، ein: 1 = مو إيد/راس
const CLOTH = `
  float cloth(vec3 p, vec4 z, float ein){
    float ax = abs(p.x); float legs = z.x, arm = z.y, head = z.z, foot = z.w;
    if(legs > 0.5 && (foot > 0.4 || p.y < uLm.z + 2.5)) return p.y < 2.4 ? 6.0 : 5.0;
    if(legs > 0.5 && p.y < uLm.z + 5.5) return 7.0;
    if(uMode < 0.5) return 0.0;
    if(head > 0.35) return 0.0;
    if(uFem < 0.5){
      vec3 shp = vec3(sign(p.x) * uSh.x, uSh.y, uSh.z), ad = normalize(vec3(sign(p.x) * uEl.x, uEl.y, uEl.z) - shp);
      float along = dot(p - shp, ad), armLen = distance(uSh, uEl);
      float neck = ax > 7.0 ? 1e3 : uLm2.y + 2.6 - 1.4 * (1.0 - smoothstep(0.0, 6.0, ax)) * (p.z > 0.0 ? 1.0 : 0.2);
      if(arm > 0.35) return along < armLen * 0.55 ? 2.0 : 0.0;                          // ردن نص
      if(p.y > uLm.w - 4.0) return p.y < neck ? 2.0 : 0.0;                              // تيشيرت
      if(legs > 0.6 && p.y > uLm.y - 1.5) return 1.0;                                   // شورت لحد الركبة
    } else {
      if(arm > 0.35 && ein < 0.5) return 0.0;
      float neck = ax > 6.5 ? 1e3 : uLm2.y + 4.2 - 1.2 * (1.0 - smoothstep(0.0, 5.0, ax)) * (p.z > 0.0 ? 1.0 : 0.2);
      if(arm > 0.35) return 2.0;                                                        // ردن طويل لحد الرسغ
      if(p.y > uLm.x - 9.0) return p.y < neck ? 2.0 : 0.0;                              // بلوزة بياقة عالية، نازلة للورك
      if(legs > 0.6) return 1.0;                                                        // ليغنز للكاحل
    }
    return 0.0;
  }`;

/* ---------- طبقة الجسم: بالعرض التشريحي هي الطبقة العميقة تحت العضلات، وبعرض الملابس هي الجسم نفسه ----------
   بالوضعين: شعر وحواجب، حذاء رياضي. بالتشريحي: تحت العضلات غامق (أخاديد)، العظم الظاهر فاتح، والراس والإيدين بلون البشرة.
   بالملابس: رجال تيشيرت وشورت للركبة، بنات بلوزة بردون طويلة ونازلة للورك وليغنز للكاحل. العضلات المستهدفة تبين كتظليل خفيف */

/* طبعة HERO على التيشيرت: كانفس فيه الكلمة، وينعاد رسمه من يتحمّل خط الهوية */
function heroLogoTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const draw = () => { const g = c.getContext('2d'); g.clearRect(0, 0, 512, 160); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 128px "Poppins", "Montserrat", "Arial Black", "Helvetica Neue", Arial, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing = '10px';
    g.fillText('HERO', 256, 86); t.needsUpdate = true; };
  draw(); try { document.fonts && document.fonts.load('800 128px Poppins').then(draw, () => {}); } catch (e) {}
  return t;
}
const EXT = /^(head|neck03|wrist|finger|metacarpal|foot|toe)/;
export function bodyLayer(B, sex, DQ, cor, bone) {
  const g = B.mesh.geometry, n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const ext = B.order.map(nm => EXT.test(nm) ? 1 : (sex === 'f' && /^breast/.test(nm) ? 1 : 0));
  const brs = B.order.map(nm => /^breast/.test(nm) ? 1 : 0), aBr = new Float32Array(n);
  const aIn = new Float32Array(n), aBone = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0, q = 0; for (let k = 0; k < 4; k++) { e += ext[si.getComponent(i, k)] * sw.getComponent(i, k); q += brs[si.getComponent(i, k)] * sw.getComponent(i, k); } aIn[i] = 1 - clamp(e * 1.15, 0, 1); aBr[i] = sex === 'f' ? clamp(q * 1.6, 0, 1) : 0; }
  g.setAttribute('aBr', new THREE.BufferAttribute(aBr, 1));
  const idx = g.index.array, acc = new Float32Array(n), cnt = new Float32Array(n);
  for (let r = 0; r < 3; r++) {
    acc.fill(0); cnt.fill(0); const src = r ? aBone.slice() : bone;
    for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) { acc[idx[t + a]] += src[idx[t + c]]; cnt[idx[t + a]]++; }
    for (let i = 0; i < n; i++) aBone[i] = acc[i] / cnt[i];
  }
  g.setAttribute('aIn', new THREE.BufferAttribute(aIn, 1)); g.setAttribute('aBone', new THREE.BufferAttribute(aBone, 1));
  g.setAttribute('aCor', new THREE.BufferAttribute(cor, 3));
  // تجاويف السطح (زوايا العين، فتحات الأنف، طيات الفم، الإذن، تحت الفك): ظل ثابت خفيف يعطي عمق مثل الواقع
  { const Pp = g.attributes.position.array, Nn = g.attributes.normal.array, aCav = new Float32Array(n);
    let S = Float32Array.from(Pp); const Tt = new Float32Array(n * 3), c = new Float32Array(n);
    for (let it = 0; it < 4; it++) {
      Tt.fill(0); c.fill(0);
      for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 1; b < 3; b++) {
        const i = idx[t + a], j = idx[t + (a + b) % 3]; Tt[i * 3] += S[j * 3]; Tt[i * 3 + 1] += S[j * 3 + 1]; Tt[i * 3 + 2] += S[j * 3 + 2]; c[i]++;
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) S[i * 3 + k] = Tt[i * 3 + k] / c[i];
    }
    for (let i = 0; i < n; i++) {
      const d = Nn[i * 3] * (S[i * 3] - Pp[i * 3]) + Nn[i * 3 + 1] * (S[i * 3 + 1] - Pp[i * 3 + 1]) + Nn[i * 3 + 2] * (S[i * 3 + 2] - Pp[i * 3 + 2]);
      aCav[i] = clamp((d - 0.12) / 0.8, 0, 1);
    }
    g.setAttribute('aCav', new THREE.BufferAttribute(aCav, 1));
  }
  const lm = B.lm, P = B.pack.bones, bh = nm => new V3(...P.find(x => x.name === nm).head);
  const fem = sex === 'f' ? 1 : 0;
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffbfa3) });
  const U = {
    uMode: { value: 0 }, uMap: { value: 1 }, uInset: { value: 1.5 }, uBoneIn: { value: 0.3 },
    uDeep: { value: new THREE.Color(0x4f3632) }, uBone: { value: new THREE.Color(0xdcd2c4) }, uSoft: { value: new THREE.Color(0xd3c7bd) },
    uSkin: { value: new THREE.Color(fem ? 0xf0c8aa : 0xecc2a2) }, uHair: { value: new THREE.Color(fem ? 0xc99f5f : 0x2c1f17) },
    uShoe: { value: new THREE.Color(0x2b3038) }, uSole: { value: new THREE.Color(0xeeece8) }, uSock: { value: new THREE.Color(0xf1f0ec) },
    uTop: { value: new THREE.Color(fem ? 0x1d4ea3 : 0x1d4ea3) }, uBottom: { value: new THREE.Color(fem ? 0x1b1f28 : 0x1f2633) },
    uLogo: { value: heroLogoTex() }, uLogoCol: { value: new THREE.Color(0xffd56a) },
    uPri: { value: new Array(20).fill(0) }, uSec: { value: new Array(20).fill(0) },
    uLm: { value: new THREE.Vector4(lm.hipY, lm.kneeY, lm.ankY, lm.waist) }, uLm2: { value: new THREE.Vector4(lm.nipY, lm.clavY, lm.shY, lm.neckY) },
    uEye: { value: new V3(...lm.eye) }, uFem: { value: fem }, uSh: { value: bh('upperarm01.L') }, uEl: { value: bh('lowerarm01.L') },
    uHeadC: { value: new V3(0, lm.eye[1] + 1, lm.eye[2] - (fem ? 8.5 : 9.2)) },
    uMouth: { value: fem ? new THREE.Vector4(-6.3, 2.35, 1.3, -6.55) : new THREE.Vector4(-7.3, 2.45, 1.15, -7.45) }
  };
  const inset = { U, vert: v => v.replace('#include <common>', `#include <common>
      attribute float aIn; attribute float aBone; attribute vec4 aZone; uniform float uInset, uBoneIn, uMode, uFem; uniform vec4 uLm, uLm2, uMouth; uniform vec3 uSh, uEl, uEye, uHeadC;
      ${CLOTH}
      ${HAIR}`).replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed -= normal * mix(uInset, uBoneIn, aBone) * aIn * (1.0 - uMode);
      if(aZone.w > 0.3 && position.y < 7.0) transformed -= normal * 1.1 * smoothstep(0.3, 0.6, aZone.w);
      if(aZone.z > 0.4 && position.z > uEye.z - 1.5){   // ابتسامة خفيفة: زوايا الفم ترتفع شوية
        float mx = abs(position.x) - uMouth.y * 0.92, my = position.y - uEye.y - uMouth.w;
        float sw = exp(-(mx * mx) / 0.9 - (my * my) / 0.55); transformed.y += 0.26 * sw; transformed.z -= 0.08 * sw; }
      if(aZone.z > 0.4){ float hTop = smoothstep(2.5, 9.0, position.y - uEye.y), hFront = smoothstep(uHeadC.z - 2.0, uEye.z - 1.0, position.z) * hTop; transformed += normal * hairMask(position) * mix(mix(0.32, 1.05, hTop) + 0.3 * hFront, 0.42, uFem); }   // الشعر إله سمك خفيف فوك فروة الراس
      if(uMode > 0.5){ float cv = cloth(position, aZone, aIn); transformed += normal * (cv == 2.0 ? mix(0.45, 0.8, uFem) : (cv == 1.0 ? mix(0.5, 0.2, uFem) : 0.0)); }`) };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, DQ.U);
    let v = dqsVertex(sh.vertexShader, DQ.n, true);
    v = inset.vert(v).replace('#include <begin_vertex>', `#include <begin_vertex>
      vIn = aIn; vBone = aBone; vRest = position; vZone = aZone; vBr = aBr; vCav = aCav;
      { int i1 = int(aMus.x + 0.5), i2 = int(aMus.z + 0.5);
        vHiP = max(uPri[i1] * aMus.y, uPri[i2] * aMus.w); vHiS = max(uSec[i1] * aMus.y, uSec[i2] * aMus.w); }`).replace('#include <common>', `#include <common>
      attribute vec4 aMus; attribute float aBr; attribute float aCav; varying float vCav; uniform float uPri[20]; uniform float uSec[20]; varying float vBr;
      varying float vIn; varying float vBone; varying vec3 vRest; varying vec4 vZone; varying float vHiP; varying float vHiS;`);
    sh.vertexShader = v;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uDeep, uBone, uSkin, uHair, uShoe, uSole, uSock, uTop, uBottom, uEye, uSh, uEl, uSoft, uHeadC; uniform vec4 uLm, uLm2, uMouth; uniform float uMode, uFem, uMap; uniform sampler2D uLogo; uniform vec3 uLogoCol;
      varying float vBr; varying float vCav; varying float vIn; varying float vBone; varying vec3 vRest; varying vec4 vZone; varying float vHiP; varying float vHiS;
      ${CLOTH}
      ${HAIR}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float R = cloth(vRest, vZone, vIn);
      // ملامح الوجه: خط الشعر حول الراس، حواجب مرسومة بشعيرات، رموش، شفايف، خدود، ولحية خفيفة للرجال
      float earM = 0.0, underM = 0.0, tzM = 0.0, lipE = 0.0, lipUp = 0.0, hairM = 0.0, browM = 0.0, lashM = 0.0, lipM = 0.0, slitM = 0.0, blushM = 0.0, stubM = 0.0, sockM = 0.0;
      if(vZone.z > 0.4){
        vec3 q = vRest; float ax = abs(q.x), dy = q.y - uEye.y, dz = q.z - uEye.z;
        hairM = hairMask(q);
        // حواجب
        float bx = clamp((ax - 0.9) / 4.6, 0.0, 1.0);
        float cy = mix(1.62, 1.8, uFem) + mix(0.42, 0.55, uFem) * sin(3.1416 * pow(bx, 0.8)) - 0.35 * bx;
        float th = mix(mix(0.38, 0.34, uFem), mix(0.13, 0.1, uFem), pow(bx, 1.3));
        float ang = mix(1.25, 0.2, pow(bx, 0.7)), sPh = (ax * sin(ang) - (dy - cy) * cos(ang)) * 26.0;
        float stroke = 0.9 + 0.1 * (1.0 - smoothstep(0.5, 1.4, fwidth(sPh))) * sin(sPh);
        browM = (1.0 - smoothstep(th * 0.45, th * 1.15, abs(dy - cy))) * smoothstep(0.0, 0.07, bx) * (1.0 - smoothstep(0.86, 1.0, bx)) * step(-2.4, dz) * stroke;
        // العين: رموش فوكانية، جفن تحتاني خفيف، وظل بسيط حول العين
        vec3 E = vec3(sign(q.x) * abs(uEye.x), uEye.y, uEye.z - 0.35); float d = distance(q, E), dv = q.y - E.y;
        float front = smoothstep(E.z - 0.1, E.z + 0.4, q.z);
        float outer = smoothstep(0.2, 1.1, ax - abs(uEye.x));   // الطرف الخارجي للعين
        lashM = (1.0 - smoothstep(0.08, mix(0.3, 0.4 + 0.16 * outer, uFem), abs(d - 1.28))) * smoothstep(mix(0.0, -0.25, uFem * outer), 0.35, dv) * front;
        lashM = max(lashM, 0.35 * (1.0 - smoothstep(0.06, 0.2, abs(d - 1.26))) * smoothstep(-0.1, -0.45, dv) * front);
        sockM = (1.0 - smoothstep(1.3, 2.4, d)) * smoothstep(-0.4, 0.6, dv) * front;
        float ear2 = (1.0 - smoothstep(0.8, 1.25, length(vec2((dz - mix(-8.2, -7.0, uFem)) / 2.6, (dy - mix(-1.5, -1.4, uFem)) / mix(3.6, 3.3, uFem))))) * smoothstep(5.2, 6.2, ax);
        earM = ear2;
        underM = (1.0 - smoothstep(0.35, 1.3, distance(vec2(ax - abs(uEye.x), dy), vec2(0.15, -1.55)))) * front;
        tzM = max((1.0 - smoothstep(0.6, 1.6, ax)) * smoothstep(-5.0, -1.0, dy) * smoothstep(1.5, 3.0, dz), (1.0 - smoothstep(2.0, 4.5, ax)) * smoothstep(2.6, 3.4, dy) * (1.0 - smoothstep(5.0, 6.5, dy)));
        // الشفايف وخط الفم
        float u = ax / uMouth.y, v = (dy - uMouth.x) / (uMouth.z * (1.0 - 0.4 * u * u));
        float mf = step(uEye.z - 1.0, q.z);
        lipM = (1.0 - smoothstep(0.78, 1.0, length(vec2(u, v)))) * mf;
        lipE = smoothstep(0.45, 0.92, length(vec2(u, v))); lipUp = step(0.0, v);
        slitM = (1.0 - smoothstep(0.03, 0.13, abs(dy - uMouth.w))) * (1.0 - smoothstep(0.7, 0.98, u)) * mf;
        // خدود وأنف
        blushM = (1.0 - smoothstep(0.6, 2.4, distance(vec2(ax, dy), vec2(3.9, -3.2)))) * front;
        blushM = max(blushM, 0.6 * (1.0 - smoothstep(0.3, 1.4, distance(vec2(ax, dy), vec2(0.0, mix(-4.0, -3.0, uFem))))) * step(uEye.z + 1.5, q.z));
        // لحية خفيفة جداً (للرجال): تحت الأنف والفك والذقن، بدون الشفايف
        if(uFem < 0.5){
          float jaw;
          jaw = smoothstep(-4.4, -5.6, dy) * smoothstep(-13.2, -11.6, dy) * smoothstep(-7.5, -5.5, dz);
          float side = smoothstep(-2.5, -3.6, dy) * smoothstep(3.2, 4.4, ax) * smoothstep(-8.0, -6.0, dz) * smoothstep(-13.0, -11.0, dy);
          stubM = max(jaw, side) * (1.0 - lipM) * (0.75 + 0.25 * sin(q.x * 41.0) * sin(q.y * 37.0 + q.z * 29.0));
        }
      }
      vec3 dc = mix(uDeep, uBone, smoothstep(0.2, 0.8, vBone));
      vec3 base = mix(uSkin, dc, smoothstep(0.15, 0.85, vIn) * (1.0 - uMode));
      base = mix(base, uSoft, vBr * (1.0 - uMode));   // الصدر بالعرض التشريحي نسيج طري بلون هادئ
      float rr = 0.6;
      if(R == 1.0){ base = uBottom; rr = 0.85; } else if(R == 2.0){ base = uTop; rr = 0.8; }
      if(R == 2.0 && vZone.y < 0.35){   // HERO على صدر التيشيرت
        float hw = abs(uSh.x) * mix(0.92, 1.0, uFem), yc = mix(uLm2.x, uLm2.y, mix(0.26, 0.45, uFem)), hh = hw * 0.3125;
        vec2 luv = vec2(vRest.x / hw * 0.5 + 0.5, (vRest.y - yc) / hh * 0.5 + 0.5);
        if(vRest.z > 0.0 && luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0){
          float la = texture2D(uLogo, luv).a * smoothstep(0.0, 2.0, vRest.z);
          base = mix(base, uLogoCol, la * 0.95); rr = mix(rr, 0.6, la);
        }
      }
      else if(R == 5.0){ base = uShoe; rr = 0.55; } else if(R == 6.0){ base = uSole; rr = 0.7; } else if(R == 7.0){ base = uSock; rr = 0.9; }
      // بعرض الملابس: العضلات المستهدفة تبين كتظليل على القماش والبشرة
      if(uMode > 0.5 && uMap > 0.5 && R < 3.0){
        float gp = clamp(vHiP, 0.0, 1.0), gs = clamp(vHiS, 0.0, 1.0), cl = R > 0.5 ? 1.0 : 0.0;
        base = mix(base, vec3(0.93, 0.58, 0.45), gs * mix(0.28, 0.0, cl));
        base = mix(base, vec3(0.80, 0.12, 0.07), gp * mix(0.45, 0.3, cl));
      }
      if(R == 0.0){
        base = mix(base, base * vec3(1.0, 0.86, 0.82), blushM * mix(0.18, 0.22, uFem));
        base = mix(base, base * vec3(1.0, 0.8, 0.76), earM * 0.4);            // الإذن أحمر شوية (الدم تحت الجلد الرقيق)
        base = mix(base, base * vec3(0.9, 0.86, 0.9), underM * 0.55);         // تحت العين أغمق وأبرد شوية
        base = mix(base, base * 0.9, sockM * 0.35);
        base = mix(base, vec3(0.12, 0.1, 0.095), stubM * 0.1);
        base = mix(base, base * mix(vec3(0.8, 0.62, 0.6), vec3(0.72, 0.43, 0.44), uFem) * (1.0 - 0.14 * lipE) * (1.0 - 0.08 * lipUp), lipM * mix(0.75, 0.9, uFem));   // لون الشفايف: تغميق ودفء على لون البشرة نفسها
        base = mix(base, vec3(0.05, 0.025, 0.02), slitM * 0.6);
        base = mix(base, mix(uHair * 0.8, vec3(0.2, 0.14, 0.1), uFem), lashM * mix(0.8, 0.95, uFem));
      }
      // خصل ممشوطة لورا: خطوط رفيعة من الجبهة للخلف
      float comb = atan(vRest.x, vRest.y - uHeadC.y + 4.0);
      float phC = comb * 70.0 + sin(vRest.z * 0.8) * 1.5;
      float grain = (1.0 + mix(0.12, 0.05, uFem) * (1.0 - smoothstep(0.5, 1.4, fwidth(phC))) * sin(phC)) * (mix(0.93, 0.96, uFem) + mix(0.07, 0.04, uFem) * sin(comb * 9.0 + vRest.z * 0.6));
      base = mix(base, uHair * grain * (1.1 + mix(0.22, 0.3, uFem) * smoothstep(4.0, 10.0, vRest.y - uEye.y)), hairM);   // لمعة خفيفة فوك الراس
      base = mix(base, uHair * mix(1.25, 0.72, uFem), clamp(browM, 0.0, 1.0) * mix(0.82, 0.9, uFem));
      base *= 1.0 - 0.4 * vCav;
      if(R == 0.0) rr = mix(rr, 0.47, tzM * 0.8);
      if(hairM > 0.5) rr = 0.62;
      if(lipM > 0.5) rr = 0.66;
      diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = rr;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_SHEEN
      material.sheenColor *= (1.0 - 0.85 * lipM) * (1.0 - 0.75 * hairM);
      #endif
      material.specularColor *= (1.0 - 0.5 * lipM) * (1.0 - 0.65 * hairM) * (1.0 - 0.7 * vCav); material.specularF90 *= 1.0 - 0.85 * hairM;   // الشعر بدون لمعة الحافة البيضة   // الشفايف بدون لمعة المخمل`);
  };
  m.userData.U = U;
  B.mesh.material = m; B.mesh.customDepthMaterial = depthFor(DQ, inset);
  return m;
}

/* ---------- حذاء رياضي: شكل ناعم يلف القدم (بدون أصابع ظاهرة)، مربوط بعظم القدم ---------- */
export function makeShoes(B) {
  const P = B.pack.pos, Z = B.pack.zone, n = P.length / 3, out = [];
  const pts = []; for (let i = 0; i < n; i++) if (P[i * 3] > 0 && Z[i * 4 + 3] > 77 && P[i * 3 + 1] < 9.5) pts.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  let z0 = 1e9, z1 = -1e9; pts.forEach(p => { z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); });
  z0 -= 0.35; z1 += 0.55;
  const NS = 36, K = 40, sl = [];
  for (let k = 0; k < NS; k++) {
    const z = z0 + (z1 - z0) * k / (NS - 1); let x0 = 1e9, x1 = -1e9, yt = -1e9;
    pts.forEach(p => { if (Math.abs(p[2] - z) < 1.1) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); yt = Math.max(yt, p[1]); } });
    sl.push({ z, x0, x1, yt });
  }
  // سد الفراغات وتنعيم على طول القدم
  for (let k = 0; k < NS; k++) if (!isFinite(sl[k].x0)) { const o = sl[k > 0 ? k - 1 : k + 1]; Object.assign(sl[k], { x0: o.x0, x1: o.x1, yt: o.yt }); }
  for (let it = 0; it < 6; it++) for (let k = 1; k < NS - 1; k++) for (const key of ['x0', 'x1', 'yt']) sl[k][key] = (sl[k - 1][key] + 2 * sl[k][key] + sl[k + 1][key]) / 4;
  const collar = 7.2, yb = -0.05;
  const ring = sl.map((q, k) => {
    const u = k / (NS - 1), L = z1 - z0, dToe = (1 - u) * L, dHeel = u * L;
    let a = (q.x1 - q.x0) / 2 + 0.4, cx = (q.x0 + q.x1) / 2, top = Math.min(Math.max(q.yt + 0.5, 4.2), collar);
    const tt = dToe < 4.5 ? Math.sqrt(Math.max(0, 1 - ((4.5 - dToe) / 4.5) ** 2)) : 1, th = dHeel < 3.2 ? Math.sqrt(Math.max(0, 1 - ((3.2 - dHeel) / 3.2) ** 2)) : 1;
    const tp = Math.min(tt, th); a *= Math.max(0.12, tp); top = yb + (top - yb) * Math.max(0.45, tp ** 0.45);
    const b = (top - yb) / 2, cy = (top + yb) / 2, pr = [];
    for (let j = 0; j < K; j++) {
      const t = j / K * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t), ex = 2 / 2.8;
      pr.push([cx + a * Math.sign(c) * Math.pow(Math.abs(c), ex), cy + b * Math.sign(s2) * Math.pow(Math.abs(s2), ex), q.z]);
    }
    return pr;
  });
  const build = sg => {
    const pos = [], col = [], idx = [], C = new THREE.Color(), up = new THREE.Color(0x2b3038), sole = new THREE.Color(0xeeece8), acc = new THREE.Color(0x1d4ea3);
    const head = B.rest['foot.' + (sg > 0 ? 'L' : 'R')].head;
    ring.forEach((pr, k) => pr.forEach((p, j) => {
      pos.push(sg * p[0] - head.x, p[1] - head.y, p[2] - head.z); col.push(p[1], j / K, k / (NS - 1));
    }));
    const vi = (k, j) => k * K + ((j + K) % K);
    for (let k = 0; k < NS - 1; k++) for (let j = 0; j < K; j++) {
      const a = vi(k, j), b2 = vi(k, j + 1), c = vi(k + 1, j + 1), d = vi(k + 1, j);
      if (sg < 0) idx.push(a, c, b2, a, d, c); else idx.push(a, b2, c, a, c, d);
    }
    // أغطية الكعب والمقدمة
    [0, NS - 1].forEach((k, e) => {
      const cxs = ring[k].reduce((s3, p) => s3 + p[0], 0) / K, cys = ring[k].reduce((s3, p) => s3 + p[1], 0) / K, ci = pos.length / 3;
      pos.push(sg * cxs - head.x, cys - head.y, ring[k][0][2] - head.z); col.push(cys, 0.75, e);
      for (let j = 0; j < K; j++) { const a = vi(k, j), b2 = vi(k, j + 1); if ((e === 0) === (sg < 0)) idx.push(ci, a, b2); else idx.push(ci, b2, a); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uUp = { value: up }; sh.uniforms.uSoleC = { value: sole }; sh.uniforms.uAcc = { value: acc };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 color; varying float vY; varying vec2 vUV;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = color.x; vUV = color.yz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uUp, uSoleC, uAcc; varying float vY; varying vec2 vUV;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        float w = fwidth(vY) * 0.7;
        vec3 c = mix(uSoleC, uAcc, smoothstep(1.55 - w, 1.55 + w, vY));
        c = mix(c, uUp, smoothstep(1.85 - w, 1.85 + w, vY));
        // لسان وأربطة فوك مشط القدم
        float lace = (1.0 - smoothstep(0.035, 0.05, abs(vUV.x - 0.25))) * smoothstep(0.3, 0.34, vUV.y) * (1.0 - smoothstep(0.66, 0.7, vUV.y));
        float bars = smoothstep(0.55, 0.8, sin(vUV.y * 150.0));
        c = mix(c, mix(vec3(0.42, 0.45, 0.5), vec3(0.93), bars * 0.85), lace);
        diffuseColor.rgb = c;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vY < 1.6 ? 0.75 : 0.5;');
    };
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true; B.byName['foot.' + (sg > 0 ? 'L' : 'R')].add(m); return m;
  };
  return [build(1), build(-1)];
}

/* ---------- كعكة شعر (للبنات): مرتبة ومربوطة ورا الراس ---------- */
export function makeBun(B, hairCol) {
  // كعكة عالية ورا تاج الراس (تبين شوية من كدام): نلكى نقطة فروة الراس على شعاع مائل من مركز الراس
  const P = B.pack.pos, Z = B.pack.zone, e = B.lm.eye, n = P.length / 3;
  const C = new V3(0, e[1] + 1, e[2] - 8.5), ang = 64 * Math.PI / 180, dir = new V3(0, Math.sin(ang), -Math.cos(ang));
  let best = 0; const v = new V3(), w = new V3();
  for (let i = 0; i < n; i++) {
    if (Z[i * 4 + 2] <= 128) continue;
    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(C); const t = v.dot(dir); if (t <= 0) continue;
    w.copy(dir).multiplyScalar(t); if (v.distanceTo(w) < 1.2) best = Math.max(best, t);
  }
  const S = C.clone().addScaledVector(dir, best);
  const grp = new THREE.Group(), head = B.rest.head.head;
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hairCol).multiplyScalar(1.3), roughness: 0.62, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x5a3e2e) });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      // خصل ملفوفة حول المحور (لفّة حلزونية) مع ظل خفيف بين الخصل
      float a = atan(vP.y, vP.x), r = length(vP.xy);
      float st = 0.82 + 0.18 * sin(a * 7.0 - r * 2.2 + vP.z * 1.5) * (0.7 + 0.3 * sin(a * 23.0 + r * 5.0));
      diffuseColor.rgb *= st * 1.05;`);
  };
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), dir);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(2.8, 36, 22), mat); bun.scale.set(1.1, 1.0, 0.74);
  bun.quaternion.copy(q); bun.position.copy(S).addScaledVector(dir, 1.45); bun.castShadow = true; grp.add(bun);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.28, 10, 32), new THREE.MeshStandardMaterial({ color: 0x1d4ea3, roughness: 0.45 }));
  tie.quaternion.copy(q); tie.position.copy(S).addScaledVector(dir, 0.35); grp.add(tie);
  grp.position.sub(head); B.byName.head.add(grp);
  return grp;
}

/* ---------- تحميل العضلات المحزومة ---------- */
let META = null;
export async function loadMus(sex, base) {
  base = base || '';
  const meta = await (META || (META = fetch(base + 'body-meta.json').then(r => r.json())));
  const t = await fetch(base + `muscles-${sex}.txt`).then(r => r.text()), s = atob(t.trim()), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  const M = meta['mus_' + sex], n = M.n, ni = M.nIdx, buf = u.buffer; let o = 0;
  const i16 = k => { const a = new Int16Array(buf, o, k); o += k * 2; return a; }, u16 = k => { const a = new Uint16Array(buf, o, k); o += k * 2; return a; }, u8 = k => { const a = new Uint8Array(buf, o, k); o += k; return a; };
  const pos = i16(n * 3), along = i16(n), across = i16(n), idx = u16(ni), si = u8(n * 4), sw8 = u8(n * 4), grp = u8(n), tend = u8(n), e = u8(n), mid = u8(n);
  o += o % 2; const corB = i16(meta.nV * 3), corP = i16(n * 3), bone = u8(meta.nV);
  const info = new Float32Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    info[i * 4] = grp[i]; info[i * 4 + 1] = tend[i] / 255; info[i * 4 + 2] = across[i] / 50; info[i * 4 + 3] = e[i] / 255;
    let tt = 0; for (let k = 0; k < 4; k++) tt += sw8[i * 4 + k]; for (let k = 0; k < 4; k++) sw[i * 4 + k] = tt ? sw8[i * 4 + k] / tt : (k ? 0 : 1);
  }
  return { grp: meta.grp, names: M.names, n, pos: Float32Array.from(pos, v => v / 100), along: Float32Array.from(along, v => v / 50), info, sw, si, mid: Float32Array.from(mid), idx,
    corBody: Float32Array.from(corB, v => v / 100), corPatch: Float32Array.from(corP, v => v / 100), bone: Float32Array.from(bone) };
}

/* ---------- العضلات: قطع جلد منفصلة ومتحركة بنفس العظام ---------- */
export function makeMuscles(B, data, DQ) {
  const n = data.n, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(data.si), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.sw, 4));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(data.info, 4));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(data.along, 1));
  g.setAttribute('aMid', new THREE.Float32BufferAttribute(data.mid, 1));
  g.setAttribute('aCor', new THREE.Float32BufferAttribute(data.corPatch, 3));
  g.setIndex(new THREE.BufferAttribute(data.idx instanceof Uint16Array ? data.idx : Uint32Array.from(data.idx), 1));
  g.computeVertexNormals();
  const mat = muscleMaterial(data.grp.length, DQ);
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.bind(B.mesh.skeleton, B.mesh.bindMatrix);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const bulge = { U: mat.userData.U, vert: v => v.replace('#include <common>', `#include <common>
      attribute vec4 aInfo; uniform float uPri[${data.grp.length}]; uniform float uPulse, uMap;`).replace('#include <begin_vertex>', `#include <begin_vertex>
`) };
  mesh.customDepthMaterial = depthFor(DQ, bulge);
  return { mesh, mat };
}

function muscleMaterial(nG, DQ) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.48, clearcoat: 0.2, clearcoatRoughness: 0.42, sheen: 0.45, sheenRoughness: 0.42, sheenColor: new THREE.Color(0xffd4c2), side: THREE.DoubleSide });
  const U = {
    uPri: { value: new Array(nG).fill(0) }, uSec: { value: new Array(nG).fill(0) }, uPulse: { value: 0 }, uMap: { value: 1 }, uDebug: { value: 0 }, uSel: { value: -1 },
    uClay: { value: new THREE.Color(0xc4b7ae) }, uTendon: { value: new THREE.Color(0xf2ede6) },
    uPriC: { value: new THREE.Color(0xc92414) }, uSecC: { value: new THREE.Color(0xf29773) }, uDeep: { value: new THREE.Color(0x5b403b) }
  };
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, DQ.U);
    let v = dqsVertex(sh.vertexShader, DQ.n, true);
    v = v.replace('#include <common>', `#include <common>
      attribute vec4 aInfo; attribute float aAlong; attribute float aMid; uniform float uPri[${nG}]; uniform float uSec[${nG}]; uniform float uPulse, uMap;
      varying vec4 vInfo; varying float vAlong; varying float vMid; varying float vP; varying float vS;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vInfo = aInfo; vAlong = aAlong; vMid = aMid; int gi = int(aInfo.x + 0.5); vP = uPri[gi]; vS = uSec[gi];
`);
    sh.vertexShader = v;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uClay, uTendon, uPriC, uSecC, uDeep; uniform float uPulse, uMap, uDebug, uSel;
      varying vec4 vInfo; varying float vAlong; varying float vMid; varying float vP; varying float vS;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float tend = smoothstep(0.3, 0.75, clamp(vInfo.y, 0.0, 1.0)), acr = vInfo.z, e = clamp(vInfo.w, 0.0, 1.0);
      float P = vP * uMap, Sx = vS * uMap * (1.0 - P);
      vec3 belly = mix(uClay, uSecC, Sx);
      belly = mix(belly, uPriC, P);
      vec3 tcol = mix(uTendon, belly, 0.25 * max(P, Sx));
      float fib = 0.5 + 0.5 * sin(acr * 7.0 + sin(vAlong * 0.33) * 1.3);
      float fib2 = 0.5 + 0.5 * sin(acr * 2.1 - vAlong * 0.11);
      vec3 col = mix(belly, tcol, tend);
      col *= 1.0 - (0.07 * fib + 0.045 * fib2) * (1.0 - tend);
      col *= mix(0.55, 1.0, smoothstep(0.0, 0.45, e));
      if (uDebug > 0.5) { float h = fract(vMid * 0.618034); col = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0) * 0.8 + 0.1; col *= mix(0.5, 1.0, e); }
      if (uDebug > 1.5) { col = abs(vMid - uSel) < 0.5 ? vec3(0.85, 0.1, 0.05) : vec3(0.75); col *= mix(0.6, 1.0, e); }
      if (!gl_FrontFacing) col = uDeep * 0.7;
      diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.48, 0.3, smoothstep(0.3, 0.75, clamp(vInfo.y, 0.0, 1.0)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uPriC * vP * uMap * 0.08 * (1.0 - smoothstep(0.3, 0.75, clamp(vInfo.y, 0.0, 1.0)));`);
  };
  return m;
}

/* ---------- المشهد ---------- */
export async function start(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe3ea); scene.fog = new THREE.Fog(0xdfe3ea, 420, 1000);
  let FLOOR = null;
  const setTheme = (bg, fl) => { scene.background.set(bg); scene.fog.color.set(bg); if (FLOOR) FLOOR.material.color.set(fl); };
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff1e2, 2.3); key.position.set(160, 300, 220); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -150, right: 150, top: 230, bottom: -30, near: 50, far: 900 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.6; scene.add(key);
  const rim = new THREE.DirectionalLight(0xdce6ff, 1.35); rim.position.set(-220, 200, -260); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-200, 80, 200); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.35));
  const plat = platform(); scene.add(plat); FLOOR = plat.children[plat.children.length - 1];
  if (opts.theme) setTheme(...opts.theme);
  const cam = new THREE.PerspectiveCamera(30, 1, 5, 4000);
  const S = { yaw: -34 * R, pitch: 10 * R, zoom: 1, t: 0, speed: 1, playing: true, map: true, clothes: false, body: null, sex: null };
  const bar = barbell(); scene.add(bar);
  let hair = null;
  async function setSex(sex) {
    if (S.sex === sex) return; S.sex = sex;
    const pack = opts.packs[sex] || (opts.packs[sex] = await opts.load(sex));
    const mdata = opts.muscles[sex] || (opts.muscles[sex] = await opts.loadMuscles(sex));
    if (S.body) { scene.remove(S.body.mesh); scene.remove(S.body.mus.mesh); }
    scene.children.filter(o => o.userData.hair).forEach(o => scene.remove(o));
    const B = buildBody(pack, new THREE.MeshBasicMaterial());
    B.DQ = makeDQ(B.mesh.skeleton, B.mesh);
    B.layer = bodyLayer(B, sex, B.DQ, mdata.corBody, mdata.bone); B.eyes = eyes(B); B.shoes = makeShoes(B);
    B.rig = makeRig(B); B.sq = makeSquat(B, B.rig);
    scene.add(B.mesh); S.body = B;
    B.mus = makeMuscles(B, mdata, B.DQ); scene.add(B.mus.mesh);
    // السكوات: الأساسية الفخذ الأمامي والأرداف، والمساعدة الفخذ الداخلي وأسفل الظهر والبطن والخلفية والسمانة
    const G = mdata.grp, U = B.mus.mat.userData.U;
    const pri = opts.primary || ['quads', 'glutes'], sec = opts.secondary || ['adductors', 'erectors', 'abs', 'obliques', 'hamstrings', 'calves'];
    U.uPri.value = G.map(m => pri.includes(m) ? 1 : 0); U.uSec.value = G.map(m => sec.includes(m) ? 1 : 0);
    const LU = B.layer.userData.U, MN = pack.muscles;
    LU.uPri.value = MN.map(m => pri.includes(m) ? 1 : 0); LU.uSec.value = MN.map(m => sec.includes(m) ? 1 : 0);
    const before = new Set(scene.children);
    hair = null; if (sex === 'f') B.bun = makeBun(B, 0x35241b);
    scene.children.forEach(o => { if (!before.has(o)) o.userData.hair = 1; });
  }
  await setSex(opts.sex || 'm');
  function frame(dt) {
    const B = S.body; if (!B) return;
    if (S.playing) S.t += dt * S.speed;
    const p = B.sq.solve(S.t), out = poseSquat(B, B.rig, B.sq, p);
    bar.position.copy(out.bar);
    B.mesh.updateMatrixWorld(true); B.DQ.update();
    const U = B.mus.mat.userData.U; U.uMap.value = S.map ? 1 : 0; U.uPulse.value = p.ph.pulse;
    const LU = B.layer.userData.U; LU.uMode.value = S.clothes ? 1 : 0; LU.uMap.value = S.map ? 1 : 0; B.mus.mesh.visible = !S.clothes;
    if (hair) hair(Math.min(dt, 1 / 30) * (S.playing ? S.speed : 0) || 1e-4);
    const hf = Math.atan(Math.tan(15 * R) * cam.aspect), tg = S.tg || new V3(0, 92, 8), d = Math.max(430, 122 / Math.tan(hf)) * S.zoom;
    if (opts.onPhase) opts.onPhase(p.ph);
    cam.position.set(tg.x + d * Math.cos(S.pitch) * Math.sin(S.yaw), tg.y + d * Math.sin(S.pitch), tg.z + d * Math.cos(S.pitch) * Math.cos(S.yaw)); cam.lookAt(tg);
    renderer.render(scene, cam);
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas); resize();
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
    cam, setTheme, S, setSex, frame, scene, setTarget: (x, y, z) => { S.tg = x == null ? null : new V3(x, y, z); },
    render: (t, yaw, pitch, zoom) => { S.t = t; if (yaw != null) S.yaw = yaw * R; if (pitch != null) S.pitch = pitch * R; if (zoom) S.zoom = zoom; S.playing = false; frame(0); S.playing = true; },
    view(v) { const V = { angle: [-34, 10], front: [0, 6], side: [-74, 4], back: [180, 12] }[v]; if (V) { S.yaw = V[0] * R; S.pitch = V[1] * R; } },
    setDeep(on) { S.body.mesh.visible = on; }, setMus(on) { S.body.mus.mesh.visible = on; },
    info: () => ({ yTop: S.body.sq.yTop, yBot: S.body.sq.yBot, per: S.body.sq.PER })
  };
}
