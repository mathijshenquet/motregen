import { expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { encodeStill } from './encode.js'
import { FRAME_PIXELS } from './config.js'

it('encodes a complete native frame as a JPEG at the original dimensions and rejects incomplete pixels', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-native-still-'))
  try {
    const frame = join(directory, 'frame.ppm'), destination = join(directory, 'still.jpg.tmp')
    const header = Buffer.from(`P6\n${FRAME_PIXELS.width} ${FRAME_PIXELS.height}\n255\n`)
    await writeFile(frame, Buffer.concat([header, Buffer.alloc(FRAME_PIXELS.width * FRAME_PIXELS.height * 3, 100)]))
    await encodeStill(frame, destination)
    const metadata = await sharp(destination).metadata()
    expect(metadata.format).toBe('jpeg')
    expect({ width: metadata.width, height: metadata.height }).toEqual(FRAME_PIXELS)
    await writeFile(frame, header)
    await expect(encodeStill(frame, destination)).rejects.toThrow('Ongeldig native stillframe')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
