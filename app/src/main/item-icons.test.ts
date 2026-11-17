import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { gameFolderFrom, openClientFiles, registryInstallPath, type ClientFiles } from './client-files'
import { itemIconFile, itemIconLooked, itemIcons } from './item-icons'
import { servedFile } from './tiles'

const real = gameFolderFrom([registryInstallPath()])
const PNG = '89504e47'

test('an item picture is served from the folder of the build, and nothing else is', () => {
  expect(servedFile('/b', '/items/159.png')).toBe(join('/b', 'items', '159.png'))
  expect(servedFile('/b', '/items/../x.png')).toBeNull()
  expect(servedFile('/b', '/items/12345678.png')).toBeNull()
})

// Water, linen cloth, the hearthstone, and an item of Forever's own.
test.skipIf(!real)('the real game gives the pictures of items once; then they come from the folder, without the game', () => {
  const folder = mkdtempSync(join(tmpdir(), 'twinmap-items-'))
  let opened = 0
  let files: ClientFiles | undefined
  const make = itemIcons(() => (opened++, (files ??= openClientFiles(real!))), folder)
  for (const item of [159, 2589, 6948, 255716]) {
    expect(make(item), `item ${item}`).toBe(true)
    expect(readFileSync(itemIconFile(folder, item)).subarray(0, 4).toString('hex')).toBe(PNG)
  }
  expect(make(1)).toBe(false) // no such item
  expect(itemIconLooked(folder, 1)).toBe(true)

  // Another run of the app: what was made and what is missing are known without opening the game.
  const again = itemIcons(() => {
    throw new Error('the game was opened again')
  }, folder)
  for (const item of [159, 2589, 6948, 255716]) expect(again(item)).toBe(true)
  expect(again(1)).toBe(false)
  expect(opened).toBeGreaterThan(0)
})
