// Darrell's fork: what the 3D view needs of the game's files to look more like the game.
//
// The ground's textures, as the game paints a block ("tex0" ADT): the textures it uses (MDID, file
// numbers), and for each of its 16 x 16 chunks up to four layers (MCLY), each a texture, all but the
// first with how much of it covers each of 64 x 64 points of the chunk (MCAL). The first layer is
// whatever the others leave.
//
// The buildings (WMO): a root file with the materials (MOMT: the texture of each), the kind of each
// group (MOGI: outside, inside) and the files of the groups (GFID: the groups again for each level
// of detail, the coarsest last); a group file with its points (MOVT), their normals (MONR), colours
// (MOCV, not always), the triangles (MOVI) and the runs of triangles drawn with one material (MOBA).
// What the view gets of a building: its outside, coloured by the average of its materials' textures.

export interface Chunked { tag: string; data: Buffer }

/** The chunks of a game file: a four letter tag written backwards, a size, the data. */
export function chunksOf(b: Buffer): Chunked[] {
  const out: Chunked[] = []
  for (let at = 0; at + 8 <= b.length; ) {
    const size = b.readUInt32LE(at + 4)
    out.push({ tag: b.toString('latin1', at, at + 4).split('').reverse().join(''), data: b.subarray(at + 8, Math.min(b.length, at + 8 + size)) })
    at += 8 + size
  }
  return out
}

/** Points of alpha a side of a chunk, and of a block (16 chunks). */
export const ALPHA = 64
export const GROUND_SIDE = ALPHA * 16
export const NO_LAYER = 255

export interface GroundLayers {
  /** The file numbers of the textures, as the layers number them. */
  textures: number[]
  /** For each chunk, row first, its four layers' textures (NO_LAYER past the last). */
  layers: Uint8Array // 256 x 4
  /** For each of the 1024 x 1024 points of the block, row first, how much layers 2, 3 and 4 cover it, 0..255. */
  alpha: Uint8Array // 1024 x 1024 x 3
}

/** bigAlpha: the world file says alpha is kept 8 bits a point (MPHD flags 0x4 or 0x80); else 4. */
export function groundLayers(tex0: Buffer, bigAlpha: boolean): GroundLayers | null {
  const top = chunksOf(tex0)
  const mdid = top.find((c) => c.tag === 'MDID')
  if (!mdid) return null
  const textures = Array.from({ length: mdid.data.length >> 2 }, (_, i) => mdid.data.readUInt32LE(i * 4))
  const layers = new Uint8Array(256 * 4).fill(NO_LAYER)
  const alpha = new Uint8Array(GROUND_SIDE * GROUND_SIDE * 3)
  const mcnks = top.filter((c) => c.tag === 'MCNK')
  mcnks.slice(0, 256).forEach((chunk, n) => {
    const sub = chunksOf(chunk.data)
    const mcly = sub.find((s) => s.tag === 'MCLY'), mcal = sub.find((s) => s.tag === 'MCAL')
    if (!mcly) return
    const count = Math.min(4, mcly.data.length >> 4)
    const cr = n >> 4, cc = n & 15
    for (let l = 0; l < count; l++) {
      const tex = mcly.data.readUInt32LE(l * 16), flags = mcly.data.readUInt32LE(l * 16 + 4), offset = mcly.data.readUInt32LE(l * 16 + 8)
      layers[n * 4 + l] = tex < NO_LAYER ? tex : NO_LAYER
      if (l === 0 || !(flags & 0x100) || !mcal) continue
      const points = alphaOf(mcal.data, offset, !!(flags & 0x200), bigAlpha)
      for (let y = 0; y < ALPHA; y++)
        for (let x = 0; x < ALPHA; x++) alpha[((cr * ALPHA + y) * GROUND_SIDE + cc * ALPHA + x) * 3 + l - 1] = points[y * ALPHA + x]!
    }
  })
  return { textures, layers, alpha }
}

function alphaOf(mcal: Buffer, at: number, compressed: boolean, big: boolean): Uint8Array {
  const out = new Uint8Array(ALPHA * ALPHA)
  if (compressed) {
    // Runs: a byte says how many (low 7 bits) and whether one value fills them (top bit) or each comes in turn.
    let o = 0
    while (o < out.length && at < mcal.length) {
      const b = mcal[at++]!, n = b & 0x7f
      if (b & 0x80) {
        const v = mcal[at++] ?? 0
        for (let k = 0; k < n && o < out.length; k++) out[o++] = v
      } else for (let k = 0; k < n && o < out.length && at < mcal.length; k++) out[o++] = mcal[at++]!
    }
  } else if (big) out.set(mcal.subarray(at, at + out.length))
  else
    for (let k = 0; k < out.length >> 1; k++) {
      const b = mcal[at + k] ?? 0
      out[k * 2] = (b & 15) * 17
      out[k * 2 + 1] = (b >> 4) * 17
    }
  return out
}

