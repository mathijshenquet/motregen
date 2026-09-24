"""U18b verkenning (weggooi, geen productiepad): compacte, tabel-exacte codering van feels_like_c.

uv run --with numpy --with scipy --with zstandard python measure.py <dir met *feels_like_c*.mrf> [...]

Alle varianten zijn verliesvrij op tabelniveau (index-exact t.o.v. de bitmap); de meting is dus bytes.
"""
import glob, json, math, struct, sys, time
import numpy as np, zstandard
from scipy.fft import dctn, idctn
from scipy.ndimage import distance_transform_edt

Z = zstandard.ZstdCompressor(level=19)
D = zstandard.ZstdDecompressor()


def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[4:8])[0]; h = json.loads(b[8:8+n]); p = b[8+n:]
    g = h['grid']; out = []
    for fr in h['frames']:
        raw = np.frombuffer(D.decompress(p[fr['offset']:fr['offset']+fr['len']], max_output_size=g['width']*g['height']), dtype=np.uint8)
        out.append((fr['time'], raw.reshape(g['height'], g['width']).copy(), fr['len']))
    return h, out


def fill_nearest(idx):
    mask = idx == 255
    if not mask.any(): return idx.astype(np.int32)
    ind = distance_transform_edt(mask, return_distances=False, return_indices=True)
    return idx[tuple(ind)].astype(np.int32)


def neighbours(x):
    """a = links, b = boven, c = linksboven, d = rechtsboven; randen: ontbrekende buur = beschikbare buur."""
    a = np.empty_like(x); b = np.empty_like(x); c = np.empty_like(x); d = np.empty_like(x)
    a[:, 1:] = x[:, :-1]; b[1:, :] = x[:-1, :]
    a[:, 0] = np.r_[x[0, 0] * 0 + 128, x[:-1, 0]]  # kolom 0: boven (rij 0: 128)
    b[0, :] = np.r_[128, x[0, :-1]]                # rij 0: links
    c[1:, 1:] = x[:-1, :-1]; c[0, :] = b[0, :]; c[1:, 0] = b[1:, 0]
    d[1:, :-1] = x[:-1, 1:]; d[1:, -1] = b[1:, -1]; d[0, :] = b[0, :]
    return a, b, c, d


def predict(x, how):
    a, b, c, d = neighbours(x)
    if how == 'left': return a
    if how == 'avg': return (a + b) >> 1
    if how == 'grad': return np.clip(a + b - c, 0, 254)
    if how == 'med':
        return np.where(c >= np.maximum(a, b), np.minimum(a, b), np.where(c <= np.minimum(a, b), np.maximum(a, b), a + b - c))
    if how == 'paeth':
        p = a + b - c; pa = abs(p - a); pb = abs(p - b); pc = abs(p - c)
        return np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))
    if how == 'avg4':  # (2a + 2b + d - c) / 4-achtig, gladde velden
        return np.clip(np.round((3 * a + 3 * b - 2 * c + d) / 5).astype(np.int32), 0, 254)
    raise ValueError(how)


def zz(r):
    return np.where(r >= 0, 2 * r, -2 * r - 1)


def maskbytes(idx):
    return np.packbits((idx == 255).ravel()).tobytes()


def zlen(*parts):
    return len(Z.compress(b''.join(parts)))


def adaptive_cost(sym, ctx, nctx, alphabet=64):
    """Bits van een adaptief frequentiemodel per context (telling start op 1, +32 per symbool, halveren
    boven 2^16) — benadert een eigen rANS/aritmetische coder; symbolen ≥ alphabet-1 via escape + 8 bit."""
    counts = np.ones((nctx, alphabet), dtype=np.int64)
    total = np.full(nctx, alphabet, dtype=np.int64)
    bits = 0.0
    for s, k in zip(sym.tolist(), ctx.tolist()):
        e = s if s < alphabet - 1 else alphabet - 1
        bits -= math.log2(counts[k, e] / total[k])
        if e == alphabet - 1: bits += 9
        counts[k, e] += 32; total[k] += 32
        if total[k] > 65536:
            counts[k] = (counts[k] + 1) >> 1; total[k] = counts[k].sum()
    return bits / 8


def activity_ctx(x, levels=(0, 1, 2, 3, 5, 8, 12)):
    a, b, c, d = neighbours(x)
    act = abs(a - c) + abs(b - c) + abs(d - b)
    return np.searchsorted(np.array(levels), act, side='right') - 1 + 0  # 0..len-1


def dct_bytes(filled, K):
    """U18-codering (i16 bytevlakken, stap max(0,2, max|c|/32767)) + teruggerekende indices (via tabel)."""
    return dctn(filled, norm='ortho')[:K, :K]


NEAR = False


