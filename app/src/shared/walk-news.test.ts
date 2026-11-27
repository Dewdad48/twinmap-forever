import { expect, test } from 'vitest'
import { unitsOfWorld } from './geo'
import type { GameMap } from './maps'
import { walkNewsFrom } from './send'
import { walkNews, yardsOfUnits } from './walk-news'

const EK: GameMap = { id: 1415, name: 'Eastern Kingdoms', parent: 947, level: 'continent', continent: 0, rect: { minX: -15973, minY: -22569, maxX: 16486, maxY: 18172 }, area: 0 }
const at = (n: number, w: number): { x: number; y: number; z: number } => ({ ...unitsOfWorld(n, w), z: 60 })

test('map units and yards of the world go both ways', () => {
  const [n, w] = yardsOfUnits(unitsOfWorld(-9459, 43))
  expect(n).toBeCloseTo(-9459, 6)
  expect(w).toBeCloseTo(43, 6)
})

test('a walk on trails gives its points further on, apart, and none by the character', () => {
  const me = at(-9459, 43), pts = [me, at(-9450, 40), at(-9400, 0), at(-9390, -5), at(-9300, -180), at(-9100, -250), at(-8914, -135)]
  const news = walkNews(pts, 0.8, me, EK, '1415 10.00 20.00', 5)
  expect(news).not.toBe(false)
  if (!news) return
  expect(news.v.map((p) => [Math.round(p.n) + 0, Math.round(p.w) + 0])).toEqual([[-9400, 0], [-9300, -180], [-9100, -250]])
  const checked = walkNewsFrom(news)
  expect(checked && checked.v.length).toBe(3)
})

test('a walk mostly off the trails gives nothing: Shortest Path walks its own way', () => {
  const me = at(-9459, 43)
  expect(walkNews([me, at(-9300, -180), at(-8914, -135)], 0.1, me, EK, 'g', 5)).toBe(false)
})
