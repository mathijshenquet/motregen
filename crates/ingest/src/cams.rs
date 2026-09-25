//! CAMS European air-quality forecast: pollen and air quality on a 6 km NL+Flanders grid.
//! Source, calendar and quantization are documented in docs/pollen.md.

use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path, time::SystemTime};

use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, Datelike, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    grid::{GridSpec, web_mercator_to_lon_lat},
    pipeline::generated_chunk_filename,
    publisher::{ManifestChunk, ProducedChunk, atomic_write, produced_chunk, write_chunks},
};

pub const ADS_DATASET: &str = "cams-europe-air-quality-forecasts";
pub const LICENSE: &str = "Contains modified Copernicus Atmosphere Monitoring Service information";
pub const SIDECAR: &str = "cams.json";
pub const SOURCE: &str = "cams";
/// CAMS Europe forecasts run to +96 h; lead 0 is the analysis-near hour we leave out,
/// as for HARMONIE.
pub const LEADS: u32 = 96;
const CHUNK_LEADS: usize = 24;
/// A missed timer run keeps yesterday's forecast visible; after this the frames are
/// mostly in the past and the feed is dropped from the manifest.
const MAX_RUN_AGE_HOURS: i64 = 72;

/// ADS `area` (N, W, S, E). CAMS cell centres sit on x.x5, so this selects
/// 50.25–53.85 N × 2.25–7.55 E: every CAMS_GRID cell centre has four neighbours.
pub const AREA: [f64; 4] = [53.9, 2.2, 50.2, 7.6];

/// 6 km cells aligned with `grid::DETAIL_GRID`, cut to NL + Flanders
/// (2.32–7.49 E, 50.32–53.80 N at the cell edges).
pub const CAMS_GRID: GridSpec = GridSpec {
    crs: "EPSG:3857",
    x0: 258_000.0,
    y0: 7_132_000.0,
    dx: 6_000.0,
    dy: -6_000.0,
    width: 96,
    height: 105,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Field {
    PollenAlder,
    PollenBirch,
    PollenGrass,
    PollenMugwort,
    Pm25,
    Pm10,
    No2,
    O3,
}

impl Field {
    pub const ALL: [Field; 8] = [
        Field::PollenAlder,
        Field::PollenBirch,
        Field::PollenGrass,
        Field::PollenMugwort,
        Field::Pm25,
        Field::Pm10,
        Field::No2,
        Field::O3,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Field::PollenAlder => "pollen_alder",
            Field::PollenBirch => "pollen_birch",
            Field::PollenGrass => "pollen_grass",
            Field::PollenMugwort => "pollen_mugwort",
            Field::Pm25 => "pm25",
            Field::Pm10 => "pm10",
            Field::No2 => "no2",
            Field::O3 => "o3",
        }
    }

    pub fn ads_variable(self) -> &'static str {
        match self {
            Field::PollenAlder => "alder_pollen",
            Field::PollenBirch => "birch_pollen",
            Field::PollenGrass => "grass_pollen",
            Field::PollenMugwort => "mugwort_pollen",
            Field::Pm25 => "particulate_matter_2.5um",
            Field::Pm10 => "particulate_matter_10um",
            Field::No2 => "nitrogen_dioxide",
            Field::O3 => "ozone",
        }
    }

    pub fn open_meteo_variable(self) -> &'static str {
        match self {
            Field::PollenAlder => "alder_pollen",
            Field::PollenBirch => "birch_pollen",
            Field::PollenGrass => "grass_pollen",
            Field::PollenMugwort => "mugwort_pollen",
            Field::Pm25 => "pm2_5",
            Field::Pm10 => "pm10",
            Field::No2 => "nitrogen_dioxide",
            Field::O3 => "ozone",
        }
    }

    /// GRIB2 (parameterNumber, constituentType) in discipline 0, category 20, as ADS
    /// encodes CAMS Europe (ECMWF forum topic 1563; Open-Meteo's CamsDomain.swift).
    pub fn grib_id(self) -> (i64, i64) {
        match self {
            Field::PollenAlder => (POLLEN_NUMBER_CONCENTRATION, 62100),
            Field::PollenBirch => (POLLEN_NUMBER_CONCENTRATION, 62101),
            Field::PollenGrass => (POLLEN_NUMBER_CONCENTRATION, 62300),
            Field::PollenMugwort => (POLLEN_NUMBER_CONCENTRATION, 62201),
            Field::Pm25 => (MASS_DENSITY, 40009),
            Field::Pm10 => (MASS_DENSITY, 40008),
            Field::No2 => (MASS_DENSITY, 5),
            Field::O3 => (MASS_DENSITY, 0),
        }
    }

    pub fn from_grib_id(parameter_number: i64, constituent_type: i64) -> Option<Field> {
        Field::ALL
            .into_iter()
            .find(|field| field.grib_id() == (parameter_number, constituent_type))
    }

    pub fn is_pollen(self) -> bool {
        self.grib_id().0 == POLLEN_NUMBER_CONCENTRATION
    }

    /// KNMI/LUMC pollen calendar (months, inclusive); air quality is year-round.
    pub fn season(self) -> Option<(u32, u32)> {
        match self {
            Field::PollenAlder => Some((1, 3)),
            Field::PollenBirch => Some((4, 5)),
            Field::PollenGrass => Some((5, 8)),
            Field::PollenMugwort => Some((7, 9)),
            _ => None,
        }
    }

    pub fn in_season(self, time: DateTime<Utc>) -> bool {
        self.season()
            .is_none_or(|(first, last)| (first..=last).contains(&time.month()))
    }

    pub fn quantization_table(self) -> Vec<Option<f32>> {
        if self.is_pollen() {
            pollen_quantization_table()
        } else {
            concentration_quantization_table()
        }
    }

    /// Upper bound of a physically sane domain median in the published unit. A median
    /// above it means a unit mismatch (e.g. kg m-3 left unscaled or scaled twice).
    fn plausible_median_max(self) -> f32 {
        if self.is_pollen() { 50_000.0 } else { 1_000.0 }
    }
}

