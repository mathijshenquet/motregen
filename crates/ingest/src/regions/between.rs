//! Tussenbalken van het histogram op de server (PO 2026-11-09, "kan je die averaging niet server side doen?").
//! Een letterlijke port van `rainBetween` (web/src/core/rain-point-detail.ts), `motionWarpStrength`
//! (rain-motion.ts) en `selectPairMotion` (motion-selection.ts), op het celmidden in plaats van op de plek. De
//! uitkomst is de gemengde byte vóór de kwantisatietabel: alleen f64-rekenwerk op bytes en i8-vectoren, zodat Rust en
//! TypeScript exact gelijk uitkomen (`web/scripts/regio-check.ts` vergelijkt ze).

use chrono::DateTime;

pub const RAIN_DETAIL_STEP_MS: f64 = 15.0 * 60_000.0;
const WARP_CAP_CELLS: f64 = 15.0;
const WARP_FADE_END_CELLS: f64 = 30.0;
const PATCH_RADIUS: i64 = WARP_CAP_CELLS as i64 + 2;
const PATCH_SIZE: i64 = 2 * PATCH_RADIUS + 1;
const NO_DATA: u8 = 255;

fn motion_warp_strength(total_displacement: f64) -> f64 {
    let cap_scale = (WARP_CAP_CELLS / total_displacement.max(0.0001)).min(1.0);
    let position = ((total_displacement - WARP_CAP_CELLS) / (WARP_FADE_END_CELLS - WARP_CAP_CELLS))
        .clamp(0.0, 1.0);
    let fallback = 1.0 - position * position * (3.0 - 2.0 * position);
    cap_scale * fallback
}

/// Een frame met zijn rastermaten; `cell_x`/`cell_y` zijn celcoördinaten met celmiddens op .5, zoals in de shader.
pub struct Raster<'a> {
    pub bytes: &'a [u8],
    pub width: u32,
    pub height: u32,
}

pub struct Motion<'a> {
    pub vectors: &'a [i8],
    pub width: u32,
    pub height: u32,
}

/// `motionAtPatch`: snelheid in cellen per minuut, bilineair; `None` als een buurblok geen vector heeft.
fn motion_at(
    motion: &Motion,
    cell_x: f64,
    cell_y: f64,
    width: u32,
    height: u32,
) -> Option<(f64, f64)> {
    let block_x = cell_x / f64::from(width) * f64::from(motion.width) - 0.5;
    let block_y = cell_y / f64::from(height) * f64::from(motion.height) - 0.5;
    let lower_x = block_x.floor();
    let lower_y = block_y.floor();
    let weight_x = block_x - lower_x;
    let weight_y = block_y - lower_y;
    let (mut x, mut y) = (0.0, 0.0);
    for (offset_x, offset_y, weight) in [
        (0.0, 0.0, (1.0 - weight_x) * (1.0 - weight_y)),
        (1.0, 0.0, weight_x * (1.0 - weight_y)),
        (0.0, 1.0, (1.0 - weight_x) * weight_y),
        (1.0, 1.0, weight_x * weight_y),
    ] {
        if weight <= 0.0 {
            continue;
        }
        let column = (lower_x + offset_x)
            .max(0.0)
            .min(f64::from(motion.width) - 1.0) as usize;
        let row = (lower_y + offset_y)
            .max(0.0)
            .min(f64::from(motion.height) - 1.0) as usize;
        let index = (row * motion.width as usize + column) * 2;
        let (vx, vy) = (motion.vectors[index], motion.vectors[index + 1]);
        if vx == -128 || vy == -128 {
            return None;
        }
        x += f64::from(vx) * 0.1 * weight;
        y += f64::from(vy) * 0.1 * weight;
    }
    Some((x, y))
}

