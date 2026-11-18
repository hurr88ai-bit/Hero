from PIL import Image, ImageDraw, ImageFilter
im = Image.open('hero-full.png').convert('RGBA')
S = 4  # supersample
w, h = 34, 36
L = Image.new('RGBA', (w*S, h*S), (0,0,0,0)); d = ImageDraw.Draw(L)
def bar(x0,y0,x1,y1,c): d.rounded_rectangle([x0*S,y0*S,x1*S,y1*S], radius=2*S, fill=c)
gold, edge = (234,190,92,255), (122,86,20,255)
for dx,dy,c in [(1.2,1.2,edge),(0,0,gold)]:
    bar(4+dx,3+dy,12+dx,33+dy,c); bar(22+dx,3+dy,30+dx,33+dy,c); bar(10+dx,15+dy,24+dx,21+dy,c)
# highlight
d.rectangle([5*S,4*S,7*S,31*S], fill=(255,236,170,200)); d.rectangle([23*S,4*S,25*S,31*S], fill=(255,236,170,200))
L = L.resize((w, h), Image.LANCZOS).rotate(-6, resample=Image.BICUBIC, expand=True)
# subtle fabric shading: darken bottom half slightly
mask = Image.linear_gradient('L').resize(L.size)
shade = Image.new('RGBA', L.size, (0,0,0,0)); shade.putalpha(mask.point(lambda v: int(v*0.22)))
Lc = L.copy(); Lc.alpha_composite(Image.composite(shade, Image.new('RGBA',L.size,(0,0,0,0)), L.split()[3]))
x, y = 250, 336
im.alpha_composite(Lc, (x, y))
im.save('hero-full-H.png')
t = im.crop((60,250,400,650)); bg = Image.new('RGBA', t.size, (242,244,249,255)); bg.alpha_composite(t); bg.save('torsoH.png')
