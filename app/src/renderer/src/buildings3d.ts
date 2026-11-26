// Darrell's fork: the game's buildings standing on the 3D ground (main/world3d.ts makes them: each
// building's shape, coarsened, coloured by its materials). Shown only when the view is close enough
// for them to matter, and only those round the point looked at; a shape is fetched once and shared
// by every copy of the building.
import * as THREE from 'three'

/** As main/world3d.ts writes them. */
interface Standing { f: number; u: number; v: number; h: number; t: number; s: number }

const SHOWN_WITHIN = 2600 // yards from the camera to the point looked at, past which no building is shown
const REACH = 2.2 // the buildings shown: within this many of those distances of the point looked at
const AT_MOST = 400 // buildings on show at once, the nearest

export class Buildings {
  readonly group = new THREE.Group()
  private folder = ''
  private standing: Promise<Standing[]> | null = null
  private list: Standing[] = []
  private shapes = new Map<number, Promise<Shape | null>>()
  private made = new Map<Standing, THREE.Mesh>()
  private changed = false

  constructor(
    private tiles: string,
    private inflated: (url: string) => Promise<Uint8Array | null>,
    private shadows: boolean,
  ) {
    this.group.name = 'buildings'
  }

  show(folder: string): void {
    if (folder === this.folder) return
    this.folder = folder
    for (const m of this.made.values()) this.group.remove(m)
    this.made.clear()
    this.list = []
    this.standing = fetch(`${this.tiles}/${folder}/buildings.json`)
      .then((a) => (a.ok ? (a.json() as Promise<Standing[]>) : []))
      .catch(() => [])
    void this.standing.then((l) => {
      if (folder === this.folder) ((this.list = l), (this.changed = true))
    })
    this.asked = performance.now()
  }

  // The buildings are made after the rest of the map, the first time: until they are, asked again now and then.
  private asked = 0
  private again(): void {
    if (this.list.length || performance.now() - this.asked < 30_000 || !this.folder) return
    const folder = this.folder
    this.folder = ''
    this.show(folder)
  }

  /** Before a frame: the buildings round the point looked at. True when the view must be drawn again. */
  update(at: THREE.Vector3, distance: number): boolean {
    this.again()
    const on = distance < SHOWN_WITHIN
    this.group.visible = on
    if (on) {
      const reach = Math.max(600, distance * REACH)
      const near = this.list
        .map((s) => ({ s, d: Math.hypot(s.u - at.x, s.v - at.z) }))
        .filter((x) => x.d < reach)
        .sort((a, b) => a.d - b.d)
        .slice(0, AT_MOST)
        .map((x) => x.s)
      const wanted = new Set(near)
      for (const [s, m] of this.made) if (!wanted.has(s)) (this.group.remove(m), this.made.delete(s))
      for (const s of near) if (!this.made.has(s)) this.place(s)
    }
    const was = this.changed
    this.changed = false
    return was
  }

  private place(s: Standing): void {
    const mesh = new THREE.Mesh()
    mesh.castShadow = mesh.receiveShadow = this.shadows
    mesh.matrixAutoUpdate = false
    // The building's own x, y (z up) into the ground's: x east, z south, y up; turned as interiors.ts lays out its rooms.
    const turn = ((s.t - 180) * Math.PI) / 180, sin = Math.sin(turn), cos = Math.cos(turn), k = s.s
    mesh.matrix.set(-k * sin, -k * cos, 0, s.u, 0, 0, k, s.h, -k * cos, k * sin, 0, s.v, 0, 0, 0, 1)
    mesh.visible = false
    this.made.set(s, mesh)
    this.group.add(mesh)
    const folder = this.folder
    void this.shape(s.f).then((g) => {
      if (!g || folder !== this.folder || this.made.get(s) !== mesh) return
      mesh.geometry = g.geometry
      mesh.material = g.material
      mesh.onBeforeRender = g.bind
      mesh.visible = true
      mesh.updateMatrixWorld(true)
      this.changed = true
    })
  }

  private shape(file: number): Promise<Shape | null> {
    let p = this.shapes.get(file)
    if (!p) {
      p = this.inflated(`${this.tiles}/wmo2/${file}.bin`).then((b) => (b ? shapeOf(b) : null))
      this.shapes.set(file, p)
    }
    return p
  }

  dispose(): void {
    for (const p of this.shapes.values())
      void p.then((g) => {
        g?.geometry.dispose()
        g?.material.dispose()
        g?.textures.dispose()
      })
  }
}

interface Shape {
  geometry: THREE.BufferGeometry
  material: THREE.MeshLambertMaterial
  textures: THREE.DataArrayTexture
  /** Before a copy of it is drawn: its textures in the shared uniform. */
  bind: () => void
}

const SIDE = 64 // pixels a side of a building's textures, as main/world3d.ts keeps them

// Every building's material shares one compiled program (three.js runs onBeforeCompile for the first
// only): its textures go in this uniform just before each building is drawn. A material for each
// shape, so three.js sets the uniform again whenever it goes from one shape to another.
const shared = { uBuilding: { value: null as THREE.DataArrayTexture | null } }

function materialFor(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBuilding = shared.uBuilding
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 bUv;\nattribute float bLayer;\nvarying vec2 vBUv;\nflat varying float vBLayer;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBUv = bUv;\nvBLayer = bLayer;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uBuilding;\nvarying vec2 vBUv;\nflat varying float vBLayer;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec4 t = texture(uBuilding, vec3(vBUv, vBLayer));
  if (t.a < 0.5) discard;
  diffuseColor.rgb *= t.rgb;
}`,
      )
  }
  m.customProgramCacheKey = () => 'building'
  return m
}

/** "TMB2", points, indices, textures, then the indices, the points, their u, v, their textures, their normals (i8 x 3), the textures. */
function shapeOf(b: Uint8Array): Shape | null {
  if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'TMB2') return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = v.getUint32(4, true), count = v.getUint32(8, true), pictures = v.getUint32(12, true)
  if (!n || !count || !pictures) return null
  let at = b.byteOffset + 16
  const copy = (bytes: number): ArrayBuffer => (b.buffer as ArrayBuffer).slice(at, (at += bytes))
  const index = new Uint32Array(copy(count * 4)), pos = new Float32Array(copy(n * 12)), uv = new Float32Array(copy(n * 8))
  const layer16 = new Uint16Array(copy(n * 2)), nrm = new Int8Array(copy(n * 3)), rgba = new Uint8Array(copy(pictures * SIDE * SIDE * 4))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true))
  g.setAttribute('bUv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('bLayer', new THREE.BufferAttribute(Float32Array.from(layer16), 1))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.computeBoundingSphere()
  const textures = new THREE.DataArrayTexture(rgba, SIDE, SIDE, pictures)
  textures.wrapS = textures.wrapT = THREE.RepeatWrapping
  textures.minFilter = THREE.LinearMipmapLinearFilter
  textures.magFilter = THREE.LinearFilter
  textures.generateMipmaps = true
  textures.colorSpace = THREE.SRGBColorSpace
  textures.needsUpdate = true
  return {
    geometry: g,
    material: materialFor(),
    textures,
    bind: () => {
      shared.uBuilding.value = textures
    },
  }
}
