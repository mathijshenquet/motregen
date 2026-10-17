//! Wolkenkaart (MIP-34) op de CPU: dezelfde wiskunde als `web/src/core/cloud-map-shader.ts` en de veldvoorbereiding
//! uit `cloud-map.ts`. De shader rekent in 32-bits floats; deze port ook, zodat ruis en drempels gelijk vallen.
//! Coördinaten: `uv` loopt over het wolkenrooster (0–1), kolom- en rijrichting zoals de rasterdata.

use crate::{
    field::{Field, basis},
    mode_constants::mode_constants,
    projection::Grid,
    sky_light::{cloud_modification, layer_transmission, sky_darkness, solar_elevation_sin},
};

const HOUR: f64 = 3_600_000.0;
const EARTH_RADIUS: f64 = 6_378_137.0;

#[derive(Clone, Copy)]
pub struct RasterView<'a> {
    pub grid: &'a Grid,
    pub quant: &'a [Option<f32>],
    pub values: &'a [u8],
}

/// Twee bronframes en hun tijdmenging, zoals `FieldBlend` in de app.
#[derive(Clone, Copy)]
pub struct RasterBlend<'a> {
    pub left: RasterView<'a>,
    pub right: RasterView<'a>,
    pub mix: f64,
}

/// Een regen-motionannex: vectoren in 0,1 geprojecteerde broncellen per minuut op het `grid` van de regen.
#[derive(Clone, Copy)]
pub struct MotionView<'a> {
    pub grid: &'a Grid,
    pub width: usize,
    pub height: usize,
    pub vectors: &'a [i8],
}

#[derive(Clone, Copy, Default)]
pub struct CloudInputs<'a> {
    pub low: Option<RasterBlend<'a>>,
    pub mid: Option<RasterBlend<'a>>,
    pub high: Option<RasterBlend<'a>>,
    pub radiation: Option<RasterBlend<'a>>,
    pub radiation_next: Option<RasterBlend<'a>>,
    pub motion: Option<MotionView<'a>>,
}

/// Eén uurlaag van het wolkenvolume: per cel bedekking (0–100), geldigheid, vorm en donkerte, plus de stroming in
/// wolkencellen per uur.
#[derive(Clone, Debug)]
pub struct CloudHour {
    pub epoch: i64,
    pub channels: Vec<[f32; 4]>,
    pub flow: Vec<[f32; 2]>,
}

fn sample_frame(view: RasterView<'_>, x: f64, y: f64) -> Option<f64> {
    let grid = view.grid;
    let column = (x - grid.x0) / grid.dx - 0.5;
    let row = (y - grid.y0) / grid.dy - 0.5;
    if column < -0.5
        || row < -0.5
        || column > grid.width as f64 - 0.5
        || row > grid.height as f64 - 0.5
    {
        return None;
    }
    let left = column.floor();
    let top = row.floor();
    let mix_x = column - left;
    let mix_y = row - top;
    let mut sum = 0.0;
    let mut weight = 0.0;
    for offset_y in 0..2 {
        for offset_x in 0..2 {
            let source_row = (top as isize + offset_y).clamp(0, grid.height as isize - 1) as usize;
            let source_column =
                (left as isize + offset_x).clamp(0, grid.width as isize - 1) as usize;
            let code = view.values[source_row * grid.width + source_column];
            let share = if offset_x == 1 { mix_x } else { 1.0 - mix_x }
                * if offset_y == 1 { mix_y } else { 1.0 - mix_y };
            if let Some(value) = view.quant[code as usize].filter(|value| value.is_finite()) {
                sum += f64::from(value) * share;
                weight += share;
            }
        }
    }
    (weight > 0.0).then(|| sum / weight)
}

fn sample_blend(blend: Option<RasterBlend<'_>>, x: f64, y: f64) -> Option<f64> {
    let blend = blend?;
    match (
        sample_frame(blend.left, x, y),
        sample_frame(blend.right, x, y),
    ) {
        (None, right) => right,
        (left, None) => left,
        (Some(left), Some(right)) => Some(left * (1.0 - blend.mix) + right * blend.mix),
    }
}

/// Verplaatsing in meter per uur (oost, langs de rijen), of `None` buiten de annex of bij een ontbrekende vector.
fn sample_motion(motion: MotionView<'_>, x: f64, y: f64) -> Option<(f64, f64)> {
    let grid = motion.grid;
    let u = (x - grid.x0) / (grid.dx * grid.width as f64);
    let v = (y - grid.y0) / (grid.dy * grid.height as f64);
    if !(0.0..=1.0).contains(&u) || !(0.0..=1.0).contains(&v) {
        return None;
    }
    let column = u * motion.width as f64 - 0.5;
    let row = v * motion.height as f64 - 0.5;
    let left = column.floor();
    let top = row.floor();
    let mix_x = column - left;
    let mix_y = row - top;
    let mut east = 0.0;
    let mut down = 0.0;
    for offset_y in 0..2 {
        for offset_x in 0..2 {
            let weight = if offset_x == 1 { mix_x } else { 1.0 - mix_x }
                * if offset_y == 1 { mix_y } else { 1.0 - mix_y };
            if weight == 0.0 {
                continue;
            }
            let source_row =
                (top as isize + offset_y).clamp(0, motion.height as isize - 1) as usize;
            let source_column =
                (left as isize + offset_x).clamp(0, motion.width as isize - 1) as usize;
            let at = source_row * motion.width + source_column;
            let eastward = motion.vectors[at * 2];
            let southward = motion.vectors[at * 2 + 1];
            if eastward == -128 || southward == -128 {
                return None;
            }
            east += f64::from(eastward) * weight;
            down += f64::from(southward) * weight;
        }
    }
    // Annexeenheden zijn 0,1 geprojecteerde broncel per minuut, geen grondsnelheid: geen breedtegraadfactor.
    Some((east * 6.0 * grid.dx, down * 6.0 * grid.dy))
}

