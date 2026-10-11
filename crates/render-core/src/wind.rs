use crate::{
    constants::constants,
    field::smoothstep,
    mode_constants::mode_constants,
    projection::{Grid, Projection},
    strokes::stroke,
};

pub struct WindField<'a> {
    pub grid: &'a Grid,
    pub left: &'a [u8],
    pub right: &'a [u8],
    pub left_quant: &'a [Option<f32>],
    pub right_quant: &'a [Option<f32>],
    pub mix: f64,
}

impl WindField<'_> {
    pub fn sample(&self, column: f64, row: f64) -> Option<f64> {
        if column < 0.0
            || row < 0.0
            || column > (self.grid.width - 1) as f64
            || row > (self.grid.height - 1) as f64
        {
            return None;
        }
        let west = column.floor() as usize;
        let north = row.floor() as usize;
        let east = (west + 1).min(self.grid.width - 1);
        let south = (north + 1).min(self.grid.height - 1);
        let horizontal = column - west as f64;
        let vertical = row - north as f64;
        let indices = [
            north * self.grid.width + west,
            north * self.grid.width + east,
            south * self.grid.width + west,
            south * self.grid.width + east,
        ];
        let weights = [
            (1.0 - horizontal) * (1.0 - vertical),
            horizontal * (1.0 - vertical),
            (1.0 - horizontal) * vertical,
            horizontal * vertical,
        ];
        let mut value = 0.0;
        for corner in 0..4 {
            if weights[corner] == 0.0 {
                continue;
            }
            let left = self.left_quant[self.left[indices[corner]] as usize];
            let right = self.right_quant[self.right[indices[corner]] as usize];
            if (self.mix < 1.0 && left.is_none()) || (self.mix > 0.0 && right.is_none()) {
                return None;
            }
            value += (f64::from(left.unwrap_or(0.0)) * (1.0 - self.mix)
                + f64::from(right.unwrap_or(0.0)) * self.mix)
                * weights[corner];
        }
        Some(value)
    }
}

pub struct Water<'a> {
    pub width: usize,
    pub height: usize,
    pub alpha: &'a [u8],
}

#[derive(Default, Debug)]
pub struct WindStats {
    pub particles: usize,
    pub strokes: usize,
    pub direction: [f64; 2],
}

pub fn color(speed: f64, night: bool) -> [u8; 3] {
    let settings = &mode_constants().wind;
    let mut upper = 1;
    while upper < settings.stops.len() - 1 && speed > settings.stops[upper] {
        upper += 1;
    }
    let fraction = ((speed - settings.stops[upper - 1])
        / (settings.stops[upper] - settings.stops[upper - 1]))
        .clamp(0.0, 1.0);
    let ramp = if night {
        &settings.dark
    } else {
        &settings.light
    };
    std::array::from_fn(|channel| {
        (ramp[upper - 1][channel] + (ramp[upper][channel] - ramp[upper - 1][channel]) * fraction)
            .round() as u8
    })
}

