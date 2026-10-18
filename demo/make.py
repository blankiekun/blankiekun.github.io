# Draws the demo game's pictures and cuts its font down to the characters it uses.
# Run from this folder: python3 make.py (needs Pillow and fontTools).
# The font is Shippori Mincho B1 (SIL OFL 1.1, see OFL.txt), from Arch's ttf-shippori-mincho.

import random
from PIL import Image, ImageDraw, ImageFont
from fontTools import subset

W, H = 640, 480
FONT = '/usr/share/fonts/TTF/ShipporiMinchoB1-Regular.ttf'


def save(img, name, colors=64):
    # A small palette keeps flat drawings tiny; the sprites keep their alpha.
    img.quantize(colors, method=Image.Quantize.FASTOCTREE if img.mode == 'RGBA' else Image.Quantize.MEDIANCUT).save(name, optimize=True)


def sky(top, bottom, h=H):
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img, d


def title():
    img, d = sky((16, 18, 52), (70, 40, 110))
    rnd = random.Random(7)
    for _ in range(90):
        x, y, r = rnd.randrange(W), rnd.randrange(300), rnd.choice((1, 1, 1, 2))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 220))
    d.ellipse([480, 50, 560, 130], fill=(255, 240, 190))
    d.ellipse([500, 40, 580, 120], fill=(16, 18, 52))
    d.polygon([(0, 480), (0, 380), (160, 330), (330, 370), (500, 320), (640, 360), (640, 480)], fill=(30, 22, 60))
    big, small = ImageFont.truetype(FONT, 64), ImageFont.truetype(FONT, 22)
    d.text((W // 2 + 3, 173), 'CONscripter', font=big, fill=(255, 0, 140), anchor='mm')
    d.text((W // 2, 170), 'CONscripter', font=big, fill=(255, 255, 120), anchor='mm')
    d.text((W // 2, 230), 'a one-minute demo', font=small, fill=(200, 220, 255), anchor='mm')
    d.text((W // 2, 420), 'Click to start', font=small, fill=(255, 255, 255), anchor='mm')
    save(img, 'title.png')


def room():
    img = Image.new('RGB', (W, H), (236, 214, 178))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 360, W, H], fill=(150, 104, 70))
    for x in range(0, W, 80):
        d.line([(x, 360), (x - 40, H)], fill=(130, 88, 58), width=3)
    d.rectangle([60, 70, 260, 250], fill=(120, 190, 240), outline=(255, 255, 255), width=10)
    d.line([(160, 70), (160, 250)], fill=(255, 255, 255), width=8)
    d.line([(60, 160), (260, 160)], fill=(255, 255, 255), width=8)
    d.ellipse([90, 100, 150, 130], fill=(255, 255, 255))
    d.rectangle([400, 280, 620, 300], fill=(110, 70, 40))  # desk
    d.rectangle([420, 300, 440, 380], fill=(110, 70, 40))
    d.rectangle([580, 300, 600, 380], fill=(110, 70, 40))
    d.rectangle([440, 170, 580, 280], fill=(200, 196, 180))  # the old computer
    d.rectangle([455, 182, 565, 260], fill=(20, 60, 120))
    d.rectangle([462, 190, 520, 196], fill=(255, 255, 255))
    save(img, 'room.png')


def park():
    img, d = sky((250, 150, 90), (255, 220, 160), 340)
    d.ellipse([380, 220, 500, 340], fill=(255, 240, 200))
    d.ellipse([-200, 280, 500, 640], fill=(90, 150, 80))
    d.ellipse([250, 300, 900, 700], fill=(70, 130, 70))
    d.rectangle([120, 220, 140, 340], fill=(90, 60, 40))
    d.ellipse([60, 140, 200, 260], fill=(50, 110, 60))
    save(img, 'park.png')


def screen():
    img = Image.new('RGB', (W, H), (40, 36, 34))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 30, 600, 450], 30, fill=(200, 196, 180))
    d.rounded_rectangle([80, 60, 560, 380], 20, fill=(10, 40, 90))
    mono = ImageFont.truetype(FONT, 20)
    for i, line in enumerate(['*start', 'bg "room.png",9', 'ld c,"conny.png",9', '`Hello!@', 'select "Outside",*outside, ...', '_']):
        d.text((100, 80 + i * 30), line, font=mono, fill=(140, 255, 160))
    d.ellipse([520, 400, 540, 420], fill=(80, 220, 80))
    save(img, 'screen.png')


def conny(smile):
    # Conny: a round-faced girl in a purple hoodie, drawn from circles.
    img = Image.new('RGBA', (240, 380), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([30, 220, 210, 400], 60, fill=(120, 60, 170))  # hoodie
    d.polygon([(100, 230), (140, 230), (120, 270)], fill=(255, 220, 90))
    d.ellipse([20, 20, 220, 210], fill=(60, 40, 40))  # hair
    d.ellipse([45, 50, 195, 215], fill=(255, 224, 200))  # face
    d.chord([35, 15, 205, 150], 180, 360, fill=(60, 40, 40))  # fringe
    if smile:
        d.arc([70, 120, 100, 145], 200, 340, fill=(40, 30, 30), width=5)
        d.arc([140, 120, 170, 145], 200, 340, fill=(40, 30, 30), width=5)
        d.chord([95, 160, 145, 195], 0, 180, fill=(200, 60, 80))
    else:
        d.ellipse([75, 115, 95, 145], fill=(40, 30, 30))
        d.ellipse([145, 115, 165, 145], fill=(40, 30, 30))
        d.arc([100, 165, 140, 185], 20, 160, fill=(200, 60, 80), width=4)
    d.ellipse([58, 150, 82, 166], fill=(255, 170, 170))
    d.ellipse([158, 150, 182, 166], fill=(255, 170, 170))
    img.save('conny-smile.png' if smile else 'conny.png', optimize=True)  # full alpha: the engine ignores a palette's transparency


title(); room(); park(); screen(); conny(False); conny(True)

# Every printable ASCII character, the kana, and what the script uses.
text = open('0.txt', encoding='utf-8').read()
chars = set(map(chr, range(0x20, 0x7f))) | set(map(chr, range(0x3040, 0x3100))) | set(text) | set('　、。・「」『』（）！？…―ー')
opts = subset.Options()
opts.layout_features, opts.name_IDs, opts.notdef_outline = [], ['*'], True
f = subset.load_font(FONT, opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(c for c in chars if c >= ' ')))
s.subset(f)
subset.save_font(f, 'default.ttf', opts)
