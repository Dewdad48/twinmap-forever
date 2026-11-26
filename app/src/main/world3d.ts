// Darrell's fork: the game's ground textures and buildings for the 3D view (shared/world3d.ts says
// what is read of the game's files). Made once for each build, after the insides of buildings; a
// run cut short resumes, as the rest of the map does (keep).
//
// What is kept, in the folder of the build:
//   <world>/ground/<column>/<row>.bin   a block's ground layers (packGround), deflated
//   gtex/<file>.bin                     a ground texture, 128 x 128, three bytes a pixel ("TMT1"), deflated
//   <world>/buildings.json              the buildings standing in a continent: file, where, how turned
//   wmo/<file>.bin                      a building's shape, coarsened to the size of the 3D view ("TMB1"), deflated
//   world3d.json                        written last: the format, for a later app to make it again
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { decodeBlp } from '../shared/blp'
import { BLOCKS, WORLDS } from '../shared/world'
import { buildingGroup, buildingRoot, chunksOf, groundLayers, packGround } from '../shared/world3d'
import { EncryptedFileError } from './client-files'
import { keep } from './tiles'

export const WORLD3D_FILE = 'world3d.json'
const FORMAT = 1
const TEXTURE = 128 // pixels a side of a ground texture as kept
const CELL = 0.6 // yards: points of a building closer than this become one

/** A building standing in a continent: its file, where (yards from the top left, u east, v south, h up), its turn (degrees) and size. */
export interface Standing { f: number; u: number; v: number; h: number; t: number; s: number }

export function finishedWorld3d(folder: string): boolean {
  try {
    return (JSON.parse(readFileSync(join(folder, WORLD3D_FILE), 'utf8')) as { format?: number }).format === FORMAT
  } catch {
    return false
  }
}

/** only: the blocks to do (row * 64 + column), for a trial; all when left out. */
export function convertWorld3d(read: (id: number) => Buffer | null, folder: string, only?: Set<number>): { blocks: number; buildings: number; shapes: number } {
  const get = (id: number): Buffer | null => {
    try {
      return id ? read(id) : null
    } catch (e) {
      if (e instanceof EncryptedFileError) return null
      throw e
    }
  }
  const textures = new Set<number>(), shapes = new Set<number>()
  let blocks = 0, buildings = 0
  for (const world of WORLDS) {
    const wdt = get(world.file)
    if (!wdt) continue
    const top = chunksOf(wdt)
    const flags = top.find((c) => c.tag === 'MPHD')?.data.readUInt32LE(0) ?? 0, maid = top.find((c) => c.tag === 'MAID')?.data
    if (!maid) continue
    const standing = new Map<number, Standing>() // by the number the game gives each: one may lie on several blocks
    for (let block = 0; block < BLOCKS * BLOCKS; block++) {
      if (only && !only.has(block)) continue
      const column = block % BLOCKS, row = Math.floor(block / BLOCKS)
      const tex0 = maid.readUInt32LE(block * 32 + 12), obj0 = maid.readUInt32LE(block * 32 + 4)
      if (tex0) {
        const file = join(folder, world.name, 'ground', String(column), `${row}.bin`)
        if (!existsSync(file)) {
          const b = get(tex0), g = b && groundLayers(b, !!(flags & 0x84))
          if (g) {
            keep(file, () => deflateSync(packGround(g), { level: 9 }))
            g.textures.forEach((t) => textures.add(t))
            blocks++
          }
        } else {
          // Done in an earlier run: its textures from its file, which starts with them.
          const head = inflateSync(readFileSync(file)).subarray(0, 4096)
          for (let k = 0; k < head.readUInt16LE(4); k++) textures.add(head.readUInt32LE(6 + k * 4))
          blocks++
        }
      }
      const objects = get(obj0)
      const modf = objects && chunksOf(objects).find((c) => c.tag === 'MODF')
      if (modf)
        for (let at = 0; at + 64 <= modf.data.length; at += 64) {
          const d = modf.data
          standing.set(d.readUInt32LE(at + 4), {
            f: d.readUInt32LE(at),
            u: round(d.readFloatLE(at + 8)),
            h: round(d.readFloatLE(at + 12)),
            v: round(d.readFloatLE(at + 16)),
            t: round(d.readFloatLE(at + 24)),
            s: d.readUInt16LE(at + 62) / 1024 || 1,
          })
        }
    }
    const list = [...standing.values()]
    list.forEach((s) => shapes.add(s.f))
    buildings += list.length
    mkdirSync(join(folder, world.name), { recursive: true })
    writeFileSync(join(folder, world.name, 'buildings.json'), JSON.stringify(list))
  }
  for (const t of textures) keep(join(folder, 'gtex', `${t}.bin`), () => deflateSync(groundTexture(get(t)), { level: 9 }))
  const averages = new Map<number, [number, number, number]>()
  const average = (t: number): [number, number, number] => {
    if (!averages.has(t)) {
      let c: [number, number, number] = [150, 140, 125]
      try {
        const b = get(t)
        if (b) c = averageOf(decodeBlp(b).rgb)
      } catch {
        // a texture not read: a stone grey
      }
      averages.set(t, c)
    }
    return averages.get(t)!
  }
  for (const f of shapes) keep(join(folder, 'wmo', `${f}.bin`), () => deflateSync(buildingShape(get(f), get, average), { level: 9 }))
  if (!only) writeFileSync(join(folder, WORLD3D_FILE), JSON.stringify({ format: FORMAT, blocks, buildings, shapes: shapes.size }))
  return { blocks, buildings, shapes: shapes.size }
}

