//! Windzakken en Beaufortvlakken van de windfilm (U101): een port van `wind-glyph.ts`, `windsock-flow.ts`,
//! `wind-beaufort.ts` en de polygoonvuller van `bot/native-windsocks.ts`. De tests rekenen de Node-uitkomsten
//! in `assets/windsock-fixtures.json` na.

use crate::mode_constants::{disc_radius, mode_constants};
use crate::projection::Grid;
use serde::{Deserialize, Serialize};

pub type Point = [f64; 2];

/// Ondergrenzen en quantisering zoals `beaufortScale` en `beaufortFrame`.
pub fn beaufort_scale(speed: f64) -> f64 {
    let lower = &mode_constants().beaufort.lower_ms;
    let maximum = lower.len() as f64;
    if speed.is_nan() || speed <= 0.0 {
        return 0.0;
    }
    if speed < lower[0] {
        return speed / lower[0];
    }
    for force in 1..lower.len() {
        if speed < lower[force] {
            return force as f64 + (speed - lower[force - 1]) / (lower[force] - lower[force - 1]);
        }
    }
    (maximum + 0.99).min(maximum + (speed - lower[lower.len() - 1]) / 4.0)
}

pub fn beaufort_number(speed: f64) -> usize {
    let lower = &mode_constants().beaufort.lower_ms;
    lower.iter().take_while(|&&limit| speed >= limit).count()
}

/// De continue Beaufortwaarde van één cel, gequantiseerd zoals het synthetische frame van de app; `None` = geen data.
pub fn beaufort_code(east: Option<f32>, north: Option<f32>) -> u8 {
    let (Some(east), Some(north)) = (east, north) else {
        return 255;
    };
    let codes = mode_constants().beaufort.codes_per_force;
    (beaufort_scale(f64::from(east).hypot(f64::from(north))) * codes)
        .round()
        .min(254.0) as u8
}

/// Bandkleuren voor `field_raster::fill`: band k (tussen de lijnen k en k+1) is Beaufortklasse k.
pub fn beaufort_palette() -> Vec<f32> {
    let colors = &mode_constants().beaufort.colors;
    (0..256 * 3)
        .map(|index| {
            let force = (index as isize / 3 - 128).clamp(0, colors.len() as isize - 1) as usize;
            let hex = &colors[force][1..];
            let channel = index % 3;
            f32::from(u8::from_str_radix(&hex[channel * 2..channel * 2 + 2], 16).unwrap()) / 255.0
        })
        .collect()
}

pub struct Shape {
    /// Rand links en rechts van de as gezien vanaf de mast, van mond tot staart; de mast ligt in (0, 0).
    pub left: Vec<Point>,
    pub right: Vec<Point>,
    pub axis: Vec<Point>,
    /// Schermhoek per aspunt in graden, met de klok mee vanaf boven.
    pub headings: Vec<f64>,
}

pub fn fill_fraction(strength: f64) -> f64 {
    (strength / mode_constants().windsock.full_force).clamp(0.0, 1.0)
}

/// `windsockShape(strength, headings, 'kaart')`.
pub fn shape(strength: f64, headings: &[f64]) -> Shape {
    let settings = &mode_constants().windsock;
    let filled = fill_fraction(strength);
    let length =
        settings.max_length * (settings.slack_length + (1.0 - settings.slack_length) * filled);
    let tail = settings.mouth * (settings.slack_tail + settings.full_tail_gain * filled);
    let slack_bend = settings.slack_bend * (1.0 - filled);
    let samples = settings.samples;
    let mut shape = Shape {
        left: Vec::with_capacity(samples + 1),
        right: Vec::with_capacity(samples + 1),
        axis: Vec::with_capacity(samples + 1),
        headings: Vec::with_capacity(samples + 1),
    };
    let (mut x, mut y) = (0.0, 0.0);
    for (index, &degrees) in headings.iter().enumerate().take(samples + 1) {
        let t = index as f64 / samples as f64;
        let heading = degrees * std::f64::consts::PI / 180.0 + slack_bend * t * t;
        let half_width = (settings.mouth + (tail - settings.mouth) * t) / 2.0;
        let (normal_x, normal_y) = (heading.cos(), heading.sin());
        shape.axis.push([x, y]);
        shape.headings.push(heading * 180.0 / std::f64::consts::PI);
        shape
            .left
            .push([x - normal_x * half_width, y - normal_y * half_width]);
        shape
            .right
            .push([x + normal_x * half_width, y + normal_y * half_width]);
        x += heading.sin() * length / samples as f64;
        y -= heading.cos() * length / samples as f64;
    }
    shape
}

