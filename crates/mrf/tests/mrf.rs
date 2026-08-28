use base64::{Engine, engine::general_purpose::STANDARD};
use mrf::{
    COMPRESSION_LEVEL, ChunkMeta, Grid, decode, encode, parse_header, quantization_table, quantize,
    quantize_with_table,
};
use proptest::prelude::*;

fn grid(width: u32, height: u32) -> Grid {
    Grid {
        crs: "EPSG:3857".into(),
        x0: 364_958.0,
        y0: 7_045_000.0,
        dx: 1_000.0,
        dy: -1_000.0,
        width,
        height,
    }
}

fn meta(width: u32, height: u32, frame_count: usize) -> ChunkMeta {
    ChunkMeta::standard(
        grid(width, height),
        "synthetic",
        "2026-08-28T12:00:00Z",
        (0..frame_count)
            .map(|index| format!("2026-08-28T12:{index:02}:00Z"))
            .collect(),
    )
}

proptest! {
    #[test]
    fn roundtrip_property(frame in prop::collection::vec(any::<u8>(), 1..128), count in 1_usize..5) {
        let frames = vec![frame.clone(); count];
        let chunk = encode(&frames, &meta(frame.len() as u32, 1, count)).unwrap();
        let full = decode(&chunk).unwrap();
        prop_assert_eq!(full.frames, frames);
        let index = parse_header(&chunk).unwrap();
        for frame_index in 0..count {
            let range = index.frame_range(frame_index).unwrap();
            let member = &chunk[range.start as usize..range.end as usize];
            prop_assert_eq!(index.decode_frame(frame_index, member).unwrap(), frame.clone());
        }
    }
}

#[test]
fn dry_no_data_heavy_and_85_frame_chunks_roundtrip() {
    let dry = vec![0; 12];
    let no_data = vec![255; 12];
    let heavy = (0..12)
        .map(|index| if index % 2 == 0 { 254 } else { 253 })
        .collect::<Vec<_>>();
    let short = vec![dry.clone(), no_data.clone(), heavy.clone()];
    assert_eq!(
        decode(&encode(&short, &meta(4, 3, short.len())).unwrap())
            .unwrap()
            .frames,
        short
    );
    let long = (0..85)
        .map(|frame| (0..12).map(|cell| ((frame + cell) % 256) as u8).collect())
        .collect::<Vec<Vec<u8>>>();
    assert_eq!(
        decode(&encode(&long, &meta(4, 3, long.len())).unwrap())
            .unwrap()
            .frames,
        long
    );
}

#[test]
fn header_and_offsets_tile_the_payload() {
    let frames = vec![vec![0, 1, 2, 3], vec![255, 254, 3, 0], vec![4, 5, 6, 7]];
    let chunk = encode(&frames, &meta(2, 2, frames.len())).unwrap();
    let index = parse_header(&chunk).unwrap();
    assert_eq!(
        index.header_len,
        8 + u32::from_le_bytes(chunk[4..8].try_into().unwrap()) as usize
    );
    let mut end = 0;
    for (number, frame) in index.header.frames.iter().enumerate() {
        assert_eq!(frame.offset, end);
        let range = index.frame_range(number).unwrap();
        assert_eq!(
            range.start as usize,
            index.header_len + frame.offset as usize
        );
        assert_eq!(
            index
                .decode_frame(number, &chunk[range.start as usize..range.end as usize])
                .unwrap(),
            frames[number]
        );
        end += frame.len;
    }
    assert_eq!(index.header_len + end as usize, chunk.len());
}

#[test]
fn quantization_rules_are_exact() {
    let table = quantization_table();
    assert_eq!(table.len(), 256);
    assert_eq!(table[0], Some(0.0));
    assert_eq!(table[255], None);
    assert_eq!(quantize(f32::NAN), 255);
    assert_eq!(quantize(0.004_999), 0);
    assert_eq!(quantize(0.005), 0);
    assert_eq!(quantize(151.0), 254);
    let midpoint = (table[100].unwrap() + table[101].unwrap()) / 2.0;
    assert_eq!(quantize(midpoint), 100);
}

#[test]
fn signed_quantization_uses_the_full_table() {
    let table = (0..255)
        .map(|index| Some(-30.0 + index as f32 * 0.3))
        .chain(std::iter::once(None))
        .collect::<Vec<_>>();
    assert_eq!(quantize_with_table(-40.0, &table).unwrap(), 0);
    assert_eq!(quantize_with_table(-29.85, &table).unwrap(), 0);
    assert_eq!(quantize_with_table(0.0, &table).unwrap(), 100);
    assert_eq!(quantize_with_table(60.0, &table).unwrap(), 254);

    let meta = ChunkMeta::standard(
        grid(1, 1),
        "harmonie",
        "2026-08-28T12:00:00Z",
        vec!["2026-08-28T13:00:00Z".into()],
    )
    .with_field("temp_c", table);
    let chunk = encode(&[vec![100]], &meta).unwrap();
    let header = parse_header(&chunk).unwrap().header;
    assert_eq!(header.field, "temp_c");
    assert_eq!(header.quant[0], Some(-30.0));
}

