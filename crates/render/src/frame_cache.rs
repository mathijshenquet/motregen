//! Content-addressed frames across bot generations (MIP-37).

use anyhow::{Context, Result};
use render_core::constants::constants;
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, SystemTime},
};

pub type Identity = [u8; 32];

/// A source frame's identity, and whether its product is replaced every few minutes (nowcast, seamless): a frame
/// built on such a source never comes back in a later generation, so it is not worth writing (MIP-37).
#[derive(Clone, Copy)]
pub struct Source {
    pub identity: Identity,
    pub volatile: bool,
}

/// Bump when the meaning of a key or the layout of a cache file changes.
const SCHEMA: &[u8] = b"motregen-frame-cache-1";
const ZSTD_LEVEL: i32 = 1;
/// Stills sit on a 10-minute grid around "now" while generations step 5 minutes, so a frame
/// often comes back two generations later; keep unused files a few generations long.
const RETENTION: Duration = Duration::from_secs(20 * 60);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Key(Identity);

impl Key {
    pub fn hex(&self) -> String {
        self.0.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}

pub struct KeyBuilder {
    hasher: blake3::Hasher,
    sources: Vec<Identity>,
    cacheable: bool,
    volatile: bool,
}

impl KeyBuilder {
    pub fn number(&mut self, value: i64) -> &mut Self {
        self.hasher.update(&value.to_le_bytes());
        self
    }

    pub fn real(&mut self, value: f64) -> &mut Self {
        self.hasher.update(&value.to_le_bytes());
        self
    }

    pub fn flag(&mut self, value: bool) -> &mut Self {
        self.hasher.update(&[u8::from(value)]);
        self
    }

    pub fn bytes(&mut self, value: &[u8]) -> &mut Self {
        self.hasher.update(&(value.len() as u64).to_le_bytes());
        self.hasher.update(value);
        self
    }

    pub fn reals(&mut self, values: &[f32]) -> &mut Self {
        self.hasher.update(&(values.len() as u64).to_le_bytes());
        for value in values {
            self.hasher.update(&value.to_le_bytes());
        }
        self
    }

    /// A source frame the output may read; one without an identity makes the frame uncacheable.
    pub fn source(&mut self, source: Option<Source>) -> &mut Self {
        match source {
            Some(source) => {
                self.hasher.update(&source.identity);
                self.sources.push(source.identity);
                self.volatile |= source.volatile;
            }
            None => self.cacheable = false,
        }
        self
    }

    /// Another key this frame depends on as a whole (a Lucht cloud hour); its sources are checked on their own.
    pub fn include(&mut self, other: &Prediction) -> &mut Self {
        self.hasher.update(&other.key.0);
        self.volatile |= other.volatile;
        self
    }

    pub fn finish(self) -> Option<Prediction> {
        self.cacheable.then(|| Prediction {
            key: Key(*self.hasher.finalize().as_bytes()),
            sources: self.sources.into_iter().collect(),
            volatile: self.volatile,
        })
    }
}

/// A key plus the source frames it was derived from, to check what rendering actually read.
pub struct Prediction {
    pub key: Key,
    sources: HashSet<Identity>,
    pub volatile: bool,
}

#[derive(Clone, Copy)]
pub struct Parts {
    pub rgb: bool,
    pub still: bool,
    pub state: bool,
}

pub struct Hit {
    pub rgb: Option<Vec<u8>>,
    pub state: Option<Vec<u8>>,
}

#[derive(Debug, Default, Serialize)]
pub struct Report {
    pub reused_frames: usize,
    pub rendered_frames: usize,
    pub uncacheable_frames: usize,
    /// Rendered but not written: they read nowcast or seamless data.
    pub volatile_frames: usize,
    pub mismatches: usize,
    pub written_bytes: u64,
    pub read_bytes: u64,
    pub removed_files: usize,
    pub resumed_chain: bool,
}

pub struct FrameCache {
    directory: PathBuf,
    base: Identity,
    limit_bytes: u64,
    used: Mutex<HashSet<String>>,
}

impl FrameCache {
    pub fn open(directory: &Path, basemap_directory: &Path, limit_bytes: u64) -> Result<Self> {
        fs::create_dir_all(directory)?;
        let mut hasher = blake3::Hasher::new();
        hasher.update(SCHEMA);
        let executable = std::env::current_exe().context("Renderer executable for cache key")?;
        hasher.update(blake3::hash(&fs::read(&executable)?).as_bytes());
        let mut assets: Vec<_> = fs::read_dir(basemap_directory)?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<_, _>>()?;
        assets.sort();
        for path in assets.iter().filter(|path| path.is_file()) {
            hasher.update(path.file_name().unwrap().as_encoded_bytes());
            hasher.update(blake3::hash(&fs::read(path)?).as_bytes());
        }
        let size = &constants().size;
        hasher.update(&(size.width as u64).to_le_bytes());
        hasher.update(&(size.height as u64).to_le_bytes());
        Ok(Self {
            directory: directory.into(),
            base: *hasher.finalize().as_bytes(),
            limit_bytes,
            used: Mutex::default(),
        })
    }

