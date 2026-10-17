use super::*;

fn utc(value: &str) -> DateTime<Utc> {
    value.parse().unwrap()
}

pub fn synthetic(run: DateTime<Utc>) -> EcmwfRun {
    let mut messages = Vec::new();
    let mut previous = 0;
    for end in forecast_steps() {
        for parameter in Parameter::FORECAST {
            let (start, value) = match parameter {
                Parameter::Precip => (0, end as f32),
                Parameter::Tmax => (previous, 20.0),
                Parameter::Tmin => (previous, 10.0),
                Parameter::Gust => (end - 1, 12.0),
                Parameter::U => (end, 3.0),
                Parameter::V => (end, 4.0),
                Parameter::Cloud => (end, 40.0),
                _ => unreachable!(),
            };
            messages.push(Message {
                run,
                parameter,
                start,
                end,
                values: vec![value; CROP.cell_count()],
            });
        }
        previous = end;
    }
    for start in (0..=216).step_by(12) {
        for parameter in [Parameter::Prob1, Parameter::Prob5] {
            messages.push(Message {
                run,
                parameter,
                start,
                end: start + 24,
                values: vec![start as f32 / 3.0; CROP.cell_count()],
            });
        }
    }
    EcmwfRun { run, messages }
}

#[test]
fn summer_and_winter_clock_changes_have_23_and_25_hour_totals() {
    for (run, date, hours, start, end) in [
        (
            "2026-03-28T00:00:00Z",
            "2026-03-29",
            23,
            "2026-03-28T23:00:00Z",
            "2026-03-29T22:00:00Z",
        ),
        (
            "2026-10-24T00:00:00Z",
            "2026-10-25",
            25,
            "2026-10-24T22:00:00Z",
            "2026-10-25T23:00:00Z",
        ),
    ] {
        let daily = aggregate(&synthetic(utc(run))).unwrap();
        let index = daily
            .days
            .iter()
            .position(|day| day.date.to_string() == date)
            .unwrap();
        assert_eq!(daily.days[index].start, utc(start));
        assert_eq!(daily.days[index].end, utc(end));
        assert_eq!(
            (daily.days[index].end - daily.days[index].start).num_hours(),
            hours
        );
        assert!((daily.fields[&Field::Precip][index][0] - hours as f32).abs() < 0.001);
        assert_eq!(
            daily.days[index].noon().with_timezone(&Amsterdam).hour(),
            12
        );
    }
}

#[test]
fn midday_run_omits_both_incomplete_days() {
    let daily = aggregate(&synthetic(utc("2026-10-17T12:00:00Z"))).unwrap();
    assert_eq!(daily.days.len(), 9);
    assert_eq!(daily.days[0].date.to_string(), "2026-10-18");
    assert_eq!(daily.days.last().unwrap().date.to_string(), "2026-10-26");
    assert!(
        daily.fields[&Field::Precip]
            .iter()
            .zip(&daily.days)
            .all(
                |(frame, day)| (frame[0] - (day.end - day.start).num_hours() as f32).abs() < 0.001
            )
    );
}

#[test]
fn transition_144_to_150_deaccumulates_six_hours_once() {
    let run = synthetic(utc("2026-10-17T00:00:00Z"));
    let messages = run
        .messages
        .iter()
        .filter(|message| message.parameter == Parameter::Precip)
        .collect::<Vec<_>>();
    let intervals = precipitation_intervals(&messages).unwrap();
    let interval = intervals.iter().find(|message| message.end == 150).unwrap();
    assert_eq!(interval.start, 144);
    assert_eq!(interval.values[0], 6.0);
    let daily = aggregate(&run).unwrap();
    assert!(
        daily.fields[&Field::Precip]
            .iter()
            .zip(&daily.days)
            .all(
                |(frame, day)| (frame[0] - (day.end - day.start).num_hours() as f32).abs() < 0.001
            )
    );
}

#[test]
fn precipitation_handles_period_accumulation_and_rejects_resets_or_gaps() {
    let run = utc("2026-10-17T00:00:00Z");
    let message = |start, end, value| Message {
        run,
        parameter: Parameter::Precip,
        start,
        end,
        values: vec![value],
    };
    let messages = [
        message(0, 3, 2.0),
        message(0, 6, 7.0),
        message(6, 9, 3.0),
        message(6, 12, 4.0),
    ];
    let intervals = precipitation_intervals(&messages.iter().collect::<Vec<_>>()).unwrap();
    assert_eq!(
        intervals
            .iter()
            .map(|message| message.values[0])
            .collect::<Vec<_>>(),
        [2.0, 5.0, 3.0, 1.0]
    );
    assert!(precipitation_intervals(&[&message(0, 3, 4.0), &message(0, 6, 2.0)]).is_err());
    assert!(precipitation_intervals(&[&message(0, 3, 4.0), &message(6, 9, 2.0)]).is_err());
}