/// `windsockBand`: band 0 is de oranje band aan de mond.
pub fn band(shape: &Shape, band: usize) -> Vec<Point> {
    let settings = &mode_constants().windsock;
    let samples = settings.samples as f64;
    let bands = settings.bands as f64;
    let from = (band as f64 * samples / bands).round() as usize;
    let to = ((band + 1) as f64 * samples / bands).round() as usize;
    let mut points = shape.left[from..=to].to_vec();
    points.extend(shape.right[from..=to].iter().rev());
    points
}

/// `windsockInflated`: de rand `margin` naar buiten, ook voorbij mond en staart.
pub fn inflated(shape: &Shape, margin: f64) -> Vec<Point> {
    let last = shape.axis.len() - 1;
    let grow = |points: &[Point]| -> Vec<Point> {
        points
            .iter()
            .enumerate()
            .map(|(index, &[x, y])| {
                let [axis_x, axis_y] = shape.axis[index];
                let mut length = (x - axis_x).hypot(y - axis_y);
                if length == 0.0 {
                    length = 1.0;
                }
                let heading = shape.headings[index] * std::f64::consts::PI / 180.0;
                let along = if index == 0 {
                    -margin
                } else if index == last {
                    margin
                } else {
                    0.0
                };
                [
                    x + (x - axis_x) / length * margin + heading.sin() * along,
                    y + (y - axis_y) / length * margin - heading.cos() * along,
                ]
            })
            .collect()
    };
    let mut points = grow(&shape.left);
    points.extend(grow(&shape.right).into_iter().rev());
    points
}

pub struct Badge {
    pub center: Point,
    pub radius: f64,
    pub cut_radius: f64,
    pub font_px: f64,
}

/// `windsockBadge`: over de mond of midden op de as; drie cijfers krijgen de kleinere letter.
pub fn badge(shape: &Shape, at_mouth: bool, label: &str) -> Badge {
    let settings = &mode_constants().windsock;
    let center = shape.axis[if at_mouth { 0 } else { settings.samples / 2 }];
    // Schijfregel van het kaartregime (U107, `windsockBadge`): één cijfer 9,5 px, twee cijfers ruimer.
    let font_px = if label.chars().count() > 2 {
        settings.badge.long_font_px
    } else {
        settings.badge.font_px
    };
    let radius = disc_radius("0", settings.badge.font_px).max(disc_radius(label, font_px));
    Badge {
        center,
        radius,
        cut_radius: radius + settings.badge.gap,
        font_px,
    }
}

/// `windsockPill` (wind-glyph.ts, U113): getal en eenheid in een pil op de mond, in CSS-px t.o.v. de mast.
#[derive(Clone, Debug, PartialEq)]
pub struct Pill {
    pub center: Point,
    pub half_width: f64,
    pub half_height: f64,
    pub gap: f64,
    pub font_px: f64,
    pub unit_px: f64,
    pub number_width: f64,
    pub unit_width: f64,
    /// Basislijn t.o.v. het midden: de cijferinkt staat dan precies in het midden.
    pub baseline: f64,
}

/// `pillTextEm`: breedte in em volgens de pilconstanten (onbekende tekens als een cijfer).
pub fn pill_text_em(text: &str) -> f64 {
    let pill = &mode_constants().windsock.pill;
    text.chars()
        .map(|character| {
            if character.is_ascii_digit() {
                pill.digit_em
            } else {
                pill.letter_em.get(&character).copied().unwrap_or(pill.digit_em)
            }
        })
        .sum()
}