/** A block's ground layers as a file: "TMG1", texture count (u16), the numbers (u32 each), the layers, the alpha. */
export function packGround(g: GroundLayers): Buffer {
  const head = Buffer.alloc(6 + g.textures.length * 4)
  head.write('TMG1', 0, 'latin1')
  head.writeUInt16LE(g.textures.length, 4)
  g.textures.forEach((t, i) => head.writeUInt32LE(t, 6 + i * 4))
  return Buffer.concat([head, Buffer.from(g.layers), Buffer.from(g.alpha)])
}

export function unpackGround(b: Uint8Array): GroundLayers | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'TMG1') return null
  const n = v.getUint16(4, true)
  const textures = Array.from({ length: n }, (_, i) => v.getUint32(6 + i * 4, true))
  let at = 6 + n * 4
  const layers = b.subarray(at, (at += 256 * 4)), alpha = b.subarray(at, at + GROUND_SIDE * GROUND_SIDE * 3)
  return alpha.length === GROUND_SIDE * GROUND_SIDE * 3 ? { textures, layers, alpha } : null
}

// ---------------------------------------------------------------- buildings

export interface BuildingRoot {
  /** Each material's first texture, a file number (0: none). */
  materials: number[]
  /** The groups' files for the level of detail chosen, and whether each is outside. */
  groups: { file: number; outside: boolean }[]
}

/** lod: 0 the finest; past the coarsest the coarsest. */
export function buildingRoot(file: Buffer, lod = 99): BuildingRoot | null {
  const cs = chunksOf(file)
  const mohd = cs.find((c) => c.tag === 'MOHD'), momt = cs.find((c) => c.tag === 'MOMT'), mogi = cs.find((c) => c.tag === 'MOGI'), gfid = cs.find((c) => c.tag === 'GFID')
  if (!mohd || !mogi || !gfid) return null
  const count = mohd.data.readUInt32LE(4)
  const materials = momt ? Array.from({ length: momt.data.length >> 6 }, (_, i) => momt.data.readUInt32LE(i * 64 + 12)) : []
  const ids = Array.from({ length: gfid.data.length >> 2 }, (_, i) => gfid.data.readUInt32LE(i * 4))
  const levels = Math.max(1, Math.floor(ids.length / Math.max(1, count)))
  const groups: BuildingRoot['groups'] = []
  for (let g = 0; g < count; g++) {
    const flags = mogi.data.readUInt32LE(g * 32)
    // The coarsest level that has this group, down to the one asked.
    let file = 0
    for (let l = Math.min(lod, levels - 1); l >= 0 && !file; l--) file = ids[l * count + g] ?? 0
    groups.push({ file, outside: !!(flags & 0x8) })
  }
  return { materials, groups }
}

export interface BuildingMesh {
  /** x, y, z in the building's own frame (z up). */
  positions: Float32Array
  normals: Float32Array
  /** The material of each point, as the root numbers them. */
  materials: Uint16Array
  /** r, g, b of each point from the group's own colours, 255 where it has none. */
  shades: Uint8Array
  indices: Uint32Array
}

/** A group's drawn triangles (its runs, MOBA). */
export function buildingGroup(file: Buffer): BuildingMesh | null {
  const mogp = chunksOf(file).find((c) => c.tag === 'MOGP')
  if (!mogp) return null
  const inner = chunksOf(mogp.data.subarray(68))
  const get = (tag: string): Buffer | undefined => inner.find((c) => c.tag === tag)?.data
  const movt = get('MOVT'), monr = get('MONR'), movi = get('MOVI'), moba = get('MOBA'), mocv = get('MOCV')
  if (!movt || !movi || !moba) return null
  const n = Math.floor(movt.length / 12)
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3)
  for (let i = 0; i < n * 3; i++) {
    positions[i] = movt.readFloatLE(i * 4)
    normals[i] = monr && monr.length >= (i + 1) * 4 ? monr.readFloatLE(i * 4) : i % 3 === 2 ? 1 : 0
  }
  const shades = new Uint8Array(n * 3).fill(255)
  if (mocv && mocv.length >= n * 4)
    for (let i = 0; i < n; i++) {
      // Blue, green, red, alpha; the game doubles them when it lights a building.
      shades[i * 3] = Math.min(255, mocv[i * 4 + 2]! * 2)
      shades[i * 3 + 1] = Math.min(255, mocv[i * 4 + 1]! * 2)
      shades[i * 3 + 2] = Math.min(255, mocv[i * 4]! * 2)
    }
  const materials = new Uint16Array(n)
  const indices: number[] = []
  for (let b = 0; b + 24 <= moba.length; b += 24) {
    const start = moba.readUInt32LE(b + 12), count = moba.readUInt16LE(b + 16), flags = moba[b + 22]!
    const material = flags & 2 ? moba.readUInt16LE(b + 10) : moba[b + 23]!
    for (let k = start; k < start + count && (k + 1) * 2 <= movi.length; k++) {
      const v = movi.readUInt16LE(k * 2)
      if (v >= n) continue
      materials[v] = material
      indices.push(v)
    }
  }
  // Whole triangles only.
  indices.length -= indices.length % 3
  return { positions, normals, materials, shades, indices: Uint32Array.from(indices) }
}
