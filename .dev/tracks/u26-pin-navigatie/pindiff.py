from PIL import Image, ImageChops
import sys
d0='/home/mthq/.herdr/worktrees/motregen/track-u26-pin-navigatie/.dev/tracks/u26-pin-navigatie/shots'
# Pinvlak in crop-CSS-px (svg 391.5..418.5 x 365.5..406.5, kader vanaf 381,356) + 3 px rand.
for dpr in ['1','1.5','2.75']:
    for z in ['7.3','8.7']:
        a=Image.open(f'{d0}/pin-z{z}-dpr{dpr}-voor.png').convert('RGB'); b=Image.open(f'{d0}/pin-z{z}-dpr{dpr}-na.png').convert('RGB')
        s=float(dpr); box=(int(7*s),int(6*s),int(41*s),int(54*s))
        d=ImageChops.difference(a.crop(box),b.crop(box))
        vals=[max(d.getpixel((x,y))) for y in range(d.height) for x in range(d.width)]
        px=[(x+box[0],y+box[1]) for i,(x,y) in enumerate((x,y) for y in range(d.height) for x in range(d.width)) if vals[i]>8]
        xs=[p[0] for p in px]; ys=[p[1] for p in px]
        print(f'dpr {dpr} z{z}: pinvlak-pixels verschil>8: {len(px)} (max {max(vals)})' + (f' x {min(xs)}..{max(xs)} y {min(ys)}..{max(ys)}' if px else ''))