/// `windsockPill`: `heading` is de schermrichting van de zak zonder wuiven; de pil schuift naar de kant waar de zak
/// niet is. Kaartmaat zoals de bot: `badge.font_px` (13).
pub fn pill(heading: f64, label: &str, unit: &str) -> Pill {
    let settings = &mode_constants().windsock;
    let constants = &settings.pill;
    let size = settings.badge.font_px;
    let unit_px = (size * constants.unit_em).round();
    let number_width = pill_text_em(label) * size;
    let unit_width = pill_text_em(unit) * unit_px;
    let half_height = settings.badge.radius;
    let half_width =
        half_height.max((number_width + constants.gap + unit_width) / 2.0 + constants.padding);
    let side = (-heading.to_radians().sin() / constants.shift_sine).clamp(-1.0, 1.0);
    Pill {
        center: [(half_width - half_height) * side, 0.0],
        half_width,
        half_height,
        gap: settings.badge.gap,
        font_px: size,
        unit_px,
        number_width,
        unit_width,
        baseline: constants.digit_middle_em * size,
    }
}

/// Een liggende capsule (de pil) als veelhoek: twee halve cirkels van 16 punten.
pub fn capsule(center: Point, half_length: f64, radius: f64) -> Vec<Point> {
    let half = |side: f64| {
        (0..=16).map(move |index| {
            let angle = -std::f64::consts::FRAC_PI_2 * side
                + index as f64 / 16.0 * std::f64::consts::PI * side;
            [
                center[0] + side * half_length + angle.cos() * radius * side,
                center[1] + angle.sin() * radius,
            ]
        })
    };
    half(1.0).chain(half(-1.0)).collect()
}

/// Windvectoren (oost, noord) in m/s per rastercel; `None` is geen data.
pub trait Vectors {
    fn vector(&self, index: usize) -> Option<[f64; 2]>;
}

/// u en v om en om, zoals de app en de fixtures ze bewaren.
pub struct Interleaved<'a>(pub &'a [f32]);

impl Vectors for Interleaved<'_> {
    fn vector(&self, index: usize) -> Option<[f64; 2]> {
        let east = f64::from(self.0[index * 2]);
        let north = f64::from(self.0[index * 2 + 1]);
        (east.is_finite() && north.is_finite()).then_some([east, north])
    }
}

/// Twee uurframes en hun menging.
pub struct WindSlice<'a> {
    pub left: &'a dyn Vectors,
    pub right: &'a dyn Vectors,
    pub mix: f64,
}

/// Het veld nu, een half en een heel `lag_minutes` eerder.
pub struct WindsockField<'a> {
    pub grid: &'a Grid,
    pub slices: [WindSlice<'a>; 3],
}

/// `sampleWind`: bilineair tussen de celmiddens, in Web-Mercator-meters.
pub fn sample(field: &WindsockField, slice: usize, x: f64, y: f64) -> Option<[f64; 2]> {
    let grid = field.grid;
    let column = (x - grid.x0) / grid.dx - 0.5;
    let row = (y - grid.y0) / grid.dy - 0.5;
    let column0 = column.floor().clamp(0.0, grid.width as f64 - 2.0) as usize;
    let row0 = row.floor().clamp(0.0, grid.height as f64 - 2.0) as usize;
    if column < -0.5
        || row < -0.5
        || column > grid.width as f64 - 0.5
        || row > grid.height as f64 - 0.5
    {
        return None;
    }
    let across = (column - column0 as f64).clamp(0.0, 1.0);
    let down = (row - row0 as f64).clamp(0.0, 1.0);
    let WindSlice { left, right, mix } = &field.slices[slice];
    let (mut east, mut north) = (0.0, 0.0);
    for (row_offset, column_offset, weight) in [
        (0, 0, (1.0 - across) * (1.0 - down)),
        (0, 1, across * (1.0 - down)),
        (1, 0, (1.0 - across) * down),
        (1, 1, across * down),
    ] {
        let index = (row0 + row_offset) * grid.width + column0 + column_offset;
        // In de app maakt één ontbrekende hoek de som NaN, ook met gewicht 0.
        let [left_east, left_north] = left.vector(index)?;
        let [right_east, right_north] = right.vector(index)?;
        east += weight * (left_east * (1.0 - mix) + right_east * mix);
        north += weight * (left_north * (1.0 - mix) + right_north * mix);
    }
    Some([east, north])
}

pub fn toward_degrees([east, north]: [f64; 2]) -> f64 {
    (east.atan2(north) * 180.0 / std::f64::consts::PI + 360.0) % 360.0
}

