import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const run = promisify(execFile)
const project = fileURLToPath(new URL('..', import.meta.url))
if (!process.argv[2]) throw new Error('Gebruik: tsx tools/build-wind-layer-variants.mts /pad/preview')
const output = resolve(process.argv[2])
const target = resolve(output, 'target')
// De keuzeproeven blijven reproduceerbaar nadat MIP-31 regen uit de productiefilm verwijderde.
const sourceRevision = '244bf915130e6167139294a2dbbda19f557d3a36'
const sourceInput = resolve(output, 'source-input')
await mkdir(sourceInput, { recursive: true })
const archive = await run('git', ['archive', '--format=tar', sourceRevision, 'Cargo.toml', 'Cargo.lock', 'crates', 'bot', 'web'],
  { cwd: project, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 })
await writeFile(resolve(output, 'source-input.tar'), archive.stdout)
await run('tar', ['-xf', resolve(output, 'source-input.tar'), '-C', sourceInput])
await symlink(resolve(project, 'bot/node_modules'), resolve(sourceInput, 'bot/node_modules'))
const { modeConstants } = await import(pathToFileURL(resolve(sourceInput, 'bot/render-mode-constants.ts')).href)
const { LOOP_TIMING } = await import(pathToFileURL(resolve(sourceInput, 'bot/sequences.ts')).href)
const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { cwd: project })
const { stdout: main } = await run('git', ['rev-parse', 'origin/main'], { cwd: project })
const variants = [
  { id: 'full', rain: true, pressure: true },
  { id: 'no-rain', rain: false, pressure: true },
  { id: 'no-pressure', rain: true, pressure: false },
  { id: 'no-rain-no-pressure', rain: false, pressure: false },
]

// Mutatie blijft in dit proefproces; alleen bronkopieën krijgen het andere plan en de laagwijzigingen.
LOOP_TIMING.stepSeconds = 75
LOOP_TIMING.fps = 7.5
const constants = modeConstants()
if (constants.loop_offsets.length !== 289 || constants.hold_frames !== 8) throw new Error('Onverwacht proefplan')
async function replaceOnce(path: string, before: string, after: string) {
  const source = await readFile(path, 'utf8')
  if (source.split(before).length !== 2) throw new Error(`Bron gewijzigd: ${path}`)
  await writeFile(path, source.replace(before, after))
}

const packages = []
for (const variant of variants) {
  const root = resolve(output, variant.id)
  const source = resolve(root, 'source')
  const bundle = resolve(root, 'bundle')
  await mkdir(source, { recursive: true })
  await mkdir(bundle, { recursive: true })
  for (const path of ['Cargo.toml', 'Cargo.lock', 'crates']) {
    await cp(resolve(sourceInput, path), resolve(source, path), { recursive: true })
  }
  await writeFile(resolve(source, 'crates/render-core/assets/mode-constants.json'), JSON.stringify(constants) + '\n')
  if (!variant.rain) {
    await replaceOnce(resolve(source, 'crates/render/src/modes.rs'),
      'let mut rain = wind\n', 'let mut rain = false\n')
  }
  if (!variant.pressure) {
    await replaceOnce(resolve(source, 'crates/render/src/modes.rs'),
      `        field_raster::lines(
            &mut rgb,
            &input.slice.segments,
            line_color,
            self.wind,
            input.slice.opacity,
        );`,
      `        if !self.wind {
            field_raster::lines(
                &mut rgb,
                &input.slice.segments,
                line_color,
                self.wind,
                input.slice.opacity,
            );
        }`)
    // Het rooster blijft uit dezelfde header komen; geen drukrasters, contouren, labels of H/L voorbereiden.
    await replaceOnce(resolve(source, 'crates/render/src/fields.rs'),
      'pub fn slice(&mut self, time: i64) -> Result<Slice> {\n',
      `pub fn slice(&mut self, time: i64) -> Result<Slice> {
        if self.pressure {
            return Ok(Slice {
                field: Arc::new(Field { width: 0, height: 0, values: Vec::new(), valid: Vec::new() }),
                segments: Vec::new(), rings: Vec::new(), labels: Vec::new(), marks: Vec::new(), opacity: 1.0,
            });
        }
`)
  }
  const fingerprints: Record<string, string> = {}
  for (const path of ['crates/render/src/modes.rs', 'crates/render/src/fields.rs', 'crates/render-core/assets/mode-constants.json']) {
    fingerprints[path] = createHash('sha256').update(await readFile(resolve(source, path))).digest('hex')
  }
  const plan = { head: sourceRevision, buildHead: head.trim(), main: main.trim(), mode: 'wind', ...variant, stepSeconds: 75,
    fps: constants.fps, fpsFraction: constants.fps_fraction, frames: constants.loop_offsets.length,
    holdFrames: constants.hold_frames, offsets: constants.loop_offsets, fingerprints }
  await writeFile(resolve(bundle, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
  const build = await run('cargo', ['build', '--release', '-p', 'render', '--manifest-path', resolve(source, 'Cargo.toml'),
    '--target-dir', target], { cwd: project, maxBuffer: 4 * 1024 * 1024 })
  process.stderr.write(build.stderr)
  await cp(resolve(target, 'release/motregen-render'), resolve(bundle, 'motregen-render'))
  await cp(resolve(source, 'crates/render/assets/basemaps'), resolve(bundle, 'basemaps'), { recursive: true })
  const expression = `let flake = builtins.getFlake ${JSON.stringify(project)};
    pkgs = import flake.inputs.nixpkgs { system = "x86_64-linux"; };
    in pkgs.callPackage ${JSON.stringify(resolve(project, 'tools/wind-preview-package.nix'))} {
      bundle = builtins.path { path = ${JSON.stringify(bundle)}; name = "wind-preview-${variant.id}"; };
      variant = ${JSON.stringify(variant.id)};
    }`
  const nix = await run('nix', ['build', '--impure', '--expr', expression, '--out-link', resolve(root, 'package'),
    '--print-out-paths', '-L'], { cwd: project, maxBuffer: 4 * 1024 * 1024 })
  process.stderr.write(nix.stderr)
  const store = nix.stdout.trim()
  if (!store.startsWith('/nix/store/') || store.includes('\n')) throw new Error('Onverwacht Nix-uitvoerpad')
  const entry = { ...plan, store, binary: `${store}/bin/motregen-render`, basemaps: `${store}/share/motregen-render/basemaps` }
  packages.push(entry)
  await writeFile(resolve(output, 'packages.json'), JSON.stringify(packages, null, 2) + '\n')
  console.log(JSON.stringify({ variant: variant.id, store, exit: 0 }))
}