/// Gemiddelde regenbeweging over alle geldige vectoren, in meter per uur: de snelheid van het bulkpad.
pub fn motion_mean(motion: Option<MotionView<'_>>) -> [f64; 2] {
    let Some(motion) = motion else {
        return [0.0, 0.0];
    };
    let mut east = 0.0;
    let mut down = 0.0;
    let mut count = 0usize;
    for vector in motion.vectors.chunks_exact(2) {
        if vector[0] == -128 || vector[1] == -128 {
            continue;
        }
        east += f64::from(vector[0]);
        down += f64::from(vector[1]);
        count += 1;
    }
    if count == 0 {
        return [0.0, 0.0];
    }
    [
        east / count as f64 * 6.0 * motion.grid.dx,
        down / count as f64 * 6.0 * motion.grid.dy,
    ]
}

/// Port van `prepareCloudMapField`: vorm (laag → hoog) en donkerte uit het grondlicht per wolkencel, en de stroming.
pub fn prepare_hour(grid: &Grid, field: &Field, epoch: i64, inputs: CloudInputs<'_>) -> CloudHour {
    let cells = grid.width * grid.height;
    assert_eq!(field.values.len(), cells);
    let mut channels = Vec::with_capacity(cells);
    let mut flow = Vec::with_capacity(cells);
    for row in 0..grid.height {
        let y = grid.y0 + (row as f64 + 0.5) * grid.dy;
        let latitude =
            (2.0 * (y / EARTH_RADIUS).exp().atan() - std::f64::consts::FRAC_PI_2).to_degrees();
        for column in 0..grid.width {
            let cell = row * grid.width + column;
            let x = grid.x0 + (column as f64 + 0.5) * grid.dx;
            let longitude = (x / EARTH_RADIUS).to_degrees();
            let cover = (f64::from(field.values[cell]) / 100.0).clamp(0.0, 1.0);
            let fraction =
                |blend| sample_blend(blend, x, y).map(|value| (value / 100.0).clamp(0.0, 1.0));
            let low = fraction(inputs.low);
            let mid = fraction(inputs.mid);
            let high = fraction(inputs.high);
            let has_layers = low.is_some() || mid.is_some() || high.is_some();
            let layer_low = low.unwrap_or(if has_layers { 0.0 } else { cover });
            let layer_mid = mid.unwrap_or(0.0);
            let layer_high = high.unwrap_or(0.0);
            let total = layer_low + layer_mid + layer_high;
            let shape = if total > 0.0 {
                (0.55 * layer_mid + layer_high) / total
            } else {
                0.0
            };
            let light = cloud_modification(
                epoch as f64,
                sample_blend(inputs.radiation, x, y),
                sample_blend(inputs.radiation_next, x, y),
                |time| solar_elevation_sin(time, longitude, latitude),
            );
            let fallback = if low.is_some() && mid.is_some() && high.is_some() {
                layer_transmission(layer_low, layer_mid, layer_high)
            } else {
                1.0 - 0.75 * cover
            };
            let darkness = sky_darkness(light.unwrap_or(fallback));
            channels.push([
                field.values[cell],
                field.valid[cell],
                shape as f32,
                darkness as f32,
            ]);
            let motion = inputs.motion.and_then(|motion| sample_motion(motion, x, y));
            flow.push(motion.map_or([0.0, 0.0], |(east, down)| {
                [(east / grid.dx) as f32, (down / grid.dy) as f32]
            }));
        }
    }
    CloudHour {
        epoch,
        channels,
        flow,
    }
}

/// Eén knoop van het bulkpad: snelheid en geïntegreerde positie in meter.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DriftSample {
    pub epoch: i64,
    pub velocity: [f64; 2],
    pub position: [f64; 2],
}

/// Knooptijden van `CloudDriftLoader`: het eerste regenframe, elk heel uur ertussen en het laatste.
pub fn drift_epochs(first: i64, last: i64) -> Vec<i64> {
    let hour = HOUR as i64;
    let mut epochs = vec![first];
    let mut epoch = (first.div_euclid(hour) + 1) * hour;
    while epoch < last {
        epochs.push(epoch);
        epoch += hour;
    }
    if last > first {
        epochs.push(last);
    }
    epochs
}

/// Index van de laatste knoop op of vóór `epoch` (de app zaait het pad daar op positie nul).
pub fn drift_anchor(epochs: &[i64], epoch: i64) -> usize {
    match epochs.iter().position(|&value| value > epoch) {
        None => epochs.len() - 1,
        Some(right) => right.saturating_sub(1),
    }
}

/// Het bulkpad over `epochs`, met positie nul op `anchor` en vandaar naar beide kanten trapeziumsgewijs geïntegreerd,
/// zoals de loader het opbouwt.
pub fn drift_path(epochs: &[i64], velocities: &[[f64; 2]], anchor: usize) -> Vec<DriftSample> {
    assert_eq!(epochs.len(), velocities.len());
    let mut path: Vec<DriftSample> = epochs
        .iter()
        .zip(velocities)
        .map(|(&epoch, &velocity)| DriftSample {
            epoch,
            velocity,
            position: [0.0, 0.0],
        })
        .collect();
    for index in anchor + 1..path.len() {
        path[index].position = integrate(&path[index - 1], &path[index]);
    }
    for index in (0..anchor).rev() {
        path[index].position = integrate(&path[index + 1], &path[index]);
    }
    path
}

fn integrate(from: &DriftSample, to: &DriftSample) -> [f64; 2] {
    let hours = (to.epoch - from.epoch) as f64 / HOUR;
    std::array::from_fn(|axis| {
        from.position[axis] + (from.velocity[axis] + to.velocity[axis]) * hours / 2.0
    })
}

/// Port van `cloudDriftAt`: exacte integraal van een lineair veranderende snelheid tussen twee knopen.
pub fn drift_at(path: &[DriftSample], epoch: f64) -> [f64; 2] {
    if path.is_empty() {
        return [0.0, 0.0];
    }
    let right = path.iter().position(|sample| sample.epoch as f64 > epoch);
    let left = &path[match right {
        None => path.len() - 1,
        Some(right) => right.saturating_sub(1),
    }];
    let next = right.filter(|&right| right > 0).map(|right| &path[right]);
    let hours = (epoch - left.epoch as f64) / HOUR;
    let mix = next.map_or(0.0, |next| {
        (epoch - left.epoch as f64) / (next.epoch - left.epoch) as f64
    });
    std::array::from_fn(|axis| {
        let change = next.map_or(0.0, |next| next.velocity[axis] - left.velocity[axis]);
        left.position[axis] + hours * (left.velocity[axis] + change * mix / 2.0)
    })
}

