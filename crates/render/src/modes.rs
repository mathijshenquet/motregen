use crate::{
    data::Dataset,
    encode::{Video, jpeg},
    fields::{Fields, Pair, Slice, pair, screen},
    renderer::{FileMedia, Media, Profile, frame_plans, plates},
};
use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use render_core::{
    clock::ClockTransition,
    constants::constants,
    field_raster,
    mode_constants::{color, mode_constants},
    overlay::{ClockOptions, clock_panel_bounds, draw_overlay_title},
    projection::Projection,
    rotated_text::{RotatedText, TextStyle},
    temperature::{TemperaturePair, draw_temperature},
    text::Text,
    time::{Manifest, dark, epoch},
    wind::{self, Water, WindField},
};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Instant,
};

struct WaterMask {
    width: usize,
    height: usize,
    alpha: Vec<u8>,
}

struct Input {
    epoch: i64,
    index: usize,
    still: bool,
    loop_frame: bool,
    night: bool,
    slice: Slice,
    wind: Option<(Pair, Pair)>,
    temperatures: Option<Pair>,
}

struct Worker {
    text: Text,
    labels: RotatedText,
}

struct Painter<'a> {
    plates: &'a [Vec<u8>; 2],
    water: &'a [WaterMask; 2],
    projection: &'a Projection,
    grid: &'a render_core::projection::Grid,
    colors: &'a [f32],
    workers: &'a [Mutex<Worker>; 2],
    now: i64,
    wind: bool,
    clock: Option<ClockTransition>,
}

fn wind_field(pair: &Pair) -> WindField<'_> {
    WindField {
        grid: &pair.left.grid,
        left: &pair.left.values,
        right: &pair.right.values,
        left_quant: &pair.left.quant,
        right_quant: &pair.right.quant,
        mix: pair.mix,
    }
}

struct Output {
    rgb: Vec<u8>,
    loop_frame: bool,
    still: Option<FileMedia>,
    profile: Profile,
}

