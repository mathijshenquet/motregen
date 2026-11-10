use crate::{
    data::Dataset,
    encode::{Video, jpeg},
    fields::{Fields, Pair, Slice, pair},
    frame_cache::{Key, ModeCache, Parts, Prediction},
    renderer::{FileMedia, FramePlan, Media, Options, Profile, frame_plans, name_masks, plates},
};
use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use render_core::{
    clock::ClockTransition,
    constants::constants,
    field_raster::{self, FillStyle, LineColor},
    isoline_labels::label_text_size,
    mode_constants::{color, mode_constants},
    name_mask::NameMask,
    overlay::{ClockOptions, clock_appearance, clock_panel_bounds, draw_overlay_title},
    place_numbers::{BandedField, draw_place_numbers},
    projection::Projection,
    rotated_text::{RotatedText, TextStyle},
    text::Text,
    time::{Manifest, dark, epoch, frame_blend},
    wind::{self, Life, Particle, Water, WindField},
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
    still: bool,
    loop_frame: bool,
    night: bool,
    slice: Slice,
    /// (oost, noord) op de kaarttijd, een half en een heel `lag_minutes` eerder (windzakken, U101).
    wind: Option<[(Pair, Pair); 3]>,
    /// De zakken van dit filmframe, met momentum uit de keten (U107).
    socks: Vec<crate::windsocks::SockPose>,
    /// De deeltjes van dit filmframe, met hun levensfase uit de keten (U112).
    particles: Vec<(Particle, Life)>,
}

struct Worker {
    text: Text,
    labels: RotatedText,
    /// Het getal in de windbadge, vet (U107).
    badges: RotatedText,
}

struct Painter<'a> {
    plates: &'a [Vec<u8>; 2],
    /// Namen op de platen: de gevoelsgetallen blijven ervan af (U107).
    names: &'a [NameMask; 2],
    water: &'a [WaterMask; 2],
    projection: &'a Projection,
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
    rgb: Option<Vec<u8>>,
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
        let composition_started = Instant::now();
        let settings = &mode_constants().isoline;
        // De Bft-grenzen hebben de lijnkleur van de temperatuur, zoals `isolineColor` in de app.
        let line_color = color(if input.night {
            &settings.dark_temperature
        } else {
            &settings.light_temperature
        });
        let fill_opacity = if self.wind {
            mode_constants().beaufort.fill_opacity
        } else {
            settings.fill_opacity
        };
        let fill = field_raster::fill_with(
            &mut rgb,
            &input.slice.field,
            self.projection,
            self.colors,
            &input.slice.rings,
            input.slice.opacity,
            FillStyle {
                opacity: fill_opacity,
                by_value: self.wind.then(|| {
                    let beaufort = &mode_constants().beaufort;
                    (beaufort.clear_below as f32, beaufort.full_at as f32)
                }),
            },
        );
        // 's Nachts verdwijnt een verdonkerde lijn in de donkere vlakken; voor wind dan lichter dan de vulling.
        let shade = if self.wind && input.night {
            mode_constants().beaufort.night_line_lighten
        } else {
            settings.temperature_line_fill_shade
        };
        field_raster::lines(
            &mut rgb,
            &input.slice.segments,
            LineColor::Isotherm {
                fallback: line_color,
                fill: &fill,
                shade,
            },
            input.slice.opacity,
        );
        profile.composition_us += composition_started.elapsed().as_micros();
        if input.wind.is_some() {
            let started = Instant::now();
            let water = &self.water[usize::from(input.night)];
            wind::draw(
                &mut rgb,
                &input.particles,
                input.night,
                Water {
                    width: water.width,
                    height: water.height,
                    alpha: &water.alpha,
                },
            );
            crate::windsocks::draw(&mut rgb, &mut worker.badges, &input.socks, input.night);
            profile.strokes_us += started.elapsed().as_micros();
        }
        let halo = if input.night { [16, 32, 39] } else { [255; 3] };
        let labels_started = Instant::now();
        if !self.wind {
            draw_place_numbers(
                &mut worker.text,
                &mut rgb,
                &self.plates[usize::from(input.night)],
                &self.names[usize::from(input.night)],
                BandedField {
                    field: &input.slice.field,
                    projection: self.projection,
                    colors: self.colors,
                    alpha: (fill_opacity * input.slice.opacity) as f32,
                },
                input.night,
                clock_bounds,
            );
        }
        for label in &input.slice.labels {
            worker.labels.draw_excluding(
                &mut rgb,
                &label.text,
                label.screen,
                label.angle,
                TextStyle {
                    size: label_text_size(),
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
            rgb: Some(rgb),
            loop_frame: input.loop_frame,
            still,
            profile,
        })
    }
}

