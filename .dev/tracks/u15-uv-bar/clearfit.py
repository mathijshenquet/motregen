# Kalibreer heldere-hemel-UV a·μ^b (evt. seizoensterm) op KNMI uvi_clear.
import h5py,numpy as np,sys,datetime as dt
from scipy.optimize import least_squares
def sinelev(epoch_days, lat, lon):  # port van web/src/core/solar.ts
    r=np.pi/180; d=epoch_days+2440587.5-2451545
    L=(280.460+0.9856474*d)*r; g=(357.528+0.9856003*d)*r
    lam=L+1.915*r*np.sin(g)+0.020*r*np.sin(2*g); eps=(23.439-0.0000004*d)*r
    ra=np.arctan2(np.cos(eps)*np.sin(lam),np.cos(lam)); dec=np.arcsin(np.sin(eps)*np.sin(lam))
    st=(280.46061837+360.98564736629*d)*r; ha=lon*r-(ra-st)
    la=lat*r; return np.sin(la)*np.sin(dec)+np.cos(la)*np.cos(dec)*np.cos(ha)
MU=[];C=[];DOY=[];CY=[]
rng=np.random.default_rng(0)
for F in sys.argv[1:]:
    f=h5py.File(F); p=f['PRODUCT']; day=dt.datetime.strptime(F.split('_')[-1][:8],'%Y%m%d').replace(tzinfo=dt.timezone.utc)
    lat=p['latitude'][:].astype(float); lon=p['longitude'][:].astype(float); LON,LAT=np.meshgrid(lon,lat)
    land=(LAT>50.7)&(LAT<53.6)&(LON>3.3)&(LON<7.3)
    cl=p['uvi_clear'][:]; cy=p['uvi_cloudy'][:]; st=p['status'][:]
    for i,h in enumerate(p['time'][:]):
        e=(day.timestamp()/86400)+float(h)/24; mu=sinelev(e,LAT,LON); m=(cl[i]>=0)&(mu>0)&land
        idx=np.flatnonzero(m); idx=rng.choice(idx,min(len(idx),300),replace=False) if len(idx) else idx
        MU.append(mu.ravel()[idx]); C.append(cl[i].ravel()[idx]); DOY.append(np.full(len(idx),day.timetuple().tm_yday)); CY.append(cy[i].ravel()[idx] if st[i]>0 else np.full(len(idx),-1.0))
mu,c,doy,cy=map(np.concatenate,(MU,C,DOY,CY)); print('n',len(c),'days',len(sys.argv)-1,'max clear',c.max())
def rep(name,pred):
    e=pred-c; print(f'{name:28s} rmse {np.sqrt((e**2).mean()):.3f} bias {e.mean():+.3f} p90 {np.percentile(abs(e),90):.3f} | UV>=3: rmse {np.sqrt((e[c>=3]**2).mean()):.3f} bias {e[c>=3].mean():+.3f}')
rep('madronich 12.5·μ^2.42',12.5*mu**2.42)
rep('madronich ×0.84',0.84*12.5*mu**2.42)
f1=lambda q: q[0]*mu**q[1]
s1=least_squares(lambda q:f1(q)-c,[12,2]).x; rep(f'a·μ^b a={s1[0]:.2f} b={s1[1]:.3f}',f1(s1))
f2=lambda q: q[0]*mu**q[1]*(1+q[2]*np.cos(2*np.pi*(doy-q[3])/365))
s2=least_squares(lambda q:f2(q)-c,[12,2,0.1,80]).x; rep(f'+seizoen c={s2[2]:.3f} d0={s2[3]:.0f}',f2(s2)); print(s2)
for mon in range(4,10):
    m=(doy>=dt.date(2026,mon,1).timetuple().tm_yday)&(doy<dt.date(2026,mon+1,1).timetuple().tm_yday)
    e=f1(s1)[m]-c[m]; print(' maand',mon,'bias a·μ^b %+.3f'%e.mean(),'n',m.sum())
v=cy>=0; print('analyses cloudy>clear+0.1: %.3f'%((cy[v]>c[v]+0.1).mean()))
