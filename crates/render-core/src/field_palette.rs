use crate::mode_constants::{color, mode_constants};

pub struct Palette {
    pub low: f64,
    pub high: f64,
    knots: Vec<[f64; 2]>,
    ramp: Vec<[f64; 3]>,
}

impl Palette {
    pub fn new(minimum: f64, maximum: f64) -> Option<Self> {
        if !minimum.is_finite() || !maximum.is_finite() || minimum > maximum {
            return None;
        }
        let settings = &mode_constants().palette;
        let mut low = minimum.floor();
        let mut high = maximum.ceil();
        let missing = settings.minimum_span - (high - low);
        if missing > 0.0 {
            low -= (missing / 2.0).floor();
            high += (missing / 2.0).ceil();
        }
        let blue_end = 1.0 / (settings.ramp.len() - 1) as f64;
        let red_start = 1.0 - 0.5 / (settings.ramp.len() - 1) as f64;
        let knots = if high <= settings.cold {
            vec![[low, 0.0], [high, blue_end]]
        } else if low >= settings.warm {
            vec![[low, red_start], [high, 1.0]]
        } else {
            let mut knots = vec![[low, 0.0]];
            if low < settings.cold && (settings.cold - low) / (high - low) > blue_end {
                knots.push([settings.cold, blue_end]);
            }
            if high > settings.warm && (settings.warm - low) / (high - low) < red_start {
                knots.push([settings.warm, red_start]);
            }
            knots.push([high, 1.0]);
            knots
        };
        Some(Self {
            low,
            high,
            knots,
            ramp: settings
                .ramp
                .iter()
                .map(|hex| color(hex).map(|channel| f64::from(channel) / 255.0))
                .collect(),
        })
    }

    pub fn color(&self, temperature: f64) -> [f64; 3] {
        let mut position = self.knots.last().unwrap()[1];
        if temperature <= self.knots[0][0] {
            position = self.knots[0][1];
        } else {
            for pair in self.knots.windows(2) {
                if temperature > pair[1][0] {
                    continue;
                }
                let fraction = (temperature - pair[0][0]) / (pair[1][0] - pair[0][0]);
                position = pair[0][1] + (pair[1][1] - pair[0][1]) * fraction;
                break;
            }
        }
        let scaled = position.clamp(0.0, 1.0) * (self.ramp.len() - 1) as f64;
        let lower = (scaled.floor() as usize).min(self.ramp.len() - 2);
        let fraction = scaled - lower as f64;
        std::array::from_fn(|channel| {
            self.ramp[lower][channel]
                + (self.ramp[lower + 1][channel] - self.ramp[lower][channel]) * fraction
        })
    }

    pub fn bands(&self) -> Vec<f32> {
        (-128..128)
            .flat_map(|band| {
                self.color(f64::from(band) + 0.5)
                    .map(|channel| channel as f32)
            })
            .collect()
    }
}
