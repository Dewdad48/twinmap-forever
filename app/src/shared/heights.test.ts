import { expect, test } from 'vitest'
import { blockHeights, FLAT, heightAt, packHeights, shadeOfBlock, SHADE_PIXELS, SIDE, STEP, unpackHeights } from './heights'
import { BLOCK_YARDS, terrainFiles } from './world'

const chunk = (tag: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8)
  head.write(tag, 'latin1')
  head.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, data])
}

// A terrain file with one chunk, the third down and the fourth across of block 32, 48 (Elwynn), 100 yards up; its grid
// heights are 10 a row down and 1 a column across, the ones in the middle of its squares 999 (left out).
function oneChunk(): Buffer {
  const head = Buffer.alloc(128)
  head.writeFloatLE((32 - 48) * BLOCK_YARDS - 2 * 8 * STEP, 0x68)
  head.writeFloatLE(-3 * 8 * STEP, 0x6c)
  head.writeFloatLE(100, 0x70)
  const mcvt = Buffer.alloc(145 * 4)
  for (let i = 0; i < 145; i++) {
    const r = Math.floor(i / 17), c = i % 17
    mcvt.writeFloatLE(c < 9 ? r * 10 + c : 999, i * 4)
  }
  return Buffer.concat([chunk('REVM', Buffer.alloc(4)), chunk('KNCM', Buffer.concat([head, chunk('VCCM', Buffer.alloc(16)), chunk('TVCM', mcvt)]))])
}

test('a chunk lands on its place in the block, the middle heights left out', () => {
  const h = blockHeights(oneChunk(), 32, 48)!
  expect(h.length).toBe(SIDE * SIDE)
  expect(h[16 * SIDE + 24]).toBe(100)
  expect(h[(16 + 8) * SIDE + 24 + 8]).toBe(188)
  expect(h[(16 + 3) * SIDE + 24 + 5]).toBe(135)
  expect(h[0]).toBeNaN()
  expect(h.filter((v) => !Number.isNaN(v)).length).toBe(81)
})

test('a file with no ground in it is none', () => {
  expect(blockHeights(chunk('REVM', Buffer.alloc(4)), 32, 48)).toBeNull()
})

test('kept in quarters of a yard, and read between the heights', () => {
  const h = blockHeights(oneChunk(), 32, 48)!
  const back = unpackHeights(packHeights(h))
  expect(back[(16 + 1) * SIDE + 24 + 1]).toBe(111)
  expect(back[5]).toBeNaN()
  expect(unpackHeights(packHeights(Float32Array.of(12.3, -4.2)))).toEqual(Float32Array.of(12.25, -4.25))
  // Halfway between the first two rows and columns of the chunk: 100, 101, 110, 111.
  const x = (32 - 48) * BLOCK_YARDS - (16.5 * STEP), y = -(24.5 * STEP)
  expect(heightAt(h, 32, 48, x, y)).toBeCloseTo(105.5)
})

test('the terrain file of a block is the first of its eight in the world file', () => {
  const maid = Buffer.alloc(64 * 64 * 32)
  maid.writeUInt32LE(778027, (48 * 64 + 32) * 32)
  maid.writeUInt32LE(204493, (48 * 64 + 32) * 32 + 28)
  expect([...terrainFiles(chunk('DIAM', maid))]).toEqual([[48 * 64 + 32, 778027]])
})

test('the light comes from the north-west: ground rising to the east or the south faces it', () => {
  const plane = (east: number, south: number): Float32Array => Float32Array.from({ length: SIDE * SIDE }, (_, i) => 100 + (i % SIDE) * east + Math.floor(i / SIDE) * south)
  const middle = (h: Float32Array): number => shadeOfBlock((c, r) => (c === 32 && r === 48 ? h : null), 32, 48, 1)[128 * SHADE_PIXELS + 128]!
  expect(middle(plane(0, 0))).toBe(FLAT)
  expect(middle(plane(1, 0))).toBeGreaterThan(FLAT)
  expect(middle(plane(-1, 0))).toBeLessThan(FLAT)
  expect(middle(plane(0, 1))).toBeGreaterThan(FLAT)
  expect(middle(plane(0, -1))).toBeLessThan(FLAT)
})
