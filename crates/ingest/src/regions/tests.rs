use std::time::Duration;

use super::*;
use crate::publisher::produced_chunk;

/// 2 × 2 regio's van 40 km op een stuk van het echte kader; alle vier met een bestand.
fn small_grid() -> RegionGrid {
    RegionGrid {
        west: 258_000.0,
        east: 338_000.0,
        north: 7_132_000.0,
        south: 7_052_000.0,
        columns: 2,
        rows: 2,
        present: vec![0, 1, 2, 3],
    }
}

fn mrf_grid(x0: f64, y0: f64, step: f64, width: u32, height: u32) -> mrf::Grid {
    mrf::Grid {
        crs: "EPSG:3857".into(),
        x0,
        y0,
        dx: step,
        dy: -step,
        width,
        height,
    }
}

fn cell_byte(cell: usize, frame: usize) -> u8 {
    ((cell * 7 + frame * 13) % 251) as u8
}

/// Regen op een 1 km-raster dat het kader ruim bedekt, met een bewegingsveld per frame behalve het eerste.
fn rain_chunk(name: &str) -> ProducedChunk {
    let grid = mrf_grid(200_000.0, 7_200_000.0, 1_000.0, 200, 200);
    let frames = (0..3)
        .map(|frame| (0..40_000).map(|cell| cell_byte(cell, frame)).collect())
        .collect::<Vec<Vec<u8>>>();
    let motion_grid = mrf::MotionGrid { bw: 25, bh: 25 };
    let motions = (0..3)
        .map(|frame| {
            (frame > 0).then(|| {
                (0..25 * 25 * 2)
                    .map(|index| ((index + frame) % 50) as i8 - 25)
                    .collect()
            })
        })
        .collect::<Vec<_>>();
    let times = [
        "2026-11-09T10:00:00Z",
        "2026-11-09T10:05:00Z",
        "2026-11-09T10:10:00Z",
    ]
    .map(String::from)
    .to_vec();
    let meta = mrf::ChunkMeta::standard(grid, "rtcor", "2026-11-09T10:10:00Z", times);
    produced_chunk(
        name.into(),
        mrf::encode_with_motion(&frames, &meta, motion_grid, &motions).unwrap(),
    )
    .unwrap()
}

/// Temperatuur op een 6 km-raster.
fn temperature_chunk(name: &str) -> ProducedChunk {
    let grid = mrf_grid(240_000.0, 7_150_000.0, 6_000.0, 30, 30);
    let frames = (0..2)
        .map(|frame| (0..900).map(|cell| cell_byte(cell, frame)).collect())
        .collect::<Vec<Vec<u8>>>();
    let times = ["2026-11-09T10:00:00Z", "2026-11-09T11:00:00Z"]
        .map(String::from)
        .to_vec();
    let meta = mrf::ChunkMeta::standard(grid, "harmonie", "2026-11-09T07:00:00Z", times)
        .with_field("temp_c", mrf::quantization_table());
    produced_chunk(name.into(), mrf::encode(&frames, &meta).unwrap()).unwrap()
}

#[test]
fn land_grid_matches_the_place_catalogue() {
    let grid = RegionGrid::land().unwrap();
    assert_eq!((grid.columns, grid.rows), (14, 15));
    assert_eq!(grid.present.len(), 148);
    for id in [0, 13, 100, 209] {
        let bounds = grid.bounds(id);
        let centre = (
            (bounds.west + bounds.east) / 2.0,
            (bounds.north + bounds.south) / 2.0,
        );
        assert_eq!(grid.region_of(centre.0, centre.1), Some(id));
        // Op de rand zelf beslist de afronding; een meter binnen de rand is eenduidig.
        assert_eq!(
            grid.region_of(bounds.west + 1.0, bounds.north - 1.0),
            Some(id)
        );
    }
    assert_eq!(grid.region_of(grid.east, grid.north), None);
    assert_eq!(grid.region_of(grid.west, grid.south), None);
}

