// The pictures of the items, from the player's own game: made the first time a screen asks for one
// and kept as PNG files in <folder>/items, beside the tiles of the build, so the game's archive is
// opened for an item once. An item with no picture the game can give gets an empty <item>.none, and
// is not looked for again. Nothing of them is in the app (product.md, M10-F1).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeBlpCutout } from '../shared/blp'
import { readTable } from '../shared/wdc5'
import type { ClientFiles } from './client-files'
import { encodePng } from './png'

export const ITEMS_FOLDER = 'items'
const ITEM_FILE = 841626, ITEM_ICON = 7 // the table of the items, and its column with the number of the picture (icons.ts)

/** Where an item's picture is kept, and the mark of an item that has none. */
export const itemIconFile = (folder: string, item: number): string => join(folder, ITEMS_FOLDER, `${item}.png`)
const noneFile = (folder: string, item: number): string => join(folder, ITEMS_FOLDER, `${item}.none`)

/** Whether the picture of an item was already looked for: made, or known to be missing. */
export const itemIconLooked = (folder: string, item: number): boolean => existsSync(itemIconFile(folder, item)) || existsSync(noneFile(folder, item))

/**
 * A maker of item pictures for one build. files: the game's archive, opened when first needed.
 * The table of the items is read once, at the first item asked. Gives back whether the picture is there.
 */
export function itemIcons(files: () => ClientFiles, folder: string): (item: number) => boolean {
  let pictures: Map<number, number> | null = null
  return (item) => {
    if (existsSync(itemIconFile(folder, item))) return true
    if (existsSync(noneFile(folder, item))) return false
    mkdirSync(join(folder, ITEMS_FOLDER), { recursive: true })
    try {
      if (!pictures) {
        const table = files().read(ITEM_FILE, true)
        pictures = new Map(table ? readTable(table).rows.map((r) => [r.id, r.int(ITEM_ICON)]) : [])
      }
      const picture = pictures.get(item), f = picture ? files().read(picture) : null
      if (f) {
        const { width, height, rgba } = decodeBlpCutout(f)
        writeFileSync(itemIconFile(folder, item), encodePng(rgba, width, height, 4))
        return true
      }
    } catch {
      // A picture stored some other way, or kept hidden: the item goes without.
    }
    writeFileSync(noneFile(folder, item), '')
    return false
  }
}
