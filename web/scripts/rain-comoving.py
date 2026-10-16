# Gebruik: uv run --with numpy --with pillow python -I scripts/rain-comoving.py <opnamemap van rain-motion-strip.ts> <uit.png> <lng> <lat>
# Meebewegend venster: elk beeld wordt uitgesneden rond startpunt + nowcastsnelheid × tijd. Lineaire beweging
# staat dan stil; wiebelen of springen in het venster is interpolatie-artefact.
import sys, glob, json, math, numpy as np
from PIL import Image, ImageDraw

folder, out = sys.argv[1], sys.argv[2]
start_lng, start_lat = float(sys.argv[3]), float(sys.argv[4])
files = sorted(glob.glob(folder + '/[0-9]*.png'))
EARTH = 6378137.0
velocity_km = np.array([1.0, 0.6])  # mercator-km/min oost, noord (nowcast 06:00Z: 5 en 3 cellen per 5 min)
scale = 1.0  # de nowcastcellen zijn al mercator-km (EPSG:3857-raster van 1000 m)


def mercator(lng, lat):
    return np.array([lng * math.pi / 180 * EARTH, math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * EARTH])


def to_pixel(projection, point):
    a, b = projection['a'], projection['b']
    ma, mb = mercator(a['lng'], a['lat']), mercator(b['lng'], b['lat'])
    return a['x'] + (point[0] - ma[0]) / (mb[0] - ma[0]) * (b['x'] - a['x']), a['y'] + (point[1] - ma[1]) / (mb[1] - ma[1]) * (b['y'] - a['y'])


origin = mercator(start_lng, start_lat)
first = None
tiles = []
for path in files:
    name = path.split('/')[-1][:6]
    minute = int(name[:2]) * 60 + int(name[2:4]) + int(name[4:6]) / 60
    first = minute if first is None else first
    centre = origin + velocity_km * (minute - first) * 1000 * scale
    projection = json.load(open(path[:-4] + '.json'))
    x, y = to_pixel(projection, centre)
    half = 70
    tile = Image.open(path).convert('RGB').crop((int(x) - half, int(y) - half, int(x) + half, int(y) + half))
    draw = ImageDraw.Draw(tile)
    draw.line([(half - 6, half), (half + 6, half)], fill=(200, 0, 0))
    draw.line([(half, half - 6), (half, half + 6)], fill=(200, 0, 0))
    local = f'{(int(name[:2]) + 2) % 24:02d}:{name[2:4]}:{name[4:6]}'
    keyframe = name[4:6] == '00' and int(name[2:4]) % 5 == 0
    draw.text((4, 4), local + (' K' if keyframe else ''), fill=(200, 0, 0) if keyframe else (0, 0, 0))
    pixels = np.asarray(Image.open(path).convert('RGB').crop((int(x) - half, int(y) - half, int(x) + half, int(y) + half)), dtype=float)
    sea = np.array([158, 188, 252], dtype=float)
    weight = np.clip(np.abs(pixels - sea).sum(-1) - 25, 0, None)
    if weight.sum() > 0:
        ys, xs = np.indices(weight.shape)
        cx, cy = (xs * weight).sum() / weight.sum() - half, (ys * weight).sum() / weight.sum() - half
        print(f'{local}  zwaartepunt t.o.v. de eenparige baan: {cx:+6.1f} px oost  {-cy:+6.1f} px noord  massa {weight.sum() / 1e3:7.0f}' + ('  ← KNMI-frame' if keyframe else ''))
    tiles.append(tile)
columns = 10
size = tiles[0].size
sheet = Image.new('RGB', (columns * (size[0] + 2), math.ceil(len(tiles) / columns) * (size[1] + 2)), 'white')
for index, tile in enumerate(tiles):
    sheet.paste(tile, ((index % columns) * (size[0] + 2), (index // columns) * (size[1] + 2)))
sheet.save(out)
