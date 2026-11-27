// Finds the ways on foot on a thread of its own: reading a continent's grid takes a moment, and a
// long search more than the reading of the strip can wait. The grid is the one in the player's
// own Shortest Path Forever, so it is always that of the version installed; where the addon is
// not there, or its files are of a format this app does not read, the copy shipped with the app.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { UNITS_PER_BLOCK, unitsOfWorld } from '../shared/geo'
import { navFrom } from '../shared/nav-data'
import type { Far, FarAsk, Floors, TrackAsk, WalkAsk, WalkPath } from '../shared/walk'
import { BLOCK_YARDS, BLOCKS } from '../shared/world'
import { Trails } from './trails'
import { readAddonNav, shortestPathFolder, walker, type Tracker, type Walker, type Yards } from './walk'

const { gameFolder, shipped, trailFolder } = workerData as { gameFolder: string | null; shipped: string; trailFolder?: string }
// The ways the player walked, by continent (trails.ts): kept in the app's folder, written now and then.
const trails = new Map<number, Trails>()
const trailsOf = (continent: number): Trails => trails.get(continent) ?? trails.set(continent, new Trails(trailFolder && join(trailFolder, `trails${continent}.json`))).get(continent)!
const SAVE_EVERY = 30_000
setInterval(() => {
  for (const t of trails.values()) {
    try {
      t.save()
    } catch {
      // a disk that will not take it now: next time
    }
  }
}, SAVE_EVERY).unref()
const finders = new Map<number, Walker | null>()
// One character, followed on each continent: the floor it stands on is known from where it stood before.
const trackers = new Map<number, Tracker>()

function finder(continent: number): Walker | null {
  if (!finders.has(continent)) {
    let nav = gameFolder ? readAddonNav(shortestPathFolder(gameFolder), continent) : null
    try {
      nav ??= navFrom(readFileSync(join(shipped, `nav${continent}.json`), 'utf8'))
    } catch {
      // no file: no ways on foot, and the rest of the app goes on
    }
    // The way is found on the game's ground alone: the trails walked are kept, but no longer steer it (they led back where the character had been).
    finders.set(continent, nav && walker(nav))
  }
  return finders.get(continent) ?? null
}

// Map units to yards of the world: the other way of unitsOfWorld (shared/geo.ts).
const yardsOf = (p: { x: number; y: number }): Yards => [(BLOCKS / 2 - p.y / UNITS_PER_BLOCK) * BLOCK_YARDS, (BLOCKS / 2 - p.x / UNITS_PER_BLOCK) * BLOCK_YARDS]

// An asking with a reach is for the yards to many ends; one with a single point, for the floor
// the character stands on; any other for the way to one.
parentPort?.on('message', ({ id, ask }: { id: number; ask: WalkAsk | FarAsk | TrackAsk }) => {
  if ('at' in ask) {
    let floors: Floors = null
    try {
      const find = finder(ask.continent)
      if (find && !trackers.has(ask.continent)) trackers.set(ask.continent, find.track())
      const told = trackers.get(ask.continent)?.(yardsOf(ask.at), ask.indoors)
      floors = told ? { over: told.over, under: told.under, z: told.z } : null
      // On foot: the way from the point before is a way walked. Off it (a flight, a taxi): none.
      const here = yardsOf(ask.at), trail = trailsOf(ask.continent)
      for (const [c, t] of trails) if (c !== ask.continent) t.broken()
      if (ask.foot === false) trail.broken()
      else if (ask.foot === true) trail.walked(here[0], here[1], told?.z, Date.now())
      // For trials in the game: TWINMAP_TRACK_LOG names a file that gets a line for each point followed.
      if (process.env.TWINMAP_TRACK_LOG) appendFileSync(process.env.TWINMAP_TRACK_LOG, JSON.stringify({ t: Date.now(), ...ask, told: told ?? null }) + '\n')
    } catch {
      // as for the ways: nothing to say, rather than a thread that dies
    }
    return void parentPort?.postMessage({ id, path: floors })
  }
  const many = 'reach' in ask
  let path: WalkPath | Far = many ? ask.to.map(() => null) : null
  try {
    const find = finder(ask.continent)
    if (find && many) path = find.far(yardsOf(ask.from), ask.to.map(yardsOf), ask.reach)
    else if (find && !many) {
      const walk = find(yardsOf(ask.from), yardsOf(ask.to), ask.fromZ, ask.toZ)
      if (walk) path = { points: walk.points.map(([x, y], i) => ({ ...unitsOfWorld(x, y), z: Math.round(walk.heights[i]!) })), yards: walk.yards, own: walk.own }
    }
  } catch {
    // a grid that does not read as it should: no way, rather than a thread that dies
  }
  parentPort?.postMessage({ id, path })
})
