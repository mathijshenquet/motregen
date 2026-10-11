import { cp, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { modeConstants } from '../bot/render-mode-constants.js'
import { LOOP_TIMING } from '../bot/sequences.js'

const run = promisify(execFile)
const project = fileURLToPath(new URL('..', import.meta.url))
if (!process.argv[2]) throw new Error('Gebruik: tsx tools/build-wind-tempo-variant.mts /pad/preview')
const output = resolve(process.argv[2])
const source = resolve(output, 'source')
await mkdir(source, { recursive: true })
for (const path of ['Cargo.toml', 'Cargo.lock', 'crates']) await cp(resolve(project, path), resolve(source, path), { recursive: true })

// Alleen de gekopieerde Rust-bron krijgt het PO-proefplan; de productieconstanten blijven ongewijzigd.
LOOP_TIMING.stepSeconds = 75
LOOP_TIMING.fps = 7.5
const constants = modeConstants()
await writeFile(resolve(source, 'crates/render-core/assets/mode-constants.json'), JSON.stringify(constants) + '\n')
const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { cwd: project })
await writeFile(resolve(output, 'plan.json'), JSON.stringify({ head: head.trim(), mode: 'wind', stepSeconds: 75, fps: constants.fps,
  frames: constants.loop_offsets.length, holdFrames: constants.hold_frames, offsets: constants.loop_offsets }, null, 2) + '\n')
const { stderr } = await run('cargo', ['build', '--release', '-p', 'render', '--manifest-path', resolve(source, 'Cargo.toml'),
  '--target-dir', resolve(project, 'target')], { cwd: project })
process.stderr.write(stderr)
console.log(JSON.stringify({ binary: resolve(project, 'target/release/motregen-render'), plan: resolve(output, 'plan.json'), exit: 0 }))
