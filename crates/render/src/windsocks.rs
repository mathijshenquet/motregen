//! De windzakken van de windfilm (U101), zoals `bot/native-windsocks.ts`: vorm, stroming, momentum en wuiven uit
//! `render_core::windsock`, getekend als vlakken met een badge die de zak wegknipt.

use crate::{
    data::Raster,
    fields::{Pair, screen},
};
use render_core::{
    constants::constants,
    mode_constants::{color, mode_constants},
    projection::{Grid, project},
    rotated_text::{RotatedText, TextStyle},
    windsock::{self, Cut, Point, Shape, SockMotion, Vectors, WindSlice, WindsockField},
};
use serde::{Deserialize, Serialize};

/// u en v van één uurframe, gelezen via hun quantisering.
struct RasterVectors<'a> {
    east: &'a Raster,
    north: &'a Raster,
}

impl Vectors for RasterVectors<'_> {
    fn vector(&self, index: usize) -> Option<[f64; 2]> {
        let east = self.east.quant[self.east.values[index] as usize]?;
        let north = self.north.quant[self.north.values[index] as usize]?;
        Some([f64::from(east), f64::from(north)])
    }
}

/// Momentum en golffase van alle zakken, doorgegeven van filmframe naar filmframe (U107; `FieldState`, dus ook in
/// de framecache-keten). Een still begint leeg en springt direct naar het veld.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SockChain {
    /// Filmseconden van de vorige stap.
    seconds: Option<f64>,
    /// Per plaats in `mode_constants().windsock.places`.
    motions: Vec<SockMotion>,
}

/// Wat het tekenen van één zak nodig heeft: de getekende richtingen per asstuk, kracht en het Bft-getal.
pub struct SockPose {
    point: Point,
    headings: Vec<f64>,
    strength: f64,
    label: String,
}

/// `pairs`: (oost, noord) op de kaarttijd, een half en een heel `lag_minutes` eerder. Stapt de keten één filmframe
/// verder (`seconds`), zoals `WindsockLayer.draw` in de app per animatieframe.
pub fn advance(
    chain: &mut SockChain,
    grid: &Grid,
    pairs: &[(Pair, Pair); 3],
    seconds: f64,
) -> Vec<SockPose> {
    let settings = &mode_constants().windsock;
    let vectors: Vec<_> = pairs
        .iter()
        .map(|(east, north)| {
            (
                RasterVectors {
                    east: &east.left,
                    north: &north.left,
                },
                RasterVectors {
                    east: &east.right,
                    north: &north.right,
                },
                east.mix,
            )
        })
        .collect();
    let slice = |index: usize| WindSlice {
        left: &vectors[index].0,
        right: &vectors[index].1,
        mix: vectors[index].2,
    };
    let field = WindsockField {
        grid: &pairs[0].0.left.grid,
        slices: [slice(0), slice(1), slice(2)],
    };
    let elapsed = chain
        .seconds
        .map_or(f64::NAN, |previous| seconds - previous);
    let snap = elapsed.is_nan() || elapsed <= 0.0 || elapsed > settings.snap_seconds;
    chain.seconds = Some(seconds);
    chain
        .motions
        .resize(settings.places.len(), SockMotion::default());
    let transform = screen(grid);
    let size = &constants().size;
    let scale = mode_constants().scale;
    let mut poses = Vec::new();
    for (place, motion) in settings.places.iter().zip(&mut chain.motions) {
        let (x, y) = project(place.lng, place.lat);
        let point = transform.point([(x - grid.x0) / grid.dx - 0.5, (y - grid.y0) / grid.dy - 0.5]);
        if point[0] < -90.0
            || point[1] < -90.0
            || point[0] > size.width as f64 + 90.0
            || point[1] > size.height as f64 + 90.0
        {
            continue;
        }
        let (Some(wind), Some(compass)) = (
            windsock::sample(&field, 0, x, y),
            windsock::headings(&field, x, y, settings.stream, settings.lag),
        ) else {
            continue;
        };
        let speed = wind[0].hypot(wind[1]);
        let target = compass[0];
        windsock::advance_sock(
            motion,
            target,
            windsock::beaufort_scale(speed),
            elapsed,
            snap,
        );
        let (Some(heading), Some(strength)) = (motion.heading, motion.strength) else {
            continue;
        };
        let strength = strength.value.max(0.0);
        let bends = windsock::sway_bends(strength, motion.wave, seconds, place.phase);
        poses.push(SockPose {
            point: [
                point[0] + place.offset[0] * scale,
                point[1] + place.offset[1] * scale,
            ],
            headings: compass
                .iter()
                .zip(&bends)
                .map(|(compass, bend)| {
                    heading.value + windsock::angle_difference(target, *compass) + bend
                })
                .collect(),
            strength,
            label: windsock::beaufort_number(speed).to_string(),
        });
    }
    poses
}

