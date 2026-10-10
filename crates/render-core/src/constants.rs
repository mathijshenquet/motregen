use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
pub struct Size {
    pub width: usize,
    pub height: usize,
}

#[derive(Debug, Deserialize)]
pub struct View {
    pub lng: f64,
    pub lat: f64,
    pub zoom: f64,
}

#[derive(Debug, Deserialize)]
pub struct Place {
    #[serde(alias = "label")]
    pub name: String,
    pub lng: f64,
    pub lat: f64,
}

#[derive(Debug, Deserialize)]
pub struct Constants {
    pub frame: Size,
    pub size: Size,
    pub view: View,
    pub location: Place,
    pub palette: Vec<u8>,
    pub flow_curve: f64,
    pub sampling: SamplingConstants,
    pub warp: Vec<WarpLimit>,
    pub places: Vec<Place>,
    pub sources: Vec<String>,
    pub loop_offsets: Vec<i64>,
    pub fps: usize,
    pub still_minutes: Vec<i64>,
    pub presentation: serde_json::Value,
    pub temperature_style: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct SamplingConstants {
    pub kernel_radius: f64,
    pub samples: Vec<Blur>,
    pub radar_cell_width: f64,
    pub harmonie_cell_width: f64,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Blur {
    pub sigma: f64,
    pub taps: usize,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpLimit {
    pub cap_cells: f64,
    pub fade_end_cells: f64,
}

pub fn constants() -> &'static Constants {
    static CONSTANTS: OnceLock<Constants> = OnceLock::new();
    CONSTANTS.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/constants.json"))
            .expect("generated render constants")
    })
}

pub fn blur(lead_ms: i64) -> Blur {
    let samples = &constants().sampling.samples;
    let minute = (lead_ms as f64 / 60_000.0).clamp(0.0, (samples.len() - 1) as f64);
    let lower = minute.floor() as usize;
    let upper = (lower + 1).min(samples.len() - 1);
    let sigma = samples[lower].sigma
        + (samples[upper].sigma - samples[lower].sigma) * (minute - lower as f64);
    Blur {
        sigma,
        taps: (constants().sampling.kernel_radius * sigma).ceil() as usize * 2 + 1,
    }
}

pub fn warp_limit(interval_minutes: f64) -> WarpLimit {
    let index = interval_minutes.clamp(0.0, (constants().warp.len() - 1) as f64) as usize;
    constants().warp[index]
}