/// Every dataset a Wind or Gevoel frame reads.
struct Sources<'a> {
    fields: Fields<'a>,
    east: Option<Dataset<'a>>,
    north: Option<Dataset<'a>>,
}

/// De kaarttijd en de twee eerdere tijden waar de staart van de windzak naar kijkt (traagheid, U101).
fn windsock_times(time: i64) -> [i64; 3] {
    let lag = (mode_constants().windsock.lag_minutes * 60_000.0) as i64;
    [time, time - lag / 2, time - lag]
}

impl<'a> Sources<'a> {
    fn input(&mut self, plan: FramePlan, simulation_seconds: f64) -> Result<Input> {
        let time = plan.epoch;
        let slice = self.fields.slice(time)?;
        let wind = if let (Some(east), Some(north)) = (&mut self.east, &mut self.north) {
            let [now, halfway, earliest] = windsock_times(time);
            Some([
                (pair(east, now)?, pair(north, now)?),
                (pair(east, halfway)?, pair(north, halfway)?),
                (pair(east, earliest)?, pair(north, earliest)?),
            ])
        } else {
            None
        };
        let grid = self.fields.grid.clone();
        let socks = wind.as_ref().map_or_else(Vec::new, |pairs| {
            crate::windsocks::advance(&mut self.fields.socks, &grid, pairs, simulation_seconds)
        });
        let particles = wind.as_ref().map_or_else(Vec::new, |[(east, north), ..]| {
            let particles = wind::particles(&wind_field(east), &wind_field(north));
            wind::advance(&mut self.fields.particles, &particles, simulation_seconds)
        });
        Ok(Input {
            epoch: time,
            still: plan.still,
            loop_frame: plan.loop_frame,
            night: dark(time),
            slice,
            wind,
            socks,
            particles,
        })
    }

    fn key_pair(
        dataset: &mut Dataset,
        time: i64,
        key: &mut crate::frame_cache::KeyBuilder,
    ) -> Result<()> {
        let blend = frame_blend(&dataset.frames, time);
        let left = dataset.frames[blend.left].clone();
        let right = dataset.frames[blend.right].clone();
        key.real(blend.mix)
            .source(dataset.identity(&left)?)
            .source(dataset.identity(&right)?);
        Ok(())
    }

    fn predict(&mut self, frame: &FrameKey, cache: &ModeCache) -> Result<Option<Prediction>> {
        let time = frame.plan.epoch;
        let mut key = cache.key();
        key.bytes(format!("{:?}", frame.clock).as_bytes())
            .number(time)
            .bytes(
                clock_appearance(
                    time,
                    ClockOptions {
                        transition: frame.clock,
                        still: frame.plan.still,
                    },
                )
                .as_bytes(),
            )
            .flag(time <= frame.now)
            .real(frame.simulation_seconds)
            .reals(frame.colors)
            .bytes(&self.fields.state()?);
        self.fields.key_sources(time, &mut key)?;
        if let (Some(east), Some(north)) = (&mut self.east, &mut self.north) {
            for time in windsock_times(time) {
                Self::key_pair(east, time, &mut key)?;
                Self::key_pair(north, time, &mut key)?;
            }
        }
        Ok(key.finish())
    }