pub const MASS_DENSITY: i64 = 0;
pub const POLLEN_NUMBER_CONCENTRATION: i64 = 59;

/// Fields worth fetching for a run: air quality always, pollen when any published
/// lead falls inside the species' season.
pub fn fields_for_run(run: DateTime<Utc>) -> Vec<Field> {
    Field::ALL
        .into_iter()
        .filter(|field| {
            (1..=LEADS).any(|lead| field.in_season(run + Duration::hours(i64::from(lead))))
        })
        .collect()
}

/// Index 0 = no pollen; 1..=254 log-spaced 0.1 → 10 000 grains/m³ (≈4.7 % per step).
pub fn pollen_quantization_table() -> Vec<Option<f32>> {
    std::iter::once(Some(0.0))
        .chain((0..254).map(|step| Some(0.1 * 10f32.powf(5.0 * step as f32 / 253.0))))
        .chain(std::iter::once(None))
        .collect()
}

/// 0–100 µg/m³ in 0.5 steps (indices 0..=200), then 105–370 in steps of 5.
pub fn concentration_quantization_table() -> Vec<Option<f32>> {
    (0..=200)
        .map(|index| Some(index as f32 * 0.5))
        .chain((1..=54).map(|step| Some(100.0 + step as f32 * 5.0)))
        .chain(std::iter::once(None))
        .collect()
}

/// A regular lat/lon raster, row-major; row `j` lies at `lat0 + j·dlat`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LatLonRaster {
    pub lat0: f64,
    pub lon0: f64,
    pub dlat: f64,
    pub dlon: f64,
    pub ni: usize,
    pub nj: usize,
}

impl LatLonRaster {
    pub fn cell_count(&self) -> usize {
        self.ni * self.nj
    }
}

/// Bilinear weights from a lat/lon raster to a web-mercator grid. A target cell whose
/// centre lies outside the raster, or next to a missing source value, becomes no-data.
pub struct BilinearMap {
    source_cells: usize,
    taps: Vec<Option<[(u32, f32); 4]>>,
}

