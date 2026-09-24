"""U18 verkenning (weggooi, geen productiepad): DCT-afkap van feels_like_c per K.

uv run --with numpy --with scipy --with zstandard python measure.py <dir met *.mrf>
"""
import glob, json, math, struct, sys
import numpy as np, zstandard
from scipy.fft import dctn, idctn
from scipy.ndimage import distance_transform_edt

CITIES = [(4.9,52.37),(4.48,51.92),(5.12,52.09),(6.57,53.22),(5.8,53.2),(3.61,51.5),(5.69,50.85),(5.48,51.44),(6.09,52.52),(5.91,51.98),(5.47,52.52),(6.56,52.99),(4.76,52.96),(6.9,52.22),(4.78,51.59),(6.17,51.37),(4.3,52.08),(4.75,52.63),(5.42,53.17),(5.86,51.84),(5.97,52.21),(6.9,52.79),(3.57,51.45),(5.3,51.69),(5.09,51.56),(5.39,52.16),(4.64,52.38),(4.49,52.16),(4.67,51.81),(3.89,51.5),(3.92,51.65),(3.83,51.34),(4.29,51.5),(5.99,51.19),(5.98,50.89),(5.71,51.25),(5.66,51.48),(5.52,51.77),(5.18,52.96),(4.62,53.0)]
KS = [16, 24, 32, 48, 64, 96]
Z = zstandard.ZstdCompressor(level=19)
D = zstandard.ZstdDecompressor()

def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[4:8])[0]; h = json.loads(b[8:8+n]); p = b[8+n:]
    q = np.array([np.nan if v is None else v for v in h['quant']], dtype=np.float64)
    g = h['grid']; out = []
    for fr in h['frames']:
        raw = np.frombuffer(D.decompress(p[fr['offset']:fr['offset']+fr['len']], max_output_size=g['width']*g['height']), dtype=np.uint8)
        out.append((fr['time'], q[raw].reshape(g['height'], g['width']), fr['len']))
    return h, out

