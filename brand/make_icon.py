"""يعيد رسم أيقونة هيرو بأي حجم (1024 للمتاجر) من الخطوط المضمّنة بالتطبيق نفسه.
المقاسات والألوان مقاسة من icons/icon-512.png الأصلية (الفرق بعد التصغير ~1.7 من 255).
الاستعمال (من جذر المستودع): python3 brand/make_icon.py 1024 brand/hero_icon_1024.png
يحتاج: pip install pillow numpy fonttools brotli  (Pillow بيه raqm للعربي)"""
import sys, os, re, base64, io
from PIL import Image, ImageDraw, ImageFont
import numpy as np
S = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
out = sys.argv[2] if len(sys.argv) > 2 else f'hero_icon_{S}.png'
k = S / 512
# الخلفية: كحلي متدرج دائري (#2A4478 بالوسط فوك → #13233F)
yy, xx = np.mgrid[0:S, 0:S]
t = np.clip(np.hypot(xx - 256 * k, yy - 140 * k) / (440 * k), 0, 1)[..., None]
A, B = np.array([42, 68, 120.]), np.array([19, 35, 63.])
HERE = os.path.dirname(os.path.abspath(__file__))
def font(fam):   # الخط ينسحب من index.html (مضمّن بيه woff2) ويتحول ttf مرة وحدة
    p = os.path.join(HERE, fam + '.ttf')
    if not os.path.exists(p):
        from fontTools.ttLib import TTFont
        s = open(os.path.join(HERE, '..', 'index.html'), encoding='utf-8').read()
        b = re.search(r"@font-face\{font-family:'%s';[^}]*?base64,([A-Za-z0-9+/=]+)" % fam, s).group(1)
        t = TTFont(io.BytesIO(base64.b64decode(b))); t.flavor = None; t.save(p)
    return p
img = Image.fromarray((A + (B - A) * t).round().astype('uint8'), 'RGB')
d = ImageDraw.Draw(img)

def fit(text, font_path, box, color, spacing=0, **kw):
    x0, x1, y0, y1 = [v * k for v in box]
    lo, hi = 10, 2000
    while hi - lo > 1:          # حجم الخط اللي ارتفاع الحروف بي يساوي ارتفاع الصندوق
        m = (lo + hi) // 2
        f = ImageFont.truetype(font_path, m, layout_engine=ImageFont.Layout.RAQM)
        bb = d.textbbox((0, 0), text, font=f, **kw)
        (lo, hi) = (m, hi) if bb[3] - bb[1] <= (y1 - y0) else (lo, m)
    f = ImageFont.truetype(font_path, lo, layout_engine=ImageFont.Layout.RAQM)
    if spacing:                # حروف HERO متباعدة: نوزعها على عرض الصندوق
        ws = [d.textbbox((0, 0), ch, font=f) for ch in text]
        tot = sum(b[2] - b[0] for b in ws); gap = ((x1 - x0) - tot) / (len(text) - 1)
        x = x0
        for ch, b in zip(text, ws):
            d.text((x - b[0], y0 - b[1]), ch, font=f, fill=color); x += b[2] - b[0] + gap
    else:
        bb = d.textbbox((0, 0), text, font=f, **kw)
        cx = (x0 + x1) / 2 - (bb[0] + bb[2]) / 2
        d.text((cx, y0 - bb[1]), text, font=f, fill=color, **kw)

fit('هيرو', font('Lalezar'), (86, 424, 175, 325), (255, 207, 74), direction='rtl', language='ar')
fit('HERO', font('Poppins'), (174, 339, 347, 379), (255, 255, 255), spacing=1)
img.save(out, optimize=True)
print('saved', out, img.size)
