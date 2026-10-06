import { deflateSync } from 'node:zlib'

/**
 * A PNG of white at varying opacity (color type 4, gray and opacity, eight bits each), for images the server draws
 * once at build and the page colors itself: a color flooded through it by an SVG filter shows at each pixel as much as
 * its opacity says, so one file serves both color schemes. Node's own zlib compresses it; nothing else is needed. Server
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

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * A `w` × `h` PNG of white, each pixel's opacity from `opacity` (row by row, top first). Each row is filtered with
 * whichever of PNG's five filters leaves it smallest by the usual measure (the least sum of its bytes as signed
 * differences), so a smooth image — a book's depth, rising away from the price — compresses to a fraction of its size.
 */
export function whitePng(w: number, h: number, opacity: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 4
  const bpp = 2, row = w * bpp
  const px = new Uint8Array(h * row)
  for (let i = 0; i < w * h; i++) {
    px[i * 2] = 255
    px[i * 2 + 1] = opacity[i]!
  }
  const raw = Buffer.alloc(h * (1 + row))
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(row))
  for (let y = 0; y < h; y++) {
    const at = y * row
    let best = 0, bestCost = Infinity
    for (let f = 0; f < 5; f++) {
      const out = cand[f]!
      let cost = 0
      for (let i = 0; i < row; i++) {
        const x = px[at + i]!
        const a = i >= bpp ? px[at + i - bpp]! : 0
        const b = y > 0 ? px[at - row + i]! : 0
        const c = y > 0 && i >= bpp ? px[at - row + i - bpp]! : 0
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c)
        const v = (x - pred) & 255
        out[i] = v
        cost += v < 128 ? v : 256 - v
      }
      if (cost < bestCost) {
        bestCost = cost
        best = f
      }
    }
    raw[y * (1 + row)] = best
    raw.set(cand[best]!, y * (1 + row) + 1)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
