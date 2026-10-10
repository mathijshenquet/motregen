use std::collections::HashMap;
use std::io::{self, BufReader, Read, Write};

fn integer(reader: &mut impl Read) -> io::Result<usize> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_le_bytes(bytes) as usize)
}

fn decimal(reader: &mut impl Read) -> io::Result<f64> {
    let mut bytes = [0; 8];
    reader.read_exact(&mut bytes)?;
    Ok(f64::from_le_bytes(bytes))
}

#[path = "../crates/render-core/src/composition.rs"]
mod composition;
#[path = "../crates/render-core/src/motion.rs"]
mod motion;
#[path = "../crates/render-core/src/sampling.rs"]
mod sampling;
use motion::Motion;
use sampling::Sampling;

impl Sampling {
    fn read(input: &mut impl Read) -> io::Result<Self> {
        Ok(Self {
            kind: integer(input)?,
            taps: integer(input)?,
            cell_width: decimal(input)?,
            sigma: decimal(input)?,
        })
    }
}

struct ProjectedMotion {
    vectors: Vec<i8>,
    width: usize,
    height: usize,
    interval: f64,
    cap: f64,
    fade: f64,
    displacements: Vec<(f64, f64)>,
}

impl ProjectedMotion {
    fn matches(&self, motion: &Motion<'_>) -> bool {
        self.vectors == motion.vectors
            && self.width == motion.width
            && self.height == motion.height
            && self.interval == motion.interval
            && self.cap == motion.cap
            && self.fade == motion.fade
    }

    fn new(
        motion: &Motion<'_>,
        columns: &[f64],
        rows: &[f64],
        grid_width: usize,
        grid_height: usize,
    ) -> Self {
        let displacements = rows
            .iter()
            .flat_map(|&row| {
                columns
                    .iter()
                    .map(move |&column| motion.displacement(column, row, grid_width, grid_height))
            })
            .collect();
        Self {
            vectors: motion.vectors.to_vec(),
            width: motion.width,
            height: motion.height,
            interval: motion.interval,
            cap: motion.cap,
            fade: motion.fade,
            displacements,
        }
    }
}

fn release_file_cache(path: &std::ffi::OsStr) -> io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        use std::os::fd::AsRawFd;
        unsafe extern "C" {
            fn posix_fadvise(fd: i32, offset: i64, length: i64, advice: i32) -> i32;
        }
        let file = std::fs::File::open(path)?;
        // DONTNEED only releases clean pages; PPM bytes remain available for still encoding.
        file.sync_data()?;
        let error = unsafe { posix_fadvise(file.as_raw_fd(), 0, 0, 4) };
        if error != 0 {
            return Err(io::Error::from_raw_os_error(error));
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = path;
    Ok(())
}

fn main() -> io::Result<()> {
    let mut arguments = std::env::args_os().skip(1);
    if arguments.next().as_deref() == Some(std::ffi::OsStr::new("--release-file-cache")) {
        let path = arguments
            .next()
            .ok_or_else(|| io::Error::other("missing file path"))?;
        return release_file_cache(&path);
    }
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let width = integer(&mut input)?;
    let height = integer(&mut input)?;
    let grid_width = integer(&mut input)?;
    let grid_height = integer(&mut input)?;
    let _default_cap = decimal(&mut input)?;
    let _default_fade = decimal(&mut input)?;
    let multiply = integer(&mut input)? != 0;
    if width == 0 || height == 0 || grid_width == 0 || grid_height == 0 {
        return Err(io::Error::other("empty grid"));
    }
    let columns = (0..width)
        .map(|_| decimal(&mut input))
        .collect::<io::Result<Vec<_>>>()?;
    let rows = (0..height)
        .map(|_| decimal(&mut input))
        .collect::<io::Result<Vec<_>>>()?;
    let mut colors = vec![[0_f32; 4]; 65536];
    for color in colors.iter_mut().flatten() {
        let mut bytes = [0; 4];
        input.read_exact(&mut bytes)?;
        *color = f32::from_le_bytes(bytes);
    }
    let mut rgb = vec![0; width * height * 3];
    let mut frames = HashMap::new();
    let mut projected_motion: Option<ProjectedMotion> = None;
    loop {
        let mix = match decimal(&mut input) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
            Err(error) => return Err(error),
        };
        let interval = decimal(&mut input)?;
        let motion_width = integer(&mut input)?;
        let motion_height = integer(&mut input)?;
        let left_id = integer(&mut input)?;
        let right_id = integer(&mut input)?;
        let flags = integer(&mut input)?;
        let cap = decimal(&mut input)?;
        let fade = decimal(&mut input)?;
        let left_sampling = Sampling::read(&mut input)?;
        let right_sampling = Sampling::read(&mut input)?;
        input.read_exact(&mut rgb)?;
        for (id, flag, sampling) in [(left_id, 1, &left_sampling), (right_id, 2, &right_sampling)] {
            if flags & flag == 0 {
                continue;
            }
            let mut raster = vec![0; grid_width * grid_height];
            input.read_exact(&mut raster)?;
            frames.insert(id, sampling.filter(raster, grid_width, grid_height));
        }
        let left = frames
            .get(&left_id)
            .ok_or_else(|| io::Error::other("missing left frame"))?;
        let right = frames
            .get(&right_id)
            .ok_or_else(|| io::Error::other("missing right frame"))?;
        let mut vectors = vec![0; motion_width * motion_height * 2];
        input.read_exact(&mut vectors)?;
        let vectors: Vec<i8> = vectors.into_iter().map(|value| value as i8).collect();
        let motion = if vectors.is_empty() {
            None
        } else {
            Some(Motion {
                vectors: &vectors,
                width: motion_width,
                height: motion_height,
                interval,
                cap,
                fade,
            })
        };
        if let Some(motion) = &motion {
            if !projected_motion
                .as_ref()
                .is_some_and(|cached| cached.matches(motion))
            {
                projected_motion = Some(ProjectedMotion::new(
                    motion,
                    &columns,
                    &rows,
                    grid_width,
                    grid_height,
                ));
            }
        }
        let displacements = motion
            .as_ref()
            .map(|_| projected_motion.as_ref().unwrap().displacements.as_slice());
        let split = height / 2;
        let (upper, lower) = rgb.split_at_mut(split * width * 3);
        let (upper_rows, lower_rows) = rows.split_at(split);
        let upper_displacements = displacements.map(|field| &field[..split * width]);
        let lower_displacements = displacements.map(|field| &field[split * width..]);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                composition::compose(
                    upper,
                    composition::Composition {
                        columns: &columns,
                        rows: upper_rows,
                        grid_width,
                        grid_height,
                        left,
                        right,
                        colors: &colors,
                        mix,
                        displacements: upper_displacements,
                        multiply,
                    },
                )
            });
            composition::compose(
                lower,
                composition::Composition {
                    columns: &columns,
                    rows: lower_rows,
                    grid_width,
                    grid_height,
                    left,
                    right,
                    colors: &colors,
                    mix,
                    displacements: lower_displacements,
                    multiply,
                },
            );
        });
        output.write_all(&rgb)?;
        output.flush()?;
        frames.retain(|id, _| *id == left_id || *id == right_id);
    }
    Ok(())
}
