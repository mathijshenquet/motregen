import json, struct, sys, math
from datetime import datetime, timezone
from pathlib import Path
import numpy as np, zstandard

data = Path(sys.argv[1])
m = json.loads((data / 'manifest.json').read_text())

def read(url):
    b = (data / url).read_bytes()
    assert b[:4] == b'mrf0'
    h = struct.unpack('<I', b[4:8])[0]
    head = json.loads(b[8:8 + h])
    base = 8 + h
    g = head['grid']
    q = np.array([np.nan if v is None else v for v in head['quant']], dtype=np.float64)
    frames = {}
    d = zstandard.ZstdDecompressor()
    for f in head['frames']:
        raw = d.decompress(b[base + f['offset']: base + f['offset'] + f['len']], max_output_size=g['width'] * g['height'])
        frames[f['time']] = q[np.frombuffer(raw, np.uint8)].reshape(g['height'], g['width'])
    return g, frames

def epoch(t): return datetime.fromisoformat(t.replace('Z', '+00:00')).timestamp() * 1000

def sin_elev(ep, lon, lat):
    rad = math.pi / 180
    n = ep / 86400000 + 2440587.5 - 2451545
    L = ((280.460 + 0.9856474 * n) * rad) % (2 * math.pi)
    g = ((357.528 + 0.9856003 * n) * rad) % (2 * math.pi)
    lam = L + 1.915 * rad * math.sin(g) + 0.020 * rad * math.sin(2 * g)
    eps = (23.439 - 0.0000004 * n) * rad
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    gmst = ((280.46061837 + 360.98564736629 * n) * rad) % (2 * math.pi)
    sub = ra - gmst
    ha = lon * rad - sub
    return np.sin(lat * rad) * math.sin(dec) + np.cos(lat * rad) * math.cos(dec) * np.cos(ha)

def clear_rad(mu):
    mu = np.maximum(mu, 1e-6)
    return np.where(mu > 0.01, 1098 * mu * np.exp(-0.057 / mu), 0.0)

def mean_clear_rad(end_ep, lon, lat):
    return np.mean([clear_rad(sin_elev(end_ep - (k + 0.5) * 600000, lon, lat)) for k in range(6)], axis=0)

uv_chunk = next(c for c in m['chunks'] if c['source'] == 'uv')
ug, uvf = read(uv_chunk['url'])
import h5py
P = h5py.File(sys.argv[2])['PRODUCT']
nlat = P['latitude'][:]; nlon = P['longitude'][:]; nclear = P['uvi_clear'][:]; ntime = P['time'][:]
rad = {}
for c in m['chunks']:
    if c.get('field') == 'radiation':
        rg, fr = read(c['url'])
        rad.update(fr)
R = 6378137
xs = ug['x0'] + (np.arange(ug['width']) + 0.5) * ug['dx']
ys = ug['y0'] + (np.arange(ug['height']) + 0.5) * ug['dy']
X, Y = np.meshgrid(xs, ys)
lon = X / R * 180 / math.pi
lat = (2 * np.arctan(np.exp(Y / R)) - math.pi / 2) * 180 / math.pi
col = np.floor((X - rg['x0']) / rg['dx']).astype(int)
row = np.floor((Y - rg['y0']) / rg['dy']).astype(int)
inside = (col >= 0) & (row >= 0) & (col < rg['width']) & (row < rg['height'])
col = np.clip(col, 0, rg['width'] - 1); row = np.clip(row, 0, rg['height'] - 1)
# land-ish NL box to keep it to the product area
box = (lat > 50.7) & (lat < 53.6) & (lon > 3.3) & (lon < 7.3)

samples = []
for t, uvv in sorted(uvf.items()):
    ep = epoch(t)
    if ep % 3600000: continue
    before = next((v for k, v in rad.items() if epoch(k) == ep), None)
    after = next((v for k, v in rad.items() if epoch(k) == ep + 3600000), None)
    cmfs = []
    for field, end in ((before, ep), (after, ep + 3600000)):
        if field is None: continue
        gc = mean_clear_rad(end, lon, lat)
        g = field[row, col]
        cmfs.append(np.where(gc > 20, g / np.maximum(gc, 1e-6), np.nan))
    if not cmfs: continue
    cmf = np.nanmean(np.stack(cmfs), axis=0)
    mu = sin_elev(ep, lon, lat)
    ti = int(np.argmin(abs(ntime - (ep/3600000 % 24))))
    li = np.clip(np.rint((lat - nlat[0]) / (nlat[1]-nlat[0])).astype(int), 0, len(nlat)-1); lj = np.clip(np.rint((lon - nlon[0]) / (nlon[1]-nlon[0])).astype(int), 0, len(nlon)-1)
    uvc = nclear[ti][li, lj]; uvc = np.where(uvc < 0, np.nan, uvc)
    ok = inside & box & np.isfinite(uvv) & np.isfinite(cmf) & np.isfinite(uvc) & (uvc > 0.3)
    doy = datetime.fromtimestamp(ep/1000, timezone.utc).timetuple().tm_yday
    fit = 9.20 * np.maximum(mu,0)**2.584 * (1 - 0.127*np.cos(2*np.pi*(doy-102)/365))
    samples.append((t, uvv[ok], uvc[ok], np.clip(cmf[ok], 0, 1.2), 12.5*np.maximum(mu[ok],0)**2.42, fit[ok]))
    print(t, 'n', ok.sum(), 'obs mean %.2f' % uvv[ok].mean(), 'clear mean %.2f' % uvc[ok].mean(), 'cmf mean %.2f' % np.clip(cmf[ok], 0, 1.2).mean(), 'nsrc', len(cmfs))

mad = np.concatenate([s[4] for s in samples]); fitc = np.concatenate([s[5] for s in samples])
obs = np.concatenate([s[1] for s in samples]); clear = np.concatenate([s[2] for s in samples]); cmf = np.concatenate([s[3] for s in samples])
def stats(pred):
    e = pred - obs
    return 'rmse %.3f bias %+.3f p90|e| %.3f' % (np.sqrt(np.mean(e**2)), e.mean(), np.percentile(np.abs(e), 90))
print('clear-sky only        ', stats(clear))
print('linear cmf (p=1,k=1)  ', stats(clear * cmf))
best = None
for p in np.arange(0.2, 1.6, 0.05):
    for k in np.arange(0.6, 1.4, 0.02):
        e = k * clear * cmf ** p - obs
        r = np.sqrt(np.mean(e ** 2))
        if best is None or r < best[0]: best = (r, p, k)
print('fit p=%.2f k=%.2f      ' % (best[1], best[2]), stats(best[2] * clear * cmf ** best[1]))
# vergelijking op dezelfde steekproef

print('U4 0.84·mad·cmf^0.35   ', stats(0.84*mad*cmf**0.35))
print('knmi clear·cmf^0.30    ', stats(clear*cmf**0.30))
print('fit clear·cmf^0.30     ', stats(fitc*cmf**0.30))
print('clear model vs knmi clear: fit', 'bias %+.3f' % (fitc-clear).mean(), ' U4 0.84·mad', 'bias %+.3f' % (0.84*mad-clear).mean())
for p in (0.25,0.3,0.35,0.4): print(p, 'fit', stats(fitc*cmf**p), '| knmi', stats(clear*cmf**p))