def near_lossless(x, nd, near=1):
    """JPEG-LS-achtig: MED op gereconstrueerde waarden, residu gekwantiseerd in bakken van 2·near+1."""
    H, W = x.shape; rec = np.zeros((H, W), np.int64); out = np.zeros((H, W), np.int64)
    xs = x.tolist()
    for y in range(H):
        for i in range(W):
            a = rec[y, i-1] if i else (rec[y-1, i] if y else 128)
            b = rec[y-1, i] if y else a
            c = rec[y-1, i-1] if (y and i) else b
            p = min(a, b) if c >= max(a, b) else (max(a, b) if c <= min(a, b) else a + b - c)
            e = xs[y][i] - p
            qe = (e + near) // (2 * near + 1) if e >= 0 else -((near - e) // (2 * near + 1))
            if nd[y, i]: qe = 0; rec[y, i] = x[y, i]
            else: rec[y, i] = min(254, max(0, p + qe * (2 * near + 1)))
            out[y, i] = qe
    assert (abs(rec - x)[~nd] <= near).all()
    return out


def companion(path, field):
    import os, re
    d, name = os.path.split(path)
    pat = re.sub(r'-g[0-9a-f]+\.mrf$', '-g*.mrf', name.replace('feels_like_c', field))
    hits = glob.glob(os.path.join(d, pat))
    return read(hits[0]) if hits else None


def feels_formula(T, RH, u, v):
    """Zelfde formule als de ingest (docs/fields.md), f64, op 6-km-gemiddelden."""
    w = np.hypot(u, v)
    wf = np.power(np.maximum(w, 1e-9) * 3.6, 0.16)
    chill = np.where(w < 1.3, T, 13.12 + 0.6215 * T - 11.37 * wf + 0.3965 * T * wf)
    e = np.clip(RH, 0, 1) * 6.105 * np.exp(17.27 * T / (237.7 + T))
    at = T + 0.33 * e - 0.70 * w - 4.0
    b = np.clip((T - 10) / 5, 0, 1)
    return chill * (1 - b) + at * b


