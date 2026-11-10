use crate::{
    constants::constants,
    field::smoothstep,
    mode_constants::mode_constants,
    projection::{Grid, Projection},
    strokes::stroke,
};
use serde::{Deserialize, Serialize};

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

/// One particle of the film: its anchor on screen and the wind there. The anchors and random draws depend only on
/// the particle index, so a particle keeps its identity from frame to frame (U112).
#[derive(Clone, Copy, Debug)]
pub struct Particle {
    screen: [f64; 2],
    east: f64,
    north: f64,
    speed: f64,
    screen_speed: f64,
    life_scale: f64,
    delay: f64,
}

impl Particle {
    /// Seconds one life lasts at the current wind.
    fn duration(&self) -> f64 {
        let settings = &mode_constants().wind;
        (settings.max_age * self.life_scale)
            .min(settings.trail_distance * self.life_scale / self.screen_speed)
    }

    /// The life at film time `seconds` without history: a still, or the first frame of a chain.
    fn fresh(&self, seconds: f64) -> Option<Life> {
        let age = seconds - self.delay;
        if age <= 0.0 {
            return None;
        }
        let duration = self.duration();
        Some(Life {
            phase: (age % duration) / duration,
            reborn: age >= duration,
        })
    }
}

/// Where a particle is in its life: `phase` runs from 0 to 1, `reborn` once it has respawned at least once (then
/// the fading trail of its previous life still shows).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Life {
    phase: f64,
    reborn: bool,
}

/// The lives of all particles, carried from film frame to film frame (U112) like the motion of the windsocks. A
/// still starts empty and takes the life `Particle::fresh` gives it.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ParticleChain {
    /// Film seconds of the previous step.
    seconds: Option<f64>,
    /// Per particle index; `None` before its first life.
    lives: Vec<Option<Life>>,
}

/// Lays out all particles and samples the wind at their anchors; `None` where there is no wind to draw.
pub fn particles(east: &WindField<'_>, north: &WindField<'_>) -> Vec<Option<Particle>> {
    assert_eq!(east.grid, north.grid);
    let settings = &mode_constants().wind;
    let size = &constants().size;
    let projection = Projection::new(east.grid);
    let columns = (settings.count as f64 * constants().frame.width / constants().frame.height)
        .sqrt()
        .ceil() as usize;
    let rows = settings.count.div_ceil(columns);
    let mut random_state = 0x71b_u32;
    let mut random = || {
        random_state = random_state.wrapping_mul(1664525).wrapping_add(1013904223);
        f64::from(random_state) / 4294967296.0
    };
    (0..settings.count)
        .map(|particle| {
            // All four draws up front: a particle without wind must not shift the draws of the ones after it.
            let jitter = [random(), random()];
            let life_scale = 0.8 + random() * 0.4;
            let delay = random() * settings.stagger;
            let screen = [
                ((particle % columns) as f64 + 0.5 + (jitter[0] - 0.5) * settings.spawn_jitter)
                    / columns as f64
                    * size.width as f64,
                ((particle / columns) as f64 + 0.5 + (jitter[1] - 0.5) * settings.spawn_jitter)
                    / rows as f64
                    * size.height as f64,
            ];
            let column = projection.columns[0]
                + (projection.columns[1] - projection.columns[0]) * (screen[0] - 0.5);
            let row =
                projection.rows[0] + (projection.rows[1] - projection.rows[0]) * (screen[1] - 0.5);
            let east = east.sample(column, row)?;
            let north = north.sample(column, row)?;
            let speed = east.hypot(north);
            if speed < 0.01 {
                return None;
            }
            let boost = if speed >= settings.weak_speed {
                1.0
            } else {
                (settings.weak_speed / speed.max(1e-3))
                    .sqrt()
                    .min(settings.weak_boost)
            };
            Some(Particle {
                screen,
                east,
                north,
                speed,
                screen_speed: speed * settings.screen_speed * boost,
                life_scale,
                delay,
            })
        })
        .collect()
}

/// Steps every life to film time `seconds` (times `film_tempo`) at the wind of this frame: `phase += elapsed / duration`, a respawn at 1.
/// A first step, a step back or a jump of more than `snap_seconds` starts fresh, so stills and the first frame of a
/// film without a cached chain stay a pure function of the epoch.
pub fn advance(
    chain: &mut ParticleChain,
    particles: &[Option<Particle>],
    seconds: f64,
) -> Vec<(Particle, Life)> {
    let seconds = seconds * mode_constants().wind.film_tempo;
    let elapsed = chain
        .seconds
        .map_or(f64::NAN, |previous| seconds - previous);
    let snap =
        elapsed.is_nan() || elapsed <= 0.0 || elapsed > mode_constants().windsock.snap_seconds;
    chain.seconds = Some(seconds);
    chain.lives.resize(particles.len(), None);
    let mut drawn = Vec::new();
    for (particle, life) in particles.iter().zip(&mut chain.lives) {
        // Without wind a life holds still and is not drawn.
        let Some(particle) = particle else {
            continue;
        };
        *life = match *life {
            Some(Life { phase, reborn }) if !snap => {
                let phase = phase + elapsed / particle.duration();
                Some(Life {
                    phase: phase.fract(),
                    reborn: reborn || phase >= 1.0,
                })
            }
            _ => particle.fresh(seconds),
        };
        if let Some(life) = *life {
            drawn.push((*particle, life));
        }
    }
    drawn
}

