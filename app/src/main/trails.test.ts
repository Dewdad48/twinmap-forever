import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { navFrom } from '../shared/nav-data'
import { Trails } from './trails'
import { walker, type Yards } from './walk'

const shipped = navFrom(readFileSync(join(__dirname, '..', '..', 'resources', 'nav', 'nav0.json'), 'utf8'))!
const GOLDSHIRE: Yards = [-9459, 43], NORTHSHIRE: Yards = [-8914, -135]
const crow = (a: Yards, b: Yards): number => Math.hypot(a[0] - b[0], a[1] - b[1])
// How far a point is from a line of points, at its nearest.
const off = (p: Yards, line: Yards[]): number => Math.min(...line.map((q) => crow(p, q)))

// The character walked a way, a point every half second at a run.
const ground = walker(shipped)
function walk(trails: Trails, through: Yards[], t0 = 0): number {
  let t = t0
  for (let i = 1; i < through.length; i++) {
    const a = through[i - 1]!, b = through[i]!, steps = Math.ceil(crow(a, b) / 3.5)
    for (let s = 0; s <= steps; s++) {
      const p: Yards = [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]
      trails.walked(p[0], p[1], ground.heights(p)[0], (t += 500))
    }
  }
  return t
}

test('a way the player walked is the way found, rather than the road', () => {
  const plain = walker(shipped)(GOLDSHIRE, NORTHSHIRE)!
  // A way of its own, well west of the road the grid prefers.
  const mine: Yards[] = [GOLDSHIRE, [-9300, -180], [-9100, -250], NORTHSHIRE]
  const ahead = walker(shipped, (() => { const t = new Trails(); walk(t, mine); return t })())
  const walked = ahead(GOLDSHIRE, NORTHSHIRE)!
  const dense: Yards[] = []
  for (let i = 1; i < mine.length; i++) for (let f = 0; f <= 1; f += 0.02) dense.push([mine[i - 1]![0] + (mine[i]![0] - mine[i - 1]![0]) * f, mine[i - 1]![1] + (mine[i]![1] - mine[i - 1]![1]) * f])
  const far = (w: { points: Yards[] }): number => Math.max(...w.points.map((p) => off(p, dense)))
  expect(far(walked), 'on the trail').toBeLessThan(15)
  expect(far(plain), 'the plain way is elsewhere').toBeGreaterThan(40)
})

test('what was walked before the finder was made counts, and what is walked after it too', () => {
  const t = new Trails(), find = walker(shipped, t)
  expect(find(GOLDSHIRE, NORTHSHIRE)).not.toBeNull()
  walk(t, [GOLDSHIRE, [-9300, -180], [-9100, -250], NORTHSHIRE])
  const pts = find(GOLDSHIRE, NORTHSHIRE)!.points
  expect(pts.some((p) => crow(p, [-9300, -180]) < 30)).toBe(true)
})

test('a jump (a portal, a hearth) is no way walked, and the trails are kept in a file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'trails-')), 'trails0.json')
  const t = new Trails(file)
  t.walked(0, 0, 10, 0)
  t.walked(2, 0, 10, 500)
  t.walked(500, 500, 10, 1000) // a jump
  t.save()
  const again = new Trails(file)
  expect(again.size).toBe(t.size)
  const v = again.view(([x, y]) => [Math.floor(x / 8), Math.floor(y / 8)], 100000)
  expect(v.at(0, 0)?.[0]?.n).toBeGreaterThan(0)
  expect(v.at(62, 62)?.length).toBe(1)
  expect(v.linked(0, 0, 62, 62)).toBe(false)
})
