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
    pub fn source(&mut self, identity: Option<Identity>) -> &mut Self {
        match identity {
            Some(identity) => {
                self.hasher.update(&identity);
                self.sources.push(identity);
            }
            None => self.cacheable = false,
        }
        self
    }

    pub fn finish(self) -> Option<Prediction> {
        self.cacheable.then(|| Prediction {
            key: Key(*self.hasher.finalize().as_bytes()),
            sources: self.sources.into_iter().collect(),
        })
    }
}

/// A key plus the source frames it was derived from, to check what rendering actually read.
pub struct Prediction {
    pub key: Key,
    sources: HashSet<Identity>,
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

    /// Stores the parts of a freshly rendered frame that are not on disk yet.
    pub fn store(
        &self,
        key: Key,
        rgb: Option<&[u8]>,
        still: Option<&Path>,
        state: Option<&[u8]>,
    ) -> Result<()> {
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
        if prediction.is_none() {
            self.uncacheable.fetch_add(1, Ordering::Relaxed);
        }
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
            let index: BTreeMap<i64, String> =
                chain.iter().map(|(epoch, key)| (*epoch, key.hex())).collect();
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