/// Elke plek in de regio vindt in de HARMONIE-groep zijn cel, de hele regenpatch en de bewegingsblokken van de
/// client, en in de ECMWF-groep de bilineaire buren, met dezelfde bytes als het raster.
#[test]
fn region_files_hold_every_value_a_place_reads() {
    let grid = small_grid();
    let rain = rain_chunk("harmonie-test.mrf");
    let temperature = temperature_chunk("ecmwf-step_temp_c-test.mrf");
    let built_rain = build_group(Group::Harmonie, &[&rain], &grid, 3).unwrap();
    let built_temperature = build_group(Group::Ecmwf, &[&temperature], &grid, 3).unwrap();
    assert_eq!(built_rain.files.len(), 4);
    let rain_decoded = mrf::decode(&rain.bytes).unwrap();
    let temperature_decoded = mrf::decode(&temperature.bytes).unwrap();

    for (id, bytes) in &built_rain.files {
        let file = read_region_file(bytes).unwrap();
        assert_eq!(file.header.region, *id);
        assert_eq!(file.header.chunks[0].url, "chunks/harmonie-test.mrf");
        let bounds = grid.bounds(*id);
        let header = &rain_decoded.header;
        for step in 0..=20 {
            let x = bounds.west + (bounds.east - bounds.west) * f64::from(step) / 20.0
                - if step == 20 { 1.0 } else { 0.0 };
            let y = bounds.north - (bounds.north - bounds.south) * f64::from(step) / 20.0
                + if step == 20 { 1.0 } else { 0.0 };
            assert_eq!(grid.region_of(x, y), Some(*id));
            let column = ((x - header.grid.x0) / header.grid.dx).floor() as i64;
            let row = ((y - header.grid.y0) / header.grid.dy).floor() as i64;
            let radius = i64::from(RAIN_MARGIN_CELLS);
            for patch_row in row - radius..=row + radius {
                for patch_column in column - radius..=column + radius {
                    let cell =
                        patch_row as usize * header.grid.width as usize + patch_column as usize;
                    for frame in 0..3 {
                        assert_eq!(
                            file.value(0, patch_column as u32, patch_row as u32, frame),
                            Some(rain_decoded.frames[frame][cell])
                        );
                    }
                }
            }
            let motion_grid = header.motion_grid.unwrap();
            let block_x = (x - header.grid.x0) / header.grid.dx / f64::from(header.grid.width)
                * f64::from(motion_grid.bw)
                - 0.5;
            let block_y = (y - header.grid.y0) / header.grid.dy / f64::from(header.grid.height)
                * f64::from(motion_grid.bh)
                - 0.5;
            for (block_column, block_row) in [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)] {
                let block_column = (block_x.floor() + block_column)
                    .clamp(0.0, f64::from(motion_grid.bw - 1))
                    as u32;
                let block_row =
                    (block_y.floor() + block_row).clamp(0.0, f64::from(motion_grid.bh - 1)) as u32;
                for frame in 1..3u32 {
                    let vectors = rain_decoded.motions[frame as usize].as_ref().unwrap();
                    let at =
                        (block_row as usize * motion_grid.bw as usize + block_column as usize) * 2;
                    assert_eq!(
                        file.motion(0, block_column, block_row, frame),
                        Some((vectors[at], vectors[at + 1]))
                    );
                }
            }
            assert_eq!(
                file.motion(0, 0, 0, 0),
                None,
                "het eerste frame heeft geen bewegingsveld"
            );
        }
    }

    for (id, bytes) in &built_temperature.files {
        let file = read_region_file(bytes).unwrap();
        let bounds = grid.bounds(*id);
        let header = &temperature_decoded.header;
        let table = &built_temperature.tables[&file.header.chunks[0].table];
        assert_eq!((&table.grid, &table.quant), (&header.grid, &header.quant));
        for (x, y) in [
            (bounds.west, bounds.north),
            (bounds.east - 1.0, bounds.south + 1.0),
        ] {
            let column = ((x - header.grid.x0) / header.grid.dx - 0.5).floor() as u32;
            let row = ((y - header.grid.y0) / header.grid.dy - 0.5).floor() as u32;
            for (bilinear_column, bilinear_row) in [
                (column, row),
                (column + 1, row),
                (column, row + 1),
                (column + 1, row + 1),
            ] {
                let cell =
                    bilinear_row as usize * header.grid.width as usize + bilinear_column as usize;
                assert_eq!(
                    file.value(0, bilinear_column, bilinear_row, 1),
                    Some(temperature_decoded.frames[1][cell])
                );
            }
        }
    }
}

/// Hybride: radar en de HARMONIE-velden alleen hun eigen cellen en geen beweging; de patch dient alleen de
/// tussenbalken, en die heeft alleen de HARMONIE-regen.
#[test]
fn hybrid_layout_keeps_only_own_cells_outside_harmonie_rain() {
    let grid = small_grid();
    let rain = rain_chunk("rtcor-test.mrf");
    let temperature = temperature_chunk("harmonie-temp_c-test.mrf");
    for (group, chunk) in [(Group::Radar, &rain), (Group::Harmonie, &temperature)] {
        let built = build_group(group, &[chunk], &grid, 3).unwrap();
        let decoded = mrf::decode(&chunk.bytes).unwrap();
        for (id, bytes) in &built.files {
            let file = read_region_file(bytes).unwrap();
            let entry = &file.header.chunks[0];
            assert_eq!(
                Some(entry.window),
                cell_window(&decoded.header.grid, grid.bounds(*id), 0)
            );
            assert!(entry.motion.is_none());
        }
    }
}

#[test]
fn windows_stop_at_the_raster_edge() {
    let raster = mrf_grid(300_000.0, 7_100_000.0, 6_000.0, 4, 4);
    let bounds = small_grid().bounds(0);
    let window = cell_window(&raster, bounds, FIELD_MARGIN_CELLS).unwrap();
    assert_eq!((window.column, window.row), (0, 0));
    assert!(window.width <= 4 && window.height <= 4);
    let elsewhere = mrf_grid(900_000.0, 7_100_000.0, 6_000.0, 4, 4);
    assert_eq!(cell_window(&elsewhere, bounds, FIELD_MARGIN_CELLS), None);
}