impl BilinearMap {
    pub fn new(source: &LatLonRaster, target: GridSpec) -> Result<Self> {
        ensure!(
            source.ni >= 2 && source.nj >= 2,
            "CAMS raster needs 2×2 points"
        );
        ensure!(
            source.dlat != 0.0 && source.dlon != 0.0,
            "zero CAMS spacing"
        );
        let mut taps = Vec::with_capacity(target.cell_count());
        for row in 0..target.height {
            for column in 0..target.width {
                let x = target.x0 + (f64::from(column) + 0.5) * target.dx;
                let y = target.y0 + (f64::from(row) + 0.5) * target.dy;
                let (lon, lat) = web_mercator_to_lon_lat(x, y);
                taps.push(bilinear_taps(source, lon, lat));
            }
        }
        Ok(Self {
            source_cells: source.cell_count(),
            taps,
        })
    }

    pub fn apply(&self, values: &[f32]) -> Result<Vec<f32>> {
        ensure!(
            values.len() == self.source_cells,
            "CAMS field has {} values, raster expects {}",
            values.len(),
            self.source_cells
        );
        Ok(self
            .taps
            .iter()
            .map(|taps| match taps {
                Some(taps) => taps
                    .iter()
                    .map(|(index, weight)| values[*index as usize] * weight)
                    .sum(),
                None => f32::NAN,
            })
            .collect())
    }
}

fn bilinear_taps(source: &LatLonRaster, lon: f64, lat: f64) -> Option<[(u32, f32); 4]> {
    let row = (lat - source.lat0) / source.dlat;
    let column = (lon - source.lon0) / source.dlon;
    let last_row = (source.nj - 1) as f64;
    let last_column = (source.ni - 1) as f64;
    const EDGE: f64 = 1e-9;
    if !(-EDGE..=last_row + EDGE).contains(&row) || !(-EDGE..=last_column + EDGE).contains(&column)
    {
        return None;
    }
    let row = row.clamp(0.0, last_row);
    let column = column.clamp(0.0, last_column);
    let j0 = (row.floor() as usize).min(source.nj - 2);
    let i0 = (column.floor() as usize).min(source.ni - 2);
    let fy = (row - j0 as f64) as f32;
    let fx = (column - i0 as f64) as f32;
    let index = |j: usize, i: usize| (j * source.ni + i) as u32;
    Some([
        (index(j0, i0), (1.0 - fx) * (1.0 - fy)),
        (index(j0, i0 + 1), fx * (1.0 - fy)),
        (index(j0 + 1, i0), (1.0 - fx) * fy),
        (index(j0 + 1, i0 + 1), fx * fy),
    ])
}

/// One decoded CAMS run in published units (grains/m³, µg/m³), on its source raster.
#[derive(Clone, Debug)]
pub struct CamsRun {
    pub run: DateTime<Utc>,
    pub provider: String,
    pub raster: LatLonRaster,
    pub fields: BTreeMap<Field, BTreeMap<u32, Vec<f32>>>,
}

impl CamsRun {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.fields.is_empty(),
            "CAMS run {} has no fields",
            self.run
        );
        for (field, leads) in &self.fields {
            for (lead, values) in leads {
                ensure!(
                    values.len() == self.raster.cell_count(),
                    "{} lead {lead} has {} values, raster has {}",
                    field.name(),
                    values.len(),
                    self.raster.cell_count()
                );
            }
            let first = leads
                .values()
                .next()
                .with_context(|| format!("{} has no leads", field.name()))?;
            let mut sorted = first
                .iter()
                .copied()
                .filter(|v| v.is_finite())
                .collect::<Vec<_>>();
            ensure!(!sorted.is_empty(), "{} has no finite values", field.name());
            sorted.sort_by(f32::total_cmp);
            let median = sorted[sorted.len() / 2];
            ensure!(
                (0.0..=field.plausible_median_max()).contains(&median),
                "{} domain median {median} is implausible; unit conversion is off",
                field.name()
            );
        }
        Ok(())
    }
}

