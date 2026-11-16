import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { BLOCK_YARDS } from '../shared/world'
import { convertHeights, heightsDone, heightsFile, shadeFile } from './heights'
import { servedFile } from './tiles'

const chunk = (tag: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8)
  head.write(tag, 'latin1')
  head.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, data])
}

test('a continent gets its heights and its relief, down to the tile of the whole world, once', () => {
  // One block, 32 48, with one chunk of level ground in its corner; file 7 is its terrain.
  const maid = Buffer.alloc(64 * 64 * 32)
  maid.writeUInt32LE(7, (48 * 64 + 32) * 32)
  maid.writeUInt32LE(8, (48 * 64 + 33) * 32) // listed, but the game has no such file
  const head = Buffer.alloc(128)
  head.writeFloatLE((32 - 48) * BLOCK_YARDS, 0x68)
  head.writeFloatLE(0, 0x6c)
  const adt = chunk('KNCM', Buffer.concat([head, chunk('TVCM', Buffer.alloc(145 * 4))]))
  const folder = mkdtempSync(join(tmpdir(), 'heights-'))
  try {
    const steps: number[] = []
    expect(convertHeights(chunk('DIAM', maid), (id) => (id === 7 ? adt : null), folder, (done) => steps.push(done))).toEqual({ blocks: 1, missing: 1 })
    expect(steps.at(-1)).toBe(3)
    expect(existsSync(heightsFile(folder, 32, 48))).toBe(true)
    for (const zoom of [6, 3, 0]) expect(existsSync(shadeFile(folder, zoom, 32 >> (6 - zoom), 48 >> (6 - zoom))), `zoom ${zoom}`).toBe(true)
    expect(existsSync(shadeFile(folder, 6, 33, 48))).toBe(false)
    expect(heightsDone(folder)).toBe(true)
    expect(convertHeights(chunk('DIAM', maid), () => null, folder)).toEqual({ blocks: -1, missing: -1 })
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('the relief is served from its folder, and nothing beside it', () => {
  const base = join(tmpdir(), 'build')
  expect(servedFile(base, '/azeroth/shade/6/32/48.png')).toBe(shadeFile(join(base, 'azeroth'), 6, 32, 48))
  for (const path of ['/azeroth/shade/../6/1/1.png', '/azeroth/heights/32/48.bin', '/azeroth/shade/12/1/1.png']) expect(servedFile(base, path), path).toBeNull()
})
