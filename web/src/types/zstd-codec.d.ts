declare module 'zstd-codec' {
  export const ZstdCodec: {
    run(callback: (zstd: { Simple: new () => { compress(data: Uint8Array, level?: number): Uint8Array } }) => void): void
  }
}