    pub fn mode(&self, mode: &'static str) -> ModeCache<'_> {
        ModeCache {
            cache: self,
            mode,
            reused: AtomicUsize::new(0),
            rendered: AtomicUsize::new(0),
            uncacheable: AtomicUsize::new(0),
            volatile: AtomicUsize::new(0),
            mismatches: AtomicUsize::new(0),
            written: AtomicU64::new(0),
            read: AtomicU64::new(0),
            resumed_chain: Mutex::new(false),
        }
    }

    fn use_file(&self, name: String) -> Result<()> {
        self.used
            .lock()
            .map_err(|_| anyhow::anyhow!("Frame cache panicked"))?
            .insert(name);
        Ok(())
    }

    fn write_atomic(&self, name: &str, bytes: &[u8]) -> Result<u64> {
        let mut temporary = tempfile::Builder::new()
            .prefix(".tmp-")
            .tempfile_in(&self.directory)?;
        temporary.write_all(bytes)?;
        temporary
            .persist(self.directory.join(name))
            .map_err(|error| error.error)?;
        Ok(bytes.len() as u64)
    }

    /// Evict least recently used files (hits refresh their mtime) until the cache fits its limit.
    fn enforce_limit(&self) -> Result<usize> {
        let used = self
            .used
            .lock()
            .map_err(|_| anyhow::anyhow!("Frame cache panicked"))?
            .clone();
        let mut files = Vec::new();
        let mut total = 0;
        for entry in fs::read_dir(&self.directory)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            if !metadata.is_file() {
                continue;
            }
            total += metadata.len();
            files.push((metadata.modified()?, metadata.len(), entry.file_name()));
        }
        files.sort();
        let mut removed = 0;
        for (_, bytes, name) in files {
            if total <= self.limit_bytes {
                break;
            }
            if used.contains(name.to_string_lossy().as_ref()) {
                continue;
            }
            remove_if_present(&self.directory.join(&name))?;
            total -= bytes;
            removed += 1;
        }
        Ok(removed)
    }
}

pub struct ModeCache<'a> {
    cache: &'a FrameCache,
    mode: &'static str,
    reused: AtomicUsize,
    rendered: AtomicUsize,
    uncacheable: AtomicUsize,
    volatile: AtomicUsize,
    mismatches: AtomicUsize,
    written: AtomicU64,
    read: AtomicU64,
    resumed_chain: Mutex<bool>,
}

