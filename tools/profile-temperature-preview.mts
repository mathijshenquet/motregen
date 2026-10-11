import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const run = promisify(execFile), project = fileURLToPath(new URL('..', import.meta.url))
if (!process.argv[2]) throw new Error('Gebruik: tsx tools/profile-temperature-preview.mts /pad/profiel')
const output = resolve(process.argv[2]), source = resolve(output, 'source')
const optimization = process.argv[3] ?? 'baseline'
if (!['baseline', 'equal-corners'].includes(optimization)) throw new Error('Proef moet baseline of equal-corners zijn')
await mkdir(source, { recursive: true })
for (const path of ['Cargo.toml', 'Cargo.lock', 'crates']) await cp(resolve(project, path), resolve(source, path), { recursive: true })
async function replaceOnce(path: string, before: string, after: string) {
  const file = resolve(source, path), text = await readFile(file, 'utf8')
  if (text.split(before).length !== 2) throw new Error(`Bron gewijzigd: ${path}`)
  await writeFile(file, text.replace(before, after))
}
const raster = 'crates/render-core/src/field_raster.rs', fields = 'crates/render/src/fields.rs'
await replaceOnce(raster, 'fn basis(position:', `use std::{sync::atomic::{AtomicU64, Ordering}, time::Instant};
static SAMPLE_US: AtomicU64 = AtomicU64::new(0);
static UPSCALE_US: AtomicU64 = AtomicU64::new(0);
static LINES_US: AtomicU64 = AtomicU64::new(0);
pub fn preview_profile() -> (u64, u64, u64) {
    (SAMPLE_US.load(Ordering::Relaxed), UPSCALE_US.load(Ordering::Relaxed), LINES_US.load(Ordering::Relaxed))
}
fn basis(position:`)
await replaceOnce(raster, '    let size = &constants().size;\n    let width = size.width;\n    let height = size.height;\n    let grid_width',
  '    let preview_started = Instant::now();\n    let size = &constants().size;\n    let width = size.width;\n    let height = size.height;\n    let grid_width')
await replaceOnce(raster, '    let horizontal_samples: Vec<_> =',
  '    SAMPLE_US.fetch_add(preview_started.elapsed().as_micros() as u64, Ordering::Relaxed);\n    let preview_started = Instant::now();\n    let horizontal_samples: Vec<_> =')
await replaceOnce(raster, '}\npub fn lines(',
  '    UPSCALE_US.fetch_add(preview_started.elapsed().as_micros() as u64, Ordering::Relaxed);\n}\npub fn lines(')
await replaceOnce(raster, 'pub fn lines(rgb: &mut [u8], segments: &[f32], color: [u8; 3], pressure: bool, opacity: f64) {',
  'pub fn lines(rgb: &mut [u8], segments: &[f32], color: [u8; 3], pressure: bool, opacity: f64) {\n    let preview_started = Instant::now();')
await replaceOnce(raster, '            rgb[index] = (rgb[index] as f32 * (1.0 - alpha) + color * alpha).round() as u8;\n        }\n    }\n}',
  '            rgb[index] = (rgb[index] as f32 * (1.0 - alpha) + color * alpha).round() as u8;\n        }\n    }\n    LINES_US.fetch_add(preview_started.elapsed().as_micros() as u64, Ordering::Relaxed);\n}')
if (optimization === 'equal-corners') {
  await replaceOnce(raster, `            let mut rgba = [0.0f32; 4];
            for corner in 0..4 {
                for channel in 0..4 {
                    rgba[channel] += filled[indexes[corner] + channel] as f32 * weights[corner];
                }
            }`, `            let first = &filled[indexes[0]..indexes[0] + 4];
            let uniform = indexes[1..].iter().all(|&index| &filled[index..index + 4] == first);
            let mut rgba = [0.0f32; 4];
            if uniform {
                for channel in 0..4 {
                    rgba[channel] = first[channel] as f32;
                }
            } else {
                for corner in 0..4 {
                    for channel in 0..4 {
                        rgba[channel] += filled[indexes[corner] + channel] as f32 * weights[corner];
                    }
                }
            }`)
}
await replaceOnce(fields, '    pub contours_us: u128,', '    pub contours_us: u128,\n    pub preview_trace_us: u128,\n    pub preview_ring_us: u128,')
await replaceOnce(fields, '            contours_us: 0,', '            contours_us: 0,\n            preview_trace_us: 0,\n            preview_ring_us: 0,')
await replaceOnce(fields, '        let contours = contours::trace(&field, &self.grid, self.step, tolerance);',
  '        let preview_started = Instant::now();\n        let contours = contours::trace(&field, &self.grid, self.step, tolerance);\n        self.preview_trace_us += preview_started.elapsed().as_micros();')
await replaceOnce(fields, '            contours::ring_raster(&contours, ring_km, self.grid.width, self.grid.height)',
  '            let preview_started = Instant::now();\n            let rings = contours::ring_raster(&contours, ring_km, self.grid.width, self.grid.height);\n            self.preview_ring_us += preview_started.elapsed().as_micros();\n            rings')
await replaceOnce('crates/render/src/modes.rs', '    let media = Media {',
  `    let (sample_us, upscale_us, lines_us) = field_raster::preview_profile();
    eprintln!("TEMP_PHASE fill_us={} lines_us={} trace_us={} ring_us={} sample_us={} upscale_us={}", sample_us + upscale_us, lines_us, fields.preview_trace_us, fields.preview_ring_us, sample_us, upscale_us);
    let media = Media {`)
const build = await run('cargo', ['build', '--release', '-p', 'render', '--manifest-path', resolve(source, 'Cargo.toml'),
  '--target-dir', resolve(output, '../target')], { cwd: project, maxBuffer: 4 * 1024 * 1024 })
process.stderr.write(build.stderr)
await cp(resolve(output, '../target/release/motregen-render'), resolve(output, 'motregen-render'))
const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { cwd: project })
await writeFile(resolve(output, 'plan.json'), JSON.stringify({ head: head.trim(), mode: 'feels', optimization }, null, 2) + '\n')
console.log(JSON.stringify({ binary: resolve(output, 'motregen-render'), mode: 'feels', optimization, exit: 0 }))
