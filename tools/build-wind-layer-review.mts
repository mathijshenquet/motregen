import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const run = promisify(execFile)
if (!process.argv[2]) throw new Error('Gebruik: tsx tools/build-wind-layer-review.mts /pad/proeven')
const root = resolve(process.argv[2])
const measurements = JSON.parse(await readFile(resolve(root, 'measurements.json'), 'utf8'))
const packages = JSON.parse(await readFile(resolve(root, 'packages.json'), 'utf8'))
const titles: Record<string, string> = { full: 'Volledig', 'no-rain': 'Zonder regen',
  'no-pressure': 'Zonder isobaren en drukletters', 'no-rain-no-pressure': 'Zonder beide',
  'baseline-weather': 'Regen', 'baseline-feels': 'Gevoelstemperatuur', 'baseline-wind': 'Wind · 5,6 fps', 'baseline-all': 'Alles samen' }
const { stdout: head } = await run('git', ['rev-parse', 'HEAD'])
const probes = []
for (const p of packages) {
  const film = resolve(root, p.id, 'media/wind-loop.mp4')
  const media = JSON.parse(await readFile(resolve(root, p.id, 'media/media.json'), 'utf8'))
  assert.equal(media.generated, measurements[0].generated)
  assert.equal(media.clock_variant, 'schuif')
  assert.equal(media.frames, 289); assert.equal(media.hold_frames, 8); assert.equal(media.fps, 7.5)
  const ffprobe = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', film])
  const stream = JSON.parse(ffprobe.stdout).streams[0]
  assert.equal(stream.nb_frames, '297'); assert.equal(stream.r_frame_rate, '15/2')
  assert.equal(stream.profile, 'High'); assert.equal(stream.pix_fmt, 'yuv420p')
  assert.equal(stream.width, 960); assert.equal(stream.height, 1224)
  const bytes = await readFile(film)
  assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')))
  for (const [name, filter] of Object.entries({
    day: 'select=eq(n\\,48)', night: 'select=eq(n\\,0)',
    motion: 'select=between(n\\,96\\,101),crop=320:240:330:650,tile=3x2',
    clock: 'select=lt(n\\,8),crop=220:160:0:0,tile=8x1',
  })) {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-y', '-i', film,
      '-vf', filter, '-frames:v', '1', resolve(root, p.id, `${name}.png`)])
  }
  probes.push({ id: p.id, title: titles[p.id], store: p.store, frames: 297, duration: stream.duration,
    profile: stream.profile, bytes: media.files[0].bytes, layers: { rain: p.rain, pressure: p.pressure } })
}
await writeFile(resolve(root, 'review.json'), JSON.stringify({ head: head.trim(), snapshot: measurements[0].generated,
  now: measurements[0].now, measurements, probes }, null, 2) + '\n')
