use crate::constants::constants;
use fontdue::Font;
use std::{collections::HashMap, sync::Arc};

struct Stamp {
    width: usize,
    height: usize,
    alpha: Vec<u8>,
    halo: Vec<u8>,
}

pub struct RotatedText {
    font: Arc<Font>,
    stamps: HashMap<(String, u32), Stamp>,
}

pub struct TextStyle {
    pub size: u32,
    pub color: [u8; 3],
    pub halo: [u8; 3],
    pub opacity: f64,
}

impl RotatedText {
    /// Kaartlabels in Noto Sans Regular, de letter van de plaatsnamen (U107).
    pub fn new() -> Result<Self, &'static str> {
        Ok(Self {
            font: crate::font::map_regular()?,
            stamps: HashMap::new(),
        })
    }

    /// Het getal in de windbadge: Noto Sans ExtraBold (gewicht 800, zoals de app).
    pub fn bold() -> Result<Self, &'static str> {
        Ok(Self {
            font: crate::font::map_bold()?,
            stamps: HashMap::new(),
        })
    }

    fn stamp(&mut self, text: &str, size: u32) -> &Stamp {
        self.stamps
            .entry((text.to_owned(), size))
            .or_insert_with(|| {
                let glyphs: Vec<_> = text
                    .chars()
                    .map(|character| self.font.rasterize(character, size as f32))
                    .collect();
                let width = glyphs
                    .iter()
                    .map(|(metrics, _)| metrics.advance_width)
                    .sum::<f32>()
                    .ceil() as usize
                    + 12;
                let height = size as usize * 2;
                let mut alpha = vec![0; width * height];
                let mut position = 6.0_f32;
                let baseline = (height as f64 / 2.0 + f64::from(size) * 0.35).round() as isize;
                for (metrics, coverage) in glyphs {
                    let left = position.round() as isize + metrics.xmin as isize;
                    let top = baseline - metrics.ymin as isize - metrics.height as isize;
                    for row in 0..metrics.height {
                        for column in 0..metrics.width {
                            let target_column = left + column as isize;
                            let target_row = top + row as isize;
                            if target_column >= 0
                                && target_row >= 0
                                && target_column < width as isize
                                && target_row < height as isize
                            {
                                alpha[target_row as usize * width + target_column as usize] =
                                    coverage[row * metrics.width + column];
                            }
                        }
                    }
                    position += metrics.advance_width;
                }
                let mut halo = vec![0; alpha.len()];
                for row in 0..height {
                    for column in 0..width {
                        for source_row in row.saturating_sub(2)..=(row + 2).min(height - 1) {
                            for source_column in
                                column.saturating_sub(2)..=(column + 2).min(width - 1)
                            {
                                halo[row * width + column] = halo[row * width + column]
                                    .max(alpha[source_row * width + source_column]);
                            }
                        }
                    }
                }
                Stamp {
                    width,
                    height,
                    alpha,
                    halo,
                }
            })
    }

    pub fn draw(
        &mut self,
        rgb: &mut [u8],
        text: &str,
        center: [f64; 2],
        angle: f64,
        style: TextStyle,
    ) {
        self.draw_excluding(rgb, text, center, angle, style, None);
    }

    /// Rechtop, met het midden van de inkt (de echte glyphgrenzen, niet de basislijn) precies op `center`: het getal in
    /// de windbadge (U107, PO: optisch exact in de cirkel, zoals de app met `measureText`).
    pub fn draw_ink_centered(
        &mut self,
        rgb: &mut [u8],
        text: &str,
        center: [f64; 2],
        style: TextStyle,
    ) {
        let offset = self.ink_offset(text, style.size);
        self.draw(
            rgb,
            text,
            [center[0] - offset[0], center[1] - offset[1]],
            0.0,
            style,
        );
    }

    /// Midden van de inktgrenzen t.o.v. het punt waarop `draw` de stempel zet, in beeldpunten.
    pub fn ink_offset(&mut self, text: &str, size: u32) -> [f64; 2] {
        let stamp = self.stamp(text, size);
        let (mut left, mut top, mut right, mut bottom) = (usize::MAX, usize::MAX, 0, 0);
        for row in 0..stamp.height {
            for column in 0..stamp.width {
                if stamp.alpha[row * stamp.width + column] > 0 {
                    left = left.min(column);
                    right = right.max(column);
                    top = top.min(row);
                    bottom = bottom.max(row);
                }
            }
        }
        if left > right {
            return [0.0, 0.0];
        }
        // `draw` zet stempelpixel s op schermpunt s − breedte/2 + midden + 0,5 (pixelmidden).
        [
            (left + right) as f64 / 2.0 - stamp.width as f64 / 2.0 + 0.5,
            (top + bottom) as f64 / 2.0 - stamp.height as f64 / 2.0 + 0.5,
        ]
    }

    pub fn draw_excluding(
        &mut self,
        rgb: &mut [u8],
        text: &str,
        center: [f64; 2],
        angle: f64,
        style: TextStyle,
        excluded: Option<[f64; 4]>,
    ) {
        if style.opacity <= 0.0 {
            return;
        }
        let stamp = self.stamp(text, style.size);
        let cosine = angle.to_radians().cos();
        let sine = angle.to_radians().sin();
        let half_width =
            (cosine.abs() * stamp.width as f64 + sine.abs() * stamp.height as f64) / 2.0;
        let half_height =
            (sine.abs() * stamp.width as f64 + cosine.abs() * stamp.height as f64) / 2.0;
        let size = &constants().size;
        if excluded.is_some_and(|[left, top, right, bottom]| {
            center[0] + half_width > left
                && center[0] - half_width < right
                && center[1] + half_height > top
                && center[1] - half_height < bottom
        }) {
            return;
        }
        if center[0] < half_width
            || center[0] + half_width > size.width as f64
            || center[1] < half_height
            || center[1] + half_height > size.height as f64
        {
            return;
        }
        for row in
            (center[1] - half_height).floor() as usize..(center[1] + half_height).ceil() as usize
        {
            for column in
                (center[0] - half_width).floor() as usize..(center[0] + half_width).ceil() as usize
            {
                let source_x = (column as f64 + 0.5 - center[0]) * cosine
                    + (row as f64 + 0.5 - center[1]) * sine
                    + stamp.width as f64 / 2.0
                    - 0.5;
                let source_y = -(column as f64 + 0.5 - center[0]) * sine
                    + (row as f64 + 0.5 - center[1]) * cosine
                    + stamp.height as f64 / 2.0
                    - 0.5;
                let west = source_x.floor() as isize;
                let north = source_y.floor() as isize;
                if west < 0
                    || north < 0
                    || west + 1 >= stamp.width as isize
                    || north + 1 >= stamp.height as isize
                {
                    continue;
                }
                let horizontal = source_x - west as f64;
                let vertical = source_y - north as f64;
                let mut coverage = [0.0; 2];
                for (offset_x, offset_y, weight) in [
                    (0, 0, (1.0 - horizontal) * (1.0 - vertical)),
                    (1, 0, horizontal * (1.0 - vertical)),
                    (0, 1, (1.0 - horizontal) * vertical),
                    (1, 1, horizontal * vertical),
                ] {
                    let index =
                        (north as usize + offset_y) * stamp.width + west as usize + offset_x;
                    coverage[0] += f64::from(stamp.halo[index]) / 255.0 * weight * style.opacity;
                    coverage[1] += f64::from(stamp.alpha[index]) / 255.0 * weight * style.opacity;
                }
                let index = (row * size.width + column) * 3;
                for channel in 0..3 {
                    let halo = f64::from(rgb[index + channel]) * (1.0 - coverage[0])
                        + f64::from(style.halo[channel]) * coverage[0];
                    rgb[index + channel] = (halo * (1.0 - coverage[1])
                        + f64::from(style.color[channel]) * coverage[1])
                        .round() as u8;
                }
            }
        }
    }
}