/// `patchByte` op een patch rond (`center_x`, `center_y`), gelezen uit het hele raster.
fn patch_byte(raster: &Raster, center_x: f64, center_y: f64, cell_x: f64, cell_y: f64) -> f64 {
    let (width, height) = (f64::from(raster.width), f64::from(raster.height));
    if cell_x < 0.5 || cell_y < 0.5 || cell_x > width - 0.5 || cell_y > height - 0.5 {
        return 0.0;
    }
    let origin_column = center_x.floor() as i64 - PATCH_RADIUS;
    let origin_row = center_y.floor() as i64 - PATCH_RADIUS;
    let column = cell_x - 0.5 - origin_column as f64;
    let row = cell_y - 0.5 - origin_row as f64;
    let lower_column = (column.floor() as i64).clamp(0, PATCH_SIZE - 2);
    let lower_row = (row.floor() as i64).clamp(0, PATCH_SIZE - 2);
    let weight_x = column - lower_column as f64;
    let weight_y = row - lower_row as f64;
    let at = |offset_column: i64, offset_row: i64| {
        let source_column = origin_column + lower_column + offset_column;
        let source_row = origin_row + lower_row + offset_row;
        if source_column < 0
            || source_row < 0
            || source_column >= i64::from(raster.width)
            || source_row >= i64::from(raster.height)
        {
            return NO_DATA;
        }
        raster.bytes[source_row as usize * raster.width as usize + source_column as usize]
    };
    let corners = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)];
    if corners.contains(&NO_DATA) {
        return 0.0;
    }
    let [c0, c1, c2, c3] = corners.map(f64::from);
    let top = c0 + (c1 - c0) * weight_x;
    let bottom = c2 + (c3 - c2) * weight_x;
    top + (bottom - top) * weight_y
}

/// De gemengde byte van `rainBetween` op het midden van cel (`column`, `row`).
pub fn blended_byte(
    left: &Raster,
    right: &Raster,
    motion: Option<&Motion>,
    interval_minutes: f64,
    weight: f64,
    column: u32,
    row: u32,
) -> f64 {
    let cell_x = f64::from(column) + 0.5;
    let cell_y = f64::from(row) + 0.5;
    let (mut shift_x, mut shift_y) = (0.0, 0.0);
    if let Some((velocity_x, velocity_y)) =
        motion.and_then(|motion| motion_at(motion, cell_x, cell_y, left.width, left.height))
    {
        let strength = motion_warp_strength(velocity_x.hypot(velocity_y) * interval_minutes);
        shift_x = velocity_x * interval_minutes * strength;
        shift_y = velocity_y * interval_minutes * strength;
    }
    let left_byte = patch_byte(
        left,
        cell_x,
        cell_y,
        cell_x - shift_x * weight,
        cell_y - shift_y * weight,
    );
    let right_byte = patch_byte(
        right,
        cell_x,
        cell_y,
        cell_x + shift_x * (1.0 - weight),
        cell_y + shift_y * (1.0 - weight),
    );
    left_byte + (right_byte - left_byte) * weight
}

/// Aantal tussenbalken tussen twee frames (`steps − 1` in de client), 0 onder twee stappen.
pub fn between_count(left_ms: f64, right_ms: f64) -> u32 {
    let steps = ((right_ms - left_ms) / RAIN_DETAIL_STEP_MS).round();
    if steps < 2.0 { 0 } else { steps as u32 - 1 }
}

/// `selectPairMotion` voor twee opeenvolgende frames van één chunk: het bewegingsveld van rechts, anders van het frame
/// daarna als dat niet verder weg ligt, anders van links.
pub fn pair_motion(times_ms: &[f64], has_motion: &[bool], left: usize) -> Option<usize> {
    let right = left + 1;
    if times_ms[left] >= times_ms[right] {
        return None;
    }
    if has_motion[right] {
        return Some(right);
    }
    let step = times_ms[right] - times_ms[left];
    if let Some(&next) = times_ms.get(right + 1)
        && next - times_ms[right] <= step
        && has_motion[right + 1]
    {
        return Some(right + 1);
    }
    has_motion[left].then_some(left)
}

pub fn epoch_ms(time: &str) -> Option<f64> {
    DateTime::parse_from_rfc3339(time)
        .ok()
        .map(|time| time.timestamp_millis() as f64)
}