impl Painter<'_> {
    fn frame(&self, input: &Input, directory: &Path) -> Result<Output> {
        let mut worker = self.workers[rayon::current_thread_index().unwrap_or(0)]
            .lock()
            .map_err(|_| anyhow::anyhow!("Field text worker panicked"))?;
        let mut rgb = self.plates[usize::from(input.night)].clone();
        let title = if self.wind {
            "Wind"
        } else {
            "Gevoels-\ntemperatuur"
        };
        let clock_bounds = clock_panel_bounds(&mut worker.text, title);
        let mut profile = Profile {
            output_frames: 1,
            ..Profile::default()
        };
        if let Some(pair) = &input.temperatures {
            let started = Instant::now();
            draw_temperature(
                &mut worker.text,
                &mut rgb,
                self.projection,
                TemperaturePair {
                    left_grid: &pair.left.grid,
                    right_grid: &pair.right.grid,
                    left: &pair.left.values,
                    right: &pair.right.values,
                    left_quant: &pair.left.quant,
                    right_quant: &pair.right.quant,
                    mix: pair.mix,
                },
                input.night,
            );
            profile.overlay_us += started.elapsed().as_micros();
        }
        let composition_started = Instant::now();
        let settings = &mode_constants().isoline;
        let line_color = color(match (self.wind, input.night) {
            (true, true) => &settings.dark_pressure,
            (true, false) => &settings.light_pressure,
            (false, true) => &settings.dark_temperature,
            (false, false) => &settings.light_temperature,
        });
        if !self.wind {
            field_raster::fill(
                &mut rgb,
                &input.slice.field,
                self.projection,
                self.colors,
                &input.slice.rings,
                input.slice.opacity,
            );
        }
        field_raster::lines(
            &mut rgb,
            &input.slice.segments,
            line_color,
            self.wind,
            input.slice.opacity,
        );
        profile.composition_us += composition_started.elapsed().as_micros();
        if let Some((east, north)) = &input.wind {
            let started = Instant::now();
            let water = &self.water[usize::from(input.night)];
            wind::draw(
                &mut rgb,
                wind_field(east),
                wind_field(north),
                1.0 + input.index as f64 / mode_constants().loops.wind.fps,
                input.night,
                Water {
                    width: water.width,
                    height: water.height,
                    alpha: &water.alpha,
                },
            );
            profile.strokes_us += started.elapsed().as_micros();
        }
        let labels_started = Instant::now();
        let halo = if input.night { [16, 32, 39] } else { [255; 3] };
        let transform = screen(self.grid);
        for mark in &input.slice.marks {
            let point = transform.point([mark.column, mark.row]);
            let mark_color = match (mark.kind, input.night) {
                ('H', false) => [212, 53, 44],
                ('L', false) => [36, 98, 199],
                ('H', true) => [255, 107, 94],
                _ => [110, 163, 255],
            };
            worker.labels.draw_excluding(
                &mut rgb,
                &mark.kind.to_string(),
                point,
                0.0,
                TextStyle {
                    size: 45,
                    color: mark_color,
                    halo,
                    opacity: mark.opacity * input.slice.opacity,
                },
                Some(clock_bounds),
            );
        }
        profile.labels_us += labels_started.elapsed().as_micros();
        let labels_started = Instant::now();
        for label in &input.slice.labels {
            worker.labels.draw_excluding(
                &mut rgb,
                &label.text,
                label.screen,
                label.angle,
                TextStyle {
                    size: 17,
                    color: line_color,
                    halo,
                    opacity: label.opacity,
                },
                Some(clock_bounds),
            );
        }
        profile.labels_us += labels_started.elapsed().as_micros();
        let overlay_started = Instant::now();
        draw_overlay_title(
            &mut worker.text,
            &mut rgb,
            (input.epoch, self.now),
            input.night,
            ClockOptions {
                transition: self.clock,
                still: input.still,
            },
            title,
        );
        profile.overlay_us += overlay_started.elapsed().as_micros();
        let jpeg_started = Instant::now();
        let still = if input.still {
            let name = format!("feels-{}.jpg", input.epoch);
            let bytes = jpeg(&rgb, &directory.join(&name))?;
            Some(FileMedia {
                file: name,
                kind: "photo",
                epoch: input.epoch,
                bytes,
                width: constants().size.width,
                height: constants().size.height,
            })
        } else {
            None
        };
        if input.still {
            profile.jpeg_us += jpeg_started.elapsed().as_micros();
        }
        Ok(Output {
            rgb,
            loop_frame: input.loop_frame,
            still,
            profile,
        })
    }
}

