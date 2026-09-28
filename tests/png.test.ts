import { deflateSync, inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, whitePng } from '../lib/png'

/**
 * A PNG of white at varying opacity, from Node's own zlib (lib/png.ts), for the images
 * the server draws once at build: /market's order book poster is one, a mask
 * the page's colour shows through.
 */

/** The pixels of a grey-and-opacity PNG from `whitePng`, each row's filter undone by PNG's own rules. */
function decode(png: Buffer, w: number, h: number): Uint8Array {
  const len = png.readUInt32BE(33)
  const raw = inflateSync(png.subarray(41, 41 + len))
  const bpp = 2, stride = 1 + w * bpp
  const out = new Uint8Array(w * h * bpp)
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride]!
    for (let i = 0; i < w * bpp; i++) {
      const x = raw[y * stride + 1 + i]!
      const a = i >= bpp ? out[y * w * bpp + i - bpp]! : 0
      const b = y > 0 ? out[(y - 1) * w * bpp + i]! : 0
      const c = y > 0 && i >= bpp ? out[(y - 1) * w * bpp + i - bpp]! : 0
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c)
      out[y * w * bpp + i] = (x + pred) & 255
    }
  }
  return out
}

describe('the PNG encoder', () => {
  it('writes a well-formed file: the signature, and chunks whose checksums are right', () => {
    const png = whitePng(3, 2, new Uint8Array([0, 10, 20, 30, 40, 255]))
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    let o = 8
    const types: string[] = []
    while (o < png.length) {
      const len = png.readUInt32BE(o)
      const type = png.subarray(o + 4, o + 8)
      const body = png.subarray(o + 8, o + 8 + len)
      expect(png.readUInt32BE(o + 8 + len)).toBe(crc32(Buffer.concat([type, body])))
      types.push(type.toString('latin1'))
      o += 12 + len
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('carries the pixels it was given: white, each at its own opacity', () => {
    const png = whitePng(3, 2, new Uint8Array([0, 10, 20, 30, 40, 255]))
    const ihdr = png.subarray(16, 29)
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]]).toEqual([3, 2, 8, 4])
    // Grey and opacity a pixel, once each row's filter is undone.
    expect(Array.from(decode(png, 3, 2))).toEqual([255, 0, 255, 10, 255, 20, 255, 30, 255, 40, 255, 255])
  })

  it('checksums as the standard does: CRC-32 of "123456789" is CBF43926', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
})

describe('the PNG encoder’s filters', () => {
  it('chooses each row’s filter to shrink it, and the file decodes to exactly the pixels given', () => {
    // A smooth ramp across and down: what the order book's depth looks like, and what the filters are for.
    const w = 256, h = 73
    const op = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) op[y * w + x] = Math.min(255, Math.round(40 + y * 2.5 + ((x * 7) % 11)))
    const png = whitePng(w, h, op)
    const len = png.readUInt32BE(33)
    const raw = inflateSync(png.subarray(41, 41 + len))
    // Undo each row's filter (PNG's own rules, bytes of two per pixel) and compare.
    const bpp = 2, stride = 1 + w * bpp
    const out = new Uint8Array(w * h * bpp)
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    const filters = new Set<number>()
    for (let y = 0; y < h; y++) {
      const f = raw[y * stride]!
      filters.add(f)
      for (let i = 0; i < w * bpp; i++) {
        const x = raw[y * stride + 1 + i]!
        const a = i >= bpp ? out[y * w * bpp + i - bpp]! : 0
        const b = y > 0 ? out[(y - 1) * w * bpp + i]! : 0
        const c = y > 0 && i >= bpp ? out[(y - 1) * w * bpp + i - bpp]! : 0
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c)
        out[y * w * bpp + i] = (x + pred) & 255
      }
    }
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 2]).toBe(255)
      expect(out[i * 2 + 1]).toBe(op[i])
    }
    expect(filters.size).toBeGreaterThan(1)
    // And it is smaller than the same pixels unfiltered would be.
    expect(png.length).toBeLessThan(deflateSync(Buffer.from(Array.from({ length: h }, (_, y) => [0, ...Array.from({ length: w }, (_, x) => [255, op[y * w + x]!]).flat()]).flat()), { level: 9 }).length)
  })
})