const table = (rows: any[]) => `<div class="scroll"><table><thead><tr><th>Proef / modus</th><th>Tijd (s)</th><th>CPU (s)</th><th>Piek (MiB)</th><th>Film (MB)</th><th>Stills</th></tr></thead><tbody>${rows.map(r => `<tr><td>${titles[r.id]}</td><td>${r.wallSeconds.toFixed(3)}</td><td>${r.cpuSeconds.toFixed(3)}</td><td>${r.peakMiB.toFixed(1)}</td><td>${r.files.map((f: any) => (f.bytes / 1e6).toFixed(3)).join(' / ')}</td><td>${r.stills}</td></tr>`).join('')}</tbody></table></div>`
await writeFile(resolve(root, 'index.html'), `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motregen · Windlagen bij 7,5 fps</title><style>
body{margin:0;background:#edf3f5;color:#18333e;font:16px/1.5 system-ui}main{max-width:1400px;margin:auto;padding:24px}h1{margin:0}h2{margin-top:32px}a{color:#155d8a}p{max-width:1050px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}section,.summary{background:white;padding:18px;border-radius:12px}video{display:block;width:100%;max-height:620px;background:#17313c}.images{display:grid;grid-template-columns:1fr 1fr;gap:12px}.images img{width:100%;height:auto}figure{margin:0}figcaption{font-size:14px}table{border-collapse:collapse;width:100%;background:white;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #cad9df}.scroll{overflow:auto}.native img{display:block;max-width:none}code{font-size:13px;overflow-wrap:anywhere}.muted{color:#526b78;font-size:14px}button{padding:10px 18px;background:#155d8a;color:white;border:0;border-radius:6px;margin:8px 12px 8px 0}input{width:300px;max-width:80%}@media(max-width:760px){main{padding:14px}.grid{grid-template-columns:1fr}}
</style><main><h1>Wind: vier lagenproeven bij 7,5 fps</h1><p class="muted">Head ${head.trim()} · snapshot ${measurements[0].generated} · now ${measurements[0].now}</p>
<div class="summary"><strong>Dezelfde snapshot, klok, streepjes, temperatuurpunten en kaartplaten</strong><p>Alle vier films: 75 seconden kaarttijd per frame, 7,5 fps, −1…+5 uur, 289 kaartframes + acht eindholdframes, 39,6 s. De gekozen U76-schuifklok blijft gelijk. Veryfast/CRF18, High/yuv420p/faststart en het duurgebonden 20 MB-VBV blijven gelijk. De standaardproductiebron blijft 100 s / 5,6 fps, met alle lagen.</p><p>De drukloze proef verwijdert de drukcontouren, lijnlabels en H/L, inclusief voorbereiding en rasterisatie. Alleen de roosterheader blijft voor dezelfde projectie. De regenloze proef maakt geen regenrasters, motionvelden of menging. Geen nieuwe rendercaches of productievlaggen.</p><p>Dev-host: taskset 0,1, CPUQuota=200%, MemoryMax=1600M, geen swap; iedere render synchroon exit 0. Losse tijden zijn niet optelbaar tot de parallelle generatie. De PM-VM-meting gebruikt een latere snapshot (12:47:47Z); onderstaande metingen en beelden gebruiken onderling exact dezelfde snapshot van 06:40:24Z.</p></div>
<h2>Windbudgetten op twee kernen</h2>${table(measurements.filter((r: any) => !r.id.startsWith('baseline-')))}
<button id="play">Vier films vanaf het begin afspelen</button><button id="pause">Pauzeren</button><label>Zelfde bronframe <input id="frame" type="range" min="0" max="296" value="0"><output id="number">0</output></label>
<div class="grid">${probes.map(p => `<section><h2>${p.title}</h2><video controls loop muted playsinline preload="metadata" poster="${p.id}/night.png" src="${p.id}/media/wind-loop.mp4"></video><p>${(p.bytes / 1e6).toFixed(3)} MB · <a href="${p.id}/media/wind-loop.mp4" download>MP4</a> · <a href="${p.id}/media/media.json">Faseprofiel</a> · <a href="receipts/${p.id}.txt">Exact commando + meting</a></p><p class="muted">Regen ${p.layers.rain ? 'aan' : 'uit'} · drukcontouren, labels en H/L ${p.layers.pressure ? 'aan' : 'uit'}</p></section>`).join('')}</div>
<h2>Budgetten van alle standaardmodi · 5,6 fps</h2>${table(measurements.filter((r: any) => r.id.startsWith('baseline-')))}<p>${measurements.filter((r: any) => r.id.startsWith('baseline-')).map((r: any) => `<a href="${r.media}">${titles[r.id]} profiel</a> · <a href="${r.receipt}">meting</a>`).join(' · ')}</p>
<h2>Dezelfde dag- en nachtbeelden</h2><p>Dag: bronframe 48 (08:35 Amsterdam). Nacht: bronframe 0 (07:35). Klik voor de oorspronkelijke 960×1224 pixels.</p><div class="grid">${probes.map(p => `<section><h3>${p.title}</h3><div class="images">${['day', 'night'].map(theme => `<figure><a href="${p.id}/${theme}.png"><img loading="lazy" src="${p.id}/${theme}.png" width="960" height="1224" alt="${p.title} ${theme}"></a><figcaption>${theme === 'day' ? 'Dag' : 'Nacht'}</figcaption></figure>`).join('')}</div></section>`).join('')}</div>
<h2>Zes opeenvolgende bewegingsframes op 100%</h2><p>Frames 96–101; kaarttijd 09:35…09:41:15. Dezelfde 320×240-uitsnede, zonder schaling. Lees links naar rechts, dan de onderste rij.</p>${probes.map(p => `<h3>${p.title}</h3><div class="scroll native"><a href="${p.id}/motion.png"><img src="${p.id}/motion.png" width="960" height="480" alt="Zes bewegingsframes: ${p.title}"></a></div>`).join('')}
<h2>Dezelfde gekozen schuifklok op 100%</h2><p>Acht opeenvolgende frames; vier frames per klokwaarde bij deze proef. Dezelfde U76-curve.</p>${probes.map(p => `<h3>${p.title}</h3><div class="scroll native"><a href="${p.id}/clock.png"><img src="${p.id}/clock.png" width="1760" height="160" alt="Acht klokframes: ${p.title}"></a></div>`).join('')}
<h2>Kopieerbare Nix-pakketten</h2><p>Elke closure bevat de renderer, ffmpeg, ELF-runtime, kaartplaten en het proefplan. De links onder de proefmappen houden de pakketten bereikbaar voor garbage collection. Alleen op de dev-host gebouwd; geen VM- of prod-acties.</p>${probes.map(p => `<p><strong>${p.title}</strong><br><code>${p.store}</code></p>`).join('')}<p><a href="packages.json">Pakketten en bronfingerprints</a> · <a href="measurements.json">Alle metingen + exacte commando's</a> · <a href="review.json">Reviewgegevens</a> · <a href="../round4/index.html">U76 + tempo oplevering</a></p>
<script>const films=[...document.querySelectorAll('video')];document.getElementById('play').onclick=()=>films.forEach(v=>{v.currentTime=0;v.play()});document.getElementById('pause').onclick=()=>films.forEach(v=>v.pause());document.getElementById('frame').oninput=e=>{document.getElementById('number').value=e.target.value;films.forEach(v=>{v.pause();v.currentTime=Number(e.target.value)/7.5})};</script></main></html>`)
console.log(JSON.stringify({ page: resolve(root, 'index.html'), probes: probes.length, images: probes.length * 4, exit: 0 }))