fn add_profile(total: &mut Profile, frame: &Profile) {
    total.output_frames += frame.output_frames;
    total.composition_us += frame.composition_us;
    total.labels_us += frame.labels_us;
    total.strokes_us += frame.strokes_us;
    total.mixing_us += frame.mixing_us;
    total.overlay_us += frame.overlay_us;
    total.jpeg_us += frame.jpeg_us;
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
    wind: bool,
    clock: Option<ClockTransition>,
) -> Result<Media> {
    let started = Instant::now();
    let now = epoch(&manifest.now)?;
    let loop_plan = if wind {
        &mode_constants().loops.wind
    } else {
        &mode_constants().loops.feels
    };
    let mut fields = Fields::new(data_directory, manifest, wind)?;
    let mut east = wind
        .then(|| Dataset::new(data_directory, manifest, "wind_u_ms"))
        .transpose()?;
    let mut north = wind
        .then(|| Dataset::new(data_directory, manifest, "wind_v_ms"))
        .transpose()?;
    let mut temperatures = wind
        .then(|| Dataset::new(data_directory, manifest, "feels_like_c"))
        .transpose()?;
    if let (Some(east), Some(north)) = (&east, &north) {
        ensure!(
            east.frames
                .iter()
                .map(|frame| frame.epoch)
                .eq(north.frames.iter().map(|frame| frame.epoch)),
            "Wind components have different timelines"
        );
    }
    let rain_grid = Dataset::new(data_directory, manifest, "rain_rate")?.grid()?;
    let mut plates = plates(basemap_directory, &rain_grid)?;
    if !wind {
        for plate in Arc::make_mut(&mut plates) {
            for pixel in plate.chunks_exact_mut(3) {
                let gray = f64::from(pixel[0]) * 0.213
                    + f64::from(pixel[1]) * 0.715
                    + f64::from(pixel[2]) * 0.072;
                for channel in pixel {
                    *channel = (gray + (f64::from(*channel) - gray) * mode_constants().saturation)
                        .round() as u8;
                }
            }
        }
    }
    let water = ["light", "dark"].map(|theme| -> Result<WaterMask> {
        let mask = image::open(basemap_directory.join(format!("water-{theme}.png")))?.into_rgba8();
        Ok(WaterMask {
            width: mask.width() as usize,
            height: mask.height() as usize,
            alpha: mask.pixels().map(|pixel| pixel.0[3]).collect(),
        })
    });
    let [light, night] = water;
    let water = [light?, night?];
    let colors = if wind {
        Vec::new()
    } else {
        fields.palette(now)?
    };
    let workers = [0, 1].map(|_| -> Result<Mutex<Worker>> {
        Ok(Mutex::new(Worker {
            text: Text::new().map_err(anyhow::Error::msg)?,
            labels: RotatedText::new().map_err(anyhow::Error::msg)?,
        }))
    });
    let [first, second] = workers;
    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
    let mode = if wind { "wind" } else { "feels" };
    let loop_epochs: Vec<_> = loop_plan
        .loop_offsets
        .iter()
        .map(|offset| now + offset)
        .collect();
    let still_epochs: Vec<_> = if wind {
        Vec::new()
    } else {
        constants()
            .still_minutes
            .iter()
            .map(|minute| now + minute * 60_000)
            .collect()
    };
    let plans = frame_plans(&loop_epochs, &still_epochs);
    let painter_workers = [first?, second?];
    let projection = Projection::new(&fields.grid);
    let field_grid = fields.grid.clone();
    let mut total = Profile::default();
    let mut preparation_us = 0;
    let batch_size = if crate::shared::inputs().is_some() {
        1
    } else {
        4
    };
    let (mut files, bytes, loop_ms) = thread::scope(|scope| -> Result<_> {
        let (sender, receiver) = mpsc::sync_channel::<Vec<Output>>(1);
        let writer = scope.spawn(|| -> Result<_> {
            let mut video = Video::start_plan(
                &temporary.path().join(format!("{mode}-loop.mp4")),
                loop_epochs.len(),
                loop_plan.hold_frames,
                (
                    loop_plan.fps_fraction.numerator,
                    loop_plan.fps_fraction.denominator,
                ),
            )?;
            let mut files = Vec::new();
            let mut profile = Profile::default();
            for batch in receiver {
                for frame in batch {
                    add_profile(&mut profile, &frame.profile);
                    if let Some(file) = frame.still {
                        files.push(file);
                    }
                    if frame.loop_frame {
                        let started = Instant::now();
                        video.frame(&frame.rgb)?;
                        profile.ffmpeg_wait_us += started.elapsed().as_micros();
                    }
                }
            }
            let started = Instant::now();
            let (bytes, loop_ms) = video.finish()?;
            profile.ffmpeg_wait_us += started.elapsed().as_micros();
            Ok((files, bytes, loop_ms, profile))
        });
        let (input_sender, input_receiver) = mpsc::sync_channel(1);
        let producer = scope.spawn(|| -> Result<u128> {
            let input_sender = input_sender;
            let mut preparation_us = 0;
            for (batch_index, batch) in plans.chunks(batch_size).enumerate() {
                let preparation_started = Instant::now();
                let inputs = batch
                    .iter()
                    .enumerate()
                    .map(|(offset, plan)| -> Result<Input> {
                        let time = plan.epoch;
                        let slice = fields.slice(time)?;
                        let wind_pair = if let (Some(east), Some(north)) = (&mut east, &mut north) {
                            Some((pair(east, time)?, pair(north, time)?))
                        } else {
                            None
                        };
                        let temperature = if let Some(temperatures) = &mut temperatures {
                            let time = ((time + 300_000).div_euclid(600_000) * 600_000).clamp(
                                temperatures.frames[0].epoch,
                                temperatures.frames.last().unwrap().epoch,
                            );
                            Some(pair(temperatures, time)?)
                        } else {
                            None
                        };
                        Ok(Input {
                            epoch: time,
                            index: batch_index * batch_size + offset,
                            still: plan.still,
                            loop_frame: plan.loop_frame,
                            night: dark(time),
                            slice,
                            wind: wind_pair,
                            temperatures: temperature,
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                preparation_us += preparation_started.elapsed().as_micros();
                input_sender
                    .send(inputs)
                    .context("Field painters stopped")?;
            }
            Ok(preparation_us)
        });
        let production = (|| -> Result<()> {
            for inputs in &input_receiver {
                let painter = Painter {
                    plates: &plates,
                    water: &water,
                    projection: &projection,
                    grid: &field_grid,
                    colors: &colors,
                    workers: &painter_workers,
                    now,
                    wind,
                    clock,
                };
                let outputs = inputs
                    .par_iter()
                    .map(|input| painter.frame(input, temporary.path()))
                    .collect::<Result<Vec<_>>>()?;
                sender.send(outputs).context("Field video writer stopped")?;
            }
            Ok(())
        })();
        drop(input_receiver);
        let prepared = producer
            .join()
            .map_err(|_| anyhow::anyhow!("Field preparation panicked"))?;
        drop(sender);
        let written = writer
            .join()
            .map_err(|_| anyhow::anyhow!("Field video writer panicked"))?;
        production?;
        preparation_us = prepared?;
        let (files, bytes, loop_ms, profile) = written?;
        total = profile;
        Ok((files, bytes, loop_ms))
    })?;
    files.insert(
        0,
        FileMedia {
            file: format!("{mode}-loop.mp4"),
            kind: "animation",
            epoch: now,
            bytes,
            width: constants().size.width,
            height: constants().size.height,
        },
    );
    ensure!(
        files.len() == still_epochs.len() + 1,
        "Incomplete field media matrix"
    );
    for file in &files {
        fs::rename(
            temporary.path().join(&file.file),
            out_directory.join(&file.file),
        )?;
    }
    total.fields_us = fields.fields_us;
    total.contours_us = fields.contours_us;
    total.labels_us += fields.labels_us;
    total.decode_us = fields.data.decode_us;
    total.source_frames = fields.data.loaded;
    for data in [east.as_ref(), north.as_ref(), temperatures.as_ref()]
        .into_iter()
        .flatten()
    {
        total.decode_us += data.decode_us;
        total.source_frames += data.loaded;
        total.sampling_us += data.sampling_us;
    }
    let media = Media {
        version: 1,
        mode,
        generated: manifest.generated.clone(),
        now: manifest.now.clone(),
        width: constants().size.width,
        height: constants().size.height,
        fps: loop_plan.fps,
        frames: loop_epochs.len(),
        hold_frames: loop_plan.hold_frames,
        clock_variant: clock,
        loop_epochs,
        render_ms: (preparation_us
            + total.composition_us
            + total.strokes_us
            + total.mixing_us
            + total.overlay_us
            + total.labels_us)
            / 1000,
        encode_ms: total.jpeg_us / 1000,
        loop_ms,
        total_ms: started.elapsed().as_millis(),
        profile: total,
        files,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}