#[test]
fn golden_chunk_decodes_byte_exactly() {
    let fixture = STANDARD
        .decode(
            include_str!("fixtures/golden-canonical.mrf.b64")
                .lines()
                .collect::<String>(),
        )
        .unwrap();
    let decoded = decode(&fixture).unwrap();
    assert_eq!(decoded.frames, vec![vec![0, 1, 255, 254], vec![3, 4, 5, 6]]);
    assert_eq!(
        encode(
            &decoded.frames,
            &ChunkMeta {
                field: decoded.header.field,
                grid: decoded.header.grid,
                quant: decoded.header.quant,
                source: decoded.header.source,
                run: decoded.header.run,
                frame_times: decoded
                    .header
                    .frames
                    .into_iter()
                    .map(|frame| frame.time)
                    .collect()
            }
        )
        .unwrap(),
        fixture
    );
}

#[test]
fn cli_encodes_inspects_and_decodes_raw_data() {
    let directory = std::env::temp_dir().join(format!("mrf-cli-test-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let input = directory.join("field.f32le");
    let metadata = directory.join("meta.json");
    let chunk = directory.join("field.mrf");
    let output = directory.join("field.u8");
    let mut raw = Vec::new();
    for value in [0.0_f32, 1.0, f32::NAN, 254.0] {
        raw.extend_from_slice(&value.to_le_bytes());
    }
    std::fs::write(&input, raw).unwrap();
    let quant = (0..255)
        .map(|index| Some(index as f32))
        .chain(std::iter::once(None))
        .collect::<Vec<_>>();
    std::fs::write(
        &metadata,
        serde_json::to_vec(&serde_json::json!({
            "grid": grid(2, 2), "quant": quant, "source": "cli-test", "run": "2026-08-28T12:00:00Z", "times": ["2026-08-28T12:00:00Z"]
        }))
        .unwrap(),
    )
    .unwrap();
    let binary = env!("CARGO_BIN_EXE_mrf");
    assert!(
        std::process::Command::new(binary)
            .args(["encode", "--input"])
            .arg(&input)
            .args(["--meta"])
            .arg(&metadata)
            .args(["--output"])
            .arg(&chunk)
            .status()
            .unwrap()
            .success()
    );
    let inspect = std::process::Command::new(binary)
        .arg("inspect")
        .arg(&chunk)
        .output()
        .unwrap();
    assert!(inspect.status.success());
    assert!(
        String::from_utf8(inspect.stdout)
            .unwrap()
            .contains("frame table")
    );
    assert!(
        std::process::Command::new(binary)
            .args(["decode"])
            .arg(&chunk)
            .args(["0", "--output"])
            .arg(&output)
            .status()
            .unwrap()
            .success()
    );
    assert_eq!(std::fs::read(&output).unwrap(), [0, 1, 255, 254]);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn level_19_beats_level_3_on_sparse_advecting_fields() {
    let fields = sparse_advecting_fields(12);
    let compressed_at = |level| {
        fields
            .iter()
            .map(|field| {
                zstd::stream::encode_all(field.as_slice(), level)
                    .unwrap()
                    .len()
            })
            .sum::<usize>()
    };
    let level_3 = compressed_at(3);
    let level_19 = compressed_at(COMPRESSION_LEVEL);
    eprintln!("synthetic 700x765 x12: zstd level 3={level_3} bytes, level 19={level_19} bytes");
    assert!(level_19 <= level_3);
}

fn sparse_advecting_fields(frame_count: usize) -> Vec<Vec<u8>> {
    const WIDTH: usize = 700;
    const HEIGHT: usize = 765;
    (0..frame_count)
        .map(|frame| {
            let mut field = vec![0; WIDTH * HEIGHT];
            for y in 0..HEIGHT {
                for x in 0..WIDTH {
                    let mut intensity = 0_u8;
                    for blob in 0..5 {
                        let cx = 90 + blob * 140 + frame * 7;
                        let cy = 110 + (blob * 109 + frame * 5) % 560;
                        let dx = x.abs_diff(cx);
                        let dy = y.abs_diff(cy);
                        if dx * dx + dy * dy < 2_500 {
                            intensity = intensity.max((254 - (dx + dy) as u8).max(1));
                        }
                    }
                    field[y * WIDTH + x] = intensity;
                }
            }
            field
        })
        .collect()
}