def block3(field):
    h, w = field.shape; H, W = -(-h // 3), -(-w // 3)
    pad = np.full((H*3, W*3), np.nan); pad[:h, :w] = field
    blocks = pad.reshape(H, 3, W, 3)
    with np.errstate(invalid='ignore'):
        return np.nanmean(blocks, axis=(1, 3))

def blur(field, passes):
    cur = field.copy()
    for _ in range(passes):
        for axis in (1, 0):
            valid = ~np.isnan(cur); v = np.where(valid, cur, 0.0)
            s = v.copy(); c = valid.astype(float)
            for off in (-1, 1):
                sv = np.roll(v, off, axis); sc = np.roll(valid.astype(float), off, axis)
                if axis == 1:
                    if off == 1: sv[:, 0] = 0; sc[:, 0] = 0
                    else: sv[:, -1] = 0; sc[:, -1] = 0
                else:
                    if off == 1: sv[0] = 0; sc[0] = 0
                    else: sv[-1] = 0; sc[-1] = 0
                s += sv; c += sc
            cur = np.where(valid, s / np.maximum(c, 1), np.nan)
    return cur

def fill_nearest(field):
    mask = np.isnan(field)
    if not mask.any(): return field
    idx = distance_transform_edt(mask, return_distances=False, return_indices=True)
    return field[tuple(idx)]

def lonlat_to_cell(h, lon, lat):
    x = 6378137 * math.radians(lon); y = 6378137 * math.log(math.tan(math.pi/4 + math.radians(lat)/2))
    g = h['grid']; return int((y - g['y0']) // g['dy']), int((x - g['x0']) // g['dx'])

def nl_box(h, shape):
    r0, c0 = lonlat_to_cell(h, 3.3, 53.6); r1, c1 = lonlat_to_cell(h, 7.3, 50.7)
    m = np.zeros(shape, bool); m[r0:r1+1, c0:c1+1] = True; return m

def encode(coef, how):
    K = coef.shape[0]
    if how == 'f16':
        return Z.compress(coef.astype('<f2').tobytes()), coef.astype(np.float16).astype(np.float64)
    step = {'i16s0.05': 0.05, 'i16s0.1': 0.1, 'i16s0.2': 0.2}[how]
    qi = np.clip(np.round(coef / step), -32767, 32767).astype('<i2')
    # diagonale volgorde + bytevlakken gesplitst (lage bytes, dan hoge)
    order = sorted(((a + b, a, b) for a in range(K) for b in range(K)))
    flat = np.array([qi[a, b] for _, a, b in order], dtype='<i2')
    planes = flat.view(np.uint8).reshape(-1, 2).T.copy().tobytes()
    return Z.compress(planes), qi.astype(np.float64) * step

def main(folder):
    frames = []
    for path in sorted(glob.glob(f'{folder}/*feels_like*.mrf')):
        h, fr = read(path)
        run = h['run']
        for t, f, n in fr:
            if f.shape[1] > 300: f = block3(f)
            frames.append((run, t, f, n if f.shape[1] < 300 else None))
    h6, _ = read(sorted(glob.glob(f'{folder}/*0700-h48-l1-24*.mrf'))[0])
    shape = frames[0][2].shape; nl = nl_box(h6, shape)
    cities = [lonlat_to_cell(h6, lo, la) for lo, la in CITIES]
    runs = sorted({r for r, *_ in frames}); print('runs', runs, 'frames', len(frames), 'shape', shape)
    bitmap = [n for *_, n in frames if n]; print(f'bitmap 6km B/frame gem {np.mean(bitmap):.0f} (n={len(bitmap)})')
    mask_bytes = [len(Z.compress(np.packbits(np.isnan(f)).tobytes())) for *_, f, _ in frames]
    print(f'masker bitpacked+zstd: {np.mean(mask_bytes):.0f} B')
    rows = {}
    for run, t, f, _ in frames:
        valid = ~np.isnan(f); ref = blur(f, 2); filled = fill_nearest(f)
        C = dctn(filled, norm='ortho')
        for K in KS:
            for how in ('f16', 'i16s0.05', 'i16s0.1', 'i16s0.2'):
                blob, cq = encode(C[:K, :K], how)
                full = np.zeros_like(C); full[:K, :K] = cq
                rec = idctn(full, norm='ortho'); rec[~valid] = np.nan
                for variant, field in (('dct', rec), ('dct+blur2', blur(rec, 2))):
                    d = (field - ref)[valid]; dn = (field - ref)[valid & nl]
                    pt = np.array([rec[r, c] - f[r, c] for r, c in cities if valid[r, c]])
                    same = np.mean([round(rec[r, c]) == round(f[r, c]) for r, c in cities if valid[r, c]])
                    key = (K, how, variant)
                    rows.setdefault(key, []).append((len(blob), math.sqrt(np.mean(d**2)), np.abs(d).max(), math.sqrt(np.mean(dn**2)), np.abs(dn).max(), np.percentile(np.abs(dn), 99), math.sqrt(np.mean(pt**2)), np.abs(pt).max(), same, run))
    # referentie zelf: blur2 vs rauw (wat de tabel ziet)
    print('\nK   codering  variant     B/frame  rms°C  max°C | NL: rms  p99   max | stad: rms  max  gelijk°  | max-per-run(NL max)')
    for key, vals in rows.items():
        a = np.array([v[:9] for v in vals]); per = {}
        for v in vals: per[v[9]] = max(per.get(v[9], 0), v[4])
        print(f'{key[0]:<3} {key[1]:<9} {key[2]:<10} {a[:,0].mean():7.0f}  {a[:,1].mean():.3f}  {a[:,2].max():.2f} | {a[:,3].mean():.3f}  {np.median(a[:,5]):.2f} {a[:,4].max():.2f} | {a[:,6].mean():.2f}  {a[:,7].max():.2f}  {a[:,8].mean()*100:4.1f}% | ' + ' '.join(f'{r[5:13]}:{m:.2f}' for r, m in sorted(per.items())))

if len(sys.argv) == 2: main(sys.argv[1])

def residual(folder):
    """DCT (i16, stap 0,2) + restveld (rauw − DCT) op 0,3 °C als u8 (0 = −38,1 °C … 254, 255 no-data)."""
    frames = []
    for path in sorted(glob.glob(f'{folder}/*feels_like*.mrf')):
        h, fr = read(path)
        frames += [f if f.shape[1] < 300 else block3(f) for _, f, _ in fr]
    print('\nK   DCT B  rest B  totaal B  | rest0-fractie  max|fout| t.o.v. rauw')
    for K in (32, 48, 64):
        tot = []
        for f in frames:
            valid = ~np.isnan(f); C = dctn(fill_nearest(f), norm='ortho')
            blob, cq = encode(C[:K, :K], 'i16s0.2'); full = np.zeros_like(C); full[:K, :K] = cq
            rec = idctn(full, norm='ortho')
            q = np.clip(np.round((f - rec) / 0.3), -127, 127)
            byte = np.where(valid, q + 127, 255).astype(np.uint8)
            back = rec + 0.3 * (byte.astype(float) - 127)
            tot.append((len(blob), len(Z.compress(byte.tobytes())), np.mean(q[valid] == 0), np.abs((back - f)[valid]).max()))
        a = np.array(tot)
        print(f'{K:<3} {a[:,0].mean():5.0f}  {a[:,1].mean():6.0f}  {a[:,0].mean()+a[:,1].mean():7.0f}   | {a[:,2].mean()*100:5.1f}%        {a[:,3].max():.2f}')

if len(sys.argv) > 2: residual(sys.argv[1])
