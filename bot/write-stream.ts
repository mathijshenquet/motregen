import type { Writable } from 'node:stream'

export function writeStream(stream: Writable, bytes: Uint8Array): Promise<void> {
  // Racing every write against a process-lifetime promise retains frame buffers until exit.
  return new Promise((resolve, reject) => {
    stream.write(bytes, (error) => error ? reject(error) : resolve())
  })
}
