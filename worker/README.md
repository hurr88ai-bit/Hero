# سيرفر «صوّر صحنك» · hero-snap

سيرفر صغير على Cloudflare Workers. التطبيق يرسله صورة الصحن، وهو يسأل Claude (موديل `claude-haiku-5-5`)
شنو الأكلات وكل وحدة شكد غرام، ويرجّع النتيجة. **السعرات يحسبها التطبيق من قاعدة أكله**، مو من الذكاء الاصطناعي.
مفتاح API محفوظ بالسيرفر بس (Secret)، فما أحد يگدر يشوفه من كود التطبيق.

الرابط اللي التطبيق يستعمله (بـ`index.html`، داخل `SNAP`):
`https://hero-snap.baghdadhurr.workers.dev/analyze`

## الإعداد (مرة وحدة، من لوحة Cloudflare)

1. **مفتاح Anthropic:** console.anthropic.com ← سجّل ← Billing (اشحن رصيد، مثلاً 5$) ← API Keys ← Create Key. انسخه.
2. **KV للحد اليومي:** Cloudflare ← Storage & Databases ← KV ← Create ← الاسم `hero-snap-kv`.
3. **الـWorker:** Workers & Pages ← Create ← Worker ← الاسم `hero-snap` ← Deploy ← Edit code ← الصق محتوى `snap-worker.js` ← Deploy.
4. **الإعدادات:** الـWorker ← Settings:
   - Variables and Secrets ← Add ← النوع **Secret** ← الاسم `ANTHROPIC_API_KEY` ← الصق المفتاح.
   - Variables and Secrets ← Add ← النوع Text ← `DAILY_LIMIT` = `5`.
   - Bindings ← Add ← KV namespace ← الاسم `SNAP_KV` ← اختار `hero-snap-kv`.
5. **فحص:** افتح `https://hero-snap.baghdadhurr.workers.dev/health` ← لازم يطلع `{"ok":true}`.

أو بالـCLI: `npx wrangler deploy` من هذا المجلد (بعد ما تحط id الـKV بـ`wrangler.toml`) و`npx wrangler secret put ANTHROPIC_API_KEY`.

## الكلفة

`claude-haiku-5-5`: ‎0.10$ لكل مليون توكن داخل و0.50$ لكل مليون طالع. الصورة المصغّرة (1024px) ~1,400 توكن،
وقائمة الأكلات ~3,000، والجواب ~300 ← تقريباً **0.0006$ للصورة** (يعني ~1,600 صورة بالدولار).
الحد اليومي (5 صور لكل جهاز، و30 لكل IP) يحمي الحساب من الاستنزاف. حط بلوحة Anthropic حد صرف شهري (Limits) احتياط.

## الموديل

- `SNAP_MODEL` (Variable بإعدادات الـWorker): حالياً `claude-sonnet-5-5`. أدق بربط الأكلة الصحيحة (بالتجربة Haiku مرات ربط الدجاج بالشاورما أو بالرز)، ~0.01$ للصورة.
- لترجع لـHaiku (أرخص بعشر مرات): امسح المتغيّر أو خلّيه `claude-haiku-5-5`.
- Sonnet ما يقبل `tool_choice: tool`، فالسيرفر يستخدم `auto` والتعليمات تجبره يستدعي الأداة.
- الكميات: الموديلين يبالغون بالنشويات المنفوشة؛ التطبيق يصحّحها (×0.7) ويتعلّم من تصحيحات كل مستخدم (نسخة 90).

## ملاحظات

- المواقع المسموحة (CORS) مكتوبة بـ`ALLOWED_ORIGINS`. إذا صار للتطبيق دومين جديد ضيفه هناك.
- الصورة ما تنحفظ. الـKV يحفظ بس عدّاد يومي (بصمة مشفّرة للجهاز والـIP) وينمسح بعد ~30 ساعة.
- لتغيير الموديل: `MODEL` بأول الملف.
