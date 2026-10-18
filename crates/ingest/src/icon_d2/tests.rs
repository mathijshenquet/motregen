use super::{download::*, *};

fn utc(value: &str) -> DateTime<Utc> {
    value.parse().unwrap()
}

fn fixture(lead: u32) -> Vec<u8> {
    let path = format!(
        "{}/tests/fixtures/icon-d2-2026101809-{lead:03}-aswdir_s.grib2.bz2",
        env!("CARGO_MANIFEST_DIR")
    );
    fs::read(path).unwrap()
}

/// Two 8 km cells inside the fixture box (51,90–52,30 N × 4,90–5,50 E).
const FIXTURE_GRID: GridSpec = GridSpec {
    crs: "EPSG:3857",
    x0: 560_000.0,
    y0: 6_810_000.0,
    dx: 8_000.0,
    dy: -8_000.0,
    width: 2,
    height: 1,
};

fn constant_run(run: DateTime<Utc>, value: f32) -> DirectRun {
    DirectRun {
        run,
        hours: vec![vec![value; GRID.cell_count()]; LEADS as usize],
        station_hours: vec![vec![value; archive::STATIONS.len()]; LEADS as usize],
    }
}

#[test]
fn real_dwd_file_yields_the_whole_hour_message_not_the_quarter_hours() {
    let run = utc("2026-10-18T09:00:00Z");
    let average = decode_average(&decompress(&fixture(12)).unwrap(), run, 12).unwrap();
    assert_eq!(average.lead, 12);
    assert_eq!(
        average.raster,
        LatLonRaster {
            lat0: 51.9,
            lon0: 4.9,
            dlat: 0.02,
            dlon: 0.02,
            ni: 31,
            nj: 21
        }
    );
    // The fixture's south-west corner is missing, like DWD's bitmap outside the model domain.
    assert!(average.values[0].is_nan());
    // grib_ls over the valid points: the 0-12 h message averages 7,456 W/m², the 0m-735m quarter after it 7,304.
    let valid = average.values[1..].iter().collect::<Vec<_>>();
    assert!(valid.iter().all(|value| value.is_finite()));
    let mean = valid.iter().copied().sum::<f32>() / valid.len() as f32;
    assert!((mean - 7.4558).abs() < 0.01, "{mean}");
    assert!(decode_average(&decompress(&fixture(12)).unwrap(), run, 11).is_err());
    assert!(
        decode_average(
            &decompress(&fixture(12)).unwrap(),
            utc("2026-10-18T06:00:00Z"),
            12
        )
        .is_err()
    );
    assert!(decompress(b"not bzip2").is_err());
}

#[test]
fn real_averages_de_average_to_the_hour_mean_on_blocks() {
    let run = utc("2026-10-18T09:00:00Z");
    let eleven = decode_average(&decompress(&fixture(11)).unwrap(), run, 11).unwrap();
    let twelve = decode_average(&decompress(&fixture(12)).unwrap(), run, 12).unwrap();
    let map = BlockMap::new(&eleven.raster, FIXTURE_GRID).unwrap();
    let block_eleven = map.apply(&eleven.values).unwrap();
    let block_twelve = map.apply(&twelve.values).unwrap();
    for cell in 0..FIXTURE_GRID.cell_count() {
        let pointwise = twelve
            .values
            .iter()
            .zip(&eleven.values)
            .map(|(twelve, eleven)| 12.0 * twelve - 11.0 * eleven)
            .collect::<Vec<_>>();
        let expected = map.apply(&pointwise).unwrap()[cell];
        let hour = 12.0 * block_twelve[cell] - 11.0 * block_eleven[cell];
        assert!((hour - expected).abs() < 0.01);
        // 20–21 UTC on 18 October: the sun is down, only packing noise remains.
        assert!(hour.abs() < 1.0, "{hour}");
    }
}

