// Keeps the heights of a continent's ground (shared/heights.ts) beside its tiles, once per build of
// the game, a file a block:
//   <folder>/heights/<column>/<row>.bin   SIDE x SIDE heights, packHeights, deflated.
//
// ponytail: not yet run by the tiles worker; nothing in the app uses the heights until the shaded
// relief (M16-F3). Call it from tiles-worker.ts then, after convertWorld.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { blockHeights, packHeights } from '../shared/heights'
import { BLOCKS, terrainFiles } from '../shared/world'
import { keep } from './tiles'

const MARKER = 'done.json'

export const heightsFile = (folder: string, column: number, row: number): string => join(folder, 'heights', String(column), `${row}.bin`)

/** Blocks kept and blocks the world lists that could not be read. A folder already done is left as it is. */
export function convertHeights(wdt: Buffer, read: (id: number) => Buffer | null, folder: string): { blocks: number; missing: number } {
  const marker = join(folder, 'heights', MARKER)
  if (existsSync(marker)) return { blocks: -1, missing: -1 }
  let blocks = 0, missing = 0
  for (const [block, file] of terrainFiles(wdt)) {
    const column = block % BLOCKS, row = Math.floor(block / BLOCKS)
    let h: Float32Array | null = null
    try {
      const adt = read(file)
      h = adt && blockHeights(adt, column, row)
    } catch {
      h = null
    }
    if (!h) {
      missing++
      continue
    }
    keep(heightsFile(folder, column, row), () => deflateSync(packHeights(h), { level: 9 }))
    blocks++
  }
  mkdirSync(join(folder, 'heights'), { recursive: true })
  writeFileSync(marker, JSON.stringify({ blocks, missing }))
  return { blocks, missing }
}
