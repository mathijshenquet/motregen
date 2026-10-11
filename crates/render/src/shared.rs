use crate::data::Raster;
use anyhow::Result;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock, Weak, atomic::AtomicUsize},
};

pub type RasterKey = (PathBuf, usize, bool);
pub type Plates = Arc<[Vec<u8>; 2]>;
pub type ProjectedMotion = Arc<Vec<(f64, f64)>>;
pub type MotionKey = (RasterKey, RasterKey);
type RasterSlot = Arc<Mutex<Weak<Raster>>>;

#[derive(Default)]
pub struct Inputs {
    rasters: Mutex<HashMap<RasterKey, RasterSlot>>,
    pub plates: Mutex<Option<Plates>>,
    pub hits: AtomicUsize,
    recent: Mutex<VecDeque<(RasterKey, Arc<Raster>, usize)>>,
    motions: Mutex<VecDeque<(MotionKey, Option<ProjectedMotion>)>>,
    pub motion_hits: AtomicUsize,
}

impl Inputs {
    pub fn projected_motion(
        &self,
        key: MotionKey,
        project: impl FnOnce() -> Result<Option<ProjectedMotion>>,
    ) -> Result<Option<ProjectedMotion>> {
        let mut motions = self
            .motions
            .lock()
            .map_err(|_| anyhow::anyhow!("Shared motion cache panicked"))?;
        if let Some(index) = motions.iter().position(|(cached, _)| *cached == key) {
            let entry = motions.remove(index).unwrap();
            let motion = entry.1.clone();
            motions.push_back(entry);
            self.motion_hits
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Ok(motion);
        }
        // Two full-size fields bound retained memory while the rain and wind timelines diverge.
        if motions.len() == 2 {
            motions.pop_front();
        }
        let motion = project()?;
        motions.push_back((key, motion.clone()));
        Ok(motion)
    }

    pub fn raster_slot(&self, key: RasterKey) -> Result<RasterSlot> {
        let mut rasters = self
            .rasters
            .lock()
            .map_err(|_| anyhow::anyhow!("Shared raster cache panicked"))?;
        rasters.retain(|_, slot| {
            Arc::strong_count(slot) > 1
                || slot
                    .try_lock()
                    .is_ok_and(|raster| raster.strong_count() > 0)
        });
        Ok(Arc::clone(rasters.entry(key).or_default()))
    }

    pub fn retain_rain(&self, key: &RasterKey, raster: &Arc<Raster>) -> Result<()> {
        if raster.coverage.is_none() {
            return Ok(());
        }
        let bytes = raster.values.len()
            + raster.quant.len() * std::mem::size_of::<Option<f32>>()
            + (raster.grid.width.div_ceil(8) + 1) * (raster.grid.height.div_ceil(8) + 1) * 4;
        let mut recent = self
            .recent
            .lock()
            .map_err(|_| anyhow::anyhow!("Shared rain cache panicked"))?;
        recent.retain(|(cached, _, _)| cached != key);
        recent.push_back((key.clone(), Arc::clone(raster), bytes));
        while recent.iter().map(|(_, _, bytes)| bytes).sum::<usize>() > 4 * 1024 * 1024 {
            recent.pop_front();
        }
        Ok(())
    }
}

static INPUTS: OnceLock<Inputs> = OnceLock::new();

pub fn enable() -> &'static Inputs {
    INPUTS.get_or_init(Inputs::default)
}

pub fn inputs() -> Option<&'static Inputs> {
    INPUTS.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn motion_cache_reuses_fields_and_missing_motion_with_bounded_retention() {
        let inputs = Inputs::default();
        let key = |index| {
            (
                (PathBuf::from("rain"), index, true),
                (PathBuf::from("rain"), index + 1, true),
            )
        };
        let first = inputs
            .projected_motion(key(0), || Ok(Some(Arc::new(vec![(1.0, 2.0)]))))
            .unwrap()
            .unwrap();
        let hit = inputs
            .projected_motion(key(0), || panic!("Repeated projection"))
            .unwrap()
            .unwrap();
        assert!(Arc::ptr_eq(&first, &hit));
        assert!(
            inputs
                .projected_motion(key(1), || Ok(None))
                .unwrap()
                .is_none()
        );
        assert!(
            inputs
                .projected_motion(key(1), || panic!("Repeated missing motion lookup"))
                .unwrap()
                .is_none()
        );
        inputs.projected_motion(key(2), || Ok(None)).unwrap();
        let fresh = inputs
            .projected_motion(key(0), || Ok(Some(Arc::new(vec![(1.0, 2.0)]))))
            .unwrap()
            .unwrap();
        assert!(!Arc::ptr_eq(&first, &fresh));
        assert_eq!(
            inputs
                .motion_hits
                .load(std::sync::atomic::Ordering::Relaxed),
            2
        );
        assert_eq!(inputs.motions.lock().unwrap().len(), 2);
    }
}
