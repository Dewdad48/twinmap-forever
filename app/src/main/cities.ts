// Darrell's fork: the game's own maps of the capital cities (its world map's pictures of them), laid
// over the 2D map where each city lies, so a city's streets and buildings read clearly. From the
// player's own game files, as the rest of the map is.
//
// A city's map (UiMap) has a picture (UiMapXMapArt → UiMapArt), drawn in tiles of 256 pixels
// (UiMapArtTile: row, column, layer, file) and cut to the size its style gives (UiMapArtStyleLayer,
// 1002 x 668 for every city of this game). Where it lies in the world is the map's rectangle (maps.ts).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeBlpCutout } from '../shared/blp'
import type { GameMap } from '../shared/maps'
import { MIDDLE_YARDS } from '../shared/inside'
import type { Table } from '../shared/wdc5'
import { encodePng } from './png'

export const CITIES_FILE = 'cities.json'
/** The tables, by their file in the game's archive: found by reading the real ones (build 1.60.1.71139). */
export const UI_MAP_X_MAP_ART = 1957217
export const UI_MAP_ART_TILE = 1957210
const TILE = 256
const WIDTH = 1002
const HEIGHT = 668
/** The capitals, by their name in the table of maps (English: the names in other languages are not matched). */
const CAPITALS = /^(Orgrimmar|Thunder Bluff|Undercity|Stormwind City|Ironforge|Darnassus)$/

/** A city's picture as kept: its map, its name, and where it lies (yards from the top left of the square: u east, v south). */
export interface CityMap { id: number; name: string; continent: number; box: [number, number, number, number] }

export function makeCities(maps: GameMap[], xart: Table, tiles: Table, read: (id: number) => Buffer | null, folder: string): CityMap[] {
  const artOf = new Map<number, number>()
  for (const r of xart.rows) if (r.parent !== undefined && !artOf.has(r.parent)) artOf.set(r.parent, r.int(1))
  const out: CityMap[] = []
  mkdirSync(join(folder, 'cities'), { recursive: true })
  for (const m of maps) {
    if (!CAPITALS.test(m.name) || !m.rect || m.continent === null) continue
    const art = artOf.get(m.id)
    const own = tiles.rows.filter((r) => r.parent === art && r.int(2) === 0)
    if (!art || !own.length) continue
    const rgba = new Uint8Array(WIDTH * HEIGHT * 4)
    for (const t of own) {
      const row = t.int(0), column = t.int(1)
      let img
      try {
        const b = read(t.int(3))
        if (!b) continue
        img = decodeBlpCutout(b)
      } catch {
        continue
      }
      for (let y = 0; y < img.height; y++) {
        const py = row * TILE + y
        if (py >= HEIGHT) break
        for (let x = 0; x < img.width; x++) {
          const px = column * TILE + x
          if (px >= WIDTH) break
          rgba.set(img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (py * WIDTH + px) * 4)
        }
      }
    }
    writeFileSync(join(folder, 'cities', `${m.id}.png`), encodePng(rgba, WIDTH, HEIGHT, 4))
    // The top left of the picture is the map's north-west corner: the most x (north) and the most y (west).
    const { minX, minY, maxX, maxY } = m.rect
    out.push({ id: m.id, name: m.name, continent: m.continent, box: [MIDDLE_YARDS - maxY, MIDDLE_YARDS - maxX, MIDDLE_YARDS - minY, MIDDLE_YARDS - minX] })
  }
  writeFileSync(join(folder, CITIES_FILE), JSON.stringify(out))
  return out
}
