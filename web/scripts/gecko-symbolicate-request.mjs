import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const [file, threadName, out] = process.argv.slice(2)
const p = JSON.parse(gunzipSync(readFileSync(file)))
const all = [], libs = []
const walk = (q) => { for (const t of q.threads) all.push(Object.assign(t, { libs: q.libs ?? [] })); for (const c of q.processes ?? []) walk(c) }
walk(p)
const tab = (t) => t.data.map((r) => Object.fromEntries(Object.entries(t.schema).map(([k, i]) => [k, r[i]])))
const t = all.filter((x) => x.name === threadName).sort((a, b) => b.samples.data.length - a.samples.data.length)[0]; libs.push(...t.libs)
const samples = tab(t.samples), stacks = tab(t.stackTable), frames = tab(t.frameTable)
const fname = (f) => t.stringTable[frames[f].location]
const incl = new Map(), self = new Map(); let total = 0
for (const s of samples) {
  const w = s.threadCPUDelta ?? 0; if (s.stack == null || !w) continue; total += w
  let st = s.stack; const leaf = fname(stacks[st].frame); self.set(leaf, (self.get(leaf) ?? 0) + w)
  const seen = new Set()
  while (st != null) { const n = fname(stacks[st].frame); if (!seen.has(n)) { seen.add(n); incl.set(n, (incl.get(n) ?? 0) + w) } st = stacks[st].prefix }
}
const top = [...new Set([...[...incl].sort((a, b) => b[1] - a[1]).slice(0, 80), ...[...self].sort((a, b) => b[1] - a[1]).slice(0, 40)].map(([n]) => n))].filter((n) => n.startsWith('0x'))
const usedLibs = [], jobs = []
for (const a of top) {
  const addr = BigInt(a)
  const li = libs.findIndex((l) => addr >= BigInt(l.start) && addr < BigInt(l.end))
  if (li < 0 || !/^[\w.+-]+$/.test(libs[li].debugName ?? "") || !libs[li].breakpadId) continue
  const l = libs[li]
  let idx = usedLibs.findIndex((u) => u[0] === l.debugName && u[1] === l.breakpadId)
  if (idx < 0) { usedLibs.push([l.debugName, l.breakpadId]); idx = usedLibs.length - 1 }
  jobs.push({ a, frame: [idx, Number(addr - BigInt(l.start) + BigInt(l.offset ?? 0))] })
}
writeFileSync(out, JSON.stringify({ jobs: [{ memoryMap: usedLibs, stacks: [jobs.map((j) => j.frame)] }] }))
writeFileSync(out + '.meta.json', JSON.stringify({ total, addrs: jobs.map((j) => j.a), incl: Object.fromEntries(incl), self: Object.fromEntries(self) }))
console.log(usedLibs, jobs.length)
