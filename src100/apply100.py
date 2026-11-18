"""هيرو · نسخة 100: حرف «H» ذهبي صغير على صدر هيرو (يرمز لـ Hurr و Hero)

طلب حر (18 تشرين الثاني 2026). الحرف انرسم على media/hero-full.webp (جهة القلب، مثل شعار ماركة)،
و«تمريني» صار يبيّن هيرو من الراس للصدر حتى يبين الحرف.
السكربت اللي رسم الحرف: src100/addH.py (يشتغل على hero-full.png الأصلية المقصوصة).

الاستعمال:  python3 src100/apply100.py  ثم  python3 tools/release.py 100
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
s = open(IDX, encoding='utf-8').read()
old = ".tr-coach img{width:auto; height:auto; max-width:none; min-height:118%; object-fit:contain; object-position:50% 0; margin-top:10px; filter:drop-shadow(0 8px 18px rgba(0,0,0,.35));}"
new = ".tr-coach img{width:auto; height:640px; max-width:none; object-fit:contain; object-position:50% 0; margin-top:14px; filter:drop-shadow(0 8px 18px rgba(0,0,0,.35));}"
if new in s: sys.exit('✗ نسخة 100 منطبقة من قبل')
if s.count(old) != 1: sys.exit('✗ tr-coach')
s = s.replace(old, new)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 100 انطبقت')
