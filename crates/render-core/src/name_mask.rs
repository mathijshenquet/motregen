/// Pixels where the basemap draws names (places, provinces, countries, water), in frame pixels. Made by the bot
/// (`captureNameMask`) next to each plate; temperature and isoline labels keep out of it (U103).
pub struct NameMask {
    width: usize,
    height: usize,
    occupied: Vec<bool>,
}

impl NameMask {
    pub fn new(width: usize, height: usize, luma: &[u8]) -> Self {
        assert_eq!(luma.len(), width * height, "Name mask size");
        Self {
            width,
            height,
            occupied: luma.iter().map(|&value| value > 0).collect(),
        }
    }

    pub fn empty() -> Self {
        Self::new(0, 0, &[])
    }

    pub(crate) fn overlaps(&self, rect: &Rect) -> bool {
        let left = rect.left.clamp(0, self.width as i32) as usize;
        let right = rect.right.clamp(0, self.width as i32) as usize;
        let top = rect.top.clamp(0, self.height as i32) as usize;
        let bottom = rect.bottom.clamp(0, self.height as i32) as usize;
        (top..bottom).any(|row| {
            self.occupied[row * self.width + left..row * self.width + right]
                .iter()
                .any(|&occupied| occupied)
        })
    }
}

/// Half-open pixel rectangle.
#[derive(Clone, Copy)]
pub(crate) struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub(crate) fn grown(self, margin: i32) -> Self {
        Self {
            left: self.left - margin,
            top: self.top - margin,
            right: self.right + margin,
            bottom: self.bottom + margin,
        }
    }

    pub(crate) fn intersects(&self, other: &Rect) -> bool {
        self.left < other.right
            && other.left < self.right
            && self.top < other.bottom
            && other.top < self.bottom
    }
}
