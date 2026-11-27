// The ways the player has walked: where the character went on foot, kept by continent, so that
// the ways found on the walking grid (walk.ts) keep to them. A place walked is a place that can be
// walked, whatever the grid says; and a step between two places walked one after the other is a
// step that can be taken. The grid of Shortest Path Forever is cut in cells of about 8 yards and
// made ahead of time; what the character walks is the game itself.
//
// Kept in cells of CELL yards, a cell for each floor (heights in bands of BAND yards): how many
// times the character was there and where on average, and the steps from cell to cell. Only the
// player's own computer keeps it, in the app's folder.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { Yards } from './walk'

const CELL = 4 // yards
const BAND = 6 // yards of height to a floor
const OFF = 5000 // cells: the world is some 34,000 yards across, 8,500 cells
const SPAN = 10_000
const BANDS = 2000
const LONGEST = 30 // yards between two points for the way between them to count as walked: more is a jump (a portal, a hearth)
const SLOWEST = 3000 // ms between two points for the same
const EVERY = 2 // yards between the points put down along a way walked

export interface TrailCell { n: number; x: number; y: number; z: number }

/** What a finder of ways sees of the trails: by its own cells. */
export interface TrailView {
  /** The floors walked on a cell of the grid: where on average, and how high. */
  at: (gx: number, gy: number) => TrailCell[] | undefined
  /** Whether the character walked straight from one cell of the grid to the next. */
  linked: (gx: number, gy: number, tx: number, ty: number) => boolean
}

const keyOf = (x: number, y: number, z: number): number => ((Math.floor(x / CELL) + OFF) * SPAN + (Math.floor(y / CELL) + OFF)) * BANDS + (Math.round(z / BAND) + BANDS / 2)
const spot = (k: number): number => Math.floor(k / BANDS)

export class Trails {
  private cells = new Map<number, { n: number; sx: number; sy: number; sz: number }>()
  private links = new Set<string>()
  private views: { cellOf: (p: Yards) => [number, number]; width: number; at: Map<number, Map<number, TrailCell>>; lists: Map<number, TrailCell[]>; links: Set<string> }[] = []
  private last: { x: number; y: number; z: number; t: number } | null = null
  dirty = false

  constructor(readonly file?: string) {
    if (!file) return
    try {
      const kept = JSON.parse(readFileSync(file, 'utf8')) as { v: number; cells: number[][]; links: string[] }
      if (kept.v !== 1) return
      for (const [k, n, sx, sy, sz] of kept.cells) this.cells.set(k!, { n: n!, sx: sx!, sy: sy!, sz: sz! })
      for (const l of kept.links) this.links.add(l)
    } catch {
      // none yet, or a file that does not read: start again
    }
  }

  get size(): number {
    return this.cells.size
  }

  /**
   * A point the character stood at, on foot, in yards of the world, with its height when known.
   * The way from the point before, when it is near enough in yards and time, counts as walked.
   */
  walked(x: number, y: number, z: number | undefined, t: number): void {
    const last = this.last
    const h = z ?? last?.z
    if (h === undefined) return // no height yet: which floor is not known
    this.last = { x, y, z: h, t }
    if (!last) return void this.put(x, y, h, null)
    const far = Math.hypot(x - last.x, y - last.y)
    if (far > LONGEST || t - last.t > SLOWEST) return void this.put(x, y, h, null)
    if (far < 0.5) return
    const steps = Math.max(1, Math.ceil(far / EVERY))
    let before = keyOf(last.x, last.y, last.z)
    for (let i = 1; i <= steps; i++) {
      const f = i / steps
      before = this.put(last.x + (x - last.x) * f, last.y + (y - last.y) * f, last.z + (h - last.z) * f, before)
    }
  }

  /** The character went off its feet: a flight, a portal, death. The next point starts afresh. */
  broken(): void {
    this.last = null
  }

  private put(x: number, y: number, z: number, before: number | null): number {
    const k = keyOf(x, y, z)
    const c = this.cells.get(k) ?? this.cells.set(k, { n: 0, sx: 0, sy: 0, sz: 0 }).get(k)!
    c.n++
    c.sx += x
    c.sy += y
    c.sz += z
    this.dirty = true
    for (const v of this.views) this.show(v, k, c)
    if (before !== null && spot(before) !== spot(k)) {
      const link = before < k ? `${before}:${k}` : `${k}:${before}`
      if (!this.links.has(link)) {
        this.links.add(link)
        for (const v of this.views) this.showLink(v, before, k)
      }
    }
    return k
  }

  private middleOf(k: number): Yards {
    const s = spot(k)
    return [(Math.floor(s / SPAN) - OFF + 0.5) * CELL, ((s % SPAN) - OFF + 0.5) * CELL]
  }

  private show(v: Trails['views'][number], k: number, c: { n: number; sx: number; sy: number; sz: number }): void {
    const [gx, gy] = v.cellOf([c.sx / c.n, c.sy / c.n])
    const g = gx * v.width + gy
    const floors = v.at.get(g) ?? v.at.set(g, new Map()).get(g)!
    floors.set(k, { n: c.n, x: c.sx / c.n, y: c.sy / c.n, z: c.sz / c.n })
    v.lists.delete(g)
  }

  private showLink(v: Trails['views'][number], a: number, b: number): void {
    const [ax, ay] = v.cellOf(this.middleOf(a)), [bx, by] = v.cellOf(this.middleOf(b))
    if ((ax === bx && ay === by) || Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1) return
    v.links.add(`${ax * v.width + ay}:${bx * v.width + by}`)
    v.links.add(`${bx * v.width + by}:${ax * v.width + ay}`)
  }

  /** The trails as a finder of ways on a grid sees them: its cell of a point, and how many cells a row has. */
  view(cellOf: (p: Yards) => [number, number], width: number): TrailView {
    const v = { cellOf, width, at: new Map<number, Map<number, TrailCell>>(), lists: new Map<number, TrailCell[]>(), links: new Set<string>() }
    this.views.push(v)
    for (const [k, c] of this.cells) this.show(v, k, c)
    for (const l of this.links) {
      const [a, b] = l.split(':').map(Number)
      this.showLink(v, a!, b!)
    }
    return {
      // Asked for every step a search weighs: the list is kept until the cell changes.
      at: (gx, gy) => {
        const g = gx * width + gy, kept = v.lists.get(g)
        if (kept) return kept
        const floors = v.at.get(g)
        if (!floors) return undefined
        const list = [...floors.values()]
        v.lists.set(g, list)
        return list
      },
      linked: (gx, gy, tx, ty) => v.links.has(`${gx * width + gy}:${tx * width + ty}`),
    }
  }

  /** Written when something new was walked: to a file beside it first, so a write cut short loses nothing kept. */
  save(): void {
    if (!this.file || !this.dirty) return
    const cells: number[][] = []
    for (const [k, c] of this.cells) cells.push([k, c.n, Math.round(c.sx * 10) / 10, Math.round(c.sy * 10) / 10, Math.round(c.sz * 10) / 10])
    writeFileSync(this.file + '.new', JSON.stringify({ v: 1, cells, links: [...this.links] }))
    renameSync(this.file + '.new', this.file)
    this.dirty = false
  }
}
