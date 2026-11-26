// Darrell's fork: where a quest's creatures and things are, as an area rather than pins, as the game
// shows it on its own map: the places Questie gives for one quest's objectives, gathered into the
// groups that lie near each other, each group drawn as the rounded outline round its places.
import { gathered } from './geo'

export interface Place { x: number; y: number }
export interface QuestArea { quest: string; ring: Place[] }

/** The outline round some points (convex hull), anticlockwise in x right, y down. */
export function hull(points: Place[]): Place[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Place, a: Place, b: Place): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Place[] = [], upper: Place[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop()
    lower.push(q)
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * The areas of the quests: for each quest, its places in groups (within reach of one another), each
 * group's outline padded by pad all round, its corners rounded. Units as the places'.
 */
export function questAreas(places: (Place & { quests: string[] })[], reach: number, pad: number): QuestArea[] {
  const byQuest = new Map<string, Place[]>()
  for (const p of places) for (const q of p.quests) byQuest.set(q, [...(byQuest.get(q) ?? []), { x: p.x, y: p.y }])
  const out: QuestArea[] = []
  for (const [quest, points] of byQuest)
    for (const g of gathered(points, reach)) {
      // Round each place out to a ring of points, and take the outline of them all: the hull padded, its corners round.
      const round = g.of.flatMap((p) => Array.from({ length: 12 }, (_, k) => ({ x: p.x + pad * Math.cos((k * Math.PI) / 6), y: p.y + pad * Math.sin((k * Math.PI) / 6) })))
      out.push({ quest, ring: hull(round) })
    }
  return out
}
