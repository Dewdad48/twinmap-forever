// The step Zygor Guides Viewer (Forever edition) shows in the game, as the addon tells it on the
// strip (Zygor.lua): read only. Its guide, the step it is on, the lines of that step, and where its
// arrow points.
import { pinFrom, type Pin } from './send'

export interface ZygorLine {
  text: string
  /** 'done' when Zygor ticked it, 'skip' when it greys it out, 'tip' for a hint under a line ("Walks around."), else 'todo'. */
  state: 'todo' | 'done' | 'skip' | 'tip'
  /** Of a sticky step Zygor shows with the current one: a goal of an earlier step still open. */
  sticky: boolean
  /** Where the line takes place, when Zygor gives it a place. */
  at: Pin | null
}

export interface ZygorStep {
  /** The guide's name: "Hillsbrad Foothills (20-30)". */
  guide: string
  /** The step it is on, and how many the guide has; null when not told. */
  step: number | null
  of: number | null
  lines: ZygorLine[]
  /** Where Zygor's arrow points now. */
  arrow: Pin | null
  /** The creatures to kill and the items to get of the lines still to do (QuestieDB shows where). */
  kills: number[]
  items: number[]
}

const plain = (text: unknown, most: number): string =>
  typeof text === 'string' ? Array.from(text, (c) => (c < ' ' || c === '\x7f' ? ' ' : c)).join('').trim().slice(0, most) : ''
const count = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 1e5 ? (v as number) : null)

/** The section as it came off the strip, checked; null when Zygor shows no guide, or is not there. */
export function zygorFrom(section: unknown): ZygorStep | null {
  if (typeof section !== 'object' || !section || Array.isArray(section)) return null
  const { g, n, of, goals, m, x, y, name, k, it } = section as Record<string, unknown>
  if (!Array.isArray(goals)) return null
  const lines = goals.slice(0, 12).flatMap((goal: unknown): ZygorLine[] => {
    const { t: words, s, k, m: gm, x: gx, y: gy } = (typeof goal === 'object' && goal ? goal : {}) as Record<string, unknown>
    const text = plain(words, 90)
    if (!text) return []
    return [{ text, state: s === 1 ? 'done' : s === 2 ? 'skip' : s === 3 ? 'tip' : 'todo', sticky: k === 1, at: pinFrom({ m: gm, x: gx, y: gy, name: text }) }]
  })
  const guide = plain(g, 80) || 'Zygor'
  const ids = (t: unknown): number[] => (Array.isArray(t) ? t.filter((v): v is number => Number.isInteger(v) && v > 0 && v < 1e7).slice(0, 8) : [])
  return { guide, step: count(n), of: count(of), lines, arrow: pinFrom({ m, x, y, name: plain(name, 80) || guide }), kills: ids(k), items: ids(it) }
}
