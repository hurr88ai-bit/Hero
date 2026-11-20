-- هيرو · قاعدة تذكيرات الإشعارات (Cloudflare D1). لا أكل ولا وزن ولا اسم: بس عنوان إشعارات الجهاز والوقت واللغة.
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,            -- SHA-256 لعنوان الإشعارات
  endpoint TEXT NOT NULL,         -- عنوان الإشعارات (من خدمة Google/Apple/Mozilla)
  tz TEXT NOT NULL,               -- المنطقة الزمنية مثل Asia/Baghdad
  lang TEXT NOT NULL,             -- ar أو en
  reminders TEXT NOT NULL,        -- JSON: [{"h":14,"m":0},...] (أوقات محلية)
  last_slot TEXT NOT NULL DEFAULT '',   -- آخر وقت انرسل (YYYYMMDDHHMM محلي) حتى ما يتكرر
  last_test INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL           -- آخر تجديد من التطبيق (ينمسح الصف إذا مرّ 60 يوم بدون تجديد)
);
-- عدّاد تسجيل لكل IP بالساعة (مفتاح مشفّر، ينمسح تلقائياً)
CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL);
