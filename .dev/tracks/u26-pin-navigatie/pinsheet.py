from PIL import Image, ImageChops, ImageDraw
d0='/home/mthq/.herdr/worktrees/motregen/track-u26-pin-navigatie/.dev/tracks/u26-pin-navigatie/shots'
rows=[]
for dpr in ['1','1.5','2.75']:
    for z in ['7.3','8.7']:
        a=Image.open(f'{d0}/pin-z{z}-dpr{dpr}-voor.png').convert('RGB'); b=Image.open(f'{d0}/pin-z{z}-dpr{dpr}-na.png').convert('RGB')
        d=ImageChops.difference(a,b).point(lambda v: min(255, v*4))
        k=264//a.width  # alles naar ~264 px breed, pixelgetrouw
        rows.append((f'dpr {dpr} z{z}', [im.resize((a.width*k, a.height*k), Image.NEAREST) for im in (a,b,d)]))
w=max(sum(im.width for im in ims)+40 for _,ims in rows); h=sum(ims[0].height+18 for _,ims in rows)
sheet=Image.new('RGB',(w,h),'white'); dr=ImageDraw.Draw(sheet); y=0
for label,ims in rows:
    dr.text((4,y+2),label+'   voor | na | verschil x4',fill='black'); x=0; y+=16
    for im in ims: sheet.paste(im,(x,y)); x+=im.width+20
    y+=ims[0].height+2
sheet.save(f'{d0}/pin-sheet.png'); print(sheet.size)
