import assert from 'node:assert/strict'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const [botPackage] = process.argv.slice(2)
const shutdown = new AbortController()
process.once('SIGTERM', () => shutdown.abort())
globalThis.fetch = async () => { throw new Error('Unexpected network request in Rust hardening test') }
const { StillRenderer } = await import(pathToFileURL(join(botPackage, 'lib/motregen-bot/dist/bot/render.js')))
const { enabledLoopModes, STILL_HOURS } = await import(pathToFileURL(join(botPackage, 'lib/motregen-bot/dist/bot/stills.js')))
const { sequencePlan, holdFrames } = await import(pathToFileURL(join(botPackage, 'lib/motregen-bot/dist/bot/sequences.js')))
assert.equal(process.env.MOTREGEN_RUST_RENDERER, 'weather,feels,wind,air')
assert.ok(process.env.MOTREGEN_RENDER_BIN.startsWith('/nix/store/'))
assert.ok(process.env.MOTREGEN_RUST_BASEMAP_DIR.startsWith('/nix/store/'))
const dataDirectory = process.env.MOTREGEN_DATA_DIR
const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).split('\n').map((line) => line.split(' '))
assert.ok(mounts.some((mount) => mount[4] === dataDirectory && mount[5].split(',').includes('ro')))
await assert.rejects(writeFile(join(dataDirectory, 'write-probe'), 'forbidden'), { code: 'EROFS' })
const status = await readFile('/proc/self/status', 'utf8')
assert.match(status, /^NoNewPrivs:\s+1$/m)
assert.match(status, /^CapEff:\s+0+$/m)
assert.match(status, /^Seccomp:\s+2$/m)
assert.notEqual(process.getuid(), 0)

const events = []
const output = console.info
console.info = (line) => { events.push(JSON.parse(line)); output(line) }
const renderer = new StillRenderer('http://fixture.invalid', process.env.MOTREGEN_RENDER_CACHE)
try {
  const manifest = await renderer.manifest()
  const modes = enabledLoopModes()
  assert.deepEqual(modes.map(({ mode }) => mode), ['weather', 'air', 'feels', 'wind'])
  const loops = await Promise.all(modes.map(({ mode }) => renderer.render({ mode, hour: 'loop' }, manifest)))
  for (const [index, loop] of loops.entries()) {
    const mode = modes[index].mode
    assert.equal(loop.backend, 'rust')
    assert.equal(loop.cached, false)
    const plan = sequencePlan(mode, manifest)
    assert.equal(plan.loopFrames, { weather: 109, air: 145, feels: 217, wind: 193 }[mode])
    assert.equal(plan.fps, mode === 'wind' ? 7.5 : 5.6)
    assert.equal(holdFrames(plan), mode === 'wind' ? 8 : 6)
    assert.equal(loop.frames, plan.loopFrames)
    assert.equal(loop.fps, plan.fps)
    assert.equal((await stat(loop.path)).size, loop.bytes)
    if (mode !== 'wind') for (const hour of STILL_HOURS) {
      const still = await renderer.render({ mode, hour }, manifest)
      assert.equal(still.cached, true)
      assert.ok((await stat(still.path)).size > 0)
    }
    assert.equal((await renderer.render({ mode, hour: 'loop' }, manifest)).cached, true)
  }
  assert.equal(events.filter(({ event }) => event === 'rust-generation-render').length, 1)
  const { frameCache } = events.find(({ event }) => event === 'rust-generation-render')
  for (const { mode } of modes) assert.ok(frameCache[mode].rendered + frameCache[mode].reused > 0)
  assert.ok((await stat(process.env.MOTREGEN_FRAME_CACHE)).isDirectory())
  assert.equal(events.filter(({ event }) => event === 'sequence-render').length, 4)
  const files = await readdir(process.env.MOTREGEN_RENDER_CACHE)
  assert.equal(files.filter((file) => file.endsWith('.jpg')).length, 255)
  assert.equal(files.filter((file) => file.endsWith('.mp4')).length, 4)
  output('bot-test-rust-ready')
} finally { await renderer.close() }
await delay(3_600_000, undefined, { signal: shutdown.signal }).catch((error) => assert.equal(error.name, 'AbortError'))
