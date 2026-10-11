use crate::data::Raster;
use anyhow::Result;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock, Weak, atomic::AtomicUsize},
};

pub type RasterKey = (PathBuf, usize, bool);
pub type Plates = Arc<[Vec<u8>; 2]>;
type RasterSlot = Arc<Mutex<Weak<Raster>>>;

#[derive(Default)]
pub struct Inputs {
    rasters: Mutex<HashMap<RasterKey, RasterSlot>>,
    pub plates: Mutex<Option<Plates>>,
    pub hits: AtomicUsize,
    recent: Mutex<VecDeque<(RasterKey, Arc<Raster>, usize)>>,
}

impl Inputs {
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
        while recent.iter().map(|(_, _, bytes)| bytes).sum::<usize>() > 8 * 1024 * 1024 {
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