    fn datasets(&mut self) -> impl Iterator<Item = &mut Dataset<'a>> {
        [
            Some(&mut self.fields.data),
            self.fields.north.as_mut(),
            self.east.as_mut(),
            self.north.as_mut(),
        ]
        .into_iter()
        .flatten()
    }

    fn take_touched(&mut self) -> Vec<Option<crate::frame_cache::Identity>> {
        self.datasets()
            .flat_map(|data| data.take_touched())
            .collect()
    }
}

/// Everything besides the source frames that decides the pixels of one frame.
struct FrameKey<'a> {
    plan: FramePlan,
    now: i64,
    simulation_seconds: f64,
    colors: &'a [f32],
    clock: Option<ClockTransition>,
}

enum Work {
    Cached {
        plan: FramePlan,
        key: Key,
        rgb: Option<Vec<u8>>,
    },
    Render {
        input: Box<Input>,
        prediction: Option<Prediction>,
        state: Option<Vec<u8>>,
    },
}

/// Decides hit or render for one frame and keeps the label chain going either way.
fn plan_work(
    sources: &mut Sources,
    frame: FrameKey,
    cache: Option<&ModeCache>,
    chain: &mut Vec<(i64, Key)>,
) -> Result<Work> {
    let Some(cache) = cache else {
        return Ok(Work::Render {
            input: Box::new(sources.input(frame.plan, frame.simulation_seconds)?),
            prediction: None,
            state: None,
        });
    };
    let prediction = sources.predict(&frame, cache)?;
    if let Some(prediction) = &prediction {
        let parts = Parts {
            rgb: frame.plan.loop_frame,
            still: frame.plan.still,
            state: true,
        };
        if let Some(hit) = cache.lookup(prediction.key, parts)? {
            sources
                .fields
                .restore(hit.state.as_deref().unwrap_or_default())?;
            if frame.plan.loop_frame && !prediction.volatile {
                chain.push((frame.plan.epoch, prediction.key));
            }
            return Ok(Work::Cached {
                plan: frame.plan,
                key: prediction.key,
                rgb: hit.rgb,
            });
        }
    }
    sources.take_touched();
    let input = sources.input(frame.plan, frame.simulation_seconds)?;
    let touched = sources.take_touched();
    let prediction = prediction.filter(|prediction| cache.verify(prediction, &touched));
    if let Some(prediction) = &prediction
        && frame.plan.loop_frame
        && !prediction.volatile
    {
        chain.push((frame.plan.epoch, prediction.key));
    }
    Ok(Work::Render {
        input: Box::new(input),
        prediction,
        state: Some(sources.fields.state()?),
    })
}