impl ModeCache<'_> {
    pub fn key(&self) -> KeyBuilder {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.cache.base);
        hasher.update(self.mode.as_bytes());
        KeyBuilder {
            hasher,
            sources: Vec::new(),
            cacheable: true,
            volatile: false,
        }
    }

    fn name(&self, key: Key, extension: &str) -> String {
        format!("{}-{}.{extension}", self.mode, key.hex())
    }

    fn path(&self, name: &str) -> PathBuf {
        self.cache.directory.join(name)
    }

    /// Reads the small parts of a stored frame; a missing or unreadable part makes it a miss.
    pub fn lookup(&self, key: Key, parts: Parts) -> Result<Option<Hit>> {
        let mut names = Vec::new();
        let mut read = |extension: &str| -> Option<Vec<u8>> {
            let name = self.name(key, extension);
            let bytes = fs::read(self.path(&name)).ok()?;
            names.push(name);
            Some(bytes)
        };
        let rgb = if parts.rgb {
            let Some(bytes) = read("rgb") else {
                return Ok(None);
            };
            Some(bytes)
        } else {
            None
        };
        let state = if parts.state {
            let Some(bytes) = read("state") else {
                return Ok(None);
            };
            Some(bytes)
        } else {
            None
        };
        if parts.still {
            let name = self.name(key, "jpg");
            if !self.path(&name).is_file() {
                return Ok(None);
            }
            names.push(name);
        }
        let now = SystemTime::now();
        for name in names {
            if let Ok(file) = File::options().append(true).open(self.path(&name)) {
                let _ = file.set_modified(now);
            }
            self.cache.use_file(name)?;
        }
        self.read.fetch_add(
            (rgb.as_ref().map_or(0, Vec::len) + state.as_ref().map_or(0, Vec::len)) as u64,
            Ordering::Relaxed,
        );
        self.reused.fetch_add(1, Ordering::Relaxed);
        Ok(Some(Hit { rgb, state }))
    }

    pub fn restore(&self, key: Key, compressed: &[u8]) -> Result<Vec<u8>> {
        let size = &constants().size;
        let rgb = zstd::bulk::decompress(compressed, size.width * size.height * 3);
        match rgb {
            Ok(rgb) if rgb.len() == size.width * size.height * 3 => Ok(rgb),
            _ => {
                remove_if_present(&self.path(&self.name(key, "rgb")))?;
                anyhow::bail!("Corrupt cached frame {} removed", key.hex())
            }
        }
    }

    pub fn copy_still(&self, key: Key, destination: &Path) -> Result<u64> {
        let source = self.path(&self.name(key, "jpg"));
        if fs::hard_link(&source, destination).is_err() {
            fs::copy(&source, destination)?;
        }
        let bytes = fs::metadata(destination)?.len();
        self.read.fetch_add(bytes, Ordering::Relaxed);
        Ok(bytes)
    }

    /// Stores the parts of a freshly rendered frame that are not on disk yet; volatile frames are skipped.
    pub fn store(
        &self,
        prediction: &Prediction,
        rgb: Option<&[u8]>,
        still: Option<&Path>,
        state: Option<&[u8]>,
    ) -> Result<()> {
        if prediction.volatile {
            return Ok(());
        }
        let key = prediction.key;
        let mut written = 0;
        if let Some(rgb) = rgb {
            let name = self.name(key, "rgb");
            if !self.path(&name).is_file() {
                let mut compressor = zstd::bulk::Compressor::new(ZSTD_LEVEL)?;
                compressor.include_checksum(true)?;
                written += self.cache.write_atomic(&name, &compressor.compress(rgb)?)?;
            }
            self.cache.use_file(name)?;
        }
        if let Some(still) = still {
            let name = self.name(key, "jpg");
            if !self.path(&name).is_file() {
                written += self.cache.write_atomic(&name, &fs::read(still)?)?;
            }
            self.cache.use_file(name)?;
        }
        if let Some(state) = state {
            let name = self.name(key, "state");
            if !self.path(&name).is_file() {
                written += self.cache.write_atomic(&name, state)?;
            }
            self.cache.use_file(name)?;
        }
        self.written.fetch_add(written, Ordering::Relaxed);
        Ok(())
    }

    pub fn rendered(&self, prediction: Option<&Prediction>) {
        self.rendered.fetch_add(1, Ordering::Relaxed);
        match prediction {
            None => self.uncacheable.fetch_add(1, Ordering::Relaxed),
            Some(prediction) if prediction.volatile => {
                self.volatile.fetch_add(1, Ordering::Relaxed)
            }
            Some(_) => 0,
        };
    }

    /// True when rendering read only source frames that the key covers.
    pub fn verify(&self, prediction: &Prediction, touched: &[Option<Identity>]) -> bool {
        let covered = touched.iter().all(|identity| {
            identity
                .as_ref()
                .is_some_and(|identity| prediction.sources.contains(identity))
        });
        if !covered {
            self.mismatches.fetch_add(1, Ordering::Relaxed);
        }
        covered
    }

    fn chain_name(&self) -> String {
        format!("{}-chain.json", self.mode)
    }

    /// The label state after `epoch` in the last completed generation of this mode.
    pub fn chain_state(&self, epoch: i64) -> Result<Option<Vec<u8>>> {
        let Ok(bytes) = fs::read(self.path(&self.chain_name())) else {
            return Ok(None);
        };
        let Ok(chain) = serde_json::from_slice::<BTreeMap<i64, String>>(&bytes) else {
            return Ok(None);
        };
        let Some(key) = chain.get(&epoch) else {
            return Ok(None);
        };
        let state = fs::read(self.path(&format!("{}-{key}.state", self.mode))).ok();
        if state.is_some() {
            *self
                .resumed_chain
                .lock()
                .map_err(|_| anyhow::anyhow!("Frame cache panicked"))? = true;
        }
        Ok(state)
    }

    /// Records this generation's chain, then removes this mode's files that no recent generation used.
    pub fn finish(&self, chain: &[(i64, Key)]) -> Result<Report> {
        if !chain.is_empty() {
            let index: BTreeMap<i64, String> = chain
                .iter()
                .map(|(epoch, key)| (*epoch, key.hex()))
                .collect();
            self.cache
                .write_atomic(&self.chain_name(), &serde_json::to_vec(&index)?)?;
        }
        self.cache.use_file(self.chain_name())?;
        let used = self
            .cache
            .used
            .lock()
            .map_err(|_| anyhow::anyhow!("Frame cache panicked"))?
            .clone();
        let prefix = format!("{}-", self.mode);
        let now = SystemTime::now();
        let mut removed = 0;
        for entry in fs::read_dir(&self.cache.directory)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let stale_temporary = name.starts_with(".tmp-");
            if !(name.starts_with(&prefix) || stale_temporary) || used.contains(&name) {
                continue;
            }
            let age = now
                .duration_since(entry.metadata()?.modified()?)
                .unwrap_or_default();
            if age > RETENTION {
                remove_if_present(&entry.path())?;
                removed += 1;
            }
        }
        removed += self.cache.enforce_limit()?;
        let report = Report {
            reused_frames: self.reused.load(Ordering::Relaxed),
            rendered_frames: self.rendered.load(Ordering::Relaxed),
            uncacheable_frames: self.uncacheable.load(Ordering::Relaxed),
            volatile_frames: self.volatile.load(Ordering::Relaxed),
            mismatches: self.mismatches.load(Ordering::Relaxed),
            written_bytes: self.written.load(Ordering::Relaxed),
            read_bytes: self.read.load(Ordering::Relaxed),
            removed_files: removed,
            resumed_chain: *self
                .resumed_chain
                .lock()
                .map_err(|_| anyhow::anyhow!("Frame cache panicked"))?,
        };
        Ok(report)
    }
}

