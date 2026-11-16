// The height of the ground of a continent, from the game's terrain files: one "root ADT" a block
// (world.ts, terrainFiles), cut in 16 x 16 chunks ("MCNK"). Each chunk has its corner in the world
// and 145 heights over it ("MCVT"): 9 x 9 on a grid of 4.17 yards, and 8 x 8 in the middle of its
// squares. Kept here: the 9 x 9 of every chunk, joined into one grid of 129 x 129 a block, north
// row first, west column first. The middle ones are left out: for shade and shape a grid of 4
// yards is plenty, and it halves what is kept.
//
// ponytail: holes in the ground (cave mouths, under some buildings) are not read; the grid goes
// over them. Read the chunk's hole bits when the 3D view shows a lid on a cave.
import { BLOCK_YARDS } from './world'

/** Heights a side of a block. */
export const SIDE = 129
/** Yards between two heights. */
export const STEP = BLOCK_YARDS / (SIDE - 1)

/** The heights of one block, in yards, SIDE x SIDE from its north-west corner; NaN where a chunk is missing. null when the file is not a terrain file. */
export function blockHeights(adt: Buffer, column: number, row: number): Float32Array | null {
  const north = (32 - row) * BLOCK_YARDS, west = (32 - column) * BLOCK_YARDS
  const out = new Float32Array(SIDE * SIDE).fill(NaN)
  let chunks = 0
  for (let at = 0; at + 8 <= adt.length; ) {
    const tag = adt.toString('latin1', at, at + 4), size = adt.readUInt32LE(at + 4), end = at + 8 + size
    if (tag === 'KNCM' && size >= 128) {
      // The chunk's head is 128 bytes; its corner (x north, y west, z up) at 0x68.
      const h = at + 8, x = adt.readFloatLE(h + 0x68), y = adt.readFloatLE(h + 0x6c), z = adt.readFloatLE(h + 0x70)
      const r0 = Math.round((north - x) / STEP), c0 = Math.round((west - y) / STEP)
      for (let sub = h + 128; sub + 8 <= end; sub += 8 + adt.readUInt32LE(sub + 4)) {
        if (adt.toString('latin1', sub, sub + 4) !== 'TVCM' || adt.readUInt32LE(sub + 4) < 145 * 4) continue
        // Rows of 9 and of 8 in turn: the 9s are the grid.
        for (let r = 0; r <= 8; r++) {
          for (let c = 0; c <= 8; c++) {
            const gr = r0 + r, gc = c0 + c
            if (gr >= 0 && gr < SIDE && gc >= 0 && gc < SIDE) out[gr * SIDE + gc] = z + adt.readFloatLE(sub + 8 + (r * 17 + c) * 4)
          }
        }
        chunks++
        break
      }
    }
    at = end
  }
  return chunks ? out : null
}

/** A block's heights as kept on disk: whole quarters of a yard, two bytes each, -32768 where there is none. */
export function packHeights(h: Float32Array): Buffer {
  const out = Buffer.alloc(h.length * 2)
  h.forEach((v, i) => out.writeInt16LE(Number.isNaN(v) ? -32768 : Math.max(-32767, Math.min(32767, Math.round(v * 4))), i * 2))
  return out
}

export function unpackHeights(b: Buffer): Float32Array {
  const out = new Float32Array(b.length / 2)
  for (let i = 0; i < out.length; i++) {
    const v = b.readInt16LE(i * 2)
    out[i] = v === -32768 ? NaN : v / 4
  }
  return out
}

/** The height at a point of the world inside a block, between the four heights around it; NaN where there is none. */
export function heightAt(h: Float32Array, column: number, row: number, x: number, y: number): number {
  const fr = ((32 - row) * BLOCK_YARDS - x) / STEP, fc = ((32 - column) * BLOCK_YARDS - y) / STEP
  const r = Math.min(SIDE - 2, Math.max(0, Math.floor(fr))), c = Math.min(SIDE - 2, Math.max(0, Math.floor(fc)))
  const a = fr - r, b = fc - c, at = (i: number, j: number): number => h[(r + i) * SIDE + c + j]!
  return (at(0, 0) * (1 - b) + at(0, 1) * b) * (1 - a) + (at(1, 0) * (1 - b) + at(1, 1) * b) * a
}
