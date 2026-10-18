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
}

#[derive(Debug, Deserialize)]
pub struct LoopPlans {
    pub wind: LoopPlan,
    pub feels: LoopPlan,
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