fn remove_if_present(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cache() -> (tempfile::TempDir, FrameCache) {
        let directory = tempfile::tempdir().unwrap();
        let basemaps = directory.path().join("basemaps");
        fs::create_dir_all(&basemaps).unwrap();
        fs::write(basemaps.join("light.png"), b"plate").unwrap();
        let cache = FrameCache::open(&directory.path().join("frames"), &basemaps, 1 << 30).unwrap();
        (directory, cache)
    }

    fn rgb(seed: u8) -> Vec<u8> {
        let size = &constants().size;
        (0..size.width * size.height * 3)
            .map(|index| (index as u8).wrapping_mul(seed))
            .collect()
    }

    fn prediction(mode: &ModeCache, epoch: i64, source: Option<Identity>) -> Option<Prediction> {
        let mut key = mode.key();
        key.number(epoch).source(source.map(|identity| Source {
            identity,
            volatile: false,
        }));
        key.finish()
    }

    #[test]
    fn keys_follow_every_input_and_missing_hashes_are_uncacheable() {
        let (_directory, cache) = cache();
        let weather = cache.mode("weather");
        let base = prediction(&weather, 1, Some([1; 32])).unwrap().key;
        assert_eq!(base, prediction(&weather, 1, Some([1; 32])).unwrap().key);
        assert_ne!(base, prediction(&weather, 2, Some([1; 32])).unwrap().key);
        assert_ne!(base, prediction(&weather, 1, Some([2; 32])).unwrap().key);
        assert_ne!(
            base,
            prediction(&cache.mode("wind"), 1, Some([1; 32]))
                .unwrap()
                .key
        );
        assert!(prediction(&weather, 1, None).is_none());
    }

    #[test]
    fn stored_frames_come_back_bytewise_and_are_written_once() {
        let (directory, cache) = cache();
        let weather = cache.mode("weather");
        let stored = prediction(&weather, 1, Some([1; 32])).unwrap();
        let key = stored.key;
        let parts = Parts {
            rgb: true,
            still: true,
            state: true,
        };
        assert!(weather.lookup(key, parts).unwrap().is_none());
        let still = directory.path().join("still.jpg");
        fs::write(&still, b"jpeg").unwrap();
        let frame = rgb(7);
        weather
            .store(&stored, Some(&frame), Some(&still), Some(b"state"))
            .unwrap();
        let written = weather.written.load(Ordering::Relaxed);
        assert!(written > 0 && written < frame.len() as u64);
        weather
            .store(&stored, Some(&frame), Some(&still), Some(b"state"))
            .unwrap();
        assert_eq!(weather.written.load(Ordering::Relaxed), written);
        let hit = weather.lookup(key, parts).unwrap().unwrap();
        assert_eq!(weather.restore(key, &hit.rgb.unwrap()).unwrap(), frame);
        assert_eq!(hit.state.unwrap(), b"state");
        let copy = directory.path().join("copy.jpg");
        weather.copy_still(key, &copy).unwrap();
        assert_eq!(fs::read(copy).unwrap(), b"jpeg");
    }

    #[test]
    fn a_frame_needs_every_requested_part_and_corrupt_pixels_are_removed() {
        let (_directory, cache) = cache();
        let feels = cache.mode("feels");
        let stored = prediction(&feels, 1, Some([1; 32])).unwrap();
        let key = stored.key;
        feels.store(&stored, None, None, Some(b"state")).unwrap();
        let loop_frame = Parts {
            rgb: true,
            still: false,
            state: true,
        };
        assert!(feels.lookup(key, loop_frame).unwrap().is_none());
        fs::write(feels.path(&feels.name(key, "rgb")), b"not zstd").unwrap();
        let hit = feels.lookup(key, loop_frame).unwrap().unwrap();
        assert!(feels.restore(key, &hit.rgb.unwrap()).is_err());
        assert!(feels.lookup(key, loop_frame).unwrap().is_none());
    }

    #[test]
    fn frames_on_nowcast_data_are_rendered_but_not_written() {
        let (_directory, cache) = cache();
        let weather = cache.mode("weather");
        let mut key = weather.key();
        key.source(Some(Source {
            identity: [1; 32],
            volatile: true,
        }));
        let volatile = key.finish().unwrap();
        weather.rendered(Some(&volatile));
        weather.store(&volatile, Some(&rgb(3)), None, None).unwrap();
        let parts = Parts {
            rgb: true,
            still: false,
            state: false,
        };
        assert!(weather.lookup(volatile.key, parts).unwrap().is_none());
        let mut hour = weather.key();
        hour.include(&volatile);
        assert!(hour.finish().unwrap().volatile);
        let report = weather.finish(&[]).unwrap();
        assert_eq!((report.volatile_frames, report.written_bytes), (1, 0));
    }

    #[test]
    fn verification_rejects_frames_that_read_unpredicted_sources() {
        let (_directory, cache) = cache();
        let wind = cache.mode("wind");
        let prediction = prediction(&wind, 1, Some([1; 32])).unwrap();
        assert!(wind.verify(&prediction, &[Some([1; 32]), Some([1; 32])]));
        assert!(!wind.verify(&prediction, &[Some([1; 32]), Some([2; 32])]));
        assert!(!wind.verify(&prediction, &[None]));
        assert_eq!(wind.mismatches.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn the_chain_hands_label_state_to_the_next_generation() {
        let (_directory, cache) = cache();
        let wind = cache.mode("wind");
        let stored = prediction(&wind, 75_000, Some([1; 32])).unwrap();
        let key = stored.key;
        wind.store(&stored, None, None, Some(b"after 75000"))
            .unwrap();
        wind.finish(&[(75_000, key)]).unwrap();
        let next = cache.mode("wind");
        assert_eq!(next.chain_state(75_000).unwrap().unwrap(), b"after 75000");
        assert!(next.chain_state(150_000).unwrap().is_none());
        assert!(next.finish(&[]).unwrap().resumed_chain);
    }

    #[test]
    fn cleanup_keeps_recent_files_and_enforces_the_hard_limit() {
        let (directory, mut cache) = cache();
        let weather = cache.mode("weather");
        let old_prediction = prediction(&weather, 1, Some([1; 32])).unwrap();
        let recent_prediction = prediction(&weather, 2, Some([1; 32])).unwrap();
        let (old, recent) = (old_prediction.key, recent_prediction.key);
        weather
            .store(&old_prediction, Some(&rgb(3)), None, None)
            .unwrap();
        weather
            .store(&recent_prediction, Some(&rgb(5)), None, None)
            .unwrap();
        let old_path = weather.path(&weather.name(old, "rgb"));
        let recent_path = weather.path(&weather.name(recent, "rgb"));
        let stale = SystemTime::now() - Duration::from_secs(3600);
        File::options()
            .append(true)
            .open(&old_path)
            .unwrap()
            .set_modified(stale)
            .unwrap();
        cache.used.lock().unwrap().clear();
        let report = cache.mode("weather").finish(&[]).unwrap();
        assert_eq!(report.removed_files, 1);
        assert!(!old_path.exists() && recent_path.exists());
        cache.used.lock().unwrap().clear();
        cache.limit_bytes = 0;
        cache.mode("weather").finish(&[]).unwrap();
        assert!(!recent_path.exists());
        drop(directory);
    }
}
