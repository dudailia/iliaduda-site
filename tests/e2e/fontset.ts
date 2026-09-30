import { readFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

/** WOFF2's known table tags, by the index its directory stores in place of a tag. */
const KNOWN = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

/**
 * The characters a WOFF2 font has glyphs for, read from its cmap (formats 4
 * and 12). A character outside it is drawn by whatever font the system falls
 * back to, in another face, weight and size.
 */
export function codepoints(path: string): Set<number> {
  const b = readFileSync(path)
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${path} is not WOFF2`)
  const tables = b.readUInt16BE(12)
  const compressed = b.readUInt32BE(20)
  let p = 48
  const base128 = () => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const c = b[p++]!
      v = v * 128 + (c & 0x7f)
      if (!(c & 0x80)) return v
    }
    throw new Error(`${path}: bad UIntBase128`)
  }
  const dir: { tag: string; length: number }[] = []
  for (let i = 0; i < tables; i++) {
    const flags = b[p++]!
    let tag = KNOWN[flags & 0x3f]!
    if ((flags & 0x3f) === 63) {
      tag = b.toString('latin1', p, p + 4)
      p += 4
    }
    const orig = base128()
    // glyf and loca are transformed unless marked 3; every other table only if marked non-zero.
    const version = flags >> 6
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    dir.push({ tag, length: transformed ? base128() : orig })
  }
  // The tables sit end to end in one Brotli stream, in the directory's order.
  const data = brotliDecompressSync(b.subarray(p, p + compressed))
  let at = 0
  for (const t of dir) {
    if (t.tag === 'cmap') return cmap(data.subarray(at, at + t.length))
    at += t.length
  }
  throw new Error(`${path} has no cmap`)
}

function cmap(c: Buffer): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < c.readUInt16BE(2); i++) {
    const off = c.readUInt32BE(8 + i * 8)
    const format = c.readUInt16BE(off)
    if (format === 4) {
      const n2 = c.readUInt16BE(off + 6)
      const ends = off + 14, starts = ends + n2 + 2, deltas = starts + n2, ranges = deltas + n2
      for (let s = 0; s < n2 / 2; s++) {
        const end = c.readUInt16BE(ends + 2 * s), start = c.readUInt16BE(starts + 2 * s)
        const delta = c.readInt16BE(deltas + 2 * s), range = c.readUInt16BE(ranges + 2 * s)
        for (let u = start; u <= end && u !== 0xffff; u++) {
          let g = range === 0 ? u : c.readUInt16BE(ranges + 2 * s + range + 2 * (u - start))
          if (range !== 0 && g === 0) continue
          g = (g + delta) & 0xffff
          if (g !== 0) out.add(u)
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < c.readUInt32BE(off + 12); g++) {
        const at = off + 16 + g * 12
        const first = c.readUInt32BE(at), last = c.readUInt32BE(at + 4), glyph = c.readUInt32BE(at + 8)
        for (let u = first; u <= last; u++) if (glyph + (u - first) !== 0) out.add(u)
      }
    }
  }
  return out
}
