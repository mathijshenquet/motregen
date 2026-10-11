#[derive(Clone, Copy)]
pub struct Motion<'a> {
    pub vectors: &'a [i8],
    pub width: usize,
    pub height: usize,
    pub interval: f64,
    pub cap: f64,
    pub fade: f64,
}

impl Motion<'_> {
    pub fn displacement(
        &self,
        column: f64,
        row: f64,
        grid_width: usize,
        grid_height: usize,
    ) -> (f64, f64) {
        let motion_x = ((column + 0.5) / grid_width as f64 * self.width as f64 - 0.5)
            .clamp(0.0, (self.width - 1) as f64);
        let motion_y = ((row + 0.5) / grid_height as f64 * self.height as f64 - 0.5)
            .clamp(0.0, (self.height - 1) as f64);
        let west = motion_x as usize;
        let north = motion_y as usize;
        let east = (west + 1).min(self.width - 1);
        let south = (north + 1).min(self.height - 1);
        let horizontal = motion_x - west as f64;
        let vertical = motion_y - north as f64;
        let indexes = [
            north * self.width + west,
            north * self.width + east,
            south * self.width + west,
            south * self.width + east,
        ];
        let weights = [
            (1.0 - horizontal) * (1.0 - vertical),
            horizontal * (1.0 - vertical),
            (1.0 - horizontal) * vertical,
            horizontal * vertical,
        ];
        let mut velocity_x = 0.0;
        let mut velocity_y = 0.0;
        let mut validity = 0.0;
        for corner in 0..4 {
            let eastward = self.vectors[indexes[corner] * 2];
            let southward = self.vectors[indexes[corner] * 2 + 1];
            if eastward == -128 || southward == -128 {
                continue;
            }
            velocity_x += eastward as f64 * weights[corner];
            velocity_y += southward as f64 * weights[corner];
            validity += weights[corner];
        }
        let displacement_x = velocity_x * 0.1 * self.interval;
        let displacement_y = velocity_y * 0.1 * self.interval;
        let distance = displacement_x.hypot(displacement_y);
        let strength = if validity < 0.999 || distance >= self.fade {
            0.0
        } else if distance <= self.cap {
            1.0
        } else {
            {
                let position = (distance - self.cap) / (self.fade - self.cap);
                self.cap / distance * (1.0 - position * position * (3.0 - 2.0 * position))
            }
        };
        (displacement_x * strength, displacement_y * strength)
    }
}
