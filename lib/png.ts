import { deflateSync } from 'node:zlib'

/**
 * A PNG of white at varying opacity (colour type 4, grey and opacity, eight bits each), for images the server draws
 * once at build and the page colours itself: used as an SVG mask, the colour shows through each pixel as much as its
 * opacity says (white's luminance is 1), so one file serves both colour schemes. Node's own zlib compresses it; nothing else is needed. Server
 * only.
 */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32, as PNG's chunks carry it. */
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

/** A `w` × `h` PNG of white, each pixel's opacity from `opacity` (row by row, top first). */
export function whitePng(w: number, h: number, opacity: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 4
  const raw = Buffer.alloc(h * (1 + 2 * w))
  for (let y = 0; y < h; y++) {
    const o = y * (1 + 2 * w)
    raw[o] = 0
    for (let x = 0; x < w; x++) {
      raw[o + 1 + 2 * x] = 255
      raw[o + 2 + 2 * x] = opacity[y * w + x]!
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