impl Work {
    fn run(
        self,
        painter: &Painter,
        cache: Option<&ModeCache>,
        mode: &str,
        directory: &Path,
    ) -> Result<Output> {
        match self {
            Work::Cached { plan, key, rgb } => {
                let cache = cache.context("Cached frame without cache")?;
                let still = if plan.still {
                    let file = format!("{mode}-{}.jpg", plan.epoch);
                    let bytes = cache.copy_still(key, &directory.join(&file))?;
                    Some(FileMedia {
                        file,
                        kind: "photo",
                        epoch: plan.epoch,
                        bytes,
                        width: constants().size.width,
                        height: constants().size.height,
                    })
                } else {
                    None
                };
                Ok(Output {
                    rgb: rgb
                        .map(|compressed| cache.restore(key, &compressed))
                        .transpose()?,
                    loop_frame: plan.loop_frame,
                    still,
                    profile: Profile::default(),
                })
            }
            Work::Render {
                input,
                prediction,
                state,
            } => {
                let mut output = painter.frame(&input, directory)?;
                if !input.loop_frame {
                    output.rgb = None;
                }
                if let Some(cache) = cache {
                    cache.rendered(prediction.as_ref());
                    if let Some(prediction) = &prediction {
                        let still = output.still.as_ref().map(|file| directory.join(&file.file));
                        cache.store(
                            prediction,
                            output.rgb.as_deref(),
                            still.as_deref(),
                            state.as_deref(),
                        )?;
                    }
                }
                Ok(output)
            }
        }
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
    options: Options,
) -> Result<Media> {
    let started = Instant::now();
    let clock = options.clock;
    let mode = if wind { "wind" } else { "feels" };
    let cache = options.cache.map(|cache| cache.mode(mode));
    let now = epoch(&manifest.now)?;
    let loop_plan = if wind {
        &mode_constants().loops.wind
    } else {
        &mode_constants().loops.feels
    };
    let fields = Fields::new(data_directory, manifest, wind)?;
    let names = name_masks(basemap_directory)?;
    let east = wind
        .then(|| Dataset::new(data_directory, manifest, "wind_u_ms"))
        .transpose()?;
    let north = wind
        .then(|| Dataset::new(data_directory, manifest, "wind_v_ms"))
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
    let mut sources = Sources {
        fields,
        east,
        north,
    };
    let colors = sources.fields.palette();
    if cache.is_some() {
        for data in sources.datasets() {
            data.touched = Some(Vec::new());
        }
    }
    let workers = [0, 1].map(|_| -> Result<Mutex<Worker>> {
        Ok(Mutex::new(Worker {
            text: Text::new().map_err(anyhow::Error::msg)?,
            labels: RotatedText::new().map_err(anyhow::Error::msg)?,
            badges: RotatedText::bold().map_err(anyhow::Error::msg)?,
        }))
    });
    let [first, second] = workers;
    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
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
    let projection = Projection::new(&sources.fields.grid);
    let frame_step = loop_plan.loop_offsets[1] - loop_plan.loop_offsets[0];
    let mut chain = Vec::new();
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
                        video.frame(frame.rgb.as_deref().context("Loop frame without pixels")?)?;
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
            // Stills buiten de film staan op een 10-minutenrooster rond "nu" en verspringen per generatie; met een
            // eigen, verse labeltoestand blijft de keten van de film gelijk tussen generaties (MIP-37).
            let fresh_state = sources.fields.state()?;
            if let (Some(cache), Some(first)) = (&cache, plans.iter().find(|plan| plan.loop_frame))
                && let Some(state) = cache.chain_state(first.epoch - frame_step)?
            {
                sources.fields.restore(&state)?;
            }
            for batch in plans.chunks(batch_size) {
                let preparation_started = Instant::now();
                let mut works = Vec::new();
                for &plan in batch {
                    // Film seconds since 1970: every generation shows the same particles at the same epoch.
                    let simulation_seconds = plan.epoch as f64 / frame_step as f64 / loop_plan.fps;
                    let frame = FrameKey {
                        plan,
                        now,
                        simulation_seconds,
                        colors: &colors,
                        clock,
                    };
                    let film_state = if plan.loop_frame {
                        None
                    } else {
                        let state = sources.fields.state()?;
                        sources.fields.restore(&fresh_state)?;
                        Some(state)
                    };
                    works.push(
                        plan_work(&mut sources, frame, cache.as_ref(), &mut chain)
                            .with_context(|| format!("Preparing map time {}", plan.epoch))?,
                    );
                    if let Some(state) = film_state {
                        sources.fields.restore(&state)?;
                    }
                }
                preparation_us += preparation_started.elapsed().as_micros();
                input_sender.send(works).context("Field painters stopped")?;
            }
            Ok(preparation_us)
        });
        let production = (|| -> Result<()> {
            for works in &input_receiver {
                let painter = Painter {
                    plates: &plates,
                    names: &names,
                    water: &water,
                    projection: &projection,
                    colors: &colors,
                    workers: &painter_workers,
                    now,
                    wind,
                    clock,
                };
                let outputs = works
                    .into_par_iter()
                    .map(|work| work.run(&painter, cache.as_ref(), mode, temporary.path()))
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
    total.fields_us = sources.fields.fields_us;
    total.contours_us = sources.fields.contours_us;
    total.labels_us += sources.fields.labels_us;
    total.decode_us = sources.fields.data.decode_us;
    total.source_frames = sources.fields.data.loaded;
    for data in [
        sources.east.as_ref(),
        sources.north.as_ref(),
        sources.fields.north.as_ref(),
    ]
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
        cache: cache.map(|cache| cache.finish(&chain)).transpose()?,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}
