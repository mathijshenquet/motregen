use crate::constants::constants;
use fontdue::{Font, Metrics};
use std::{collections::HashMap, sync::Arc};

struct Glyph {
    metrics: Metrics,
    alpha: Vec<u8>,
}

/// Letter van een tekst: bediening (Inter) of kaart (Noto Sans, U107).
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum Face {
    Ui,
    Map,
}

pub struct Text {
    ui: Arc<Font>,
    map: Arc<Font>,
    face: Face,
    glyphs: HashMap<(Face, char, u32), Glyph>,
}

impl Text {
    pub fn new() -> Result<Self, &'static str> {
        Ok(Self {
            ui: crate::font::inter()?,
            map: crate::font::map_regular()?,
            face: Face::Ui,
            glyphs: HashMap::new(),
        })
    }

    /// Kies de letter voor de volgende metingen en tekeningen; geeft de vorige terug.
    pub fn set_face(&mut self, face: Face) -> Face {
        std::mem::replace(&mut self.face, face)
    }

    pub fn width(&mut self, text: &str, size: u32) -> f32 {
        text.chars()
            .map(|character| self.glyph(character, size).metrics.advance_width)
            .sum()
    }

    /// Height of a digit above the baseline: the ink box of a temperature label.
    pub fn digit_height(&mut self, size: u32) -> i32 {
        let metrics = self.glyph('0', size).metrics;
        metrics.ymin + metrics.height as i32
    }

    pub(crate) fn digit_mask(&mut self, character: char, width: usize, height: usize) -> Vec<u8> {
        let glyph = self.glyph(character, 58);
        let left = ((width as f32 - glyph.metrics.advance_width) / 2.0).round() as i32
            + glyph.metrics.xmin;
        let top = 52 - glyph.metrics.ymin - glyph.metrics.height as i32;
        let mut mask = vec![0; width * height];
        for row in 0..glyph.metrics.height {
            for column in 0..glyph.metrics.width {
                let x = left + column as i32;
                let y = top + row as i32;
                if x >= 0 && x < width as i32 && y >= 0 && y < height as i32 {
                    mask[y as usize * width + x as usize] =
                        glyph.alpha[row * glyph.metrics.width + column];
                }
            }
        }
        mask
    }

    fn glyph(&mut self, character: char, size: u32) -> &Glyph {
        let face = self.face;
        let font = match face {
            Face::Ui => &self.ui,
            Face::Map => &self.map,
        };
        self.glyphs
            .entry((face, character, size))
            .or_insert_with(|| {
                let (metrics, alpha) = font.rasterize(character, size as f32);
                Glyph { metrics, alpha }
            })
    }

    pub fn draw(
        &mut self,
        rgb: &mut [u8],
        text: &str,
        position: (f32, i32),
        size: u32,
        color: [u8; 3],
        halo: Option<[u8; 3]>,
    ) {
        let (left, baseline) = position;
        let mut position = left;
        for character in text.chars() {
            let glyph = self.glyph(character, size);
            let glyph_left = position.round() as i32 + glyph.metrics.xmin;
            let glyph_top = baseline - glyph.metrics.ymin - glyph.metrics.height as i32;
            if let Some(halo) = halo {
                for offset_y in -2..=2 {
                    for offset_x in -2..=2 {
                        blit_glyph(
                            rgb,
                            glyph,
                            glyph_left + offset_x,
                            glyph_top + offset_y,
                            halo,
                        );
                    }
                }
            }
            blit_glyph(rgb, glyph, glyph_left, glyph_top, color);
            position += glyph.metrics.advance_width;
        }
    }
}

fn blit_glyph(rgb: &mut [u8], glyph: &Glyph, left: i32, top: i32, color: [u8; 3]) {
    let size = &constants().size;
    for row in 0..glyph.metrics.height {
        let pixel_row = top + row as i32;
        if pixel_row < 0 || pixel_row >= size.height as i32 {
            continue;
        }
        for column in 0..glyph.metrics.width {
            let pixel_column = left + column as i32;
            if pixel_column < 0 || pixel_column >= size.width as i32 {
                continue;
            }
            let alpha = glyph.alpha[row * glyph.metrics.width + column] as f32 / 255.0;
            if alpha == 0.0 {
                continue;
            }
            let offset = (pixel_row as usize * size.width + pixel_column as usize) * 3;
            for channel in 0..3 {
                rgb[offset + channel] = (color[channel] as f32 * alpha
                    + rgb[offset + channel] as f32 * (1.0 - alpha))
                    .round() as u8;
            }
        }
    }
}