pub fn draw(rgb: &mut [u8], badges: &mut RotatedText, poses: &[SockPose], night: bool) {
    for pose in poses {
        let shape = windsock::shape(pose.strength, &pose.headings);
        draw_sock(rgb, badges, pose.point, &shape, &pose.label, night);
    }
}

fn draw_sock(
    rgb: &mut [u8],
    labels: &mut RotatedText,
    at: Point,
    shape: &Shape,
    label: &str,
    night: bool,
) {
    let settings = &mode_constants().windsock;
    let style = &settings.style;
    let scale = mode_constants().scale;
    let size = (constants().size.width, constants().size.height);
    let place = |points: &[Point], offset_y: f64| -> Vec<Point> {
        points
            .iter()
            .map(|&[x, y]| [at[0] + x * scale, at[1] + (y + offset_y) * scale])
            .collect()
    };
    let badge = windsock::badge(shape, settings.badge_at_mouth, label);
    let center = [
        at[0] + badge.center[0] * scale,
        at[1] + badge.center[1] * scale,
    ];
    let cut = Some(Cut {
        center,
        radius: badge.cut_radius * scale,
    });
    let (orange, white, ink) = (
        color(&style.orange),
        color(&style.white),
        color(&style.ink_color),
    );
    let halo = [255; 3];
    // Dezelfde lagen als de bot: schaduw, lichte rand, inkt, banden, hoepel en mast rond de badge weggeknipt.
    let mut fill = |points: Vec<Point>, fill_color: [u8; 3], opacity: f64, cut: Option<Cut>| {
        windsock::fill_polygon(rgb, size, &points, fill_color, opacity, cut);
    };
    fill(
        place(
            &windsock::inflated(shape, style.shadow.margin),
            style.shadow.offset_y,
        ),
        [0; 3],
        style.shadow.alpha,
        cut,
    );
    fill(
        place(&windsock::inflated(shape, style.halo.margin), 0.0),
        halo,
        if night {
            style.halo.dark
        } else {
            style.halo.light
        },
        cut,
    );
    fill(
        place(&windsock::inflated(shape, style.ink), 0.0),
        ink,
        1.0,
        cut,
    );
    for band in 0..settings.bands {
        fill(
            place(&windsock::band(shape, band), 0.0),
            if band % 2 == 1 { white } else { orange },
            1.0,
            cut,
        );
    }
    fill(
        place(
            &windsock::thick_line(shape.left[0], shape.right[0], style.hoop_half_width),
            0.0,
        ),
        ink,
        1.0,
        cut,
    );
    fill(
        place(&windsock::circle([0.0, 0.0], style.mast.halo), 0.0),
        halo,
        1.0,
        cut,
    );
    fill(
        place(&windsock::circle([0.0, 0.0], style.mast.ink), 0.0),
        ink,
        1.0,
        cut,
    );
    fill(
        place(
            &windsock::circle(badge.center, badge.radius + style.ink),
            style.shadow.offset_y,
        ),
        [0; 3],
        style.shadow.alpha,
        None,
    );
    fill(
        place(
            &windsock::circle(badge.center, badge.radius + style.ink),
            0.0,
        ),
        ink,
        1.0,
        None,
    );
    fill(
        place(
            &windsock::circle(badge.center, badge.radius - style.ink),
            0.0,
        ),
        halo,
        1.0,
        None,
    );
    labels.draw(
        rgb,
        label,
        [center[0], center[1] + 0.5 * scale],
        0.0,
        TextStyle {
            size: (badge.font_px * scale).round() as u32,
            color: orange,
            halo,
            opacity: 1.0,
        },
    );
}