/// Fase van de twee textuurbanken, in uren binnen `CLOUD_FLOW_HOURS`.
pub fn flow_phase(epoch: f64) -> f64 {
    let lifetime = mode_constants().cloud.flow_hours;
    let hours = epoch / HOUR;
    (hours % lifetime + lifetime) % lifetime
}

/// Het uurvolume rond één kaarttijd: de vier lagen voor de B-spline in de tijd. `time` is de fractionele index in de
/// wolkentijdlijn; lagen buiten de tijdlijn vallen op de rand, zoals CLAMP_TO_EDGE.
pub struct CloudVolume<'a> {
    pub grid: &'a Grid,
    pub hours: &'a [Option<std::sync::Arc<CloudHour>>],
}

impl CloudVolume<'_> {
    fn hour(&self, index: isize) -> &CloudHour {
        let clamped = index.clamp(0, self.hours.len() as isize - 1) as usize;
        self.hours[clamped]
            .as_deref()
            .expect("cloud hour prepared for this frame")
    }

    /// Het veld op `time`: B-spline over vier uurlagen per cel (wat de twee lineaire fetches in de shader opleveren).
    fn blended(&self, time: f64) -> Vec<[f32; 4]> {
        let base = time.floor() as isize;
        let weights = basis(time - time.floor());
        let layers: [&CloudHour; 4] =
            std::array::from_fn(|offset| self.hour(base - 1 + offset as isize));
        let mut blended = vec![[0.0f32; 4]; self.grid.width * self.grid.height];
        for (cell, value) in blended.iter_mut().enumerate() {
            for (layer, &weight) in layers.iter().zip(&weights) {
                for (channel, &source) in value.iter_mut().zip(&layer.channels[cell]) {
                    *channel += source * weight as f32;
                }
            }
        }
        blended
    }
}

/// Uniforms van één frame.
#[derive(Clone, Copy, Debug)]
pub struct CloudFrame {
    /// Fractionele index in de wolkentijdlijn (`u_time`).
    pub time: f64,
    pub phase: f64,
    /// Beginposities van bank A en B in uv (`u_cloud_anchor`).
    pub anchors: [f64; 4],
    pub night: bool,
}

/// `useCloudFlow` uit de kaartlaag: fase en ankers op de kaarttijd van `time`.
pub fn cloud_frame(
    grid: &Grid,
    epochs: &[i64],
    drift: &[DriftSample],
    time: f64,
    night: bool,
) -> CloudFrame {
    let depth = epochs.len();
    let left = (time.floor() as usize).min(depth - 1);
    let right = (left + 1).min(depth - 1);
    let epoch = epochs[left] as f64 + (epochs[right] - epochs[left]) as f64 * (time - left as f64);
    let phase = flow_phase(epoch);
    let lifetime = mode_constants().cloud.flow_hours;
    let first = drift_at(drift, epoch - phase * HOUR);
    let second = drift_at(drift, epoch - ((phase + lifetime / 2.0) % lifetime) * HOUR);
    let width = grid.dx * grid.width as f64;
    let height = grid.dy * grid.height as f64;
    CloudFrame {
        time,
        phase,
        anchors: [
            first[0] / width,
            first[1] / height,
            second[0] / width,
            second[1] / height,
        ],
        night,
    }
}

type Vec2 = [f32; 2];
type Vec3 = [f32; 3];

/// `floor` zonder functieaanroep: zonder SSE4.1 wordt `f32::floor` een aanroep naar compiler-builtins, en die kostte
/// een zesde van de wolkentijd. Exact voor eindige waarden; vanaf 2^23 is elke f32 al geheel.
fn floor(value: f32) -> f32 {
    if value.abs() >= 8_388_608.0 {
        return value;
    }
    let truncated = value as i32 as f32;
    if truncated > value {
        truncated - 1.0
    } else {
        truncated
    }
}

/// Afronden naar een byte voor waarden binnen 0–255 (geen `roundf`-aanroep, zie `floor`).
fn round_to_byte(value: f32) -> u8 {
    (value.clamp(0.0, 255.0) + 0.5) as u8
}

fn fract(value: f32) -> f32 {
    value - floor(value)
}

fn mix(from: f32, to: f32, amount: f32) -> f32 {
    from * (1.0 - amount) + to * amount
}

fn mix3(from: Vec3, to: Vec3, amount: f32) -> Vec3 {
    std::array::from_fn(|channel| mix(from[channel], to[channel], amount))
}

fn smoothstep(edge0: f32, edge1: f32, value: f32) -> f32 {
    let position = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    position * position * (3.0 - 2.0 * position)
}

fn hash(point: Vec2) -> f32 {
    let mut p3 = [
        fract(point[0] * 0.1031),
        fract(point[1] * 0.1031),
        fract(point[0] * 0.1031),
    ];
    let dot = p3[0] * (p3[1] + 33.33) + p3[1] * (p3[2] + 33.33) + p3[2] * (p3[0] + 33.33);
    p3 = p3.map(|value| value + dot);
    fract((p3[0] + p3[1]) * p3[2])
}

fn noise(point: Vec2) -> f32 {
    let cell = [floor(point[0]), floor(point[1])];
    let mut offset = [point[0] - cell[0], point[1] - cell[1]];
    offset = offset.map(|value| value * value * (3.0 - 2.0 * value));
    let top = mix(hash(cell), hash([cell[0] + 1.0, cell[1]]), offset[0]);
    let bottom = mix(
        hash([cell[0], cell[1] + 1.0]),
        hash([cell[0] + 1.0, cell[1] + 1.0]),
        offset[0],
    );
    mix(top, bottom, offset[1])
}

fn cloud_noise(mut point: Vec2) -> f32 {
    let mut value = 0.0;
    let mut weight = 0.55;
    for _ in 0..4 {
        value += weight * noise(point);
        // GLSL mat2(0.8, -0.6, 0.6, 0.8) is kolomsgewijs: (0.8x + 0.6y, -0.6x + 0.8y).
        point = [
            (0.8 * point[0] + 0.6 * point[1]) * 2.03 + 17.4,
            (-0.6 * point[0] + 0.8 * point[1]) * 2.03 + 8.2,
        ];
        weight *= 0.5;
    }
    value / 1.03125
}

