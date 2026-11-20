// هيرو · يولّد مفتاح VAPID (يشتغل عندك محلياً، المفتاح الخاص ما يدخل المستودع).
// الاستعمال:   node worker/gen-vapid.mjs > vapid.jwk.json
//              npx wrangler secret put VAPID_JWK -c worker/wrangler.push.toml < vapid.jwk.json
//              (بعدها امسح vapid.jwk.json)
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
console.log(JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)));