/// Chunks per field in day parts of 24 leads (`l1-24`, `l25-48`, …); pollen chunks
/// without any frame in the species' season are not produced.
pub fn build_chunks(run: &CamsRun) -> Result<Vec<ProducedChunk>> {
    run.validate()?;
    let map = BilinearMap::new(&run.raster, CAMS_GRID)?;
    let run_iso = run.run.to_rfc3339_opts(SecondsFormat::Secs, true);
    let stamp = run.run.format("%Y%m%dT%H").to_string();
    let mut chunks = Vec::new();
    for (field, leads) in &run.fields {
        let published = leads
            .iter()
            .filter(|(lead, _)| (1..=LEADS).contains(*lead))
            .collect::<Vec<_>>();
        let quant = field.quantization_table();
        for part in published.chunks(CHUNK_LEADS) {
            let times = part
                .iter()
                .map(|(lead, _)| run.run + Duration::hours(i64::from(**lead)))
                .collect::<Vec<_>>();
            if !times.iter().any(|time| field.in_season(*time)) {
                continue;
            }
            let (first, last) = (*part[0].0, *part[part.len() - 1].0);
            ensure!(
                (last - first) as usize == part.len() - 1,
                "{} leads {first}..{last} have gaps",
                field.name()
            );
            let frames = part
                .iter()
                .map(|(_, values)| {
                    map.apply(values)?
                        .into_iter()
                        .map(|value| mrf::quantize_with_table(value, &quant).map_err(Into::into))
                        .collect::<Result<Vec<u8>>>()
                })
                .collect::<Result<Vec<_>>>()?;
            let meta = mrf::ChunkMeta::standard(
                CAMS_GRID.mrf_grid(),
                SOURCE,
                &run_iso,
                times
                    .iter()
                    .map(|time| time.to_rfc3339_opts(SecondsFormat::Secs, true))
                    .collect(),
            )
            .with_field(field.name(), quant.clone())
            .with_pred();
            let stem = format!("cams-{}-{stamp}-l{first}-{last}", field.name());
            chunks.push(produced_chunk(
                generated_chunk_filename(&stem, &meta),
                mrf::encode(&frames, &meta)?,
            )?);
        }
    }
    ensure!(!chunks.is_empty(), "CAMS run {run_iso} produced no chunks");
    Ok(chunks)
}

/// The manifest's `cams` section: run time, provider and the mandatory attribution.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CamsSection {
    pub run: String,
    pub provider: String,
    pub license: String,
}

/// `<data>/cams.json`: what the daily CAMS job hands to the ingest daemon.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Sidecar {
    #[serde(flatten)]
    pub section: CamsSection,
    pub chunks: Vec<ManifestChunk>,
}

/// Chunks first, then the sidecar, both atomically: the daemon never sees a sidecar
/// that points at a missing chunk.
pub fn write_publication(data_dir: &Path, run: &CamsRun, chunks: &[ProducedChunk]) -> Result<()> {
    write_chunks(data_dir, &chunks.iter().collect::<Vec<_>>())?;
    let sidecar = Sidecar {
        section: CamsSection {
            run: run.run.to_rfc3339_opts(SecondsFormat::Secs, true),
            provider: run.provider.clone(),
            license: LICENSE.to_owned(),
        },
        chunks: chunks.iter().map(|chunk| chunk.manifest.clone()).collect(),
    };
    atomic_write(
        &data_dir.join(SIDECAR),
        &serde_json::to_vec_pretty(&sidecar)?,
    )
}

/// The daemon's view of the sidecar. It re-reads only when the file changes and drops
/// the feed once the run is too old, so a failing timer cannot pin stale pollen.
#[derive(Default)]
pub struct Feed {
    stamp: Option<(SystemTime, u64)>,
    loaded: Option<(CamsSection, Vec<ProducedChunk>)>,
    pub section: Option<CamsSection>,
    pub chunks: Vec<ProducedChunk>,
}