const round = (n: number): number => Math.round(n * 100) / 100

/** A ground texture at TEXTURE pixels a side, by averaging; mid grey when it cannot be read. */
function groundTexture(b: Buffer | null): Buffer {
  const out = Buffer.alloc(8 + TEXTURE * TEXTURE * 3, 128)
  out.write('TMT1', 0, 'latin1')
  out.writeUInt16LE(TEXTURE, 4)
  out.writeUInt16LE(TEXTURE, 6)
  if (!b) return out
  let img
  try {
    img = decodeBlp(b)
  } catch {
    return out
  }
  const fx = img.width / TEXTURE, fy = img.height / TEXTURE
  for (let y = 0; y < TEXTURE; y++)
    for (let x = 0; x < TEXTURE; x++) {
      const sum = [0, 0, 0]
      let n = 0
      for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++)
        for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) {
          const k = (yy * img.width + xx) * 3
          sum[0] += img.rgb[k]!
          sum[1] += img.rgb[k + 1]!
          sum[2] += img.rgb[k + 2]!
          n++
        }
      const o = 8 + (y * TEXTURE + x) * 3
      for (let c = 0; c < 3; c++) out[o + c] = n ? Math.round(sum[c]! / n) : 128
    }
  return out
}

function averageOf(rgb: Buffer): [number, number, number] {
  const s = [0, 0, 0], n = rgb.length / 3
  for (let i = 0; i < rgb.length; i += 3) ((s[0] += rgb[i]!), (s[1] += rgb[i + 1]!), (s[2] += rgb[i + 2]!))
  return [Math.round(s[0]! / n), Math.round(s[1]! / n), Math.round(s[2]! / n)]
}

/**
 * A building's shape for the 3D view: all its groups at their coarsest, points within CELL of one
 * another made one, each point coloured by its material's texture and the group's own colours.
 * "TMB1", points (u32), indices (u32), the indices (u32 each), the points (x, y, z: f32, in the
 * building's frame, z up), their normals (i8 x 3) and colours (u8 x 3).
 */
export function buildingShape(root: Buffer | null, get: (id: number) => Buffer | null, average: (texture: number) => [number, number, number]): Buffer {
  const r = root && buildingRoot(root)
  const at = new Map<string, number>()
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = []
  for (const g of r?.groups ?? []) {
    const f = get(g.file), m = f && buildingGroup(f)
    if (!m) continue
    const map = new Int32Array(m.positions.length / 3)
    for (let i = 0; i < map.length; i++) {
      const x = m.positions[i * 3]!, y = m.positions[i * 3 + 1]!, z = m.positions[i * 3 + 2]!
      const key = `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / CELL)}`
      let k = at.get(key)
      if (k === undefined) {
        k = pos.length / 3
        at.set(key, k)
        pos.push(x, y, z)
        nrm.push(...[0, 1, 2].map((c) => Math.round(Math.max(-1, Math.min(1, m.normals[i * 3 + c]!)) * 127)))
        const base = average(r!.materials[m.materials[i]!] ?? 0)
        col.push(...[0, 1, 2].map((c) => Math.round((base[c]! * m.shades[i * 3 + c]!) / 255)))
      }
      map[i] = k
    }
    for (let t = 0; t + 2 < m.indices.length; t += 3) {
      const a = map[m.indices[t]!]!, b = map[m.indices[t + 1]!]!, c = map[m.indices[t + 2]!]!
      if (a !== b && b !== c && a !== c) idx.push(a, b, c)
    }
  }
  const n = pos.length / 3
  const out = Buffer.alloc(12 + idx.length * 4 + n * 12 + n * 6)
  out.write('TMB1', 0, 'latin1')
  out.writeUInt32LE(n, 4)
  out.writeUInt32LE(idx.length, 8)
  let o = 12
  for (const i of idx) ((out.writeUInt32LE(i, o)), (o += 4))
  for (const p of pos) ((out.writeFloatLE(p, o)), (o += 4))
  for (const v of nrm) ((out.writeInt8(v, o)), (o += 1))
  for (const v of col) ((out.writeUInt8(v, o)), (o += 1))
  return out
}

