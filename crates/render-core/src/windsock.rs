//! Windzakken en Beaufortvlakken van de windfilm (U101): een port van `wind-glyph.ts`, `windsock-flow.ts`,
//! `wind-beaufort.ts` en de polygoonvuller van `bot/native-windsocks.ts`. De tests rekenen de Node-uitkomsten
//! in `assets/windsock-fixtures.json` na.

use crate::mode_constants::{Flutter, mode_constants};
use crate::projection::Grid;

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
    Badge {
        center,
        radius: settings.badge.radius,
        cut_radius: settings.badge.radius + settings.badge.gap,
        font_px: if label.chars().count() > 2 {
            settings.badge.long_font_px
        } else {
            settings.badge.font_px
        },
    }
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

/// `flutterBends`: een golf van mond naar staart, vanaf `flutter.start` Bft.
pub fn flutter_bends(
    flutter: &Flutter,
    strength: f64,
    seconds: f64,
    phase: f64,
) -> Option<Vec<f64>> {
    if strength < flutter.start {
        return None;
    }
    let samples = mode_constants().windsock.samples;
    let above = strength - flutter.start;
    let amplitude = flutter
        .max_amplitude
        .min(flutter.amplitude + flutter.amplitude_per_force * above);
    let frequency = flutter.frequency + flutter.frequency_per_force * above;
    let onset = (above * 2.0).min(1.0);
    Some(
        (0..=samples)
            .map(|index| {
                let t = index as f64 / samples as f64;
                onset
                    * amplitude
                    * t.powf(1.3)
                    * (2.0 * std::f64::consts::PI * (frequency * seconds - 1.1 * t) + phase).sin()
            })
            .collect(),
    )
}

/// Ronde uitsparing: wat erbinnen valt, wordt niet getekend (de badge).
#[derive(Clone, Copy)]
pub struct Cut {
    pub center: Point,
    pub radius: f64,
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
                ((screen_x as f64 + 0.5 - cut.center[0])
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
