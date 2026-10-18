from PIL import Image, ImageDraw, ImageFont
F='/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf'
f=lambda s: ImageFont.truetype(F,s)
W,H=1200,630
im=Image.new('RGB',(W,H),(0,128,128)); d=ImageDraw.Draw(im)
def bevel(b,fill,up=True):
    x0,y0,x1,y1=b; d.rectangle(b,fill=fill)
    l,dk=((255,255,255),(64,64,64)) if up else ((64,64,64),(255,255,255))
    d.line([(x0,y0),(x1,y0)],fill=l,width=3); d.line([(x0,y0),(x0,y1)],fill=l,width=3)
    d.line([(x0,y1),(x1,y1)],fill=dk,width=3); d.line([(x1,y0),(x1,y1)],fill=dk,width=3)
# window
bevel((90,60,1110,520),(192,192,192))
d.rectangle((100,70,1100,115),fill=(0,0,128)); d.text((116,76),'blankiekun',font=f(34),fill='white')
for i in range(3): bevel((1000+i*32-2,78,1026+i*32-2,106),(192,192,192))
d.rectangle((100,125,1100,510),fill='white')
d.text((130,150),'blankiekun',font=f(96),fill=(0,0,128))
d.text((130,262),'a retro desktop that runs in your browser',font=f(28),fill=(64,64,64))
y=330
for name,desc,c in [('chimimouryou','self-hosted reader for Calibre libraries',(128,0,0)),('CONscripter','visual novel engine in the browser',(0,100,0)),('conscripter-convert','brings games from other engines',(0,0,160))]:
    d.rectangle((130,y+6,154,y+30),fill=c); d.text((172,y),name,font=f(34),fill='black'); d.text((172+d.textlength(name,font=f(34))+20,y+6),desc,font=f(22),fill=(64,64,64)); y+=56
# taskbar
bevel((0,570,W,H),(192,192,192)); bevel((8,576,150,624),(192,192,192)); d.text((24,586),'Start',font=f(28),fill='black')
bevel((W-170,578,W-8,622),(192,192,192),False); d.text((W-150,588),'12:00',font=f(24),fill='black')
im.quantize(64).save('img/og.png',optimize=True)
