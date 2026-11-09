//! MIP-40: puntreeksen per regio. Per groep (radar, harmonie, extra, ecmwf) en per regio één bestand met de
//! reeksen van alle gridcellen die een plek in die regio leest, zodat de client zijn histogram, tabel en dagen
//! niet meer uit hele rasters hoeft te decoderen. Formaat en manifestsectie: `docs/regiobestanden.md`.

use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::publisher::{ProducedChunk, set_public_permissions};

pub const FORMAT_VERSION: u32 = 1;
pub const MAGIC: [u8; 4] = *b"mrr1";
pub const DIRECTORY: &str = "regions";
pub const DEFAULT_ZSTD_LEVEL: i32 = 19;
/// Het histogram leest regen als patch van WARP_CAP_CELLS + 2 cellen rond de plek (`rain-point-detail.ts`).
pub const RAIN_MARGIN_CELLS: u32 = 17;
/// Bilineair lezen (ECMWF en de dagvelden) heeft het naburige celmidden nodig.
pub const FIELD_MARGIN_CELLS: u32 = 1;
const DISK_BLOCK_BYTES: u64 = 4096;

/// Welke cellen en extra's een regiobestand meekrijgt. `PATCH` is het ontwerp van fase 1 (de client rekent de
/// tussenbalken uit een regenpatch met beweging); `CELL` is de server-side variant (PO 2026-11-09): alleen de eigen
/// cellen, met de tussenbalken van de HARMONIE-regen per cel al uitgerekend.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Layout {
    /// Regenrand voor de radarbronnen; die hebben nooit tussenbalken (frames 5–10 min uit elkaar), behalve het
    /// overgangspaar seamless→HARMONIE.
    pub radar_rain_margin: u32,
    pub rain_margin: u32,
    pub field_margin: u32,
    /// ECMWF leest de client bilineair (`pointValueBilinear`), de rest met de dichtstbijzijnde cel.
    pub ecmwf_margin: u32,
    pub motion: bool,
    pub between: Option<BetweenPrecision>,
}

/// Opslag van een tussenwaarde: de gemengde byte afgerond (u8) of in 1/256 byte (u16 LE).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BetweenPrecision {
    U8,
    U16,
    /// Afgeronde byte min de afgeronde lineaire interpolatie van de eigen cel (i8): nul zonder beweging.
    Delta,
}

impl Layout {
    pub const PATCH: Layout = Layout {
        radar_rain_margin: RAIN_MARGIN_CELLS,
        rain_margin: RAIN_MARGIN_CELLS,
        field_margin: FIELD_MARGIN_CELLS,
        ecmwf_margin: FIELD_MARGIN_CELLS,
        motion: true,
        between: None,
    };
    pub const CELL: Layout = Layout {
        radar_rain_margin: 0,
        rain_margin: 0,
        field_margin: 0,
        ecmwf_margin: FIELD_MARGIN_CELLS,
        motion: false,
        between: Some(BetweenPrecision::U16),
    };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Group {
    Radar,
    Harmonie,
    Extra,
    Ecmwf,
}

impl Group {
    pub const ALL: [Group; 4] = [Group::Radar, Group::Harmonie, Group::Extra, Group::Ecmwf];

    pub fn name(self) -> &'static str {
        match self {
            Group::Radar => "radar",
            Group::Harmonie => "harmonie",
            Group::Extra => "extra",
            Group::Ecmwf => "ecmwf",
        }
    }

    /// Groepen naar verversingsritme: radar elke 5 min, HARMONIE elk uur, UV en ICON-D2 op eigen ritme, ECMWF 2× per dag.
    /// Luchtdruk (alleen isobaren op de kaart) en luchtvochtigheid leest geen puntlezer van de client.
    pub fn of(source: &str, field: &str) -> Option<Group> {
        if matches!(field, "pressure_hpa" | "rel_humidity") {
            return None;
        }
        match source {
            "rtcor" | "nowcast" | "seamless" => Some(Group::Radar),
            "harmonie" => Some(Group::Harmonie),
            "uv" | "icon_d2" => Some(Group::Extra),
            "ecmwf" => Some(Group::Ecmwf),
            _ => None,
        }
    }
}

/// Het regioraster over het NL+VL-kader (EPSG:3857), met de regio's die een plaats bevatten (`regions/land.json`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RegionGrid {
    pub west: f64,
    pub east: f64,
    pub north: f64,
    pub south: f64,
    pub columns: u32,
    pub rows: u32,
    pub present: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bounds {
    pub west: f64,
    pub east: f64,
    pub north: f64,
    pub south: f64,
}