impl Feed {
    /// Returns whether the published set changed.
    pub fn refresh(&mut self, data_dir: &Path, now: DateTime<Utc>) -> Result<bool> {
        let path = data_dir.join(SIDECAR);
        let stamp = match fs::metadata(&path) {
            Ok(metadata) => Some((metadata.modified()?, metadata.len())),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if stamp != self.stamp {
            self.loaded = match stamp {
                Some(_) => Some(load_sidecar(data_dir)?),
                None => None,
            };
            self.stamp = stamp;
        }
        let fresh = match &self.loaded {
            Some((section, chunks)) => {
                let run = DateTime::parse_from_rfc3339(&section.run)?.with_timezone(&Utc);
                (now - run <= Duration::hours(MAX_RUN_AGE_HOURS))
                    .then(|| (section.clone(), chunks.clone()))
            }
            None => None,
        };
        let (section, chunks) = match fresh {
            Some((section, chunks)) => (Some(section), chunks),
            None => (None, Vec::new()),
        };
        let names = |chunks: &[ProducedChunk]| {
            chunks
                .iter()
                .map(|chunk| chunk.filename.clone())
                .collect::<Vec<_>>()
        };
        let changed = section != self.section || names(&chunks) != names(&self.chunks);
        self.section = section;
        self.chunks = chunks;
        Ok(changed)
    }
}

fn load_sidecar(data_dir: &Path) -> Result<(CamsSection, Vec<ProducedChunk>)> {
    let sidecar: Sidecar = serde_json::from_slice(&fs::read(data_dir.join(SIDECAR))?)
        .context("parsing CAMS sidecar")?;
    ensure!(
        sidecar.section.license == LICENSE,
        "CAMS sidecar lacks the mandatory attribution"
    );
    let chunks = sidecar
        .chunks
        .iter()
        .map(|entry| {
            let filename = entry
                .url
                .strip_prefix("chunks/")
                .with_context(|| format!("CAMS chunk url {} outside chunks/", entry.url))?;
            let chunk = produced_chunk(
                filename.to_owned(),
                fs::read(data_dir.join("chunks").join(filename))
                    .with_context(|| format!("reading CAMS chunk {filename}"))?,
            )?;
            if chunk.manifest != *entry {
                bail!("CAMS chunk {filename} does not match its sidecar entry");
            }
            Ok(chunk)
        })
        .collect::<Result<Vec<_>>>()?;
    Ok((sidecar.section, chunks))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raster() -> LatLonRaster {
        LatLonRaster {
            lat0: 53.85,
            lon0: 2.25,
            dlat: -0.1,
            dlon: 0.1,
            ni: 54,
            nj: 37,
        }
    }

    fn utc(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text)
            .unwrap()
            .with_timezone(&Utc)
    }

    fn synthetic_run(run: &str, fields: &[Field], leads: std::ops::RangeInclusive<u32>) -> CamsRun {
        let raster = raster();
        CamsRun {
            run: utc(run),
            provider: "test".into(),
            raster,
            fields: fields
                .iter()
                .map(|field| {
                    (
                        *field,
                        leads
                            .clone()
                            .map(|lead| (lead, vec![10.0 + lead as f32; raster.cell_count()]))
                            .collect(),
                    )
                })
                .collect(),
        }
    }

    #[test]
    fn cams_grid_is_aligned_with_the_detail_grid_and_inside_the_ads_area() {
        let detail = crate::grid::DETAIL_GRID;
        assert_eq!(CAMS_GRID.dx, detail.dx);
        assert_eq!(((CAMS_GRID.x0 - detail.x0) / detail.dx).fract(), 0.0);
        assert_eq!(((CAMS_GRID.y0 - detail.y0) / detail.dy).fract(), 0.0);
        let (west, north) = web_mercator_to_lon_lat(CAMS_GRID.x0, CAMS_GRID.y0);
        let (east, south) = web_mercator_to_lon_lat(
            CAMS_GRID.x0 + CAMS_GRID.dx * f64::from(CAMS_GRID.width),
            CAMS_GRID.y0 + CAMS_GRID.dy * f64::from(CAMS_GRID.height),
        );
        // NL + Flanders frame of the web client (map-frame.ts) with margin.
        assert!(west < 2.5 && east > 7.23 && south < 50.45 && north > 53.56);
        assert!(west > AREA[1] + 0.05 && east < AREA[3] - 0.05);
        assert!(south > AREA[2] + 0.05 && north < AREA[0] - 0.05);
        let map = BilinearMap::new(&raster(), CAMS_GRID).unwrap();
        assert!(map.taps.iter().all(Option::is_some));
    }

