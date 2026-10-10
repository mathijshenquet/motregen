use crate::{
    constants::constants,
    motion::Motion,
    palette::composition_colors,
    projection::{Grid, Projection},
};

pub struct RainPair<'a> {
    pub left: &'a [u8],
    pub right: &'a [u8],
    pub mix: f64,
}

pub struct RainCompositor {
    pub grid: Grid,
    pub projection: Projection,
    colors: [Vec<[f32; 4]>; 2],
    displacement: Option<Vec<(f64, f64)>>,
}

impl RainCompositor {
    pub fn new(grid: Grid) -> Self {
        Self {
            projection: Projection::new(&grid),
            grid,
            colors: [composition_colors(false), composition_colors(true)],
            displacement: None,
        }
    }

    pub fn set_motion(&mut self, motion: Option<Motion<'_>>) {
        let grid_width = self.grid.width;
        let grid_height = self.grid.height;
        let columns = &self.projection.columns;
        self.displacement = motion.map(|motion| {
            self.projection
                .rows
                .iter()
                .flat_map(|&row| {
                    columns.iter().map(move |&column| {
                        motion.displacement(column, row, grid_width, grid_height)
                    })
                })
                .collect()
        });
    }

    pub fn compose(&self, rgb: &mut [u8], pair: RainPair<'_>, night: bool) {
        let left_weight = (1.0 - pair.mix).powf(constants().flow_curve);
        let right_weight = pair.mix.powf(constants().flow_curve);
        let mix = right_weight / (left_weight + right_weight).max(0.0001);
        let multiply = constants().presentation[if night { "dark" } else { "light" }]["multiply"]
            .as_bool()
            .unwrap();
        crate::composition::compose_frame(
            rgb,
            crate::composition::Composition {
                columns: &self.projection.columns,
                rows: &self.projection.rows,
                grid_width: self.grid.width,
                grid_height: self.grid.height,
                left: pair.left,
                right: pair.right,
                mix,
                colors: &self.colors[usize::from(night)],
                displacements: self.displacement.as_deref(),
                multiply,
            },
        );
    }
}
