"""U18b lab (weggooi): contextmodellen voor het MED-residu, entropieschatting van een adaptieve coder."""
import sys, glob, numpy as np
from measure import read, fill_nearest, predict, neighbours, zz, adaptive_cost, maskbytes, Z, zlen
paths = sorted(p for d in sys.argv[1:] for p in glob.glob(f'{d}/*feels_like_c*.mrf'))
res = {}
def add(k, v): res.setdefault(k, []).append(v)
for path in paths:
    h, fr = read(path)
    for _, idx, n in fr[::3]:
        add('bitmap', n)
        nd = idx == 255; keep = ~nd.ravel()
        x = fill_nearest(idx); m = len(Z.compress(maskbytes(idx)))
        a, b, c, d = neighbours(x)
        for how in ('med', 'avg4'):
            r = x - predict(x, how)
            ra = np.zeros_like(r); ra[:, 1:] = abs(r[:, :-1]); rb = np.zeros_like(r); rb[1:] = abs(r[:-1])
            rc = np.zeros_like(r); rc[1:, 1:] = abs(r[:-1, :-1]); rd = np.zeros_like(r); rd[1:, :-1] = abs(r[:-1, 1:])
            act = abs(a - c) + abs(b - c) + abs(d - b)
            eng = act + 2 * (ra + rb) + rc + rd
            for name, ctx, nctx in (
                ('act7', np.searchsorted([0, 1, 2, 3, 5, 8, 12], act, side='right') - 1, 7),
                ('energy10', np.searchsorted([0, 1, 2, 3, 4, 6, 8, 11, 15, 22], eng, side='right') - 1, 10),
                ('energy16', np.minimum(eng, 15), 16),
            ):
                add(f'{how} {name}', m + adaptive_cost(zz(r).ravel()[keep], ctx.ravel()[keep], nctx))
            # rauw, 255 als waarde, mod 256 (geen masker, geen vulling)
            xr = idx.astype(np.int32); rr = (xr - predict(xr, how)) & 0xff
            add(f'{how} rauw-255 zstd', zlen(rr.astype(np.uint8).tobytes()))
base = np.mean(res['bitmap'])
for k, v in res.items(): print(f'{k:24s} {np.mean(v):8.0f}  {np.mean(v)/base*100:5.1f} %')
