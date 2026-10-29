"""هيرو · تجهيز نسخة جديدة للنشر (بديل pwa_build.py القديم)

من نسخة 81، المصدر الوحيد للتطبيق هو index.html بهذا المستودع (التعديلات تنسوى عليه مباشرة،
أو بسكربتات تعديل مثل i18n/apply83.py و src84/apply84.py). هذا السكربت ما يبني شي من الصفر،
بس يجهز النسخة للنشر:
  1) يغيّر رقم النسخة بمكانين: HERO_VER و «نسخة تجريبية N» ببطاقة حول هيرو
  2) يتأكد إن كل ملف بقائمة الـservice worker موجود
  3) يحسب اسم ذاكرة جديد للـservice worker من محتوى الملفات، حتى أجهزة المستخدمين تنزّل التحديث
  4) يفحص إن ماكو رابط محلي مكسور بـindex.html

الاستعمال (من جذر المستودع):
    python3 tools/release.py 85          # يجهز نسخة 85
    python3 tools/release.py --check     # فحص بس، بدون أي تغيير

بعدها: git add -A && git commit -m "هيرو · نسخة 85: ..." && git push
"""
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX, SW = os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'sw.js')
VER_RE = re.compile(r"(const HERO_VER = ')(\d+)(')")
ABOUT_RE = re.compile(r'(<div class="about-sub" style="opacity:\.6">نسخة تجريبية )(\d+)(</div>)')


def die(msg):
    sys.exit('✗ ' + msg)


def main():
    args = sys.argv[1:]
    check = '--check' in args
    nums = [a for a in args if a.isdigit()]
    if not check and len(nums) != 1:
        die('اكتب رقم النسخة، مثلاً: python3 tools/release.py 85  (أو --check للفحص بس)')
    s = open(IDX, encoding='utf-8').read()
    m1, m2 = VER_RE.search(s), ABOUT_RE.search(s)
    if not m1 or not m2:
        die('ما لكيت علامات رقم النسخة بـindex.html (HERO_VER أو «نسخة تجريبية»). تغيّر شكلها؟ صلّح التعبير بهذا السكربت.')
    cur = m1.group(2)
    if m2.group(2) != cur:
        print(f'! تنبيه: HERO_VER = {cur} بس بطاقة حول هيرو تكول {m2.group(2)}')

    sw = open(SW, encoding='utf-8').read()
    core = json.loads(re.search(r'const CORE = (\[.*?\]);', sw).group(1))
    missing = [f for f in core[1:] if not os.path.exists(os.path.join(ROOT, f))]
    if missing:
        die('ملفات بقائمة الـservice worker مو موجودة: ' + ', '.join(missing))

    # روابط محلية بـindex.html (src/href) لازم تكون موجودة
    local = set(re.findall(r'(?:src|href)="((?!https?:|data:|#|mailto:|intent:|x-safari|ig\.me)[^"${}]+)"', s))
    broken = [p for p in sorted(local) if p not in ('./',) and not os.path.exists(os.path.join(ROOT, p.split('?')[0].lstrip('./')))]
    if broken:
        print('! روابط محلية ما لكيتها (تأكد منها): ' + ', '.join(broken[:10]))

    if check:
        print(f'✓ الفحص تمام · النسخة الحالية {cur} · {len(core)} ملف بالـservice worker · ذاكرة {re.search(chr(39)+"(hero-[^"+chr(39)+"]+)", sw).group(1)}')
        return

    new = nums[0]
    if int(new) <= int(cur):
        die(f'النسخة الجديدة ({new}) لازم تكون أكبر من الحالية ({cur})')
    s = VER_RE.sub(lambda m: m.group(1) + new + m.group(3), s, count=1)
    s = ABOUT_RE.sub(lambda m: m.group(1) + new + m.group(3), s, count=1)
    open(IDX, 'w', encoding='utf-8').write(s)

    h = hashlib.sha1()
    for f in core[1:]:
        h.update(open(os.path.join(ROOT, f), 'rb').read())
    cache = f'hero-{new}-{h.hexdigest()[:8]}'
    sw = re.sub(r"const CACHE = '[^']+';", f"const CACHE = '{cache}';", sw, count=1)
    open(SW, 'w', encoding='utf-8').write(sw)
    print(f'✓ نسخة {cur} ← {new} · ذاكرة الـservice worker: {cache}')
    print('  الخطوة الجاية: جرّب الصفحة محلياً (python3 -m http.server)، وبعدين commit و push')


if __name__ == '__main__':
    main()