pub fn draw(
    rgb: &mut [u8],
    east: WindField<'_>,
    north: WindField<'_>,
    simulation_seconds: f64,
    night: bool,
    water: Water<'_>,
) -> WindStats {
    assert_eq!(east.grid, north.grid);
    let settings = &mode_constants().wind;
    let scale = mode_constants().scale;
    let fade_log = settings.buffer_fade.ln();
    let size = &constants().size;
    let projection = Projection::new(east.grid);
    let columns = (settings.count as f64 * constants().frame.width as f64
        / constants().frame.height as f64)
        .sqrt()
        .ceil() as usize;
    let rows = settings.count.div_ceil(columns);
    let mut random_state = 0x71b_u32;
    let mut random = || {
        random_state = random_state.wrapping_mul(1664525).wrapping_add(1013904223);
        f64::from(random_state) / 4294967296.0
    };
    let mut stats = WindStats::default();
    for particle in 0..settings.count {
        let screen = [
            ((particle % columns) as f64 + 0.5 + (random() - 0.5) * settings.spawn_jitter)
                / columns as f64
                * size.width as f64,
            ((particle / columns) as f64 + 0.5 + (random() - 0.5) * settings.spawn_jitter)
                / rows as f64
                * size.height as f64,
        ];
        let column = projection.columns[0]
            + (projection.columns[1] - projection.columns[0]) * (screen[0] - 0.5);
        let row =
            projection.rows[0] + (projection.rows[1] - projection.rows[0]) * (screen[1] - 0.5);
        let (Some(east), Some(north)) = (east.sample(column, row), north.sample(column, row))
        else {
            continue;
        };
        let speed = east.hypot(north);
        if speed < 0.01 {
            continue;
        }
        let boost = if speed >= settings.weak_speed {
            1.0
        } else {
            (settings.weak_speed / speed.max(1e-3))
                .sqrt()
                .min(settings.weak_boost)
        };
        let screen_speed = speed * settings.screen_speed * boost;
        let life_scale = 0.8 + random() * 0.4;
        let age = simulation_seconds - random() * settings.stagger;
        if age <= 0.0 {
            continue;
        }
        let duration = (settings.max_age * life_scale)
            .min(settings.trail_distance * life_scale / screen_speed);
        let phase = (age % duration) / duration;
        let life_distance = (settings.trail_distance * life_scale)
            .min(screen_speed * settings.max_age * life_scale);
        let distance = (phase - 0.5) * life_distance * scale;
        let decay_length = screen_speed / -fade_log * scale;
        let travelled = phase * life_distance;
        let length = travelled.min(3.0 * decay_length / scale) * scale;
        let direction = [east / speed, -north / speed];
        let head = [
            screen[0] + direction[0] * distance,
            screen[1] + direction[1] * distance,
        ];
        let water_column = (head[0] / size.width as f64 * water.width as f64)
            .floor()
            .clamp(0.0, (water.width - 1) as f64) as usize;
        let water_row = (head[1] / size.height as f64 * water.height as f64)
            .floor()
            .clamp(0.0, (water.height - 1) as f64) as usize;
        let water_factor = 1.0
            - settings.sea_penalty * f64::from(water.alpha[water_row * water.width + water_column])
                / 255.0;
        let damping = if speed > settings.damping_reference {
            (settings.damping_reference / speed).powf(settings.speed_damping)
        } else {
            1.0
        };
        let opacity = water_factor * settings.focus * settings.head_intensity * damping;
        let floor = settings.focus * (2.0 / settings.simulation_fps / 255.0)
            / (1.0 - settings.buffer_fade.powf(1.0 / settings.simulation_fps));
        let trail_opacity = |distance: f64, since_respawn: f64| {
            move |behind: f64, coverage: f64| {
                let past = distance - behind / scale;
                let remaining = life_distance - past;
                let strength = if past <= 0.0 || remaining <= 0.0 {
                    0.0
                } else {
                    smoothstep(0.0, settings.fade_in_px, past)
                        * smoothstep(0.0, settings.fade_out_px, remaining)
                };
                let decay = (fade_log * since_respawn - behind / decay_length).exp();
                (opacity * coverage * strength * decay - floor * (1.0 - decay)).max(0.0)
            }
        };
        stroke(
            rgb,
            [
                head[0] - direction[0] * length,
                head[1] - direction[1] * length,
            ],
            head,
            settings.line_width * scale,
            color(speed, night),
            trail_opacity(travelled, 0.0),
        );
        stats.particles += 1;
        stats.strokes += 1;
        stats.direction[0] += direction[0];
        stats.direction[1] += direction[1];
        if age >= duration {
            let since_respawn = age % duration;
            let previous_length = life_distance.min(3.0 * decay_length / scale) * scale;
            let previous_head = [
                screen[0] + direction[0] * life_distance * scale / 2.0,
                screen[1] + direction[1] * life_distance * scale / 2.0,
            ];
            if opacity * settings.buffer_fade.powf(since_respawn) >= 1.0 / 255.0 {
                stroke(
                    rgb,
                    [
                        previous_head[0] - direction[0] * previous_length,
                        previous_head[1] - direction[1] * previous_length,
                    ],
                    previous_head,
                    settings.line_width * scale,
                    color(speed, night),
                    trail_opacity(life_distance, since_respawn),
                );
                stats.strokes += 1;
            }
        }
    }
    stats
}