fn cloud_cells(point: Vec2) -> f32 {
    let cell = [floor(point[0]), floor(point[1])];
    let offset_in_cell = [point[0] - cell[0], point[1] - cell[1]];
    let mut nearest_squared: f32 = 1.0;
    for y in -1..=1 {
        for x in -1..=1 {
            let neighbour = [cell[0] + x as f32, cell[1] + y as f32];
            let center = [
                hash(neighbour),
                hash([neighbour[0] + 31.7, neighbour[1] + 31.7]),
            ];
            let delta = [
                x as f32 + center[0] - offset_in_cell[0],
                y as f32 + center[1] - offset_in_cell[1],
            ];
            let distance_squared = delta[0] * delta[0] + delta[1] * delta[1];
            let radius = mix(0.35, 0.8, hash([neighbour[0] + 71.3, neighbour[1] + 71.3]));
            nearest_squared = nearest_squared.min(distance_squared / (radius * radius));
        }
    }
    1.0 - smoothstep(0.1, 1.0, nearest_squared.sqrt())
}

fn scaled(point: Vec2, scale: f32, shift: f32) -> Vec2 {
    [point[0] * scale + shift, point[1] * scale + shift]
}

fn cloud_texture(point: Vec2) -> f32 {
    let detail = cloud_noise(scaled(point, 2.3, 0.0));
    let large = cloud_cells(scaled(point, 0.65, 0.0));
    let small = cloud_cells(scaled(point, 2.0, 42.1));
    let puffs = (large + (small - 0.5) * 0.3).clamp(0.0, 1.0);
    let sheet = cloud_noise(scaled(point, 0.23, 5.7));
    let region = smoothstep(0.25, 0.75, noise(scaled(point, 0.11, -8.3)));
    mix(detail, mix(sheet, puffs, region), 0.7)
}

fn cloud_bodies(point: Vec2, weights: Vec3) -> Vec3 {
    let low = if weights[0] > 0.0 {
        cloud_texture(point)
    } else {
        0.0
    };
    let middle = if weights[1] > 0.0 {
        mix(
            cloud_noise(scaled(point, 0.38, 27.3)),
            cloud_noise(scaled(point, 1.6, 0.0)),
            0.3,
        )
    } else {
        0.0
    };
    let high = if weights[2] > 0.0 {
        let streak = [point[0] * 0.22, point[1] * 2.8];
        mix(
            cloud_noise(streak),
            cloud_noise(scaled(streak, 2.7, 15.4)),
            0.25,
        )
    } else {
        0.0
    };
    [low, middle, high]
}

fn type_weights(shape: f32) -> Vec3 {
    let low = 1.0 - smoothstep(0.0, 0.55, shape);
    let high = smoothstep(0.55, 1.0, shape);
    [low, 1.0 - low - high, high]
}

fn cloud_opacity(body: f32, cover: f32, darkness: f32, veil: f32, night: f32) -> f32 {
    let threshold = mix(0.84, 0.16, cover);
    let mut mask = smoothstep(threshold - 0.055, threshold + 0.055, body);
    mask *= smoothstep(0.0, 0.06, cover);
    mask = mix(mask, 1.0, smoothstep(0.9, 1.0, cover));
    mask * mix(0.32, 0.60, darkness) * veil * (0.8 + body * 0.4) * mix(1.0, 0.65, night)
}

