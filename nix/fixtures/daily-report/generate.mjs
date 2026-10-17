import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.argv[2]
await Promise.all(['stats', 'telegram', 'report'].map((directory) => mkdir(join(root, directory), { recursive: true })))
async function save(directory, name, value) {
  await writeFile(join(root, directory, `${name}.json`), `${JSON.stringify(value)}\n`)
}
for (let index = 10; index <= 17; index++) {
  const day = `2026-10-${index}`
  const current = index === 17
  const beacons = current ? 34 : 20
  const feature = (count) => ({ n: count, pct: Math.round(count * 1000 / beacons) / 10 })
  await save('stats', day, {
    day, sessions: current ? 41 : 28, beacons, rejected: 0,
    features: { scrub: feature(current ? 24 : 10), pinAir: feature(current ? 4 : 2), pin: feature(current ? 3 : 1), tg: feature(current ? 5 : 2) },
    dimensions: { coarse: { true: feature(current ? 25 : 14), false: feature(current ? 9 : 6) } },
  })
  await save('telegram', day, {
    day, users: current ? 6 : 4, ...(current ? { usersLowerBound: true } : {}),
    commands: { weer: current ? 9 : 4, regen: current ? 3 : 2, wind: current ? 2 : 1 },
    inline: current ? 3 : 1, timeButtons: current ? 11 : 4, placeButtons: current ? 2 : 1,
    chats: { private: current ? 25 : 12, group: current ? 5 : 2 },
  })
}
await save('report', '2026-10-16-channel', { day: '2026-10-16', members: 21 })
await save('report', '2026-10-17-channel', { day: '2026-10-17', members: 23 })
await save('report', '2026-10-17-cloudflare', { uniques: 90, pageViews: 120, requests: 1000, frRequests: 750 })