/// Kortste hoek van `from` naar `to`, in (-180, 180].
pub fn angle_difference(from: f64, to: f64) -> f64 {
    // JavaScript `%` behoudt het teken van het deeltal, net als Rust; zelfde formule als de app.
    ((to - from) % 360.0 + 540.0) % 360.0 - 180.0
}

/// `windsockHeadings` met de kromming van de film: stroomlijn en/of traagheid.
pub fn headings(
    field: &WindsockField,
    x: f64,
    y: f64,
    stream: bool,
    lag: bool,
) -> Option<Vec<f64>> {
    let settings = &mode_constants().windsock;
    let samples = settings.samples;
    let base = toward_degrees(sample(field, 0, x, y)?);
    let mut bends = vec![0.0; samples + 1];
    if stream {
        let step = settings.stream_km * 1000.0 / samples as f64;
        let (mut point_x, mut point_y) = (x, y);
        for index in 0..=samples {
            let Some(wind) = sample(field, 0, point_x, point_y) else {
                let previous = if index == 0 { 0.0 } else { bends[index - 1] };
                bends[index..].fill(previous);
                break;
            };
            let direction = toward_degrees(wind);
            bends[index] = angle_difference(base, direction);
            point_x += (direction * std::f64::consts::PI / 180.0).sin() * step;
            point_y += (direction * std::f64::consts::PI / 180.0).cos() * step;
        }
    }
    if lag && let (Some(halfway), Some(earliest)) = (sample(field, 1, x, y), sample(field, 2, x, y))
    {
        let middle = angle_difference(base, toward_degrees(halfway));
        let end = angle_difference(base, toward_degrees(earliest));
        for (index, bend) in bends.iter_mut().enumerate() {
            let t = index as f64 / samples as f64;
            *bend += if t <= 0.5 {
                middle * t * 2.0
            } else {
                middle + (end - middle) * (t - 0.5) * 2.0
            };
        }
    }
    Some(
        bends
            .into_iter()
            .map(|bend| base + bend.clamp(-settings.max_bend, settings.max_bend))
            .collect(),
    )
}

/// Uitsparing: wat erbinnen valt, wordt niet getekend (de badge). Een liggende capsule met `half_length` (de pil);
/// 0 is een cirkel.
#[derive(Clone, Copy)]
pub struct Cut {
    pub center: Point,
    pub radius: f64,
    pub half_length: f64,
}

/// `fillPolygon`: exacte oppervlaktedekking per pixel (signed-area-accumulatie van font-rs).
pub fn fill_polygon(
    rgb: &mut [u8],
    size: (usize, usize),
    points: &[Point],
    color: [u8; 3],
    opacity: f64,
    cut: Option<Cut>,
) {
    if opacity <= 0.0 || points.len() < 3 {
        return;
    }
    let (frame_width, frame_height) = size;
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    );
    for &[x, y] in points {
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let left = min_x.floor().max(0.0);
    let top = min_y.floor().max(0.0);
    let right = (max_x.ceil() + 1.0).min(frame_width as f64);
    let bottom = (max_y.ceil() + 1.0).min(frame_height as f64);
    if left >= right || top >= bottom {
        return;
    }
    let (left, top) = (left as usize, top as usize);
    // Twee kolommen speling: een rand op de rechterrand van het vak schrijft ook in de kolom ernaast.
    let width = right as usize - left + 2;
    let height = bottom as usize - top;
    let mut coverage = vec![0.0f32; width * height];
    for index in 0..points.len() {
        let [ax, ay] = points[index];
        let [bx, by] = points[(index + 1) % points.len()];
        accumulate_edge(
            &mut coverage,
            width,
            height,
            [ax - left as f64, ay - top as f64],
            [bx - left as f64, by - top as f64],
        );
    }
    for row in 0..height {
        let mut sum = 0.0f64;
        for column in 0..width {
            sum += f64::from(coverage[row * width + column]);
            let screen_x = left + column;
            let outside_cut = cut.map_or(1.0, |cut| {
                (((screen_x as f64 + 0.5 - cut.center[0]).abs() - cut.half_length)
                    .max(0.0)
                    .hypot((top + row) as f64 + 0.5 - cut.center[1])
                    - cut.radius
                    + 0.5)
                    .clamp(0.0, 1.0)
            });
            let alpha = sum.abs().min(1.0) * opacity * outside_cut;
            if alpha <= 0.0 || screen_x >= frame_width {
                continue;
            }
            let offset = ((top + row) * frame_width + screen_x) * 3;
            for channel in 0..3 {
                let value = f64::from(rgb[offset + channel]) * (1.0 - alpha)
                    + f64::from(color[channel]) * alpha;
                rgb[offset + channel] = js_round(value) as u8;
            }
        }
    }
}

