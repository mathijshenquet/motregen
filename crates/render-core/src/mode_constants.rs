use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
pub struct ModeConstants {
    pub loops: LoopPlans,
    pub scale: f64,
    pub wind: Wind,
    pub isoline: Isoline,
    pub labels: Labels,
    pub saturation: f64,
    pub bounds: Bounds,
    pub palette: Palette,
    pub cloud: Cloud,
}

#[derive(Debug, Deserialize)]
pub struct LoopPlans {
    pub wind: LoopPlan,
    pub feels: LoopPlan,
    pub air: LoopPlan,
}

#[derive(Debug, Deserialize)]
pub struct LoopPlan {
    pub loop_offsets: Vec<i64>,
    pub fps: f64,
    pub fps_fraction: crate::constants::FrameRate,
    pub hold_frames: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wind {
    pub trail_distance: f64,
    pub fade_in_px: f64,
    pub fade_out_px: f64,
    pub max_age: f64,
    pub spawn_jitter: f64,
    pub speed_damping: f64,
    pub buffer_fade: f64,
    pub head_intensity: f64,
    pub line_width: f64,
    pub sea_penalty: f64,
    pub count: usize,
    pub focus: f64,
    pub stagger: f64,
    #[serde(rename = "simulation_fps")]
    pub simulation_fps: f64,
    #[serde(rename = "screen_speed")]
    pub screen_speed: f64,
    #[serde(rename = "damping_reference")]
    pub damping_reference: f64,
    #[serde(rename = "weak_speed")]
    pub weak_speed: f64,
    #[serde(rename = "weak_boost")]
    pub weak_boost: f64,
    pub stops: Vec<f64>,
    pub light: Vec<[f64; 3]>,
    pub dark: Vec<[f64; 3]>,
}

#[derive(Debug, Deserialize)]
pub struct Isoline {
    pub temperature_blur: usize,
    pub pressure_blur: usize,
    pub time_weights: Vec<f64>,
    pub ring_km: f64,
    pub tolerance_px: f64,
    pub edge_fade_ms: f64,
    pub pressure_radius_km: f64,
    pub pressure_prominence: f64,
    pub fill_opacity: f64,
    pub fill_resolution: f64,
    pub temperature_line_fill_opacity: f64,
    pub temperature_line_fill_shade: f64,
    pub pressure_opacity: f64,
    pub line_profile: LineProfile,
    pub light_temperature: String,
    pub dark_temperature: String,
    pub light_pressure: String,
    pub dark_pressure: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineProfile {
    pub half_width: f64,
    pub alpha: f64,
}

#[derive(Debug, Deserialize)]
pub struct Labels {
    pub spacing: f64,
    pub distance: f64,
    pub maximum: usize,
}

#[derive(Debug, Deserialize)]
pub struct Bounds {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

#[derive(Debug, Deserialize)]
pub struct Palette {
    pub ramp: Vec<String>,
    pub cold: f64,
    pub warm: f64,
    pub minimum_span: f64,
}

/// Wolkenkaart (U92), uit `cloud-map.ts`, `cloud-section.ts` en `isolines.ts`.
#[derive(Debug, Deserialize)]
pub struct Cloud {
    pub flow_steps: usize,
    pub flow_hours: f64,
    pub flow_downsample: usize,
    pub blur: usize,
    pub layer_blocking: LayerBlocking,
    pub darkest_halvings: f64,
    pub fair_halvings: f64,
    pub light_fixtures: Vec<LightFixture>,
    pub field_fixtures: Vec<FieldFixture>,
    /// SHA-256 van de shaderbron waarvan `cloud.rs` de port is.
    pub shader_sha256: String,
}

#[derive(Debug, Deserialize)]
pub struct LayerBlocking {
    pub high: f64,
    pub mid: f64,
    pub low: f64,
}

/// Controlewaarde van de lichtketen, berekend door de TypeScript-bron.
#[derive(Debug, Deserialize)]
pub struct LightFixture {
    pub epoch: f64,
    pub longitude: f64,
    pub latitude: f64,
    pub sin_elevation: f64,
    pub radiation_before: Option<f64>,
    pub radiation_after: Option<f64>,
    pub modification: Option<f64>,
    pub low: f64,
    pub mid: f64,
    pub high: f64,
    pub transmission: f64,
    pub light: Option<f64>,
    pub darkness: f64,
}

/// Invoer en uitkomst van `prepareCloudMapField` op een klein synthetisch rooster.
#[derive(Debug, Deserialize)]
pub struct FieldFixture {
    pub epoch: i64,
    pub grid: crate::projection::Grid,
    pub values: Vec<f32>,
    pub valid: Vec<f32>,
    pub quant: Vec<Option<f32>>,
    pub low: BlendFixture,
    pub mid: BlendFixture,
    pub high: BlendFixture,
    pub radiation: BlendFixture,
    pub radiation_next: BlendFixture,
    pub motion: MotionFixture,
    /// Per cel vorm en donkerte.
    pub hints: Vec<f32>,
    /// Per cel stroming in wolkencellen per uur.
    pub flow: Vec<f32>,
}

#[derive(Debug, Deserialize)]
pub struct BlendFixture {
    pub left: RasterFixture,
    pub right: RasterFixture,
    pub mix: f64,
}

#[derive(Debug, Deserialize)]
pub struct RasterFixture {
    pub grid: crate::projection::Grid,
    pub values: Vec<u8>,
}

#[derive(Debug, Deserialize)]
pub struct MotionFixture {
    pub grid: crate::projection::Grid,
    pub width: usize,
    pub height: usize,
    pub vectors: Vec<i8>,
}

pub fn mode_constants() -> &'static ModeConstants {
    static CONSTANTS: OnceLock<ModeConstants> = OnceLock::new();
    CONSTANTS.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/mode-constants.json"))
            .expect("generated mode constants")
    })
}

pub fn color(hex: &str) -> [u8; 3] {
    let value = u32::from_str_radix(hex.trim_start_matches('#'), 16).expect("generated RGB color");
    [(value >> 16) as u8, (value >> 8) as u8, value as u8]
}