def run_cross(paths):
    rows = {}
    add = lambda key, v: rows.setdefault(key, []).append(v)
    for path in paths:
        comp = {f: companion(path, f) for f in ('temp_c', 'rel_humidity', 'wind_u_ms', 'wind_v_ms')}
        if any(c is None for c in comp.values()): continue
        h, fr = read(path)
        tq = np.array([np.nan if v is None else v for v in h['quant']])
        rq = np.array([np.nan if v is None else v for v in comp['rel_humidity'][0]['quant']])
        wq = np.array([np.nan if v is None else v for v in comp['wind_u_ms'][0]['quant']])
        for i, (_, idx, n) in enumerate(fr):
            H, W = idx.shape
            nd = idx == 255; m = maskbytes(idx)
            add('bitmap (productie)', n)
            ti = comp['temp_c'][1][i][1]; hi = comp['rel_humidity'][1][i][1]
            ui = comp['wind_u_ms'][1][i][1]; vi = comp['wind_v_ms'][1][i][1]
            rows_ = np.minimum((3 * np.arange(H) + 1) // 8, hi.shape[0] - 1)
            cols_ = np.minimum((3 * np.arange(W) + 1) // 8, hi.shape[1] - 1)
            rh = rq[hi][np.ix_(rows_, cols_)] / 100
            x = fill_nearest(idx)
            d = x - fill_nearest(ti); d[nd] = 0
            add('X feels-temp int8', zlen(m, (d & 0xff).astype(np.uint8).tobytes()))
            dm = d - predict(d + 128, 'med') + 128; dm[nd] = 0
            add('X med(feels-temp) int8', zlen(m, (dm & 0xff).astype(np.uint8).tobytes()))
            f = feels_formula(tq[ti], rh, wq[ui], wq[vi])
            pi = np.clip(np.round((f - tq[0]) / 0.3), 0, 254)
            pi = np.where(np.isnan(pi), x, pi).astype(np.int32)
            r = x - pi; r[nd] = 0
            add('X feels-formule int8', zlen(m, (r & 0xff).astype(np.uint8).tobytes()))
            rv = r.ravel()[~nd.ravel()]
            add('X feels-formule order0-coder', len(Z.compress(m)) + adaptive_cost(zz(rv), np.zeros_like(rv), 1))
            rm = r - predict(r + 128, 'med') + 128; rm[nd] = 0
            add('X med(feels-formule) int8', zlen(m, (rm & 0xff).astype(np.uint8).tobytes()))
            add('  |residu formule| p50/p99/max', 0)
            rows.setdefault('_res', []).append(np.abs(rv))
    res = np.concatenate(rows.pop('_res'))
    base = np.mean(rows['bitmap (productie)'])
    print(f"residu formule: p50 {np.percentile(res,50)}, p90 {np.percentile(res,90)}, p99 {np.percentile(res,99)}, max {res.max()}, 0: {np.mean(res==0)*100:.1f} %")
    for key, v in rows.items():
        v = np.array(v, dtype=float)
        print(f'{key:34s} {v.mean():9.0f} B/frame  {v.mean() / base * 100:6.1f} %   (n {len(v)})')


def run(paths):
    rows = {}
    frames = []
    for path in paths:
        h, fr = read(path)
        q = np.array([np.nan if v is None else v for v in h['quant']], dtype=np.float64)
        frames.append((path.split('/')[-1], q, [f for _, f, _ in fr], [n for _, _, n in fr]))
    add = lambda key, v: rows.setdefault(key, []).append(v)
    for name, q, fs, lens in frames:
        prev = None
        for i, idx in enumerate(fs):
            H, W = idx.shape
            m = maskbytes(idx)
            add('bitmap (productie)', lens[i])
            add('bitmap zstd-19 opnieuw', zlen(idx.tobytes()))
            x = fill_nearest(idx)
            nd = idx == 255
            for how in ('left', 'avg', 'grad', 'med', 'paeth', 'avg4'):
                r = (x - predict(x, how)); r[nd] = 0
                add(f'P {how} int8', len(m) and zlen(m, (r & 0xff).astype(np.uint8).tobytes()))
                if how == 'med':
                    add('P med zigzag', zlen(m, zz(r).astype(np.uint8).tobytes()))
                    rv = r.ravel()[~nd.ravel()]
                    add('P med ctx-coder (schatting)', len(Z.compress(m)) + adaptive_cost(zz(rv), activity_ctx(x).ravel()[~nd.ravel()], 7))
                    add('P med order0-coder (schatting)', len(Z.compress(m)) + adaptive_cost(zz(rv), np.zeros_like(rv), 1))
            if prev is not None:
                t = x - prev; t[nd] = 0
                add('T frame-delta int8', zlen(m, (t & 0xff).astype(np.uint8).tobytes()))
                rm = x - predict(x, 'med'); rp = prev - predict(prev, 'med'); tr = rm - rp; tr[nd] = 0
                add('T med-residu-delta int8', zlen(m, (tr & 0xff).astype(np.uint8).tobytes()))
                tm = t - predict(t + 128, 'med') + 128; tm[nd] = 0
                add('T med op frame-delta int8', zlen(m, (tm & 0xff).astype(np.uint8).tobytes()))
                tv = tm.ravel()[~nd.ravel()]
                add('T med op frame-delta ctx-coder', len(Z.compress(m)) + adaptive_cost(zz(tv), activity_ctx(t + 128).ravel()[~nd.ravel()], 7))
            prev = x
            if NEAR:
                rn = near_lossless(x, nd)
                add('NL1 med int8 (|fout| <= 1 index)', zlen(m, (rn & 0xff).astype(np.uint8).tobytes()))
                rv = rn.ravel()[~nd.ravel()]
                add('NL1 med ctx-coder (schatting)', len(Z.compress(m)) + adaptive_cost(zz(rv), np.zeros_like(rv), 1))
            # R: DCT K + residu op tabelniveau
            vals = q[np.minimum(x, 254)]
            for K in (16, 32, 64):
                C = dctn(vals, norm='ortho')
                c = np.zeros_like(C); c[:K, :K] = C[:K, :K]
                step = max(0.2, float(np.abs(c).max()) / 32767)
                qi = np.round(c[:K, :K] / step).astype('<i2')
                cb = Z.compress(qi.view(np.uint8).reshape(-1, 2).T.copy().tobytes())
                c[:K, :K] = qi * step
                rec = idctn(c, norm='ortho')
                ri = np.clip(np.round((rec - q[0]) / 0.3).astype(np.int32), 0, 254)  # tabel is lineair, stap 0,3
                r = x - ri; r[nd] = 0
                add(f'R dct{K} + residu', len(cb) + zlen(m, (r & 0xff).astype(np.uint8).tobytes()))
                if K == 64:
                    rm = r - predict(r + 128, 'med') + 128; rm[nd] = 0
                    add(f'R dct{K} + med(residu)', len(cb) + zlen(m, (rm & 0xff).astype(np.uint8).tobytes()))
    base = np.mean(rows['bitmap (productie)'])
    n = len(rows['bitmap (productie)'])
    print(f'{n} frames uit {len(frames)} chunks')
    for key, v in rows.items():
        v = np.array(v, dtype=float)
        print(f'{key:34s} {v.mean():9.0f} B/frame  {v.mean() / base * 100:6.1f} %   (min {v.min():.0f}, max {v.max():.0f}, n {len(v)})')


if __name__ == '__main__':
    NEAR = '--near' in sys.argv
    paths = sorted(p for d in sys.argv[1:] if not d.startswith('--') for p in glob.glob(f'{d}/*feels_like_c*.mrf'))
    (run_cross if '--cross' in sys.argv else run)(paths)