/// `Math.round`: halven naar boven, ook negatief (hier alleen niet-negatieve kanaalwaarden).
fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}

fn add(coverage: &mut [f32], index: usize, amount: f64) {
    // Zoals een Float32Array: optellen in f64, terugschrijven als f32.
    coverage[index] = (f64::from(coverage[index]) + amount) as f32;
}

fn accumulate_edge(coverage: &mut [f32], width: usize, height: usize, from: Point, to: Point) {
    let ([x0, y0], [x1, y1]) = (from, to);
    if y0 == y1 {
        return;
    }
    let direction = if y0 < y1 { 1.0 } else { -1.0 };
    let (start_x, start_y, end_x, end_y) = if y0 < y1 {
        (x0, y0, x1, y1)
    } else {
        (x1, y1, x0, y0)
    };
    let slope = (end_x - start_x) / (end_y - start_y);
    let clamp_x = |value: f64| value.clamp(0.0, width as f64 - 1.001);
    let mut x = start_x + (-start_y).max(0.0) * slope;
    let first_row = start_y.floor().max(0.0) as usize;
    let end_row = end_y.ceil().min(height as f64);
    let mut row = first_row;
    while (row as f64) < end_row {
        let row_start = row * width;
        let span = (row as f64 + 1.0).min(end_y) - (row as f64).max(start_y);
        let next_x = x + slope * span;
        let area = span * direction;
        let left = clamp_x(x.min(next_x));
        let right = clamp_x(x.max(next_x));
        let left_column = left.floor() as usize;
        let right_column = right.ceil() as usize;
        if right_column <= left_column + 1 {
            let middle = 0.5 * (left + right) - left_column as f64;
            add(coverage, row_start + left_column, area * (1.0 - middle));
            add(coverage, row_start + left_column + 1, area * middle);
        } else {
            let inverse = 1.0 / (right - left);
            let left_fraction = left - left_column as f64;
            let first_area = 0.5 * inverse * (1.0 - left_fraction).powi(2);
            let right_fraction = right - right_column as f64 + 1.0;
            let last_area = 0.5 * inverse * right_fraction.powi(2);
            add(coverage, row_start + left_column, area * first_area);
            if right_column == left_column + 2 {
                add(
                    coverage,
                    row_start + left_column + 1,
                    area * (1.0 - first_area - last_area),
                );
            } else {
                let second_area = inverse * (1.5 - left_fraction);
                add(
                    coverage,
                    row_start + left_column + 1,
                    area * (second_area - first_area),
                );
                for column in left_column + 2..right_column - 1 {
                    add(coverage, row_start + column, area * inverse);
                }
                let before_last = second_area + (right_column - left_column - 3) as f64 * inverse;
                add(
                    coverage,
                    row_start + right_column - 1,
                    area * (1.0 - before_last - last_area),
                );
            }
            add(coverage, row_start + right_column, area * last_area);
        }
        x = next_x;
        row += 1;
    }
}

/// Een cirkel als veelhoek van 32 punten, zoals de bot.
pub fn circle(center: Point, radius: f64) -> Vec<Point> {
    (0..32)
        .map(|index| {
            let angle = index as f64 / 32.0 * 2.0 * std::f64::consts::PI;
            [
                center[0] + angle.cos() * radius,
                center[1] + angle.sin() * radius,
            ]
        })
        .collect()
}