impl RegionGrid {
    pub fn land() -> Result<Self> {
        let grid: RegionGrid = serde_json::from_str(include_str!("regions/land.json"))
            .context("regions/land.json is unreadable")?;
        ensure!(grid.columns > 0 && grid.rows > 0, "empty region grid");
        ensure!(
            grid.present.iter().all(|&id| id < grid.columns * grid.rows),
            "region id outside the grid"
        );
        Ok(grid)
    }

    fn region_width(&self) -> f64 {
        (self.east - self.west) / f64::from(self.columns)
    }

    fn region_height(&self) -> f64 {
        (self.north - self.south) / f64::from(self.rows)
    }

    /// Zoals de client het rekent: west en noord inclusief, de laatste kolom en rij lopen tot de rand.
    pub fn region_of(&self, x: f64, y: f64) -> Option<u32> {
        if x < self.west || x >= self.east || y > self.north || y <= self.south {
            return None;
        }
        let column = (((x - self.west) / self.region_width()).floor() as u32).min(self.columns - 1);
        let row = (((self.north - y) / self.region_height()).floor() as u32).min(self.rows - 1);
        Some(row * self.columns + column)
    }

    pub fn bounds(&self, id: u32) -> Bounds {
        let column = f64::from(id % self.columns);
        let row = f64::from(id / self.columns);
        Bounds {
            west: self.west + column * self.region_width(),
            east: self.west + (column + 1.0) * self.region_width(),
            north: self.north - row * self.region_height(),
            south: self.north - (row + 1.0) * self.region_height(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Window {
    pub column: u32,
    pub row: u32,
    pub width: u32,
    pub height: u32,
}

impl Window {
    fn cells(self) -> usize {
        self.width as usize * self.height as usize
    }

    pub fn contains(self, column: u32, row: u32) -> bool {
        column >= self.column
            && row >= self.row
            && column < self.column + self.width
            && row < self.row + self.height
    }
}

/// Inclusieve celindexen die `floor((v - origin) / step)` voor v in [lower, upper] oplevert, plus marge, binnen [0, size).
fn index_span(
    lower: f64,
    upper: f64,
    origin: f64,
    step: f64,
    size: u32,
    margin: u32,
) -> Option<(u32, u32)> {
    let first = ((lower - origin) / step).floor();
    let last = ((upper - origin) / step).floor();
    let low = first.min(last) - f64::from(margin);
    let high = first.max(last) + f64::from(margin);
    if high < 0.0 || low > f64::from(size) - 1.0 {
        return None;
    }
    Some((low.max(0.0) as u32, high.min(f64::from(size) - 1.0) as u32))
}

/// De cellen die een plek in de regio leest: zijn eigen cel, met `margin` cellen eromheen voor patch en bilineair.
pub fn cell_window(grid: &mrf::Grid, bounds: Bounds, margin: u32) -> Option<Window> {
    let (column_low, column_high) = index_span(
        bounds.west,
        bounds.east,
        grid.x0,
        grid.dx,
        grid.width,
        margin,
    )?;
    let (row_low, row_high) = index_span(
        bounds.north,
        bounds.south,
        grid.y0,
        grid.dy,
        grid.height,
        margin,
    )?;
    Some(Window {
        column: column_low,
        row: row_low,
        width: column_high - column_low + 1,
        height: row_high - row_low + 1,
    })
}

/// De bewegingsblokken die `motionAtPatch` (rain-point-detail.ts) bilineair leest voor een plek in de cellen van `cells`.
pub fn motion_window(grid: &mrf::Grid, motion: mrf::MotionGrid, cells: Window) -> Window {
    let block =
        |cell: f64, size: u32, blocks: u32| cell / f64::from(size) * f64::from(blocks) - 0.5;
    let span = |first: u32, count: u32, size: u32, blocks: u32| {
        let low = block(f64::from(first), size, blocks).floor().max(0.0) as u32;
        let high = (block(f64::from(first + count), size, blocks).floor() + 1.0)
            .clamp(0.0, f64::from(blocks) - 1.0) as u32;
        (low.min(blocks - 1), high)
    };
    let (column_low, column_high) = span(cells.column, cells.width, grid.width, motion.bw);
    let (row_low, row_high) = span(cells.row, cells.height, grid.height, motion.bh);
    Window {
        column: column_low,
        row: row_low,
        width: column_high - column_low + 1,
        height: row_high - row_low + 1,
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MotionEntry {
    pub grid: mrf::MotionGrid,
    pub window: Window,
    /// Frame-indexen met een bewegingsveld; per frame `window` blokken × 2 i8 (x, y), rij voor rij.
    pub frames: Vec<u32>,
    pub offset: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChunkEntry {
    pub url: String,
    pub source: String,
    pub field: String,
    pub run: String,
    /// Sleutel in het tabellenbestand van de generatie (grid en kwantisatie).
    pub table: String,
    pub window: Window,
    pub frames: u32,
    /// Welke frames van de chunk erin staan, als het er minder zijn dan alle; zonder lijst `0..frames`. De ingest
    /// schrijft nu altijd alle frames; de client leest de lijst al, zodat dat later kan veranderen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame_indexes: Option<Vec<u32>>,
    /// Byte-offset in de payload; per cel (rij voor rij in het venster) `frames` bytes in tijdvolgorde.
    pub offset: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub motion: Option<MotionEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub between: Option<BetweenEntry>,
}

/// Tussenbalken per cel (layout `CELL`): voor elk paar opeenvolgende frames `counts[paar]` waarden, per cel van het
/// venster (rij voor rij) achter elkaar in tijdvolgorde; de gemengde byte vóór de kwantisatietabel.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BetweenEntry {
    pub precision: BetweenPrecision,
    pub counts: Vec<u32>,
    pub offset: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FileHeader {
    pub version: u32,
    pub group: Group,
    pub region: u32,
    pub chunks: Vec<ChunkEntry>,
}

/// Grid en kwantisatie van een chunk. Ze veranderen alleen met de generatiesuffix van de chunknaam, dus staan ze één
/// keer in een vast tabellenbestand in plaats van in elk regiobestand (~600 B per chunk).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Table {
    pub grid: mrf::Grid,
    pub quant: Vec<Option<f32>>,
}

pub fn table_id(grid: &mrf::Grid, quant: &[Option<f32>]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(&serde_json::to_vec(&(grid, quant)).expect("table serializes"));
    hasher.finalize().to_hex()[..16].to_owned()
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TablesFile {
    pub version: u32,
    pub tables: BTreeMap<String, Table>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RegionFile {
    pub header: FileHeader,
    pub payload: Vec<u8>,
}

impl RegionFile {
    /// De gekwantiseerde byte van `frame` in cel (column, row) van het chunkraster, zoals het raster hem heeft.
    pub fn value(&self, chunk: usize, column: u32, row: u32, frame: usize) -> Option<u8> {
        let entry = self.header.chunks.get(chunk)?;
        let frame = match &entry.frame_indexes {
            Some(indexes) => indexes
                .iter()
                .position(|&candidate| candidate as usize == frame)?,
            None => frame,
        };
        if !entry.window.contains(column, row) || frame >= entry.frames as usize {
            return None;
        }
        let cell = (row - entry.window.row) as usize * entry.window.width as usize
            + (column - entry.window.column) as usize;
        self.payload
            .get(entry.offset as usize + cell * entry.frames as usize + frame)
            .copied()
    }

    pub fn motion(
        &self,
        chunk: usize,
        block_column: u32,
        block_row: u32,
        frame: u32,
    ) -> Option<(i8, i8)> {
        let motion = self.header.chunks.get(chunk)?.motion.as_ref()?;
        let slot = motion
            .frames
            .iter()
            .position(|&candidate| candidate == frame)?;
        if !motion.window.contains(block_column, block_row) {
            return None;
        }
        let block = (block_row - motion.window.row) as usize * motion.window.width as usize
            + (block_column - motion.window.column) as usize;
        let at = motion.offset as usize + (slot * motion.window.cells() + block) * 2;
        Some((
            *self.payload.get(at)? as i8,
            *self.payload.get(at + 1)? as i8,
        ))
    }
}

pub fn read_region_file(bytes: &[u8]) -> Result<RegionFile> {
    ensure!(bytes.get(..4) == Some(&MAGIC[..]), "not a region file");
    let raw = zstd::stream::decode_all(&bytes[4..]).context("region file payload")?;
    ensure!(raw.len() >= 4, "truncated region file");
    let header_len = u32::from_le_bytes(raw[..4].try_into().unwrap()) as usize;
    let header_end = 4 + header_len;
    ensure!(raw.len() >= header_end, "truncated region header");
    let header: FileHeader = serde_json::from_slice(&raw[4..header_end])?;
    ensure!(
        header.version == FORMAT_VERSION,
        "unknown region format {}",
        header.version
    );
    Ok(RegionFile {
        header,
        payload: raw[header_end..].to_vec(),
    })
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct GroupStats {
    pub chunks: usize,
    pub files: usize,
    pub bytes: u64,
    pub disk_bytes: u64,
    pub mean_bytes: u64,
    pub p95_bytes: u64,
    pub raw_bytes: u64,
    /// Som van de ongecomprimeerde koppen (JSON), waarvan de kwantisatietabellen het grootste deel zijn.
    pub header_bytes: u64,
    /// Som van de gecomprimeerde koppen als ze los gecomprimeerd zouden worden: een bovengrens voor hun aandeel.
    pub header_compressed_bytes: u64,
    pub decode_ms: f64,
    pub cut_ms: f64,
    pub compress_ms: f64,
}

#[derive(Clone, Debug)]
pub struct BuiltGroup {
    pub group: Group,
    pub key: String,
    pub chunks: Vec<String>,
    pub tables: BTreeMap<String, Table>,
    pub files: Vec<(u32, Vec<u8>)>,
    pub stats: GroupStats,
}

impl BuiltGroup {
    pub fn directory(&self) -> String {
        format!("{}-{}", self.group.name(), self.key)
    }
}

/// Een generatie heet naar de chunks waaruit hij is gemaakt: dezelfde chunks geven dezelfde naam (immutable).
pub fn group_key(group: Group, grid: &RegionGrid, urls: &[String]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(format!("mrr{FORMAT_VERSION}\n{}\n", group.name()).as_bytes());
    hasher.update(&serde_json::to_vec(grid).expect("region grid serializes"));
    for url in urls {
        hasher.update(b"\n");
        hasher.update(url.as_bytes());
    }
    hasher.finalize().to_hex()[..16].to_owned()
}

struct RegionDraft {
    id: u32,
    bounds: Bounds,
    entries: Vec<ChunkEntry>,
    payload: Vec<u8>,
}

pub fn build_group(
    group: Group,
    chunks: &[&ProducedChunk],
    grid: &RegionGrid,
    level: i32,
) -> Result<BuiltGroup> {
    build_group_with(group, chunks, grid, level, Layout::PATCH)
}

pub fn build_group_with(
    group: Group,
    chunks: &[&ProducedChunk],
    grid: &RegionGrid,
    level: i32,
    layout: Layout,
) -> Result<BuiltGroup> {
    ensure!(!chunks.is_empty(), "group {} has no chunks", group.name());
    let mut chunks = chunks.to_vec();
    chunks.sort_by(|left, right| left.manifest.url.cmp(&right.manifest.url));
    let urls = chunks
        .iter()
        .map(|chunk| chunk.manifest.url.clone())
        .collect::<Vec<_>>();
    let mut stats = GroupStats {
        chunks: chunks.len(),
        ..GroupStats::default()
    };
    let mut tables = BTreeMap::new();
    let mut drafts = grid
        .present
        .iter()
        .map(|&id| RegionDraft {
            id,
            bounds: grid.bounds(id),
            entries: Vec::new(),
            payload: Vec::new(),
        })
        .collect::<Vec<_>>();

    for chunk in &chunks {
        let started = Instant::now();
        let decoded =
            mrf::decode(&chunk.bytes).with_context(|| format!("decode {}", chunk.filename))?;
        stats.decode_ms += started.elapsed().as_secs_f64() * 1e3;
        let started = Instant::now();
        let header = &decoded.header;
        let table = table_id(&header.grid, &header.quant);
        tables.entry(table.clone()).or_insert_with(|| Table {
            grid: header.grid.clone(),
            quant: header.quant.clone(),
        });
        let rain = header.field == "rain_rate";
        let margin = if rain && group == Group::Radar {
            layout.radar_rain_margin
        } else if rain {
            layout.rain_margin
        } else if group == Group::Ecmwf {
            layout.ecmwf_margin
        } else {
            layout.field_margin
        };
        let between = match layout.between {
            Some(precision) if rain && group == Group::Harmonie => {
                Some((precision, between_plan(chunk, &decoded)?))
            }
            _ => None,
        };
        let width = header.grid.width as usize;
        drafts.par_iter_mut().for_each(|draft| {
            let Some(window) = cell_window(&header.grid, draft.bounds, margin) else {
                return;
            };
            let offset = draft.payload.len() as u64;
            draft.payload.reserve(window.cells() * decoded.frames.len());
            for row in window.row..window.row + window.height {
                for column in window.column..window.column + window.width {
                    let cell = row as usize * width + column as usize;
                    draft
                        .payload
                        .extend(decoded.frames.iter().map(|frame| frame[cell]));
                }
            }
            let between = between.as_ref().map(|(precision, plan)| {
                let between_offset = draft.payload.len() as u64;
                write_between(&mut draft.payload, *precision, plan, &decoded, window);
                BetweenEntry {
                    precision: *precision,
                    counts: plan.iter().map(|pair| pair.count).collect(),
                    offset: between_offset,
                }
            });
            let motion = header
                .motion_grid
                .filter(|_| layout.motion && margin > 0)
                .map(|motion_grid| {
                    let blocks = motion_window(&header.grid, motion_grid, window);
                    let frames = (0..decoded.motions.len() as u32)
                        .filter(|&index| decoded.motions[index as usize].is_some())
                        .collect::<Vec<_>>();
                    let motion_offset = draft.payload.len() as u64;
                    for &frame in &frames {
                        let vectors = decoded.motions[frame as usize].as_ref().unwrap();
                        for block_row in blocks.row..blocks.row + blocks.height {
                            for block_column in blocks.column..blocks.column + blocks.width {
                                let at = (block_row as usize * motion_grid.bw as usize
                                    + block_column as usize)
                                    * 2;
                                draft.payload.push(vectors[at] as u8);
                                draft.payload.push(vectors[at + 1] as u8);
                            }
                        }
                    }
                    MotionEntry {
                        grid: motion_grid,
                        window: blocks,
                        frames,
                        offset: motion_offset,
                    }
                });
            draft.entries.push(ChunkEntry {
                url: chunk.manifest.url.clone(),
                source: header.source.clone(),
                field: header.field.clone(),
                run: header.run.clone(),
                table: table.clone(),
                window,
                frames: decoded.frames.len() as u32,
                frame_indexes: None,
                offset,
                motion,
                between,
            });
        });
        stats.cut_ms += started.elapsed().as_secs_f64() * 1e3;
    }

    let started = Instant::now();
    let files = drafts
        .into_par_iter()
        .filter(|draft| !draft.entries.is_empty())
        .map(|draft| encode_region(group, draft, level))
        .collect::<Result<Vec<_>>>()?;
    ensure!(!files.is_empty(), "group {} covers no region", group.name());
    stats.compress_ms = started.elapsed().as_secs_f64() * 1e3;
    let mut sizes = files
        .iter()
        .map(|(_, bytes, ..)| bytes.len() as u64)
        .collect::<Vec<_>>();
    sizes.sort_unstable();
    stats.files = files.len();
    stats.bytes = sizes.iter().sum();
    stats.disk_bytes = sizes
        .iter()
        .map(|size| size.div_ceil(DISK_BLOCK_BYTES) * DISK_BLOCK_BYTES)
        .sum();
    stats.raw_bytes = files.iter().map(|(_, _, raw, ..)| *raw).sum();
    stats.header_bytes = files.iter().map(|(.., header, _)| *header).sum();
    stats.header_compressed_bytes = files.iter().map(|(.., compressed)| *compressed).sum();
    stats.mean_bytes = stats.bytes / (files.len().max(1) as u64);
    stats.p95_bytes = sizes
        .get(((sizes.len() as f64 * 0.95).ceil() as usize).saturating_sub(1))
        .copied()
        .unwrap_or(0);
    let key = group_key(group, grid, &urls);
    Ok(BuiltGroup {
        group,
        key,
        chunks: urls,
        tables,
        files: files
            .into_iter()
            .map(|(id, bytes, ..)| (id, bytes))
            .collect(),
        stats,
    })
}

/// Per paar opeenvolgende frames: hoeveel tussenbalken, met welk interval en welk bewegingsveld (`selectPairMotion`).
struct BetweenPair {
    count: u32,
    interval_minutes: f64,
    motion: Option<usize>,
}

fn between_plan(chunk: &ProducedChunk, decoded: &mrf::DecodedChunk) -> Result<Vec<BetweenPair>> {
    let times = decoded
        .header
        .frames
        .iter()
        .map(|frame| {
            between::epoch_ms(&frame.time)
                .with_context(|| format!("frame time {} in {}", frame.time, chunk.filename))
        })
        .collect::<Result<Vec<_>>>()?;
    let has_motion = decoded
        .motions
        .iter()
        .map(Option::is_some)
        .collect::<Vec<_>>();
    Ok((0..times.len().saturating_sub(1))
        .map(|left| BetweenPair {
            count: between::between_count(times[left], times[left + 1]),
            interval_minutes: (times[left + 1] - times[left]) / 60_000.0,
            motion: decoded
                .header
                .motion_grid
                .and_then(|_| between::pair_motion(&times, &has_motion, left)),
        })
        .collect())
}

fn write_between(
    payload: &mut Vec<u8>,
    precision: BetweenPrecision,
    plan: &[BetweenPair],
    decoded: &mrf::DecodedChunk,
    window: Window,
) {
    let grid = &decoded.header.grid;
    let raster = |frame: usize| between::Raster {
        bytes: &decoded.frames[frame],
        width: grid.width,
        height: grid.height,
    };
    let motion_grid = decoded.header.motion_grid;
    for row in window.row..window.row + window.height {
        for column in window.column..window.column + window.width {
            for (left, pair) in plan.iter().enumerate() {
                let motion = pair
                    .motion
                    .zip(motion_grid)
                    .and_then(|(frame, motion_grid)| {
                        decoded.motions[frame]
                            .as_ref()
                            .map(|vectors| between::Motion {
                                vectors,
                                width: motion_grid.bw,
                                height: motion_grid.bh,
                            })
                    });
                let steps = f64::from(pair.count + 1);
                for step in 0..pair.count {
                    let weight = f64::from(step + 1) / steps;
                    let byte = between::blended_byte(
                        &raster(left),
                        &raster(left + 1),
                        motion.as_ref(),
                        pair.interval_minutes,
                        weight,
                        column,
                        row,
                    );
                    match precision {
                        BetweenPrecision::Delta => {
                            let cell = row as usize * grid.width as usize + column as usize;
                            let (from, to) = (
                                f64::from(decoded.frames[left][cell]),
                                f64::from(decoded.frames[left + 1][cell]),
                            );
                            let linear = if from == 255.0 || to == 255.0 {
                                0.0
                            } else {
                                from + (to - from) * weight
                            };
                            payload.push((byte.round() as i32 - linear.round() as i32) as i8 as u8)
                        }
                        BetweenPrecision::U8 => payload.push(byte.round() as u8),
                        BetweenPrecision::U16 => {
                            payload.extend(((byte * 256.0).round() as u16).to_le_bytes())
                        }
                    }
                }
            }
        }
    }
}

/// Kop en payload in één zstd-frame achter het magische getal.
fn encode_region(
    group: Group,
    draft: RegionDraft,
    level: i32,
) -> Result<(u32, Vec<u8>, u64, u64, u64)> {
    let header = FileHeader {
        version: FORMAT_VERSION,
        group,
        region: draft.id,
        chunks: draft.entries,
    };
    let json = serde_json::to_vec(&header)?;
    let mut raw = Vec::with_capacity(4 + json.len() + draft.payload.len());
    raw.extend_from_slice(&(json.len() as u32).to_le_bytes());
    raw.extend_from_slice(&json);
    raw.extend_from_slice(&draft.payload);
    let mut bytes = MAGIC.to_vec();
    bytes.extend(zstd::bulk::compress(&raw, level)?);
    let header_compressed = zstd::bulk::compress(&json, level)?.len() as u64;
    Ok((
        draft.id,
        bytes,
        raw.len() as u64,
        json.len() as u64,
        header_compressed,
    ))
}

/// Schrijft een generatie als één map; bestaat die al, dan is hij identiek (zelfde chunks, zelfde naam).
pub fn write_group(data_dir: &Path, built: &BuiltGroup) -> Result<PathBuf> {
    let root = data_dir.join(DIRECTORY);
    let target = root.join(built.directory());
    if target.is_dir() {
        return Ok(target);
    }
    let staging = root.join(format!(".staging-{}", built.directory()));
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    for (id, bytes) in &built.files {
        let path = staging.join(format!("{id}.mrr"));
        fs::write(&path, bytes)?;
        set_public_permissions(&path)?;
    }
    set_directory_permissions(&staging)?;
    set_directory_permissions(&root)?;
    fs::rename(&staging, &target)?;
    Ok(target)
}

/// Schrijft de tabellen als `regions/tables-<hash>.json` (naam naar inhoud, dus immutable) en geeft de bestandsnaam.
pub fn write_tables(data_dir: &Path, tables: &BTreeMap<String, Table>) -> Result<String> {
    let json = serde_json::to_vec(&TablesFile {
        version: FORMAT_VERSION,
        tables: tables.clone(),
    })?;
    let name = format!("tables-{}.json", &blake3::hash(&json).to_hex()[..16]);
    let root = data_dir.join(DIRECTORY);
    fs::create_dir_all(&root)?;
    set_directory_permissions(&root)?;
    let path = root.join(&name);
    if !path.is_file() {
        crate::publisher::atomic_write(&path, &json)?;
    }
    Ok(name)
}

#[cfg(unix)]
fn set_directory_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_directory_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

/// MIP-40 A5: per groep blijven de nieuwste en de vorige generatie staan, en zo ook van de tabellenbestanden; een
/// client met een ouder manifest krijgt een 404 en valt terug op de rasters. `current` noemt mappen en tabellenbestand.
pub fn prune_groups(data_dir: &Path, current: &[String]) -> Result<Vec<PathBuf>> {
    let root = data_dir.join(DIRECTORY);
    let mut removed = Vec::new();
    if !root.is_dir() {
        return Ok(removed);
    }
    let mut generations: HashMap<Option<Group>, Vec<(std::time::SystemTime, String)>> =
        HashMap::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type()?.is_file() && name.starts_with("tables-") && name.ends_with(".json") {
            generations
                .entry(None)
                .or_default()
                .push((entry.metadata()?.modified()?, name));
            continue;
        }
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if name.starts_with(".staging-") {
            fs::remove_dir_all(entry.path())?;
            removed.push(entry.path());
            continue;
        }
        let Some(group) = Group::ALL.into_iter().find(|group| {
            name.strip_prefix(group.name())
                .is_some_and(|rest| rest.starts_with('-'))
        }) else {
            continue;
        };
        generations
            .entry(Some(group))
            .or_default()
            .push((entry.metadata()?.modified()?, name));
    }
    for (_, mut names) in generations {
        names.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
        let current_here = names.iter().position(|(_, name)| current.contains(name));
        let previous = names.iter().position(|(_, name)| !current.contains(name));
        for (index, (_, name)) in names.iter().enumerate() {
            let keep = Some(index) == current_here
                || (current_here.is_some() && Some(index) == previous)
                || (current_here.is_none() && index < 2);
            if !keep {
                let path = root.join(name);
                if path.is_dir() {
                    fs::remove_dir_all(&path)?;
                } else {
                    fs::remove_file(&path)?;
                }
                removed.push(path);
            }
        }
    }
    Ok(removed)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RegionsGroup {
    pub name: String,
    /// Map van de generatie, relatief aan het manifest; bestanden heten `<regio>.mrr`.
    pub url: String,
    /// De chunks waaruit de generatie is gemaakt: de client gebruikt de groep alleen als zijn tijdlijn hieruit komt.
    pub chunks: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RegionsSection {
    pub version: u32,
    pub crs: String,
    pub west: f64,
    pub east: f64,
    pub north: f64,
    pub south: f64,
    pub columns: u32,
    pub rows: u32,
    /// Regio's met een bestand (`id = rij × columns + kolom`); de rest valt terug op de rasters (A3).
    pub present: Vec<u32>,
    /// Grid en kwantisatie per tabelsleutel van de chunkregels (`regions/tables-<hash>.json`, immutable).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tables: Option<String>,
    pub groups: Vec<RegionsGroup>,
}

impl RegionsSection {
    /// `tables` is de bestandsnaam uit `write_tables`.
    pub fn new(grid: &RegionGrid, tables: Option<String>, groups: Vec<RegionsGroup>) -> Self {
        Self {
            version: FORMAT_VERSION,
            crs: "EPSG:3857".to_owned(),
            west: grid.west,
            east: grid.east,
            north: grid.north,
            south: grid.south,
            columns: grid.columns,
            rows: grid.rows,
            present: grid.present.clone(),
            tables: tables.map(|name| format!("{DIRECTORY}/{name}")),
            groups,
        }
    }
}

impl RegionsGroup {
    pub fn of(built: &BuiltGroup) -> Self {
        Self {
            name: built.group.name().to_owned(),
            url: format!("{DIRECTORY}/{}/", built.directory()),
            chunks: built.chunks.clone(),
        }
    }
}

/// Houdt per groep de laatst geschreven generatie bij, zodat een ongewijzigde groep niet opnieuw wordt gebouwd.
pub struct RegionWriter {
    grid: RegionGrid,
    level: i32,
    written: HashMap<Group, (RegionsGroup, BTreeMap<String, Table>)>,
}

impl RegionWriter {
    pub fn new(level: i32) -> Result<Self> {
        Ok(Self {
            grid: RegionGrid::land()?,
            level,
            written: HashMap::new(),
        })
    }

    pub fn with_grid(grid: RegionGrid, level: i32) -> Self {
        Self {
            grid,
            level,
            written: HashMap::new(),
        }
    }

    /// Bouwt en schrijft de gewijzigde groepen vóór het manifest; een mislukte groep valt uit de sectie, niet het manifest.
    pub fn update(&mut self, data_dir: &Path, chunks: &[&ProducedChunk]) -> RegionsSection {
        for group in Group::ALL {
            let members = chunks
                .iter()
                .copied()
                .filter(|chunk| {
                    Group::of(&chunk.manifest.source, &chunk.manifest.field) == Some(group)
                })
                .collect::<Vec<_>>();
            if members.is_empty() {
                self.written.remove(&group);
                continue;
            }
            let mut urls = members
                .iter()
                .map(|chunk| chunk.manifest.url.clone())
                .collect::<Vec<_>>();
            urls.sort();
            let key = group_key(group, &self.grid, &urls);
            let directory = format!("{}-{key}", group.name());
            if self
                .written
                .get(&group)
                .is_some_and(|(entry, _)| entry.url == format!("{DIRECTORY}/{directory}/"))
            {
                continue;
            }
            let started = Instant::now();
            let cpu_before = process_cpu_ms();
            let result = build_group(group, &members, &self.grid, self.level)
                .and_then(|built| write_group(data_dir, &built).map(|_| built));
            match result {
                Ok(built) => {
                    let stats = &built.stats;
                    info!(
                        group = group.name(),
                        generation = built.key,
                        chunks = stats.chunks,
                        files = stats.files,
                        bytes = stats.bytes,
                        disk_bytes = stats.disk_bytes,
                        mean_bytes = stats.mean_bytes,
                        p95_bytes = stats.p95_bytes,
                        decode_ms = stats.decode_ms.round(),
                        cut_ms = stats.cut_ms.round(),
                        compress_ms = stats.compress_ms.round(),
                        elapsed_ms = (started.elapsed().as_secs_f64() * 1e3).round(),
                        process_cpu_ms = cpu_before
                            .zip(process_cpu_ms())
                            .map(|(before, after)| after - before),
                        "region files written"
                    );
                    self.written
                        .insert(group, (RegionsGroup::of(&built), built.tables));
                }
                Err(error) => {
                    warn!(group = group.name(), error = %format!("{error:#}"), "region files not written; group left out of the manifest");
                    self.written.remove(&group);
                }
            }
        }
        let mut tables = BTreeMap::new();
        for (_, group_tables) in self.written.values() {
            tables.extend(
                group_tables
                    .iter()
                    .map(|(id, table)| (id.clone(), table.clone())),
            );
        }
        let tables = if tables.is_empty() {
            None
        } else {
            match write_tables(data_dir, &tables) {
                Ok(name) => Some(name),
                Err(error) => {
                    warn!(error = %format!("{error:#}"), "region tables not written; regions left out of the manifest");
                    self.written.clear();
                    None
                }
            }
        };
        let mut current = self
            .written
            .values()
            .filter_map(|(entry, _)| {
                entry
                    .url
                    .strip_prefix(&format!("{DIRECTORY}/"))
                    .map(|rest| rest.trim_end_matches('/').to_owned())
            })
            .collect::<Vec<_>>();
        current.extend(tables.clone());
        match prune_groups(data_dir, &current) {
            Ok(removed) if !removed.is_empty() => {
                info!(removed = removed.len(), "old region generations pruned")
            }
            Ok(_) => {}
            Err(error) => warn!(error = %format!("{error:#}"), "region pruning failed"),
        }
        RegionsSection::new(
            &self.grid,
            tables,
            Group::ALL
                .into_iter()
                .filter_map(|group| self.written.get(&group).map(|(entry, _)| entry.clone()))
                .collect(),
        )
    }
}

/// CPU-tijd van het hele proces (alle draden) in ms, uit /proc; `None` buiten Linux.
pub fn process_cpu_ms() -> Option<u64> {
    let stat = fs::read_to_string("/proc/self/stat").ok()?;
    let fields = stat
        .rsplit_once(')')?
        .1
        .split_whitespace()
        .collect::<Vec<_>>();
    // Velden 14 en 15 (utime, stime) in kloktikken van 10 ms (CLK_TCK = 100 op Linux).
    let ticks = fields.get(11)?.parse::<u64>().ok()? + fields.get(12)?.parse::<u64>().ok()?;
    Some(ticks * 10)
}

pub mod between;

#[cfg(test)]
mod tests;