    #[test]
    fn bilinear_reproduces_a_linear_field_exactly_and_masks_outside_cells() {
        let raster = raster();
        let values = (0..raster.nj)
            .flat_map(|j| {
                (0..raster.ni).map(move |i| {
                    let lat = raster.lat0 + j as f64 * raster.dlat;
                    let lon = raster.lon0 + i as f64 * raster.dlon;
                    (3.0 * lon - 2.0 * lat + 200.0) as f32
                })
            })
            .collect::<Vec<_>>();
        let out = BilinearMap::new(&raster, CAMS_GRID)
            .unwrap()
            .apply(&values)
            .unwrap();
        for row in [0, 50, 104] {
            for column in [0, 40, 95] {
                let x = CAMS_GRID.x0 + (f64::from(column) + 0.5) * CAMS_GRID.dx;
                let y = CAMS_GRID.y0 + (f64::from(row) + 0.5) * CAMS_GRID.dy;
                let (lon, lat) = web_mercator_to_lon_lat(x, y);
                let expected = (3.0 * lon - 2.0 * lat + 200.0) as f32;
                let got = out[row as usize * CAMS_GRID.width as usize + column as usize];
                assert!((got - expected).abs() < 1e-3, "{got} vs {expected}");
            }
        }
        let far = LatLonRaster {
            lat0: 60.0,
            ..raster
        };
        let masked = BilinearMap::new(&far, CAMS_GRID)
            .unwrap()
            .apply(&values)
            .unwrap();
        assert!(masked.iter().all(|value| value.is_nan()));
    }

    #[test]
    fn quantization_tables_are_valid_and_cover_documented_ranges() {
        let pollen = pollen_quantization_table();
        let concentration = concentration_quantization_table();
        for table in [&pollen, &concentration] {
            assert_eq!(table.len(), 256);
            assert!(table[255].is_none());
            assert_eq!(table[0], Some(0.0));
            assert_eq!(mrf::quantize_with_table(f32::NAN, table).unwrap(), 255);
        }
        assert!((pollen[1].unwrap() - 0.1).abs() < 1e-6);
        assert!((pollen[254].unwrap() - 10_000.0).abs() < 0.5);
        let ratio = pollen[101].unwrap() / pollen[100].unwrap();
        assert!((ratio - 10f32.powf(5.0 / 253.0)).abs() < 1e-4);
        assert_eq!(concentration[200], Some(100.0));
        assert_eq!(concentration[201], Some(105.0));
        assert_eq!(concentration[254], Some(370.0));
        assert_eq!(mrf::quantize_with_table(0.04, &pollen).unwrap(), 0);
        assert_eq!(mrf::quantize_with_table(0.06, &pollen).unwrap(), 1);
        assert_eq!(mrf::quantize_with_table(1e6, &pollen).unwrap(), 254);
        assert_eq!(mrf::quantize_with_table(12.3, &concentration).unwrap(), 25);
        assert_eq!(
            mrf::quantize_with_table(500.0, &concentration).unwrap(),
            254
        );
    }

    #[test]
    fn pollen_calendar_follows_knmi_lumc() {
        let at = |month: u32| utc(&format!("2026-{month:02}-15T12:00:00Z"));
        let species = |month: u32| {
            Field::ALL
                .into_iter()
                .filter(|field| field.is_pollen() && field.in_season(at(month)))
                .map(Field::name)
                .collect::<Vec<_>>()
        };
        assert_eq!(species(2), ["pollen_alder"]);
        assert_eq!(species(4), ["pollen_birch"]);
        assert_eq!(species(5), ["pollen_birch", "pollen_grass"]);
        assert_eq!(species(7), ["pollen_grass", "pollen_mugwort"]);
        assert_eq!(species(9), ["pollen_mugwort"]);
        assert!(species(11).is_empty());
        assert!(
            Field::ALL
                .iter()
                .all(|f| f.is_pollen() || f.in_season(at(11)))
        );
        // A run on 31 March still fetches birch: its leads reach into April.
        let names = |run: &str| {
            fields_for_run(utc(run))
                .into_iter()
                .map(Field::name)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            names("2026-03-31T00:00:00Z"),
            ["pollen_alder", "pollen_birch", "pm25", "pm10", "no2", "o3"]
        );
        assert_eq!(names("2026-11-10T00:00:00Z"), ["pm25", "pm10", "no2", "o3"]);
    }