/// Een dikke lijn als vierhoek, zoals de hoepel aan de mond.
pub fn thick_line(from: Point, to: Point, half_width: f64) -> Vec<Point> {
    let mut length = (to[0] - from[0]).hypot(to[1] - from[1]);
    if length == 0.0 {
        length = 1.0;
    }
    let normal = [
        -(to[1] - from[1]) / length * half_width,
        (to[0] - from[0]) / length * half_width,
    ];
    vec![
        [from[0] + normal[0], from[1] + normal[1]],
        [to[0] + normal[0], to[1] + normal[1]],
        [to[0] - normal[0], to[1] - normal[1]],
        [from[0] - normal[0], from[1] - normal[1]],
    ]
}

/// Kritisch gedempte veer (`Spring` in windsock-flow.ts): waarde en snelheid per seconde.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Spring {
    pub value: f64,
    pub velocity: f64,
}

/// `followSpring`: exacte stap van de kritisch gedempte veer naar `target`, zonder doorschieten.
pub fn follow_spring(spring: &mut Spring, target: f64, elapsed: f64, time_constant: f64) {
    let omega = 2.0 / time_constant;
    let offset = spring.value - target;
    let push = (spring.velocity + omega * offset) * elapsed;
    let decay = (-omega * elapsed).exp();
    spring.value = target + (offset + push) * decay;
    spring.velocity = (spring.velocity - omega * push) * decay;
}

fn sway_frequency(strength: f64) -> f64 {
    let [constant, linear, square] = mode_constants().windsock.sway.frequency;
    constant + linear * strength + square * strength * strength
}

/// `advanceWave`: de golffase loopt verder met de frequentie van deze windkracht.
pub fn advance_wave(wave: f64, strength: f64, elapsed: f64) -> f64 {
    let tau = 2.0 * std::f64::consts::PI;
    // JavaScript `%` en Rust `%` houden allebei het teken van het deeltal.
    (wave + tau * sway_frequency(strength) * elapsed) % (tau * 1000.0)
}

/// Beweging van één zak (`SockMotion`): momentum op richting en kracht, plus de golffase.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SockMotion {
    pub heading: Option<Spring>,
    pub strength: Option<Spring>,
    pub wave: f64,
}

/// `advanceSock`: één stap naar het veld; geeft terug of de zak nog beweegt.
pub fn advance_sock(
    motion: &mut SockMotion,
    target: f64,
    force: f64,
    elapsed: f64,
    snap: bool,
) -> bool {
    let momentum = &mode_constants().windsock.momentum;
    let (Some(heading), Some(strength)) = (motion.heading.as_mut(), motion.strength.as_mut())
    else {
        motion.heading = Some(Spring {
            value: target,
            velocity: 0.0,
        });
        motion.strength = Some(Spring {
            value: force,
            velocity: 0.0,
        });
        return false;
    };
    if snap {
        *heading = Spring {
            value: target,
            velocity: 0.0,
        };
        *strength = Spring {
            value: force,
            velocity: 0.0,
        };
        return false;
    }
    let shortest = heading.value + angle_difference(heading.value, target);
    follow_spring(heading, shortest, elapsed, momentum.heading);
    follow_spring(strength, force, elapsed, momentum.strength);
    motion.wave = advance_wave(motion.wave, strength.value.max(0.0), elapsed);
    heading.velocity.abs() > 0.05 || strength.velocity.abs() > 0.005
}

/// `swayBends`: hoek per asstuk (graden) door het wuiven; `seconds` is de filmklok voor de trage vlaag.
pub fn sway_bends(strength: f64, wave: f64, seconds: f64, phase: f64) -> Vec<f64> {
    let settings = &mode_constants().windsock;
    let sway = &settings.sway;
    let tau = 2.0 * std::f64::consts::PI;
    let wavelength = sway
        .wavelength
        .min
        .max(sway.wavelength.base - sway.wavelength.per_force * strength);
    let wavenumber = tau / wavelength;
    let calm = (strength / sway.amplitude.calm_force).min(1.0);
    let swing = calm
        * (sway.amplitude.max
            - sway.amplitude.drop * (strength / sway.amplitude.taut_force).min(1.0));
    (0..=settings.samples)
        .map(|index| {
            let t = index as f64 / settings.samples as f64;
            let travel = wave - wavenumber * t + phase;
            let ripple = (travel.sin() + 0.35 * (1.7 * travel + 2.3 * phase).sin()) / 1.35;
            let gust = sway.gust.amplitude
                * calm
                * (tau * sway.gust.frequency * (seconds - sway.gust.lag * t) + 1.7 * phase).sin();
            swing * (sway.root + (1.0 - sway.root) * t.powf(1.6)) * ripple + gust
        })
        .collect()
}

