use std::collections::BTreeMap;

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use super::{
    CROP, EcmwfRun, Field, GRID, Parameter, SOURCE, forecast_steps, grouped_messages, iso,
    precipitation_intervals,
};
use crate::{
    cams::BilinearMap,
    pipeline::{generated_chunk_filename, wind_quantization_table},
    publisher::{ProducedChunk, produced_chunk},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Step {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum StepField {
    Tmax,
    Tmin,
    Precip,
    Gust,
    Temp,
    WindU,
    WindV,
    Cloud,
}

impl StepField {
    pub const ALL: [Self; 8] = [
        Self::Tmax,
        Self::Tmin,
        Self::Precip,
        Self::Gust,
        Self::Temp,
        Self::WindU,
        Self::WindV,
        Self::Cloud,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Tmax => "step_tmax_c",
            Self::Tmin => "step_tmin_c",
            Self::Precip => "step_precip_mm",
            Self::Gust => "step_gust_ms",
            Self::Temp => "step_temp_c",
            Self::WindU => "step_wind_u_ms",
            Self::WindV => "step_wind_v_ms",
            Self::Cloud => "step_cloud",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|field| field.name() == name)
    }

    fn parameter(self) -> Parameter {
        match self {
            Self::Tmax => Parameter::Tmax,
            Self::Tmin => Parameter::Tmin,
            Self::Precip => Parameter::Precip,
            Self::Gust => Parameter::Gust,
            Self::Temp => Parameter::Temp,
            Self::WindU => Parameter::U,
            Self::WindV => Parameter::V,
            Self::Cloud => Parameter::Cloud,
        }
    }

    pub fn quantization_table(self) -> Vec<Option<f32>> {
        match self {
            Self::Tmax | Self::Tmin | Self::Temp => Field::Tmax.quantization_table(),
            Self::Gust => Field::Gust.quantization_table(),
            Self::Cloud => Field::Cloud.quantization_table(),
            Self::WindU | Self::WindV => wind_quantization_table(),
            Self::Precip => (0..255)
                .map(|index| {
                    Some(if index <= 40 {
                        index as f32 * 0.05
                    } else if index <= 200 {
                        2.0 + (index - 40) as f32 * 0.2
                    } else {
                        34.0 + (index - 200) as f32 * 2.0
                    })
                })
                .chain(std::iter::once(None))
                .collect(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct StepRun {
    pub run: DateTime<Utc>,
    pub steps: Vec<Step>,
    pub fields: BTreeMap<StepField, Vec<Vec<f32>>>,
}

pub fn for_run(run: DateTime<Utc>) -> Vec<Step> {
    let mut start = run;
    forecast_steps()
        .into_iter()
        .map(|lead| {
            let end = run + Duration::hours(i64::from(lead));
            let step = Step { start, end };
            start = end;
            step
        })
        .collect()
}

pub fn prepare(run: &EcmwfRun) -> Result<StepRun> {
    let grouped = grouped_messages(run)?;
    let precipitation = precipitation_intervals(&grouped[&Parameter::Precip])?;
    let fields = StepField::ALL
        .into_iter()
        .map(|field| {
            let frames = if field == StepField::Precip {
                precipitation
                    .iter()
                    .map(|message| message.values.clone())
                    .collect()
            } else {
                grouped[&field.parameter()]
                    .iter()
                    .map(|message| message.values.clone())
                    .collect()
            };
            (field, frames)
        })
        .collect();
    Ok(StepRun {
        run: run.run,
        steps: for_run(run.run),
        fields,
    })
}

pub fn build_chunks(run: &StepRun) -> Result<Vec<ProducedChunk>> {
    ensure!(
        run.steps == for_run(run.run),
        "unexpected ECMWF step bounds"
    );
    let map = BilinearMap::new(&CROP, GRID)?;
    let times = run
        .steps
        .iter()
        .map(|step| iso(step.end))
        .collect::<Vec<_>>();
    StepField::ALL
        .into_iter()
        .map(|field| {
            let source_frames = run
                .fields
                .get(&field)
                .with_context(|| format!("missing {}", field.name()))?;
            ensure!(
                source_frames.len() == times.len(),
                "{} frame count disagrees with steps",
                field.name()
            );
            let quant = field.quantization_table();
            let frames = source_frames
                .iter()
                .map(|frame| {
                    map.apply(frame)?
                        .into_iter()
                        .map(|value| mrf::quantize_with_table(value, &quant).map_err(Into::into))
                        .collect::<Result<Vec<_>>>()
                })
                .collect::<Result<Vec<_>>>()?;
            let meta =
                mrf::ChunkMeta::standard(GRID.mrf_grid(), SOURCE, iso(run.run), times.clone())
                    .with_field(field.name(), quant)
                    .with_pred();
            let stem = format!("ecmwf-{}-{}", field.name(), run.run.format("%Y%m%dT%H"));
            produced_chunk(
                generated_chunk_filename(&stem, &meta),
                mrf::encode(&frames, &meta)?,
            )
        })
        .collect()
}
