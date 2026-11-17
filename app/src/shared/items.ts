// The Items section: bags, bank, keyring and what is worn by a character, from the sheet the app
// keeps (sheet.ts), with what the game's own tables say of each item: name, quality, what a vendor
// gives for it, its type. Those come from the player's game (items.json, made beside the map by
// tiles-worker.ts): ItemSparse with the rows the server has sent over it, and Item for the type.
import type { Sheet, Sheets } from './sheet'
import type { Table } from './wdc5'

export const ITEMS_FILE = 'items.json'
export const ITEM_FILE = 841626 // class column 0, subclass column 1
export const ITEM_SPARSE_FILE = 1572924
export const ITEM_SPARSE_TABLE = 0x919be54e // its number among the server's rows (DBCache.bin)
export const ITEM_SPARSE_TEXTS = [0, 1, 2, 3, 4] // description and the four names
const NAME = 4, SELL = 22, QUALITY = 66

/** By the item's number: name, quality (0 poor to 7), sell price in copper, class, subclass. */
export type ItemFacts = Record<string, [string, number, number, number, number]>

/** What the game's tables say of every item. hotfixes: the server's rows of ItemSparse (null where taken away). */
export function itemFacts(item: Table, sparse: Table, hotfixes: Map<number, Buffer | null>): ItemFacts {
  const kind = new Map(item.rows.map((r) => [r.id, [r.int(0), r.int(1)] as const]))
  const rows = new Map(sparse.rows.map((r) => [r.id, r]))
  for (const [id, record] of hotfixes) {
    if (!record) rows.delete(id)
    else
      try {
        rows.set(id, sparse.rowOf!(id, record))
      } catch {
        // A row of some other shape: the game's own stays.
      }
  }
  const out: ItemFacts = {}
  for (const [id, r] of rows) {
    try {
      const [cls, sub] = kind.get(id) ?? [-1, 0]
      out[id] = [r.text(NAME), r.int(QUALITY), Math.max(0, r.int(SELL)), cls, sub]
    } catch {
      // A row cut short: the item goes without its facts.
    }
  }
  return out
}

// The names the game gives the classes of items, and the subclasses of weapons and armour.
const CLASSES = ['Consumable', 'Container', 'Weapon', 'Gem', 'Armor', 'Reagent', 'Projectile', 'Trade Goods', 'Item Enhancement', 'Recipe', 'Money', 'Quiver', 'Quest', 'Key', 'Permanent', 'Miscellaneous']
const WEAPONS = ['Axe', 'Axe', 'Bow', 'Gun', 'Mace', 'Mace', 'Polearm', 'Sword', 'Sword', 'Warglaive', 'Staff', 'Exotic', 'Exotic', 'Fist Weapon', 'Miscellaneous', 'Dagger', 'Thrown', 'Spear', 'Crossbow', 'Wand', 'Fishing Pole']
const ARMOR = ['Miscellaneous', 'Cloth', 'Leather', 'Mail', 'Plate', 'Cosmetic', 'Shield', 'Libram', 'Idol', 'Totem', 'Sigil', 'Relic']

/** "Armor · Cloth", "Weapon · Staff", "Trade Goods"; "Other" for what the game does not say. */
export function typeOf(cls: number, sub: number): string {
  if (cls === 2 && WEAPONS[sub]) return `Weapon · ${WEAPONS[sub]}`
  if (cls === 4 && ARMOR[sub]) return `Armor · ${ARMOR[sub]}`
  return CLASSES[cls] ?? 'Other'
}

export type Place = 'Bags' | 'Bank' | 'Worn' | 'Keyring'
export const PLACES: Place[] = ['Bags', 'Bank', 'Worn', 'Keyring']
const KEYRING = -1 // the keyring's container on Forever (Sheet.lua)

export interface ItemRow {
  id: number
  place: Place
  /** How many: stacks of the same item in the same place add up. */
  n: number
  name: string
  /** 0 poor to 7; 1 when the game does not say. */
  quality: number
  type: string
  /** What a vendor gives for all of them, in copper; 0 for what cannot be sold. */
  value: number
}

type Held = { b?: unknown; s?: unknown }
const slotsOf = (piece: unknown): { bag: number; item: number; n: number }[] =>
  (Array.isArray(piece) ? (piece as Held[]) : []).flatMap((c) =>
    Array.isArray(c?.s) ? (c.s as unknown[]).filter(Array.isArray).map((s) => ({ bag: Number(c.b), item: Number(s[1]), n: Number(s[2]) || 1 })) : [],
  )

/** One row for each item in each place of a sheet. */
export function itemRows(sheet: Sheet, facts: ItemFacts): ItemRow[] {
  const rows = new Map<string, ItemRow>()
  const add = (place: Place, id: number, n: number): void => {
    if (!Number.isInteger(id) || id <= 0) return
    const had = rows.get(`${place} ${id}`)
    if (had) return void (had.n += n)
    const [name, quality, sell, cls, sub] = facts[id] ?? [`Item ${id}`, 1, 0, -1, 0]
    rows.set(`${place} ${id}`, { id, place, n, name, quality, type: typeOf(cls, sub), value: sell })
  }
  for (const s of slotsOf(sheet.pieces.bags)) add(s.bag === KEYRING ? 'Keyring' : 'Bags', s.item, s.n)
  for (const s of slotsOf(sheet.pieces.bank)) add('Bank', s.item, s.n)
  for (const g of Array.isArray(sheet.pieces.gear) ? sheet.pieces.gear : []) if (Array.isArray(g)) add('Worn', Number(g[1]), 1)
  // The sell price is of one: the row is worth all of them.
  return [...rows.values()].map((r) => ({ ...r, value: r.value * r.n }))
}

export type Column = 'name' | 'type' | 'place' | 'n' | 'value'

/** The rows sorted by a column; ties by name. up: smallest first (A to Z). */
export function sortRows(rows: ItemRow[], column: Column, up: boolean): ItemRow[] {
  const by = (a: ItemRow, b: ItemRow): number => {
    const x = a[column], y = b[column]
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
  }
  return [...rows].sort((a, b) => (up ? by(a, b) : by(b, a)) || a.name.localeCompare(b.name))
}

/** The rows whose name or type holds every word typed. */
export function filterRows(rows: ItemRow[], typed: string): ItemRow[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((r) => words.every((w) => r.name.toLowerCase().includes(w) || r.type.toLowerCase().includes(w)))
}

/** The other characters that hold what is typed: who, and the rows found. */
export function othersHolding(sheets: Sheets, shown: string, facts: ItemFacts, typed: string): { key: string; rows: ItemRow[] }[] {
  if (!typed.trim()) return []
  return Object.entries(sheets)
    .filter(([key]) => key !== shown)
    .map(([key, sheet]) => ({ key, rows: filterRows(itemRows(sheet, facts), typed) }))
    .filter((o) => o.rows.length > 0)
}

/** Copper as gold, silver and copper: [amount, "g" | "s" | "c"], the empty ones left out. */
export function coins(copper: number): [number, 'g' | 's' | 'c'][] {
  const out: [number, 'g' | 's' | 'c'][] = [[Math.floor(copper / 10000), 'g'], [Math.floor(copper / 100) % 100, 's'], [copper % 100, 'c']]
  return out.filter(([n]) => n > 0)
}

/** The colours the game gives the qualities, poor to heirloom. */
export const QUALITY_COLORS = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#00ccff']
