"""U18b lab (weggooi): formule-residu met contexten."""
import sys, glob, numpy as np
from measure import read, fill_nearest, predict, neighbours, zz, adaptive_cost, maskbytes, Z, companion, feels_formula
paths = sorted(glob.glob(f'{sys.argv[1]}/*feels_like_c*.mrf'))
res = {}
def add(k, v): res.setdefault(k, []).append(v)
for path in paths:
    comp = {f: companion(path, f) for f in ('temp_c', 'rel_humidity', 'wind_u_ms', 'wind_v_ms')}
    h, fr = read(path)
    tq = np.array([np.nan if v is None else v for v in h['quant']]); rq = np.array([np.nan if v is None else v for v in comp['rel_humidity'][0]['quant']]); wq = np.array([np.nan if v is None else v for v in comp['wind_u_ms'][0]['quant']])
    for i, (_, idx, n) in enumerate(fr):
        H, W = idx.shape; add('bitmap', n)
        nd = idx == 255; keep = ~nd.ravel(); m = len(Z.compress(maskbytes(idx)))
        ti = comp['temp_c'][1][i][1]; hi = comp['rel_humidity'][1][i][1]; ui = comp['wind_u_ms'][1][i][1]; vi = comp['wind_v_ms'][1][i][1]
        rh = rq[hi][np.ix_(np.minimum((3*np.arange(H)+1)//8, hi.shape[0]-1), np.minimum((3*np.arange(W)+1)//8, hi.shape[1]-1))] / 100
        x = fill_nearest(idx)
        f = feels_formula(tq[ti], rh, wq[ui], wq[vi])
        pf = np.where(np.isnan(f), x, np.clip(np.round((f - tq[0]) / 0.3), 0, 254)).astype(np.int32)
        r = x - pf
        ra = np.zeros_like(r); ra[:, 1:] = abs(r[:, :-1]); rb = np.zeros_like(r); rb[1:] = abs(r[:-1])
        sa = np.zeros_like(r); sa[:, 1:] = np.sign(r[:, :-1]); sb = np.zeros_like(r); sb[1:] = np.sign(r[:-1])
        add('formule order0', m + adaptive_cost(zz(r).ravel()[keep], np.zeros(keep.sum(), int), 1))
        e = np.minimum(ra + rb, 5); add('formule ctx |ra|+|rb|', m + adaptive_cost(zz(r).ravel()[keep], e.ravel()[keep], 6))
        c9 = (sa + 1) * 3 + (sb + 1); add('formule ctx tekens', m + adaptive_cost(zz(r).ravel()[keep], c9.ravel()[keep], 9))
        c = np.minimum(ra + rb, 3) * 9 + c9; add('formule ctx tekens+energie', m + adaptive_cost(zz(r).ravel()[keep], c.ravel()[keep], 36))
        # frac-context: waar zat de formulewaarde tussen twee indices (onzekerheid)
        fr_ = np.where(np.isnan(f), 0.5, (f - tq[0]) / 0.3 - np.floor((f - tq[0]) / 0.3))
        fq = np.minimum((fr_ * 4).astype(int), 3)
        c2 = c9 * 4 + fq; add('formule ctx tekens+frac', m + adaptive_cost(zz(r).ravel()[keep], c2.ravel()[keep], 36))
base = np.mean(res['bitmap'])
for k, v in res.items(): print(f'{k:28s} {np.mean(v):8.0f}  {np.mean(v)/base*100:5.1f} %  n {len(v)}')
