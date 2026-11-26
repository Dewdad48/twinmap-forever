// Darrell's fork: the quests' areas (shared/quest-areas.ts) on the 3D ground: each outline filled and
// laid over the hills, faint, as on the 2D map. Made again when the areas change, and now and then
// while the ground near them is still coming in (a point with no ground yet waits for it).
import * as THREE from 'three'
import type { Terrain } from './terrain3d'

/** An area's outline in yards: x east, z south, as the 3D view has them. */
export type Outline = { x: number; z: number }[]

const STEP = 12 // yards: triangles are cut until no side is longer, so the area follows the hills
const LIFT = 1.2 // yards over the ground
const FILL = 0x6d7dff
const LINE = 0x9aa6ff

export class Areas3d {
  private group = new THREE.Group()
  private fill = new THREE.MeshBasicMaterial({ color: FILL, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  private line = new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.45, depthWrite: false })
  private outlines: { outline: Outline; lit: boolean }[] = []
  private missing = false
  private at = 0

  constructor(private terrain: Terrain) {
    this.group.name = 'quest-areas'
    this.group.renderOrder = 5
    terrain.add(this.group)
  }

  set(outlines: { outline: Outline; lit: boolean }[]): void {
    this.outlines = outlines
    this.make()
  }

  /** Before a frame: again where some ground was missing, every two seconds. */
  tick(now: number): void {
    if (this.missing && now - this.at > 2000) this.make()
  }

  clear(): void {
    this.set([])
  }

  private make(): void {
    this.at = performance.now()
    for (const c of [...this.group.children]) {
      this.group.remove(c)
      ;(c as THREE.Mesh).geometry.dispose()
    }
    this.missing = false
    for (const { outline, lit } of this.outlines) {
      if (outline.length < 3) continue
      const contour = outline.map((p) => new THREE.Vector2(p.x, p.z))
      const tris = THREE.ShapeUtils.triangulateShape(contour, [])
      const pos: number[] = []
      const put = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): void => {
        const long = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
        if (long > STEP) {
          const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5)
          put(a, ab, ca)
          put(ab, b, bc)
          put(ca, bc, c)
          put(ab, bc, ca)
          return
        }
        for (const p of [a, b, c]) pos.push(p.x, this.height(p.x, p.y), p.y)
      }
      for (const [i, j, k] of tris) put(contour[i]!, contour[j]!, contour[k]!)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const mesh = new THREE.Mesh(g, this.fill)
      mesh.renderOrder = 5
      if (!lit) mesh.visible = false
      this.group.add(mesh)
      const edge = new THREE.BufferGeometry().setFromPoints([...outline, outline[0]!].map((p) => new THREE.Vector3(p.x, this.height(p.x, p.z), p.z)))
      const loop = new THREE.Line(edge, this.line)
      loop.visible = lit
      this.group.add(loop)
    }
  }

  private height(x: number, z: number): number {
    const h = this.terrain.groundAt(x, z)
    if (Number.isNaN(h)) {
      this.missing = true
      return 0
    }
    return h + LIFT
  }
}