#[test]
fn block_map_averages_points_inside_each_cell_and_refuses_gaps() {
    let raster = LatLonRaster {
        lat0: 51.9,
        lon0: 4.9,
        dlat: 0.02,
        dlon: 0.02,
        ni: 31,
        nj: 21,
    };
    let map = BlockMap::new(&raster, FIXTURE_GRID).unwrap();
    let mut values = (0..raster.cell_count())
        .map(|index| (index % raster.ni) as f32)
        .collect::<Vec<_>>();
    let means = map.apply(&values).unwrap();
    assert!(means[0] < means[1], "{means:?}");
    let first_cell = &map.cells[0];
    assert!(first_cell.len() >= 6, "{}", first_cell.len());
    values[first_cell[0] as usize] = f32::NAN;
    let means = map.apply(&values).unwrap();
    assert!(means[0].is_nan() && means[1].is_finite());
    assert!(map.apply(&values[1..]).is_err());
    let wider = GridSpec {
        width: 20,
        ..FIXTURE_GRID
    };
    assert!(BlockMap::new(&raster, wider).is_err());
}

#[test]
fn hour_means_undo_the_running_average_and_reject_broken_series() {
    let hour_values = (1..=LEADS)
        .map(|lead| lead as f32 * 10.0)
        .collect::<Vec<_>>();
    let mut sum = 0.0;
    let averages = hour_values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            sum += value;
            vec![sum / (index + 1) as f32; 2]
        })
        .collect::<Vec<_>>();
    let hours = hour_means(&averages).unwrap();
    for (hour, expected) in hours.iter().zip(&hour_values) {
        assert!((hour[0] - expected).abs() < 0.01, "{} {expected}", hour[0]);
    }

    let mut noisy = vec![vec![0.0; 2]; LEADS as usize];
    noisy[0] = vec![0.05; 2];
    let hours = hour_means(&noisy).unwrap();
    assert_eq!(hours[1], vec![0.0; 2]);

    let mut falling = averages.clone();
    falling[30][0] = 0.0;
    assert!(hour_means(&falling).is_err());
    let mut missing = averages.clone();
    missing[5][1] = f32::NAN;
    assert!(hour_means(&missing).is_err());
    assert!(hour_means(&averages[1..]).is_err());
}

#[test]
fn publication_roundtrips_and_feed_drops_stale_or_removed_sidecars() {
    let directory = tempfile::tempdir().unwrap();
    let run = utc("2026-10-18T09:00:00Z");
    let chunk = build_chunk(&constant_run(run, 412.0)).unwrap();
    let decoded = mrf::decode(&chunk.bytes).unwrap();
    assert_eq!(decoded.header.grid, GRID.mrf_grid());
    assert_eq!(decoded.header.field, FIELD);
    assert_eq!(decoded.header.source, SOURCE);
    assert_eq!(decoded.frames.len(), 48);
    assert_eq!(decoded.header.frames[0].time, "2026-10-18T10:00:00Z");
    assert_eq!(decoded.header.frames[47].time, "2026-10-20T09:00:00Z");
    assert_eq!(
        decoded.header.quant[usize::from(decoded.frames[0][0])],
        Some(410.0)
    );

    assert_eq!(published_run(directory.path()).unwrap(), None);
    let mut feed = Feed::default();
    assert!(!feed.refresh(directory.path(), run).unwrap());
    write_publication(directory.path(), run, &chunk).unwrap();
    assert_eq!(published_run(directory.path()).unwrap(), Some(run));
    assert!(feed.refresh(directory.path(), run).unwrap());
    assert!(!feed.refresh(directory.path(), run).unwrap());
    assert_eq!(feed.chunks[0].manifest.field, FIELD);
    assert!(
        !feed
            .refresh(directory.path(), run + Duration::hours(12))
            .unwrap()
    );
    assert!(
        feed.refresh(directory.path(), run + Duration::hours(13))
            .unwrap()
    );
    assert!(feed.chunks.is_empty());
    assert!(feed.refresh(directory.path(), run).unwrap());
    fs::remove_file(directory.path().join(SIDECAR)).unwrap();
    assert!(feed.refresh(directory.path(), run).unwrap());
    assert!(feed.chunks.is_empty());
}

