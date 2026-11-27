// What Shortest Path is given to guide in the game when Twinmap's walk keeps to the player's own
// trails (main/trails.ts): a few points on the way, the nearest first. Where the walk keeps to the
// trails too little, nothing: Shortest Path's own way is as good there, and its stops not worth having.
import { UNITS_PER_BLOCK } from './geo'
import type { GameMap } from './maps'
import { WALK_VIAS, type WalkNews } from './send'
import type { WayPoint } from './walk'
import { BLOCK_YARDS, BLOCKS } from './world'

const OWN_LEAST = 0.25 // of the walk on trails, for it to be given
const NEAR = 30 // yards from the character within which a point is passed already
const APART = 50 // yards between two points given at least

/** Map units to yards of the world: north, west. */
export const yardsOfUnits = (p: { x: number; y: number }): [number, number] => [(BLOCKS / 2 - p.y / UNITS_PER_BLOCK) * BLOCK_YARDS, (BLOCKS / 2 - p.x / UNITS_PER_BLOCK) * BLOCK_YARDS]

/** The key of a journey's goal, as the addon reads it from Shortest Path. */
export const goalKey = (goal: { m: number; x: number; y: number }): string => `${goal.m} ${goal.x.toFixed(2)} ${goal.y.toFixed(2)}`

export function walkNews(points: WayPoint[], own: number, me: { x: number; y: number }, continentMap: GameMap, goal: string, t: number): WalkNews | false {
  const rect = continentMap.rect
  if (own < OWN_LEAST || !rect || points.length < 3) return false
  const [n0, w0] = yardsOfUnits(me)
  const v: WalkNews['v'] = []
  let last: [number, number] = [n0, w0]
  for (const p of points.slice(1, -1)) {
    const [n, w] = yardsOfUnits(p)
    if (Math.hypot(n - n0, w - w0) < NEAR || Math.hypot(n - last[0], w - last[1]) < APART) continue
    const x = ((rect.maxY - w) / (rect.maxY - rect.minY)) * 100, y = ((rect.maxX - n) / (rect.maxX - rect.minX)) * 100
    if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) continue
    v.push({ x, y, ...(p.z !== undefined && { z: p.z }), n, w })
    last = [n, w]
    if (v.length === WALK_VIAS) break
  }
  return v.length ? { t, m: continentMap.id, goal, v } : false
}