#[test]
fn generation_name_follows_the_chunks() {
    let grid = small_grid();
    let first = group_key(
        Group::Radar,
        &grid,
        &["chunks/a.mrf".into()],
        Layout::HYBRID,
    );
    assert_eq!(
        first,
        group_key(
            Group::Radar,
            &grid,
            &["chunks/a.mrf".into()],
            Layout::HYBRID
        )
    );
    assert_ne!(
        first,
        group_key(
            Group::Radar,
            &grid,
            &["chunks/b.mrf".into()],
            Layout::HYBRID
        )
    );
    assert_ne!(
        first,
        group_key(
            Group::Harmonie,
            &grid,
            &["chunks/a.mrf".into()],
            Layout::HYBRID
        )
    );
    assert_eq!(first.len(), 16);
}

#[test]
fn writer_keeps_the_newest_and_previous_generation() {
    let directory = tempfile::tempdir().unwrap();
    let mut writer = RegionWriter::with_grid(small_grid(), 3);
    let temperature = temperature_chunk("harmonie-temp_c-test.mrf");
    let mut generations = Vec::new();
    for name in ["rtcor-1.mrf", "rtcor-2.mrf", "rtcor-3.mrf"] {
        let rain = rain_chunk(name);
        let section = writer.update(directory.path(), &[&rain, &temperature]);
        let radar = section
            .groups
            .iter()
            .find(|group| group.name == "radar")
            .unwrap();
        assert_eq!(radar.chunks, vec![format!("chunks/{name}")]);
        generations.push(radar.url.clone());
        // De mtime-resolutie mag de volgorde van de generaties niet omdraaien.
        std::thread::sleep(Duration::from_millis(20));
    }
    let exists = |url: &str| directory.path().join(url).is_dir();
    assert!(
        !exists(&generations[0]),
        "de oudste radargeneratie is opgeruimd"
    );
    assert!(exists(&generations[1]) && exists(&generations[2]));
    let section = writer.update(directory.path(), &[&temperature]);
    assert_eq!(
        section
            .groups
            .iter()
            .map(|group| group.name.as_str())
            .collect::<Vec<_>>(),
        ["harmonie"]
    );
    assert_eq!(section.present, vec![0, 1, 2, 3]);
    let harmonie = &section.groups[0].url;
    assert!(directory.path().join(harmonie).join("0.mrr").is_file());
    let tables: TablesFile =
        serde_json::from_slice(&fs::read(directory.path().join(section.tables.unwrap())).unwrap())
            .unwrap();
    assert_eq!(
        tables.tables.len(),
        1,
        "alleen de temperatuur staat nog in het manifest"
    );
}

#[test]
fn unchanged_group_is_not_rebuilt() {
    let directory = tempfile::tempdir().unwrap();
    let mut writer = RegionWriter::with_grid(small_grid(), 3);
    let rain = rain_chunk("rtcor-1.mrf");
    let first = writer.update(directory.path(), &[&rain]);
    let file = directory.path().join(&first.groups[0].url).join("0.mrr");
    let written = fs::metadata(&file).unwrap().modified().unwrap();
    std::thread::sleep(Duration::from_millis(20));
    assert_eq!(writer.update(directory.path(), &[&rain]), first);
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), written);
}

#[test]
fn prune_removes_staging_leftovers() {
    let directory = tempfile::tempdir().unwrap();
    let staging = directory.path().join(DIRECTORY).join(".staging-radar-0000");
    fs::create_dir_all(&staging).unwrap();
    prune_groups(directory.path(), &[]).unwrap();
    assert!(!staging.exists());
}

#[test]
fn frame_list_maps_frames_to_their_slot() {
    let window = Window {
        column: 3,
        row: 4,
        width: 2,
        height: 1,
    };
    let file = RegionFile {
        header: FileHeader {
            version: FORMAT_VERSION,
            group: Group::Radar,
            region: 0,
            chunks: vec![ChunkEntry {
                url: "chunks/a.mrf".to_owned(),
                source: "rtcor".to_owned(),
                field: "rain_rate".to_owned(),
                run: "r".to_owned(),
                table: "t".to_owned(),
                window,
                frames: 2,
                frame_indexes: Some(vec![2, 5]),
                offset: 0,
                motion: None,
                between: None,
            }],
        },
        payload: vec![10, 11, 20, 21],
    };
    assert_eq!(file.value(0, 3, 4, 2), Some(10));
    assert_eq!(file.value(0, 3, 4, 5), Some(11));
    assert_eq!(file.value(0, 4, 4, 5), Some(21));
    assert_eq!(file.value(0, 3, 4, 0), None);
}

#[test]
fn another_layout_is_another_generation() {
    let grid = small_grid();
    let urls = ["chunks/a.mrf".to_owned()];
    assert_ne!(
        group_key(Group::Radar, &grid, &urls, Layout::HYBRID),
        group_key(Group::Radar, &grid, &urls, Layout::PATCH)
    );
}