    #[test]
    fn chunks_are_day_parts_and_out_of_season_parts_are_dropped() {
        let run = synthetic_run(
            "2026-09-29T00:00:00Z",
            &[Field::PollenMugwort, Field::O3],
            0..=96,
        );
        let chunks = build_chunks(&run).unwrap();
        let names = chunks
            .iter()
            .map(|chunk| {
                let (stem, _) = chunk.filename.rsplit_once("-g").unwrap();
                stem.to_owned()
            })
            .collect::<Vec<_>>();
        // Mugwort ends with September: only the part holding 30 Sep survives; the
        // l25-48 part ends on 1 Oct 00:00 and still counts as September-touching.
        assert_eq!(
            names,
            [
                "cams-pollen_mugwort-20260929T00-l1-24",
                "cams-pollen_mugwort-20260929T00-l25-48",
                "cams-o3-20260929T00-l1-24",
                "cams-o3-20260929T00-l25-48",
                "cams-o3-20260929T00-l49-72",
                "cams-o3-20260929T00-l73-96",
            ]
        );
        let o3 = &chunks[2].manifest;
        assert_eq!(o3.source, "cams");
        assert_eq!(o3.field, "o3");
        assert_eq!(o3.times.len(), 24);
        assert_eq!(o3.times[0], "2026-09-29T01:00:00Z");
        let decoded = mrf::decode(&chunks[2].bytes).unwrap();
        assert_eq!(decoded.header.grid, CAMS_GRID.mrf_grid());
        assert_eq!(decoded.frames[0].len(), CAMS_GRID.cell_count());
        // lead 1 → 11 µg/m³ → index 22 everywhere.
        assert!(decoded.frames[0].iter().all(|cell| *cell == 22));
    }

    #[test]
    fn implausible_units_are_rejected() {
        let mut run = synthetic_run("2026-09-25T00:00:00Z", &[Field::Pm25], 0..=24);
        for values in run.fields.get_mut(&Field::Pm25).unwrap().values_mut() {
            values.iter_mut().for_each(|value| *value *= 1e9);
        }
        let error = build_chunks(&run).unwrap_err().to_string();
        assert!(error.contains("implausible"), "{error}");
    }

    #[test]
    fn feed_loads_sidecar_and_drops_stale_runs() {
        let directory = tempfile::tempdir().unwrap();
        let run = synthetic_run("2026-09-25T00:00:00Z", &[Field::No2], 0..=48);
        let chunks = build_chunks(&run).unwrap();
        let mut feed = Feed::default();
        assert!(!feed.refresh(directory.path(), run.run).unwrap());
        write_publication(directory.path(), &run, &chunks).unwrap();
        assert!(feed.refresh(directory.path(), run.run).unwrap());
        assert_eq!(feed.chunks.len(), 2);
        assert_eq!(feed.section.as_ref().unwrap().license, LICENSE);
        assert_eq!(feed.section.as_ref().unwrap().run, "2026-09-25T00:00:00Z");
        assert!(!feed.refresh(directory.path(), run.run).unwrap());
        let later = run.run + Duration::hours(MAX_RUN_AGE_HOURS + 1);
        assert!(feed.refresh(directory.path(), later).unwrap());
        assert!(feed.chunks.is_empty() && feed.section.is_none());
    }

    #[test]
    fn feed_refuses_a_sidecar_that_disagrees_with_its_chunk() {
        let directory = tempfile::tempdir().unwrap();
        let run = synthetic_run("2026-09-25T00:00:00Z", &[Field::No2], 0..=24);
        let chunks = build_chunks(&run).unwrap();
        write_publication(directory.path(), &run, &chunks).unwrap();
        let path = directory.path().join(SIDECAR);
        let mut sidecar: Sidecar = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        sidecar.chunks[0].times.pop();
        fs::write(&path, serde_json::to_vec(&sidecar).unwrap()).unwrap();
        assert!(Feed::default().refresh(directory.path(), run.run).is_err());
    }
}
