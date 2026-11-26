import { expect, test } from 'vitest'
import { zygorFrom } from './zygor'

test('a Zygor step reads off the strip with its lines and its arrow', () => {
  const told = { g: 'Hillsbrad Foothills (20-30)', n: 14, of: 220, m: 1424, x: 50.12, y: 31.4, name: 'Deathstalker Lesh', goals: [{ t: 'Talk to Deathstalker Lesh', s: 1, m: 1424, x: 50.12, y: 31.4 }, { t: "Accept 'Time To Strike'", s: 0 }, { t: 'Grey line', s: 2 }, { t: 'Walks around.', s: 3 }, { t: 'Kill 2 Syndicate Rogues (8/10)', s: 0, k: 1 }] }
  expect(zygorFrom(told)).toEqual({
    guide: 'Hillsbrad Foothills (20-30)', step: 14, of: 220,
    arrow: { m: 1424, x: 50.12, y: 31.4, name: 'Deathstalker Lesh' },
    kills: [],
    items: [],
    lines: [
      { text: 'Talk to Deathstalker Lesh', state: 'done', sticky: false, at: { m: 1424, x: 50.12, y: 31.4, name: 'Talk to Deathstalker Lesh' } },
      { text: "Accept 'Time To Strike'", state: 'todo', sticky: false, at: null },
      { text: 'Grey line', state: 'skip', sticky: false, at: null },
      { text: 'Walks around.', state: 'tip', sticky: false, at: null },
      { text: 'Kill 2 Syndicate Rogues (8/10)', state: 'todo', sticky: true, at: null },
    ],
  })
})

test('no guide, no Zygor, and odd values read as none or are left out', () => {
  expect(zygorFrom([]), 'the addon says there is none').toBeNull()
  expect(zygorFrom(undefined), 'no Zygor').toBeNull()
  expect(zygorFrom({ g: 'No goals' })).toBeNull()
  expect(zygorFrom({ n: -3, of: 'many', m: 0, x: 500, y: 2, goals: [7, { t: '' }, { t: 'A\u0007B' }], k: [3110, -1, 'x'], it: [4865] })).toEqual({ guide: 'Zygor', step: null, of: null, arrow: null, kills: [3110], items: [4865], lines: [{ text: 'A B', state: 'todo', sticky: false, at: null }] })
})
