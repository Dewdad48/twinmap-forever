// Darrell's fork: the game's ground textures and buildings for the 3D view (shared/world3d.ts says
// what is read of the game's files). Made once for each build, after the insides of buildings; a
// run cut short resumes, as the rest of the map does (keep).
//
// What is kept, in the folder of the build:
//   <world>/ground/<column>/<row>.bin   a block's ground layers (packGround), deflated
//   gtex/<file>.bin                     a ground texture, 128 x 128, three bytes a pixel ("TMT1"), deflated
//   <world>/buildings.json              the buildings standing in a continent: file, where, how turned
//   wmo2/<file>.bin                     a building's shape at its coarsest, with small textures ("TMB2"), deflated
//   world3d.json                        written last: the format, for a later app to make it again
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { decodeBlp, decodeBlpCutout } from '../shared/blp'
import { BLOCKS, WORLDS } from '../shared/world'
import { buildingGroup, buildingRoot, chunksOf, groundLayers, packGround } from '../shared/world3d'
import { EncryptedFileError } from './client-files'
import { keep } from './tiles'

export const WORLD3D_FILE = 'world3d.json'
const FORMAT = 2
const TEXTURE = 128 // pixels a side of a ground texture as kept

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
// Between blocks and buildings the worker's other work gets its turn: the pictures the screens ask
// for while this runs (item-icons.ts) are answered at once, not after it.
const breathe = (): Promise<void> => new Promise((go) => setImmediate(go))

export async function convertWorld3d(read: (id: number) => Buffer | null, folder: string, only?: Set<number>): Promise<{ blocks: number; buildings: number; shapes: number }> {
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
      if (block % 8 === 0) await breathe()
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
  for (const t of textures) {
    keep(join(folder, 'gtex', `${t}.bin`), () => deflateSync(groundTexture(get(t)), { level: 9 }))
    await breathe()
  }
  for (const f of shapes) {
    keep(join(folder, 'wmo2', `${f}.bin`), () => deflateSync(buildingShape(get(f), get), { level: 9 }))
    await breathe()
  }
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

/**
 * A building's shape for the 3D view, as the game draws it at its coarsest: every group, each point
 * with its place on its material's texture, and the textures small (BUILDING_TEXTURE pixels a side,
 * with their holes), as a miniature needs them.
 * "TMB2", points (u32), indices (u32), textures (u32), then the indices (u32 each), the points
 * (x, y, z: f32, in the building's frame, z up), their u, v (f32 x 2), the texture of each (u16),
 * their normals (i8 x 3), and the textures (red, green, blue, alpha bytes).
 */
export function buildingShape(root: Buffer | null, get: (id: number) => Buffer | null): Buffer {
  const r = root && buildingRoot(root)
  const pos: number[] = [], uv: number[] = [], layer: number[] = [], nrm: number[] = [], idx: number[] = []
  // The building's textures, each once, in the order first met.
  const layers = new Map<string, number>(), pictures: Uint8Array[] = []
  const layerOf = (material: number): number => {
    const file = r?.materials[material] ?? 0, cut = !!r?.cutout[material], key = `${file} ${cut}`
    let l = layers.get(key)
    if (l === undefined) {
      l = pictures.length
      layers.set(key, l)
      pictures.push(smallPicture(get(file), cut))
    }
    return l
  }
  for (const g of r?.groups ?? []) {
    const f = get(g.file), m = f && buildingGroup(f)
    if (!m) continue
    const base = pos.length / 3, n = m.positions.length / 3
    for (let i = 0; i < n; i++) {
      pos.push(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!)
      uv.push(m.uvs[i * 2]!, m.uvs[i * 2 + 1]!)
      layer.push(layerOf(m.materials[i]!))
      for (let c = 0; c < 3; c++) nrm.push(Math.round(Math.max(-1, Math.min(1, m.normals[i * 3 + c]!)) * 127))
    }
    for (const k of m.indices) idx.push(base + k)
  }
  const n = pos.length / 3, side = BUILDING_TEXTURE
  const out = Buffer.alloc(16 + idx.length * 4 + n * 12 + n * 8 + n * 2 + n * 3 + pictures.length * side * side * 4)
  out.write('TMB2', 0, 'latin1')
  out.writeUInt32LE(n, 4)
  out.writeUInt32LE(idx.length, 8)
  out.writeUInt32LE(pictures.length, 12)
  let o = 16
  for (const i of idx) ((out.writeUInt32LE(i, o)), (o += 4))
  for (const p of pos) ((out.writeFloatLE(p, o)), (o += 4))
  for (const t of uv) ((out.writeFloatLE(t, o)), (o += 4))
  for (const l of layer) ((out.writeUInt16LE(l, o)), (o += 2))
  for (const v of nrm) ((out.writeInt8(v, o)), (o += 1))
  for (const p of pictures) (out.set(p, o), (o += p.length))
  return out
}

export const BUILDING_TEXTURE = 64

/** A texture at BUILDING_TEXTURE pixels a side, averaged; a cut out one keeps its holes. Stone grey when it cannot be read. */
function smallPicture(b: Buffer | null, cut: boolean): Uint8Array {
  const side = BUILDING_TEXTURE, out = new Uint8Array(side * side * 4)
  let img: { width: number; height: number; rgba: Uint8Array } | null = null
  try {
    img = b ? decodeBlpCutout(b) : null
  } catch {
    img = null
  }
  if (!img) {
    for (let k = 0; k < side * side; k++) out.set([150, 140, 125, 255], k * 4)
    return out
  }
  const fx = img.width / side, fy = img.height / side
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      let r = 0, g = 0, bl = 0, a = 0, n = 0
      for (let yy = Math.floor(y * fy); yy < Math.max(Math.floor(y * fy) + 1, Math.floor((y + 1) * fy)); yy++)
        for (let xx = Math.floor(x * fx); xx < Math.max(Math.floor(x * fx) + 1, Math.floor((x + 1) * fx)); xx++) {
          const k = (Math.min(yy, img.height - 1) * img.width + Math.min(xx, img.width - 1)) * 4, w = img.rgba[k + 3]!
          // Colour from the pixels that show, so holes do not darken their edges.
          r += img.rgba[k]! * w
          g += img.rgba[k + 1]! * w
          bl += img.rgba[k + 2]! * w
          a += w
          n++
        }
      const o = (y * side + x) * 4
      out[o] = a ? Math.round(r / a) : 0
      out[o + 1] = a ? Math.round(g / a) : 0
      out[o + 2] = a ? Math.round(bl / a) : 0
      // Only a cut out material has holes; the alpha of any other is not transparency (it may be shine).
      out[o + 3] = cut ? Math.round(a / n) : 255
    }
  return out
}