pub fn draw(
    rgb: &mut [u8],
    particles: &[(Particle, Life)],
    night: bool,
    water: Water<'_>,
) -> WindStats {
    let settings = &mode_constants().wind;
    let scale = mode_constants().scale;
    let fade_log = settings.buffer_fade.ln();
    let size = &constants().size;
    let mut stats = WindStats::default();
    for (particle, life) in particles {
        let Particle {
            screen,
            east,
            north,
            speed,
            screen_speed,
            life_scale,
            ..
        } = *particle;
        let phase = life.phase;
        let duration = particle.duration();
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
        if life.reborn {
            let since_respawn = phase * duration;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projection::project;

    const FILM_STEP: f64 = 1.0 / 7.5;

    fn grid() -> Grid {
        let view = &constants().view;
        let center = project(view.lng, view.lat);
        Grid {
            x0: center.0 - 1_500_000.0,
            y0: center.1 + 1_500_000.0,
            dx: 10_000.0,
            dy: -10_000.0,
            width: 300,
            height: 300,
        }
    }

    fn uniform(grid: &Grid, east: f32, north: f32) -> Vec<Option<Particle>> {
        let cells = vec![0; grid.width * grid.height];
        let field = |value: f32| [Some(value)];
        let (east, north) = (field(east), field(north));
        let component = |quant| WindField {
            grid,
            left: &cells,
            right: &cells,
            left_quant: quant,
            right_quant: quant,
            mix: 0.0,
        };
        particles(&component(&east), &component(&north))
    }

    fn head(particle: &Particle, life: &Life) -> [f64; 2] {
        let settings = &mode_constants().wind;
        let life_distance = (settings.trail_distance * particle.life_scale)
            .min(particle.screen_speed * settings.max_age * particle.life_scale);
        let distance = (life.phase - 0.5) * life_distance * mode_constants().scale;
        [
            particle.screen[0] + particle.east / particle.speed * distance,
            particle.screen[1] - particle.north / particle.speed * distance,
        ]
    }

    #[test]
    fn film_particles_move_at_the_app_screen_speed_between_respawns() {
        let grid = grid();
        let mut chain = ParticleChain::default();
        let start = 3.2e6;
        let mut previous: Option<Vec<(Particle, Life)>> = None;
        let mut moves = 0;
        for frame in 0..60 {
            // The wind picks up a little per film frame, as 75 s of model time do.
            let speed = 8.0 + frame as f32 * 0.02;
            let particles = uniform(&grid, speed, 0.0);
            let drawn = advance(&mut chain, &particles, start + frame as f64 * FILM_STEP);
            if let Some(previous) = &previous {
                for ((particle, life), (_, before)) in drawn.iter().zip(previous) {
                    if life.phase < before.phase {
                        continue;
                    }
                    let step = head(particle, life)[0] - head(particle, before)[0];
                    let expected = particle.screen_speed * FILM_STEP * mode_constants().scale;
                    assert!(
                        (step - expected).abs() < 1e-6 * expected,
                        "{step} px != {expected} px"
                    );
                    moves += 1;
                }
            }
            previous = Some(drawn);
        }
        assert!(moves > 144 * 40, "{moves} continuous moves");
    }

    #[test]
    fn a_fresh_chain_and_a_jump_give_the_stateless_life() {
        let grid = grid();
        let particles = uniform(&grid, 5.0, -3.0);
        let mut chain = ParticleChain::default();
        let fresh = |seconds: f64| {
            particles
                .iter()
                .flatten()
                .map(|particle| particle.fresh(seconds).unwrap())
                .collect::<Vec<_>>()
        };
        let lives = |drawn: Vec<(Particle, Life)>| {
            drawn.into_iter().map(|(_, life)| life).collect::<Vec<_>>()
        };
        assert_eq!(lives(advance(&mut chain, &particles, 3.2e6)), fresh(3.2e6));
        assert_ne!(
            lives(advance(&mut chain, &particles, 3.2e6 + FILM_STEP)),
            fresh(3.2e6 + FILM_STEP)
        );
        assert_eq!(
            lives(advance(&mut chain, &particles, 3.2e6 + 5.0)),
            fresh(3.2e6 + 5.0)
        );
        assert_eq!(lives(advance(&mut chain, &particles, 3.1e6)), fresh(3.1e6));
    }

    #[test]
    fn a_particle_without_wind_keeps_the_draws_of_the_others() {
        let grid = grid();
        let full = uniform(&grid, 5.0, 2.0);
        // No data in the western half of the grid (and so of the screen).
        let cells: Vec<u8> = (0..grid.width * grid.height)
            .map(|cell| u8::from(cell % grid.width < grid.width / 2))
            .collect();
        let quant = |value: f32| [Some(value), None];
        let (east, north) = (quant(5.0), quant(2.0));
        let component = |quant| WindField {
            grid: &grid,
            left: &cells,
            right: &cells,
            left_quant: quant,
            right_quant: quant,
            mix: 0.0,
        };
        let partial = particles(&component(&east), &component(&north));
        assert!(partial.iter().filter(|particle| particle.is_none()).count() > 20);
        for (full, partial) in full.iter().zip(&partial) {
            if let (Some(full), Some(partial)) = (full, partial) {
                assert_eq!(
                    (full.life_scale, full.delay, full.screen),
                    (partial.life_scale, partial.delay, partial.screen)
                );
            }
        }
    }
}
