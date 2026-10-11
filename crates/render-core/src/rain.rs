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
    pub coverage: Option<crate::composition::CoveragePair<'a>>,
}

pub struct RainCompositor {
    pub grid: Grid,
    pub projection: Projection,
    colors: [Vec<[f32; 4]>; 2],
}

impl RainCompositor {
    pub fn new(grid: Grid) -> Self {
        Self {
            projection: Projection::new(&grid),
            grid,
            colors: [composition_colors(false), composition_colors(true)],
        }
    }

    pub fn project_motion(
        &self,
        motion: Motion<'_>,
        coverage: Option<crate::composition::CoveragePair<'_>>,
    ) -> Vec<(f64, f64)> {
        let grid_width = self.grid.width;
        let grid_height = self.grid.height;
        let columns = &self.projection.columns;
        let mut field = vec![(0.0, 0.0); columns.len() * self.projection.rows.len()];
        let block_columns = columns.len().div_ceil(32);
        let active =
            coverage.map(|coverage| coverage.active_blocks(columns, &self.projection.rows, 0.5));
        let project_row = |index: usize, field: &mut [(f64, f64)]| {
            let row = self.projection.rows[index];
            for (block, field) in field.chunks_mut(32).enumerate() {
                if active
                    .as_ref()
                    .is_some_and(|active| !active[index / 16 * block_columns + block])
                {
                    continue;
                }
                for (offset, displacement) in field.iter_mut().enumerate() {
                    *displacement = motion.displacement(
                        columns[block * 32 + offset],
                        row,
                        grid_width,
                        grid_height,
                    );
                }
            }
        };
        #[cfg(feature = "parallel")]
        {
            use rayon::prelude::*;
            field
                .par_chunks_mut(columns.len())
                .enumerate()
                .for_each(|(index, field)| project_row(index, field));
        }
        #[cfg(not(feature = "parallel"))]
        for (index, field) in field.chunks_mut(columns.len()).enumerate() {
            project_row(index, field);
        }
        field
    }

    pub fn compose(
        &self,
        rgb: &mut [u8],
        pair: RainPair<'_>,
        displacements: Option<&[(f64, f64)]>,
        night: bool,
    ) {
        let left_weight = (1.0 - pair.mix).powf(constants().flow_curve);
        let right_weight = pair.mix.powf(constants().flow_curve);
        let mix = right_weight / (left_weight + right_weight).max(0.0001);
        let multiply = constants().presentation[if night { "dark" } else { "light" }]["multiply"]
            .as_bool()
            .unwrap();
        crate::composition::compose_covered(
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
                displacements,
                multiply,
            },
            pair.coverage,
        );
    }
}
