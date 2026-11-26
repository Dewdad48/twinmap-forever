import { expect, test } from 'vitest'
import { hull, questAreas } from './quest-areas'

test('the outline round points leaves the inner ones out', () => {
  const h = hull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }])
  expect(h).toHaveLength(4)
  expect(h).not.toContainEqual({ x: 5, y: 5 })
})

test("a quest's places near each other are one area, padded; far ones another; each quest its own", () => {
  const places = [
    { x: 0, y: 0, quests: ['Legging It'] },
    { x: 4, y: 0, quests: ['Legging It'] },
    { x: 100, y: 100, quests: ['Legging It', 'Zalazane'] },
  ]
  const areas = questAreas(places, 10, 2)
  expect(areas.map((a) => a.quest)).toEqual(['Legging It', 'Legging It', 'Zalazane'])
  const xs = areas[0]!.ring.map((p) => p.x)
  expect(Math.min(...xs)).toBeCloseTo(-2)
  expect(Math.max(...xs)).toBeCloseTo(6)
})
