import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, whitePng } from '../lib/png'

/**
 * A PNG of white at varying opacity, from Node's own zlib (lib/png.ts), for the images
 * the server draws once at build: /market's order book poster is one, a mask
 * the page's colour shows through.
 */

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
    const len = png.readUInt32BE(33)
    const raw = inflateSync(png.subarray(41, 41 + len))
    // Each row: a filter byte (none), then grey and opacity a pixel.
    expect(Array.from(raw)).toEqual([0, 255, 0, 255, 10, 255, 20, 0, 255, 30, 255, 40, 255, 255])
  })

  it('checksums as the standard does: CRC-32 of "123456789" is CBF43926', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
})