fn dot3(left: Vec3, right: Vec3) -> f32 {
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

/// Eerste helft van `transportedCloud`: het patroonpunt van het gemengde voetpunt (vast per kaartplek, licht
/// vervormd en gedraaid).
fn cloud_point(origin: Vec2, extent: Vec2, foot: Vec2) -> Vec2 {
    let point = [
        (origin[0] + foot[0] * extent[0] - 500_000.0) / 10_000.0,
        (origin[1] + foot[1] * extent[1] - 6_800_000.0) / 10_000.0,
    ];
    let warp = [
        noise(scaled(point, 0.55, 9.1)) - 0.5,
        noise(scaled(point, 0.55, -12.7)) - 0.5,
    ];
    let warped = [point[0] + warp[0] * 0.6, point[1] + warp[1] * 0.6];
    [
        0.94 * warped[0] + 0.34 * warped[1],
        -0.34 * warped[0] + 0.94 * warped[1],
    ]
}

/// Het reliëf vergelijkt elk type met zijn patroon iets verderop.
const RELIEF_OFFSET: Vec2 = [-0.12, 0.18];

fn relief_from(bodies: Vec3, shifted: Vec3) -> Vec3 {
    std::array::from_fn(|layer| ((bodies[layer] - shifted[layer]) * 0.22).clamp(-0.05, 0.05))
}

fn direct_relief(point: Vec2, bodies: Vec3, weights: Vec3) -> Vec3 {
    let shifted = cloud_bodies(
        [point[0] + RELIEF_OFFSET[0], point[1] + RELIEF_OFFSET[1]],
        weights,
    );
    relief_from(bodies, shifted)
}

/// Tweede helft van `transportedCloud`: kleur en optische diepte uit de typepatronen en hun reliëf.
fn cloud_color(
    bodies: Vec3,
    relief: Vec3,
    cover: f32,
    darkness: f32,
    weights: Vec3,
    night: f32,
) -> [f32; 4] {
    let opacity = [
        cloud_opacity(bodies[0], cover, darkness, 1.0, night),
        cloud_opacity(bodies[1], cover, darkness, 1.0, night),
        cloud_opacity(bodies[2], cover, darkness, 0.7, night),
    ];
    let depth = dot3(opacity.map(|value| -(1.0 - value).max(0.001).ln()), weights);
    let light = dot3(
        std::array::from_fn(|layer| relief[layer] + (bodies[layer] - 0.5) * 0.12),
        weights,
    );
    let day = mix3([0.95, 0.97, 0.98], [0.42, 0.49, 0.55], darkness);
    let dark = mix3([0.42, 0.51, 0.59], [0.25, 0.32, 0.39], darkness);
    let color = mix3(day, dark, night);
    [color[0] + light, color[1] + light, color[2] + light, depth]
}

/// Één vulpixel na de eerste pas: alles behalve het reliëf.
#[derive(Clone, Copy)]
struct FillSample {
    valid: f32,
    cover: f32,
    darkness: f32,
    weights: Vec3,
    point: Vec2,
    bodies: Vec3,
}

/// Reliëf uit de buurpixels: de patroonverschuiving omgerekend naar pixels via de lokale afgeleide van het
/// patroonpunt, en daar de al berekende patronen bilineair bemonsterd. `None` als de buren dat niet dragen; dan
/// rekent de aanroeper het reliëf direct.
fn neighbour_relief(
    samples: &[Option<FillSample>],
    width: usize,
    height: usize,
    column: usize,
    row: usize,
) -> Option<Vec3> {
    let sample = samples[row * width + column]?;
    let point_at =
        |column: usize, row: usize| samples[row * width + column].map(|sample| sample.point);
    // Centraal verschil waar beide buren er zijn, anders eenzijdig.
    let slope = |before: Option<Vec2>, after: Option<Vec2>| -> Option<Vec2> {
        match (before, after) {
            (Some(before), Some(after)) => {
                Some([(after[0] - before[0]) / 2.0, (after[1] - before[1]) / 2.0])
            }
            (None, Some(after)) => Some([after[0] - sample.point[0], after[1] - sample.point[1]]),
            (Some(before), None) => {
                Some([sample.point[0] - before[0], sample.point[1] - before[1]])
            }
            (None, None) => None,
        }
    };
    let along_columns = slope(
        column.checked_sub(1).and_then(|left| point_at(left, row)),
        (column + 1 < width)
            .then(|| point_at(column + 1, row))
            .flatten(),
    )?;
    let along_rows = slope(
        row.checked_sub(1).and_then(|up| point_at(column, up)),
        (row + 1 < height)
            .then(|| point_at(column, row + 1))
            .flatten(),
    )?;
    // Los op: along_columns·dx + along_rows·dy = RELIEF_OFFSET.
    let determinant = along_columns[0] * along_rows[1] - along_rows[0] * along_columns[1];
    if determinant.abs() < 1e-9 {
        return None;
    }
    let shift_columns =
        (RELIEF_OFFSET[0] * along_rows[1] - along_rows[0] * RELIEF_OFFSET[1]) / determinant;
    let shift_rows =
        (along_columns[0] * RELIEF_OFFSET[1] - RELIEF_OFFSET[0] * along_columns[1]) / determinant;
    let target_column = column as f32 + shift_columns;
    let target_row = row as f32 + shift_rows;
    let west = floor(target_column);
    let north = floor(target_row);
    if west < 0.0 || north < 0.0 || west + 1.0 >= width as f32 || north + 1.0 >= height as f32 {
        return None;
    }
    let mix_east = target_column - west;
    let mix_south = target_row - north;
    let (west, north) = (west as usize, north as usize);
    let mut shifted = [0.0f32; 3];
    for (neighbour_column, neighbour_row, weight) in [
        (west, north, (1.0 - mix_east) * (1.0 - mix_south)),
        (west + 1, north, mix_east * (1.0 - mix_south)),
        (west, north + 1, (1.0 - mix_east) * mix_south),
        (west + 1, north + 1, mix_east * mix_south),
    ] {
        let neighbour = samples[neighbour_row * width + neighbour_column]?;
        for (layer, value) in shifted.iter_mut().enumerate() {
            // Een buur rekent alleen de typen die hij zelf gebruikt; ontbreekt er een die hier telt, dan direct.
            if sample.weights[layer] > 0.0 && neighbour.weights[layer] <= 0.0 {
                return None;
            }
            *value += neighbour.bodies[layer] * weight;
        }
    }
    Some(relief_from(sample.bodies, shifted))
}

/// De stroming op `uv` en tijdindex `time`: trilineair, zoals `textureLod` op de RG16F-volumetextuur.
fn flow_at(volume: &CloudVolume<'_>, uv: Vec2, time: f32) -> Vec2 {
    let width = volume.grid.width;
    let height = volume.grid.height;
    let column = uv[0] * width as f32 - 0.5;
    let row = uv[1] * height as f32 - 0.5;
    let west = floor(column);
    let north = floor(row);
    let mix_x = column - west;
    let mix_y = row - north;
    let layer = floor(time);
    let mix_z = time - layer;
    let clamp_column = |value: f32| (value as isize).clamp(0, width as isize - 1) as usize;
    let clamp_row = |value: f32| (value as isize).clamp(0, height as isize - 1) as usize;
    let columns = [clamp_column(west), clamp_column(west + 1.0)];
    let rows = [clamp_row(north), clamp_row(north + 1.0)];
    let mut result = [0.0f32; 2];
    for (layer_offset, layer_weight) in [(0, 1.0 - mix_z), (1, mix_z)] {
        if layer_weight == 0.0 {
            continue;
        }
        let hour = volume.hour(layer as isize + layer_offset);
        for (row_index, row_weight) in [(rows[0], 1.0 - mix_y), (rows[1], mix_y)] {
            for (column_index, column_weight) in [(columns[0], 1.0 - mix_x), (columns[1], mix_x)] {
                let weight = layer_weight * row_weight * column_weight;
                let vector = hour.flow[row_index * width + column_index];
                result[0] += vector[0] * weight;
                result[1] += vector[1] * weight;
            }
        }
    }
    result
}

/// `wind`: oudere reis houdt de stroming een uur vóór de cursor vast, continu over uurgrenzen.
fn wind(volume: &CloudVolume<'_>, uv: Vec2, frame_time: f32, age: f32) -> Vec2 {
    let time = (frame_time - age.min(1.0)).max(0.0);
    let flow = flow_at(volume, uv, time);
    [
        flow[0] / volume.grid.width as f32,
        flow[1] / volume.grid.height as f32,
    ]
}

fn backtrace(volume: &CloudVolume<'_>, uv: Vec2, frame_time: f32, hours: f32) -> Vec2 {
    let steps = mode_constants().cloud.flow_steps;
    let step_hours = hours / steps as f32;
    let mut at = uv;
    for step in 0..steps {
        let age = step as f32 * step_hours;
        let velocity = wind(volume, at, frame_time, age);
        let midpoint = [
            at[0] - velocity[0] * (0.5 * step_hours),
            at[1] - velocity[1] * (0.5 * step_hours),
        ];
        let velocity = wind(volume, midpoint, frame_time, age + 0.5 * step_hours);
        at = [
            at[0] - velocity[0] * step_hours,
            at[1] - velocity[1] * step_hours,
        ];
    }
    at
}

/// Positie van doelpixels in het wolkenrooster (celcentrum = geheel getal), lineair uit de kaartprojectie.
pub struct CloudTarget {
    pub width: usize,
    pub height: usize,
    /// Rasterkolom per doelpixelkolom en rasterrij per doelpixelrij.
    pub columns: Vec<f64>,
    pub rows: Vec<f64>,
}

impl CloudTarget {
    /// `columns`/`rows` zijn de rastercoördinaten van de uitvoerpixels (`Projection`); het doel bedekt hetzelfde beeld
    /// met `width`×`height` pixels.
    pub fn new(columns: &[f64], rows: &[f64], width: usize, height: usize) -> Self {
        let map = |coordinates: &[f64], size: usize| -> Vec<f64> {
            let step = coordinates[1] - coordinates[0];
            let output = coordinates.len() as f64;
            (0..size)
                .map(|index| {
                    let pixel = (index as f64 + 0.5) / size as f64 * output - 0.5;
                    coordinates[0] + step * pixel
                })
                .collect()
        };
        Self {
            width,
            height,
            columns: map(columns, width),
            rows: map(rows, height),
        }
    }
}

/// Keuzes waarin de botfilm van de app mag afwijken om rekentijd te sparen (U92-hefbomen, gemeten in de LOG).
#[derive(Clone, Copy, Debug)]
pub struct CloudQuality {
    /// Het reliëf uit de buurpixels halen in plaats van elk patroon een tweede keer te rekenen.
    pub neighbour_relief: bool,
    /// Breedte van de rand in vulpixels die direct terugtracet; de app gebruikt 8 pixels van zijn vuldoel.
    pub border_pixels: usize,
}

impl CloudQuality {
    /// Precies wat de app tekent.
    pub const APP: Self = Self {
        neighbour_relief: false,
        border_pixels: 8,
    };
}

/// Rendert de wolkenvulling (voorvermenigvuldigd RGBA8, zoals het vuldoel van de app) en, met `travel`, eerst de
/// terugtrace op het grove raster.
pub fn render_fill(
    volume: &CloudVolume<'_>,
    frame: &CloudFrame,
    fill: &CloudTarget,
    travel: Option<&CloudTarget>,
    quality: CloudQuality,
) -> Vec<u8> {
    let grid = volume.grid;
    let field = volume.blended(frame.time);
    let frame_time = frame.time as f32;
    let lifetime = mode_constants().cloud.flow_hours;
    let age_a = frame.phase;
    let age_b = (age_a + lifetime / 2.0) % lifetime;
    let weight_a = (age_a * std::f64::consts::PI / lifetime).sin().powi(2) as f32;
    let (age_a, age_b) = (age_a as f32, age_b as f32);
    let anchors = frame.anchors.map(|value| value as f32);
    let origin = [grid.x0 as f32, grid.y0 as f32];
    let extent = [
        (grid.dx * grid.width as f64) as f32,
        (grid.dy * grid.height as f64) as f32,
    ];
    let night = if frame.night { 1.0 } else { 0.0 };
    let uv_of = |position: f64, size: usize| ((position + 0.5) / size as f64) as f32;
    let cached = travel.map(|travel| {
        let mut offsets = Vec::with_capacity(travel.width * travel.height);
        for &row in &travel.rows {
            for &column in &travel.columns {
                let uv = [uv_of(column, grid.width), uv_of(row, grid.height)];
                let foot_a = backtrace(volume, uv, frame_time, age_a);
                let foot_b = backtrace(volume, uv, frame_time, age_b);
                offsets.push([
                    foot_a[0] - uv[0],
                    foot_a[1] - uv[1],
                    foot_b[0] - uv[0],
                    foot_b[1] - uv[1],
                ]);
            }
        }
        (travel, offsets)
    });
    let horizontal: Vec<_> = fill
        .columns
        .iter()
        .map(|&position| spline_taps(position, grid.width))
        .collect();
    let vertical: Vec<_> = fill
        .rows
        .iter()
        .map(|&position| spline_taps(position, grid.height))
        .collect();
    // Randpixels kunnen buiten het grove raster vallen: die tracet de shader direct (8 pixels marge).
    let border = quality.border_pixels;
    let margin_u =
        ((fill.columns[1] - fill.columns[0]).abs() / grid.width as f64 * border as f64) as f32;
    let margin_v =
        ((fill.rows[1] - fill.rows[0]).abs() / grid.height as f64 * border as f64) as f32;
    let mut samples: Vec<Option<FillSample>> = vec![None; fill.width * fill.height];
    for (row, row_taps) in vertical.iter().enumerate() {
        for (column, column_taps) in horizontal.iter().enumerate() {
            let mut sample = [0.0f32; 4];
            for &(source_row, row_weight) in row_taps {
                for &(source_column, column_weight) in column_taps {
                    let value = field[source_row * grid.width + source_column];
                    let weight = row_weight * column_weight;
                    for (channel, source) in sample.iter_mut().zip(value) {
                        *channel += source * weight;
                    }
                }
            }
            let valid = smoothstep(0.3, 0.7, sample[1]);
            let cover = (sample[0] / 100.0).clamp(0.0, 1.0);
            let shape = sample[2].clamp(0.0, 1.0);
            let darkness = sample[3].clamp(0.0, 1.0);
            if cover == 0.0 || valid == 0.0 {
                continue;
            }
            let uv = [
                uv_of(fill.columns[column], grid.width),
                uv_of(fill.rows[row], grid.height),
            ];
            let interior = uv[0] > margin_u
                && uv[1] > margin_v
                && uv[0] < 1.0 - margin_u
                && uv[1] < 1.0 - margin_v
                && column >= border
                && row >= border
                && column + border < fill.width
                && row + border < fill.height;
            let (mut foot_a, mut foot_b) = match &cached {
                Some((travel, offsets)) if interior => {
                    let offset = travel_offset(travel, offsets, fill, column, row);
                    (
                        [uv[0] + offset[0], uv[1] + offset[1]],
                        [uv[0] + offset[2], uv[1] + offset[3]],
                    )
                }
                _ => (
                    backtrace(volume, uv, frame_time, age_a),
                    backtrace(volume, uv, frame_time, age_b),
                ),
            };
            // Beginposities volgen het geïntegreerde bulkpad, zodat vernieuwen nooit terugveert naar een vast patroon.
            foot_a = [foot_a[0] - anchors[0], foot_a[1] - anchors[1]];
            foot_b = [foot_b[0] - anchors[2], foot_b[1] - anchors[3]];
            let weights = type_weights(shape);
            // Trajecten interpoleren, niet twee verschoven wolkenbeelden die in elkaar overvloeien.
            let foot = [
                mix(foot_b[0], foot_a[0], weight_a),
                mix(foot_b[1], foot_a[1], weight_a),
            ];
            let point = cloud_point(origin, extent, foot);
            samples[row * fill.width + column] = Some(FillSample {
                valid,
                cover,
                darkness,
                weights,
                point,
                bodies: cloud_bodies(point, weights),
            });
        }
    }
    let mut output = vec![0u8; fill.width * fill.height * 4];
    for row in 0..fill.height {
        for column in 0..fill.width {
            let Some(sample) = samples[row * fill.width + column] else {
                continue;
            };
            let relief = if quality.neighbour_relief {
                neighbour_relief(&samples, fill.width, fill.height, column, row)
            } else {
                None
            }
            .unwrap_or_else(|| direct_relief(sample.point, sample.bodies, sample.weights));
            let colored = cloud_color(
                sample.bodies,
                relief,
                sample.cover,
                sample.darkness,
                sample.weights,
                night,
            );
            let opacity = (1.0 - (-colored[3]).exp()) * sample.valid;
            let shadow = sample.cover * sample.darkness * mix(0.15, 0.08, night) * sample.valid;
            let shadow_color = [0.22, 0.29, 0.36];
            let destination = (row * fill.width + column) * 4;
            for channel in 0..3 {
                let value =
                    colored[channel] * opacity + shadow_color[channel] * shadow * (1.0 - opacity);
                output[destination + channel] = unit_to_byte(value);
            }
            output[destination + 3] = unit_to_byte(opacity + shadow * (1.0 - opacity));
        }
    }
    output
}

fn unit_to_byte(value: f32) -> u8 {
    round_to_byte(value.clamp(0.0, 1.0) * 255.0)
}

/// `cloudTravel`: handmatig bilineair uit het grove raster, op de fragmentpositie in het vuldoel.
fn travel_offset(
    travel: &CloudTarget,
    offsets: &[[f32; 4]],
    fill: &CloudTarget,
    column: usize,
    row: usize,
) -> [f32; 4] {
    let at_x = (column as f32 + 0.5) / fill.width as f32 * travel.width as f32 - 0.5;
    let at_y = (row as f32 + 0.5) / fill.height as f32 * travel.height as f32 - 0.5;
    let west = floor(at_x);
    let north = floor(at_y);
    let mix_x = at_x - west;
    let mix_y = at_y - north;
    let fetch = |x: f32, y: f32| offsets[y as usize * travel.width + x as usize];
    let corners = [
        fetch(west, north),
        fetch(west + 1.0, north),
        fetch(west, north + 1.0),
        fetch(west + 1.0, north + 1.0),
    ];
    std::array::from_fn(|channel| {
        mix(
            mix(corners[0][channel], corners[1][channel], mix_x),
            mix(corners[2][channel], corners[3][channel], mix_x),
            mix_y,
        )
    })
}

fn spline_taps(position: f64, size: usize) -> [(usize, f32); 4] {
    let cell = position.floor() as isize;
    let weights = basis(position - position.floor());
    std::array::from_fn(|offset| {
        (
            (cell - 1 + offset as isize).clamp(0, size as isize - 1) as usize,
            weights[offset] as f32,
        )
    })
}

/// Een vulrij, horizontaal verbreed tot de uitvoerbreedte, met zijn rijnummer.
type WideRow = (usize, Vec<[f32; 4]>);

/// Legt de vulling over `rgb`: bilineair opgeschaald, maal `opacity`, als voorvermenigvuldigde alfa-over.
/// Eerst horizontaal per vulrij (één keer per rij), dan verticaal per uitvoerrij: dezelfde bilineaire weging als de
/// texture-fetch in de composietshader van de app.
pub fn composite(
    rgb: &mut [u8],
    output_width: usize,
    output_height: usize,
    filled: &[u8],
    fill_width: usize,
    fill_height: usize,
    opacity: f32,
) {
    let horizontal: Vec<_> = (0..output_width)
        .map(|column| interpolation_taps(column, output_width, fill_width))
        .collect();
    let widen = |fill_row: usize| -> Vec<[f32; 4]> {
        let row = &filled[fill_row * fill_width * 4..(fill_row + 1) * fill_width * 4];
        horizontal
            .iter()
            .map(|&(west, east, mix_east)| {
                std::array::from_fn(|channel| {
                    f32::from(row[west * 4 + channel]) * (1.0 - mix_east)
                        + f32::from(row[east * 4 + channel]) * mix_east
                })
            })
            .collect()
    };
    // De twee verbrede vulrijen rond de huidige uitvoerrij; bij de volgende vulrij schuift de onderste naar boven.
    let mut pair: Option<(WideRow, WideRow)> = None;
    for row in 0..output_height {
        let (north, south, mix_south) = interpolation_taps(row, output_height, fill_height);
        let (upper, lower) = match pair.take() {
            Some((upper, lower)) if upper.0 == north && lower.0 == south => (upper, lower),
            Some((_, lower)) if lower.0 == north => (lower, (south, widen(south))),
            _ => ((north, widen(north)), (south, widen(south))),
        };
        let (northern, southern) = (&upper.1, &lower.1);
        let output_row = &mut rgb[row * output_width * 3..(row + 1) * output_width * 3];
        for (column, pixel) in output_row.chunks_exact_mut(3).enumerate() {
            let (top, bottom) = (northern[column], southern[column]);
            if top == [0.0; 4] && bottom == [0.0; 4] {
                continue;
            }
            // De overlaycanvas bewaart de laag als 8 bits voorvermenigvuldigd; daarna legt de browser hem over de kaart.
            let overlay: [f32; 4] = std::array::from_fn(|channel| {
                f32::from(round_to_byte(
                    (top[channel] * (1.0 - mix_south) + bottom[channel] * mix_south) * opacity,
                ))
            });
            for (channel, value) in pixel.iter_mut().enumerate() {
                *value = round_to_byte(
                    f32::from(*value) * (1.0 - overlay[3] / 255.0) + overlay[channel],
                );
            }
        }
        pair = Some((upper, lower));
    }
}

/// Bilineaire buren en gewicht van de rechter/onderste buur voor uitvoerpixel `index`, met CLAMP_TO_EDGE.
fn interpolation_taps(index: usize, output_size: usize, source_size: usize) -> (usize, usize, f32) {
    let scale = source_size as f64 / output_size as f64;
    let position = ((index as f64 + 0.5) * scale - 0.5).clamp(0.0, source_size as f64 - 1.0);
    let first = position.floor() as usize;
    (
        first,
        (first + 1).min(source_size - 1),
        (position - first as f64) as f32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// De shaderbron waarvan dit bestand de port is. Wijkt de gegenereerde vingerafdruk af, dan is de app-shader
    /// veranderd: zet dezelfde wijziging hier door en werk daarna deze waarde bij.
    const PORTED_SHADER_SHA256: &str =
        "bf31324f8831526f0ad57153f9fad3990d932bc81750cb77d6790ec783c27ac9";

    #[test]
    fn port_follows_the_current_app_shader() {
        assert_eq!(mode_constants().cloud.shader_sha256, PORTED_SHADER_SHA256);
    }

    fn fixture_blend<'a>(
        blend: &'a crate::mode_constants::BlendFixture,
        quant: &'a [Option<f32>],
    ) -> RasterBlend<'a> {
        let view = |raster: &'a crate::mode_constants::RasterFixture| RasterView {
            grid: &raster.grid,
            quant,
            values: &raster.values,
        };
        RasterBlend {
            left: view(&blend.left),
            right: view(&blend.right),
            mix: blend.mix,
        }
    }

    #[test]
    fn prepares_the_hour_like_prepare_cloud_map_field() {
        let fixtures = &mode_constants().cloud.field_fixtures;
        assert_eq!(fixtures.len(), 2);
        for fixture in fixtures {
            let quant = &fixture.quant;
            let blend = |blend| fixture_blend(blend, quant);
            let field = Field {
                width: fixture.grid.width,
                height: fixture.grid.height,
                values: fixture.values.clone(),
                valid: fixture.valid.clone(),
            };
            let hour = prepare_hour(
                &fixture.grid,
                &field,
                fixture.epoch,
                CloudInputs {
                    low: Some(blend(&fixture.low)),
                    mid: Some(blend(&fixture.mid)),
                    high: Some(blend(&fixture.high)),
                    radiation: Some(blend(&fixture.radiation)),
                    radiation_next: Some(blend(&fixture.radiation_next)),
                    motion: Some(MotionView {
                        grid: &fixture.motion.grid,
                        width: fixture.motion.width,
                        height: fixture.motion.height,
                        vectors: &fixture.motion.vectors,
                    }),
                },
            );
            for (cell, channels) in hour.channels.iter().enumerate() {
                for (index, actual) in [channels[2], channels[3]].into_iter().enumerate() {
                    let expected = fixture.hints[cell * 2 + index];
                    assert!(
                        (actual - expected).abs() < 1e-6,
                        "cel {cell} hint {index}: {actual} ≠ {expected}"
                    );
                }
                for (index, &actual) in hour.flow[cell].iter().enumerate() {
                    let expected = fixture.flow[cell * 2 + index];
                    assert!(
                        (actual - expected).abs() < 1e-5,
                        "cel {cell} stroming {index}: {actual} ≠ {expected}"
                    );
                }
            }
        }
    }

    #[test]
    fn drift_matches_the_loader_and_cloud_drift_at() {
        let epochs = drift_epochs(1_800_000, 4 * 3_600_000);
        assert_eq!(
            epochs,
            vec![1_800_000, 3_600_000, 7_200_000, 10_800_000, 14_400_000]
        );
        assert_eq!(drift_anchor(&epochs, 7_200_000), 2);
        assert_eq!(drift_anchor(&epochs, 0), 0);
        assert_eq!(drift_anchor(&epochs, 99_000_000), 4);
        let velocities = vec![[10_000.0, -5_000.0]; epochs.len()];
        let path = drift_path(&epochs, &velocities, 2);
        assert_eq!(path[2].position, [0.0, 0.0]);
        assert_eq!(path[3].position, [10_000.0, -5_000.0]);
        assert_eq!(path[0].position, [-15_000.0, 7_500.0]);
        assert_eq!(drift_at(&path, 9_000_000.0), [5_000.0, -2_500.0]);
    }

    #[test]
    fn hash_and_noise_stay_in_the_unit_interval() {
        for index in 0..500 {
            let point = [index as f32 * 0.731 - 40.0, index as f32 * -1.37 + 12.0];
            let value = hash(point);
            assert!((0.0..1.0).contains(&value));
            assert!((0.0..=1.0).contains(&noise(point)));
            assert!((0.0..=1.0).contains(&cloud_cells(point)));
        }
    }

    #[test]
    fn inline_floor_matches_the_standard_floor() {
        for index in -20_000..20_000 {
            let value = index as f32 * 0.137 + 0.0001;
            assert_eq!(floor(value), value.floor(), "{value}");
            assert_eq!(fract(value), value - value.floor());
        }
        for value in [
            -1.0,
            -0.5,
            0.0,
            0.5,
            1.0,
            8_388_607.5,
            9_000_000.0,
            -9_000_000.0,
        ] {
            assert_eq!(floor(value), value.floor(), "{value}");
        }
    }

    #[test]
    fn type_weights_sum_to_one() {
        for step in 0..=20 {
            let weights = type_weights(step as f32 / 20.0);
            assert!((weights.iter().sum::<f32>() - 1.0).abs() < 1e-6);
        }
    }
}