#[test]
fn feed_rejects_mismatched_chunks_attribution_and_path_traversal() {
    let directory = tempfile::tempdir().unwrap();
    let run = utc("2026-10-18T09:00:00Z");
    let chunk = build_chunk(&constant_run(run, 100.0)).unwrap();
    write_publication(directory.path(), run, &chunk).unwrap();
    let path = directory.path().join(SIDECAR);
    let original: Sidecar = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let rejects = |sidecar: &Sidecar| {
        fs::write(&path, serde_json::to_vec(sidecar).unwrap()).unwrap();
        Feed::default().refresh(directory.path(), run).is_err()
    };
    let mut sidecar = original.clone();
    sidecar.chunks[0].times.pop();
    assert!(rejects(&sidecar));
    let mut sidecar = original.clone();
    sidecar.chunks[0].url = "chunks/../icon-d2.json".into();
    assert!(rejects(&sidecar));
    let mut sidecar = original.clone();
    sidecar.license = "DWD".into();
    assert!(rejects(&sidecar));
    let mut sidecar = original.clone();
    sidecar.run = "2026-10-18T10:00:00Z".into();
    assert!(rejects(&sidecar));
    let mut sidecar = original.clone();
    sidecar.chunks.push(sidecar.chunks[0].clone());
    assert!(rejects(&sidecar));
    assert!(!rejects(&original));
}

#[test]
fn run_times_are_three_hourly() {
    assert!(is_run_time(utc("2026-10-18T21:00:00Z")));
    assert!(!is_run_time(utc("2026-10-18T10:00:00Z")));
    assert!(!is_run_time(utc("2026-10-18T09:30:00Z")));
}

mod http {
    use super::*;
    use std::{
        io::{Read as _, Write},
        net::TcpListener,
        thread,
    };

    /// Answers each request with the status for its path (200 when listed, else 404), and records paths.
    fn serve(online: Vec<String>, requests: usize) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let mut seen = Vec::new();
            for _ in 0..requests {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                    let mut buffer = [0; 1024];
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0);
                    request.extend_from_slice(&buffer[..count]);
                }
                let request = String::from_utf8(request).unwrap();
                let path = request.split_whitespace().nth(1).unwrap().to_owned();
                let status = if online.iter().any(|known| path.ends_with(known.as_str())) {
                    "200 OK"
                } else {
                    "404 Not Found"
                };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
                seen.push(path);
            }
            seen
        });
        (format!("http://{address}"), server)
    }

    #[test]
    fn latest_run_is_the_newest_with_lead_48_and_fails_when_dwd_is_late() {
        let complete = "/06/aswdir_s/icon-d2_germany_regular-lat-lon_single-level_2026101806_048_2d_aswdir_s.grib2.bz2";
        let (base, server) = serve(vec![complete.into()], 2);
        let directory = tempfile::tempdir().unwrap();
        let client = DwdClient::new(directory.path(), Some(base)).unwrap();
        assert_eq!(
            client.latest_run(utc("2026-10-18T09:35:00Z")).unwrap(),
            utc("2026-10-18T06:00:00Z")
        );
        let seen = server.join().unwrap();
        assert!(seen[0].contains("/09/aswdir_s/") && seen[0].contains("_2026101809_048_"));

        let (base, server) = serve(vec![complete.into()], 3);
        let client = DwdClient::new(directory.path(), Some(base)).unwrap();
        assert!(client.latest_run(utc("2026-10-18T12:35:00Z")).is_err());
        server.join().unwrap();
    }
}

mod station_archive {
    use super::*;
    use std::io::Read as _;