/// `sockReach`: mast en de drie staartstanden (recht en de maximale wuifuitslag naar beide kanten), in CSS-px; de
/// pil als capsule (lijnstuk plus straal), U113.
pub struct Reach {
    pub mast: Point,
    pub tails: [Point; 3],
    pub badge: Option<(Point, Point, f64)>,
}

/// `heading`: schermrichting van de zak in kompasgraden, `strength` in Bft; `pill` t.o.v. de mast.
pub fn sock_reach(mast: Point, heading: f64, strength: f64, pill: Option<&Pill>) -> Reach {
    let settings = &mode_constants().windsock;
    let sway = &settings.sway;
    let calm = (strength / sway.amplitude.calm_force).min(1.0);
    let spread = calm
        * (sway.amplitude.max
            - sway.amplitude.drop * (strength / sway.amplitude.taut_force).min(1.0))
        + sway.gust.amplitude;
    let tails = [0.0, -spread, spread].map(|offset| {
        let tail = *shape(strength, &vec![heading + offset; settings.samples + 1])
            .axis
            .last()
            .unwrap();
        [mast[0] + tail[0], mast[1] + tail[1]]
    });
    let badge = pill.map(|pill| {
        let straight = (pill.half_width - pill.half_height).max(0.0);
        let (x, y) = (mast[0] + pill.center[0], mast[1] + pill.center[1]);
        ([x - straight, y], [x + straight, y], pill.half_height + pill.gap)
    });
    Reach { mast, tails, badge }
}

/// `socksClear`: raken twee zakken elkaar niet; `margin` > 1 vraagt extra ruimte.
pub fn socks_clear(a: &Reach, b: &Reach, margin: f64) -> bool {
    let reach_radius = mode_constants().windsock.reach_radius;
    let gap = 2.0 * reach_radius * margin;
    if !a.tails.iter().all(|tail_a| {
        b.tails
            .iter()
            .all(|tail_b| segment_distance(a.mast, *tail_a, b.mast, *tail_b) >= gap)
    }) {
        return false;
    }
    let pill_clear = |(from, to, radius): (Point, Point, f64), other: &Reach| {
        other.tails.iter().all(|tail| {
            segment_distance(from, to, other.mast, *tail) >= (radius + reach_radius) * margin
        })
    };
    if a.badge.is_some_and(|pill| !pill_clear(pill, b))
        || b.badge.is_some_and(|pill| !pill_clear(pill, a))
    {
        return false;
    }
    match (a.badge, b.badge) {
        (Some((from_a, to_a, radius_a)), Some((from_b, to_b, radius_b))) => {
            segment_distance(from_a, to_a, from_b, to_b) >= (radius_a + radius_b) * margin
        }
        _ => true,
    }
}

fn segment_distance(a0: Point, a1: Point, b0: Point, b1: Point) -> f64 {
    if segments_cross(a0, a1, b0, b1) {
        return 0.0;
    }
    point_segment(a0, b0, b1)
        .min(point_segment(a1, b0, b1))
        .min(point_segment(b0, a0, a1))
        .min(point_segment(b1, a0, a1))
}

fn point_segment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) -> f64 {
    let (dx, dy) = (bx - ax, by - ay);
    let length = dx * dx + dy * dy;
    let t = if length > 0.0 {
        (((px - ax) * dx + (py - ay) * dy) / length).clamp(0.0, 1.0)
    } else {
        0.0
    };
    (px - ax - t * dx).hypot(py - ay - t * dy)
}

fn segments_cross(a0: Point, a1: Point, b0: Point, b1: Point) -> bool {
    let side = |[ox, oy]: Point, [px, py]: Point, [qx, qy]: Point| {
        (px - ox) * (qy - oy) - (py - oy) * (qx - ox)
    };
    let (d1, d2, d3, d4) = (
        side(b0, b1, a0),
        side(b0, b1, a1),
        side(a0, a1, b0),
        side(a0, a1, b1),
    );
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}
