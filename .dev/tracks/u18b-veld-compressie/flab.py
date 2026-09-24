"""U18b lab (weggooi): zelfstandige reëelwaardige voorspellers met fractiecontext."""
import sys, glob, numpy as np
from measure import read, fill_nearest, neighbours, zz, adaptive_cost, maskbytes, Z
paths = sorted(p for d in sys.argv[1:] for p in glob.glob(f'{d}/*feels_like_c*.mrf'))
res = {}
def add(k, v): res.setdefault(k, []).append(v)
for path in paths:
    h, fr = read(path)
    for _, idx, n in fr[::3]:
        add('bitmap', n); nd = idx == 255; keep = ~nd.ravel(); m = len(Z.compress(maskbytes(idx)))
        x = fill_nearest(idx); a, b, c, d = neighbours(x)
        act = abs(a - c) + abs(b - c) + abs(d - b)
        A = np.searchsorted([0, 1, 2, 3, 5, 8, 12], act, side='right') - 1
        for name, num, den in (('(a+b)/2', a + b, 2), ('(3a+3b-2c+d)/5', 3*a + 3*b - 2*c + d, 5), ('(2a+2b-c+d)/4', 2*a + 2*b - c + d, 4), ('a+b-c/2+(d-c)/2... (a+b+d-c)/2', a + b + d - c, 2)):
            # afronden naar dichtstbijzijnde; frac = rest in 1/den
            p = np.floor_divide(2 * num + den, 2 * den); frac = num - p * den  # in [-den/2, den/2)
            r = x - p; s = zz(r).ravel()[keep]
            add(f'{name} act', m + adaptive_cost(s, A.ravel()[keep], 7))
            F = (frac + den).ravel()[keep] % den if den > 1 else np.zeros(keep.sum(), int)
            add(f'{name} act×frac', m + adaptive_cost(s, (A.ravel()[keep] * den + F), 7 * den))
base = np.mean(res['bitmap'])
for k, v in res.items(): print(f'{k:40s} {np.mean(v):8.0f}  {np.mean(v)/base*100:5.1f} %  n {len(v)}')
