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

fn sample(raster: &[u8], width: usize, height: usize, column: f64, row: f64) -> f64 {
    if column < 0.0 || row < 0.0 || column > (width - 1) as f64 || row > (height - 1) as f64 {
        return 0.0;
    }
    let west = column as usize;
    let north = row as usize;
    let east = (west + 1).min(width - 1);
    let south = (north + 1).min(height - 1);
    let values = [raster[north * width + west], raster[north * width + east], raster[south * width + west], raster[south * width + east]];
    if values.contains(&255) { return 0.0; }
    let horizontal = column - west as f64;
    let vertical = row - north as f64;
    let northern = values[0] as f64 + (values[1] as f64 - values[0] as f64) * horizontal;
    let southern = values[2] as f64 + (values[3] as f64 - values[2] as f64) * horizontal;
    northern + (southern - northern) * vertical
}

struct Motion<'a> { vectors: &'a [u8], width: usize, height: usize, interval: f64, cap: f64, fade: f64 }

impl Motion<'_> {
    fn displacement(&self, column: f64, row: f64, grid_width: usize, grid_height: usize) -> (f64, f64) {
        let motion_x = ((column + 0.5) / grid_width as f64 * self.width as f64 - 0.5).clamp(0.0, (self.width - 1) as f64);
        let motion_y = ((row + 0.5) / grid_height as f64 * self.height as f64 - 0.5).clamp(0.0, (self.height - 1) as f64);
        let west = motion_x as usize;
        let north = motion_y as usize;
        let east = (west + 1).min(self.width - 1);
        let south = (north + 1).min(self.height - 1);
        let horizontal = motion_x - west as f64;
        let vertical = motion_y - north as f64;
        let indexes = [north * self.width + west, north * self.width + east, south * self.width + west, south * self.width + east];
        let weights = [(1.0 - horizontal) * (1.0 - vertical), horizontal * (1.0 - vertical), (1.0 - horizontal) * vertical, horizontal * vertical];
        let mut velocity_x = 0.0;
        let mut velocity_y = 0.0;
        let mut validity = 0.0;
        for corner in 0..4 {
            let eastward = self.vectors[indexes[corner] * 2] as i8;
            let southward = self.vectors[indexes[corner] * 2 + 1] as i8;
            if eastward == -128 || southward == -128 { continue; }
            velocity_x += eastward as f64 * weights[corner];
            velocity_y += southward as f64 * weights[corner];
            validity += weights[corner];
        }
        let displacement_x = velocity_x * 0.1 * self.interval;
        let displacement_y = velocity_y * 0.1 * self.interval;
        let distance = displacement_x.hypot(displacement_y);
        let strength = if validity < 0.999 || distance >= self.fade { 0.0 } else if distance <= self.cap { 1.0 } else { { let position = (distance - self.cap) / (self.fade - self.cap); self.cap / distance * (1.0 - position * position * (3.0 - 2.0 * position)) } };
        (displacement_x * strength, displacement_y * strength)
    }
}

fn main() -> io::Result<()> {
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let width = integer(&mut input)?;
    let height = integer(&mut input)?;
    let grid_width = integer(&mut input)?;
    let grid_height = integer(&mut input)?;
    let cap = decimal(&mut input)?;
    let fade = decimal(&mut input)?;
    if width == 0 || height == 0 || grid_width == 0 || grid_height == 0 { return Err(io::Error::other("empty grid")); }
    let columns = (0..width).map(|_| decimal(&mut input)).collect::<io::Result<Vec<_>>>()?;
    let rows = (0..height).map(|_| decimal(&mut input)).collect::<io::Result<Vec<_>>>()?;
    let mut colors = vec![0_f32; 65536 * 4];
    for color in &mut colors {
        let mut bytes = [0; 4];
        input.read_exact(&mut bytes)?;
        *color = f32::from_le_bytes(bytes);
    }
    let mut rgb = vec![0; width * height * 3];
    let mut frames = HashMap::new();
    loop {
        let mix = match decimal(&mut input) { Ok(value) => value, Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break, Err(error) => return Err(error) };
        let interval = decimal(&mut input)?;
        let motion_width = integer(&mut input)?;
        let motion_height = integer(&mut input)?;
        let left_id = integer(&mut input)?;
        let right_id = integer(&mut input)?;
        let flags = integer(&mut input)?;
        input.read_exact(&mut rgb)?;
        for (id, flag) in [(left_id, 1), (right_id, 2)] {
            if flags & flag == 0 { continue; }
            let mut raster = vec![0; grid_width * grid_height];
            input.read_exact(&mut raster)?;
            frames.insert(id, raster);
        }
        let left = frames.get(&left_id).ok_or_else(|| io::Error::other("missing left frame"))?;
        let right = frames.get(&right_id).ok_or_else(|| io::Error::other("missing right frame"))?;
        let mut vectors = vec![0; motion_width * motion_height * 2];
        input.read_exact(&mut vectors)?;
        let motion = if vectors.is_empty() { None } else { Some(Motion { vectors: &vectors, width: motion_width, height: motion_height, interval, cap, fade }) };
        for (row, &cell_y) in rows.iter().enumerate() {
            if cell_y < 0.0 || cell_y > (grid_height - 1) as f64 { continue; }
            for (column, &cell_x) in columns.iter().enumerate() {
                if cell_x < 0.0 || cell_x > (grid_width - 1) as f64 { continue; }
                let value = if mix == 0.0 { sample(&left, grid_width, grid_height, cell_x, cell_y) }
                    else if mix == 1.0 { sample(right, grid_width, grid_height, cell_x, cell_y) }
                    else {
                        let (eastward, southward) = motion.as_ref().map_or((0.0, 0.0), |field| field.displacement(cell_x, cell_y, grid_width, grid_height));
                        sample(&left, grid_width, grid_height, cell_x - eastward * mix, cell_y - southward * mix) * (1.0 - mix)
                            + sample(right, grid_width, grid_height, cell_x + eastward * (1.0 - mix), cell_y + southward * (1.0 - mix)) * mix
                    };
                if value <= 0.0 { continue; }
                let color = ((value * 256.0).round() as usize).min(65535) * 4;
                let coverage = colors[color + 3] as f64;
                let offset = (row * width + column) * 3;
                for channel in 0..3 { rgb[offset + channel] = (colors[color + channel] as f64 + rgb[offset + channel] as f64 * coverage).round().min(255.0) as u8; }
            }
        }
        output.write_all(&rgb)?;
        output.flush()?;
        frames.retain(|id, _| *id == left_id || *id == right_id);
    }
    Ok(())
}
