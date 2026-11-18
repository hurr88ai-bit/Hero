"""هيرو · نسخة 101: هيرو يرحّب بالمستخدم الجديد (شاشات الترحيب)

هيرو (الشخصية) يعرّف نفسه بأول شاشة ويحچي بصيغة المتكلم، ويطلع وجهه بشاشة «شلون نشتغل؟»،
وجسمه كامل بآخر شاشة «كُن بطل نفسك».

الاستعمال:  python3 src101/apply101.py  ثم  python3 tools/release.py 101
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html'); EN = os.path.join(ROOT, 'i18n', 'en.json')
s = open(IDX, encoding='utf-8').read()
def sub1(old, new):
    global s
    n = s.count(old)
    if n != 1: sys.exit(f'✗ ({n}): {old[:100]}')
    s = s.replace(old, new)
if 'ob-hero-img' in s: sys.exit('✗ نسخة 101 منطبقة من قبل')

CSS = """
/* ============ v101: هيرو بشاشات الترحيب ============ */
.ob-meet{display:flex; align-items:flex-end; gap:12px; margin:6px 0 4px;}
.ob-hero-img{width:120px; height:170px; object-fit:cover; object-position:50% 0; flex:0 0 auto; filter:drop-shadow(0 8px 16px rgba(0,0,0,.35));}
.ob-bubble{position:relative; background:#fff; color:#13233f; border-radius:18px 18px 18px 6px; padding:12px 14px; font-weight:700; font-size:16px; line-height:1.5; margin-bottom:36px; box-shadow:0 8px 20px rgba(0,0,0,.2);}
[dir="rtl"] .ob-bubble{border-radius:18px 18px 6px 18px;}
.ob-face{width:56px; height:56px; border-radius:50%; object-fit:cover; background:#e9eef8; border:3px solid #ffcf4a; display:block; margin-bottom:10px;}
.ob-hero-full{display:block; height:230px; margin:0 auto 14px; object-fit:contain; filter:drop-shadow(0 10px 22px rgba(0,0,0,.4)); animation:heroIn .7s cubic-bezier(.2,.8,.2,1);}
@media (max-height:700px){ .ob-hero-img{height:130px; width:92px;} .ob-hero-full{height:170px;} }
"""
sub1("\n</style>\n\n<svg width=\"0\" height=\"0\"", CSS + "\n</style>\n\n<svg width=\"0\" height=\"0\"")

sub1("""        <h1 class="ob-title" id="ob-title-0">أهلاً بيك</h1>
        <p class="ob-text">هيرو يسويلك جدول تمرين على مقاسك ويتابعك بيه حصة بحصة، ويحسب أكلك واحتياجك اليومي بطريقة علمية ومن مصادر موثوقة، ويتابع وزنك وتقدمك.</p>""",
"""        <div class="ob-meet"><img class="ob-hero-img" src="media/hero-full.webp" alt="هيرو"><div class="ob-bubble">هلا! أنا هيرو، مدربك ورفيقك 💪</div></div>
        <h1 class="ob-title" id="ob-title-0">أهلاً بيك</h1>
        <p class="ob-text">أسويلك جدول تمرين على مقاسك وأتابعك بيه حصة بحصة، وأحسب أكلك واحتياجك اليومي بطريقة علمية ومن مصادر موثوقة، وأتابع وزنك وتقدّمك.</p>""")
sub1("""        <h1 class="ob-title">شلون يشتغل؟</h1>""",
     """        <img class="ob-face" src="media/hero-face.webp" alt="">
        <h1 class="ob-title">شلون نشتغل سوا؟</h1>""")
sub1("""      <section class="ob-step ob-hero" data-step="3" hidden>
        <div class="hero-line">""", """      <section class="ob-step ob-hero" data-step="3" hidden>
        <img class="ob-hero-full" src="media/hero-full.webp" alt="هيرو">
        <div class="hero-line">""")

NEW = {'هلا! أنا هيرو، مدربك ورفيقك 💪': "Hi! I'm Hero, your coach and buddy 💪",
       'أسويلك جدول تمرين على مقاسك وأتابعك بيه حصة بحصة، وأحسب أكلك واحتياجك اليومي بطريقة علمية ومن مصادر موثوقة، وأتابع وزنك وتقدّمك.':
       "I build a workout plan that fits you and follow you session by session, count your food and daily needs with science from trusted sources, and track your weight and progress.",
       'شلون نشتغل سوا؟': 'How we work together', 'هيرو': 'Hero'}
mD = re.search(r'const D = \{', s); head = s[mD.end():mD.end()+900000]
s = s[:mD.end()] + ''.join(json.dumps(k, ensure_ascii=False)+': '+json.dumps(v, ensure_ascii=False)+', ' for k, v in NEW.items() if (json.dumps(k, ensure_ascii=False)+':') not in head) + s[mD.end():]
en = json.load(open(EN, encoding='utf-8')); [en.setdefault(k, v) for k, v in NEW.items()]
json.dump(en, open(EN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
open(IDX, 'w', encoding='utf-8').write(s)
print('✓ نسخة 101 انطبقت')