    const DWD_RASTER: LatLonRaster = LatLonRaster {
        lat0: 43.18,
        lon0: -3.94,
        dlat: 0.02,
        dlon: 0.02,
        ni: 1215,
        nj: 746,
    };

    fn de_bilt() -> usize {
        archive::STATIONS
            .iter()
            .position(|station| station.id == 260)
            .unwrap()
    }

    #[test]
    fn stations_map_to_the_nearest_point_and_the_cell_the_client_reads() {
        let points = archive::nearest_points(&DWD_RASTER).unwrap();
        assert_eq!(points.len(), 32);
        // De Bilt (52,100 N, 5,180 E): rij 446, kolom 456.
        assert_eq!(points[de_bilt()], 446 * 1215 + 456);
        // Zelfde cel als pointValue in de client: kolom 72, rij 97 op het 8 km-raster.
        assert_eq!(archive::publication_cells()[de_bilt()], 97 * 157 + 72);
        let fixture_box = LatLonRaster {
            lat0: 51.9,
            lon0: 4.9,
            dlat: 0.02,
            dlon: 0.02,
            ni: 31,
            nj: 21,
        };
        assert!(archive::nearest_points(&fixture_box).is_err());
    }

    #[test]
    fn extract_holds_block_and_point_per_station_and_lead() {
        let directory = tempfile::tempdir().unwrap();
        let run = utc("2026-10-18T12:00:00Z");
        let cell_values = (0..GRID.cell_count())
            .map(|cell| cell as f32)
            .collect::<Vec<_>>();
        let direct = DirectRun {
            run,
            hours: vec![cell_values; LEADS as usize],
            station_hours: (1..=LEADS)
                .map(|lead| vec![lead as f32 * 10.0; archive::STATIONS.len()])
                .collect(),
        };
        archive::write(directory.path(), &direct).unwrap();
        let path = archive::path(directory.path(), run);
        assert!(path.ends_with("icon-d2-archive/20261018T12.csv.bz2"));
        let mut csv = String::new();
        bzip2::read::BzDecoder::new(fs::File::open(&path).unwrap())
            .read_to_string(&mut csv)
            .unwrap();
        let lines = csv.lines().collect::<Vec<_>>();
        assert_eq!(lines[0], "station,lead,hour_end_utc,block_wm2,point_wm2");
        assert_eq!(lines.len(), 1 + 32 * 48);
        assert!(lines.contains(&"260,1,2026-10-18T13:00:00Z,15301.0,10.0"));
        assert!(lines.contains(&"260,48,2026-10-20T12:00:00Z,15301.0,480.0"));
        // Klein: 32 stations × 48 uur.
        assert!(fs::metadata(&path).unwrap().len() < 20_000);

        let mismatched = DirectRun {
            station_hours: Vec::new(),
            ..direct
        };
        assert!(archive::write(directory.path(), &mismatched).is_err());
    }

    #[test]
    fn prune_removes_only_extracts_older_than_the_retention() {
        let directory = tempfile::tempdir().unwrap();
        let archive_dir = directory.path().join(archive::DIRECTORY);
        fs::create_dir_all(&archive_dir).unwrap();
        for name in [
            "20250901T00.csv.bz2",
            "20251018T12.csv.bz2",
            "20261018T12.csv.bz2",
            "notes.txt",
        ] {
            fs::write(archive_dir.join(name), b"x").unwrap();
        }
        let now = utc("2026-10-18T15:00:00Z");
        assert_eq!(archive::prune(directory.path(), now).unwrap(), 1);
        let mut left = fs::read_dir(&archive_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect::<Vec<_>>();
        left.sort();
        assert_eq!(
            left,
            ["20251018T12.csv.bz2", "20261018T12.csv.bz2", "notes.txt"]
        );
        assert_eq!(
            archive::prune(&directory.path().join("missing"), now).unwrap(),
            0
        );
    }
}