#[test]
fn extrema_include_overlapping_intervals_and_probability_uses_nearest_window_midpoint() {
    let mut run = synthetic(utc("2026-10-17T00:00:00Z"));
    let crossing = run
        .messages
        .iter_mut()
        .find(|message| message.parameter == Parameter::Tmax && message.end == 24)
        .unwrap();
    crossing.values.fill(35.0);
    let daily = aggregate(&run).unwrap();
    assert_eq!(daily.fields[&Field::Tmax][0][0], 35.0);
    // 18 October local midnight is 17 October 22 UTC, so the closest window is 24–48.
    assert_eq!(daily.fields[&Field::Prob1][0][0], 8.0);
    assert_eq!(daily.fields[&Field::Prob5][0][0], 8.0);
}

#[test]
fn daytime_wind_max_and_cloud_mean_ignore_night_values() {
    let mut run = synthetic(utc("2026-10-17T00:00:00Z"));
    for message in &mut run.messages {
        if message.end == 24 {
            if message.parameter == Parameter::U {
                message.values.fill(50.0);
            }
            if message.parameter == Parameter::Cloud {
                message.values.fill(100.0);
            }
        }
        if message.end == 30 && message.parameter == Parameter::U {
            message.values.fill(0.0);
        }
        if message.end == 30 && message.parameter == Parameter::V {
            message.values.fill(-10.0);
        }
    }
    let daily = aggregate(&run).unwrap();
    assert_eq!(daily.fields[&Field::Wind][0][0], 10.0);
    assert_eq!(daily.fields[&Field::Direction][0][0], 0.0);
    assert_eq!(daily.fields[&Field::Cloud][0][0], 40.0);
}

#[test]
fn missing_steps_duplicates_and_missing_data_do_not_become_dry_days() {
    let mut run = synthetic(utc("2026-10-17T00:00:00Z"));
    let precip = run
        .messages
        .iter_mut()
        .find(|message| message.parameter == Parameter::Precip && message.end == 30)
        .unwrap();
    precip.values[0] = f32::NAN;
    let daily = aggregate(&run).unwrap();
    assert!(daily.fields[&Field::Precip][0][0].is_nan());
    let removed = run.messages.pop().unwrap();
    assert!(aggregate(&run).is_err());
    run.messages.push(removed.clone());
    run.messages.push(removed);
    assert!(aggregate(&run).is_err());
}

#[test]
fn publication_roundtrips_all_fields_and_feed_drops_stale_or_removed_sidecars() {
    let directory = tempfile::tempdir().unwrap();
    let daily = aggregate(&synthetic(utc("2026-10-17T00:00:00Z"))).unwrap();
    let chunks = build_chunks(&daily).unwrap();
    assert_eq!(chunks.len(), 9);
    let decoded = mrf::decode(&chunks[0].bytes).unwrap();
    assert_eq!(decoded.header.grid, GRID.mrf_grid());
    assert_eq!(decoded.frames.len(), 9);
    assert_eq!(decoded.header.frames[0].time, "2026-10-18T10:00:00Z");
    let mut feed = Feed::default();
    assert!(!feed.refresh(directory.path(), daily.run).unwrap());
    write_publication(directory.path(), &daily, &chunks).unwrap();
    assert!(feed.refresh(directory.path(), daily.run).unwrap());
    assert!(!feed.refresh(directory.path(), daily.run).unwrap());
    assert_eq!(feed.section.as_ref().unwrap().license, LICENSE);
    assert!(
        feed.refresh(directory.path(), daily.run + Duration::hours(73))
            .unwrap()
    );
    assert!(feed.chunks.is_empty());
    assert!(feed.refresh(directory.path(), daily.run).unwrap());
    fs::remove_file(directory.path().join(SIDECAR)).unwrap();
    assert!(feed.refresh(directory.path(), daily.run).unwrap());
    assert!(feed.chunks.is_empty());
}

#[test]
fn feed_rejects_mismatched_chunks_and_path_traversal() {
    let directory = tempfile::tempdir().unwrap();
    let daily = aggregate(&synthetic(utc("2026-10-17T00:00:00Z"))).unwrap();
    let chunks = build_chunks(&daily).unwrap();
    write_publication(directory.path(), &daily, &chunks).unwrap();
    let path = directory.path().join(SIDECAR);
    let mut sidecar: Sidecar = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    sidecar.chunks[0].times.pop();
    fs::write(&path, serde_json::to_vec(&sidecar).unwrap()).unwrap();
    assert!(
        Feed::default()
            .refresh(directory.path(), daily.run)
            .is_err()
    );
    sidecar.chunks[0].url = "chunks/../ecmwf.json".into();
    fs::write(&path, serde_json::to_vec(&sidecar).unwrap()).unwrap();
    assert!(
        Feed::default()
            .refresh(directory.path(), daily.run)
            .is_err()
    );
}
