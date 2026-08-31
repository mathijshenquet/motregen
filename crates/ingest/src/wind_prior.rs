use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};

#[derive(Clone, Debug)]
pub struct WindTimeline {
    pub run: String,
    times: Vec<DateTime<Utc>>,
    frames: Vec<Vec<Option<(f32, f32)>>>,
    vector_count: usize,
}

impl WindTimeline {
    pub fn new(
        run: String,
        times: Vec<DateTime<Utc>>,
        frames: Vec<Vec<Option<(f32, f32)>>>,
    ) -> Result<Self> {
        ensure!(!times.is_empty(), "wind timeline is empty");
        ensure!(times.len() == frames.len(), "wind time/frame count differs");
        ensure!(
            times.windows(2).all(|pair| pair[0] < pair[1]),
            "wind times must increase"
        );
        let vector_count = frames[0].len();
        ensure!(vector_count > 0, "wind frames are empty");
        ensure!(
            frames.iter().all(|frame| frame.len() == vector_count),
            "wind frame sizes differ"
        );
        Ok(Self {
            run,
            times,
            frames,
            vector_count,
        })
    }

    pub fn interpolate(&self, time: DateTime<Utc>) -> Vec<Option<(f32, f32)>> {
        let upper = self.times.partition_point(|candidate| *candidate <= time);
        if upper == 0 {
            return self.frames[0].clone();
        }
        if upper == self.times.len() {
            return self.frames[self.frames.len() - 1].clone();
        }
        let lower = upper - 1;
        let interval_ms = (self.times[upper] - self.times[lower]).num_milliseconds() as f32;
        let elapsed_ms = (time - self.times[lower]).num_milliseconds() as f32;
        let weight = (elapsed_ms / interval_ms).clamp(0.0, 1.0);
        self.frames[lower]
            .iter()
            .zip(&self.frames[upper])
            .map(|(left, right)| match (left, right) {
                (Some((left_u, left_v)), Some((right_u, right_v))) => Some((
                    left_u + weight * (right_u - left_u),
                    left_v + weight * (right_v - left_v),
                )),
                _ => None,
            })
            .collect()
    }

    pub fn vector_count(&self) -> usize {
        self.vector_count
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    #[test]
    fn interpolates_and_clamps_to_available_model_times() {
        let start = Utc.with_ymd_and_hms(2026, 8, 31, 10, 0, 0).unwrap();
        let timeline = WindTimeline::new(
            "2026-08-31T10:00:00Z".into(),
            vec![start, start + chrono::Duration::hours(1)],
            vec![vec![Some((0.1, -0.2))], vec![Some((0.3, 0.2))]],
        )
        .unwrap();
        let midpoint = timeline.interpolate(start + chrono::Duration::minutes(30))[0].unwrap();
        assert!((midpoint.0 - 0.2).abs() < 1.0e-6);
        assert_eq!(midpoint.1, 0.0);
        assert_eq!(
            timeline.interpolate(start - chrono::Duration::hours(1)),
            vec![Some((0.1, -0.2))]
        );
        assert_eq!(
            timeline.interpolate(start + chrono::Duration::hours(2)),
            vec![Some((0.3, 0.2))]
        );
    }
}
