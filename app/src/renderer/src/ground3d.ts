// Darrell's fork: the ground near the camera painted with the game's own textures, blended as the
// game blends them (shared/world3d.ts: a block's textures, each chunk's four layers, how much of each
// layer covers each point). Far away the ground keeps the map's picture: the textures would only
// shimmer there, and the picture has the game's light and shade in it.
import * as THREE from 'three'
import { GROUND_SIDE, NO_LAYER, unpackGround } from '../../shared/world3d'

const REPEATS = 8 // times a texture is laid across a chunk, as the game does by default
const NEAR = 450 // yards from the camera: the textures alone up to here,
const FAR = 900 // the map's picture alone from here

export interface Painted {
  textures: THREE.DataArrayTexture
  layers: THREE.DataTexture
  alpha: THREE.DataTexture
}

export class GroundPaint {
  private blocks = new Map<string, Promise<Painted | null>>()
  private pixels = new Map<number, Promise<Uint8Array | null>>()

  constructor(
    private tiles: string,
    private inflated: (url: string) => Promise<Uint8Array | null>,
    private anisotropy: number,
  ) {}

  /** A block's paint, by "column row" in a continent's folder; null where the game has none. */
  block(folder: string, key: string): Promise<Painted | null> {
    const id = `${folder} ${key}`
    let p = this.blocks.get(id)
    if (!p) {
      const [c, r] = key.split(' ')
      p = this.inflated(`${this.tiles}/${folder}/ground/${c}/${r}.bin`).then((b) => (b ? this.make(b) : null))
      this.blocks.set(id, p)
    }
    return p
  }

  /** Forgets the blocks of the continent left (their textures go from the graphics card). */
  drop(): void {
    for (const p of this.blocks.values())
      void p.then((g) => {
        g?.textures.dispose()
        g?.layers.dispose()
        g?.alpha.dispose()
      })
    this.blocks.clear()
  }

  private texture(file: number): Promise<Uint8Array | null> {
    let p = this.pixels.get(file)
    if (!p) {
      p = this.inflated(`${this.tiles}/gtex/${file}.bin`)
      this.pixels.set(file, p)
    }
    return p
  }

  private async make(b: Uint8Array): Promise<Painted | null> {
    const g = unpackGround(b)
    if (!g || !g.textures.length) return null
    const pictures = await Promise.all(g.textures.map((t) => this.texture(t)))
    const side = 128,
      count = pictures.length
    const data = new Uint8Array(side * side * 4 * count)
    pictures.forEach((p, i) => {
      const off = i * side * side * 4
      for (let k = 0; k < side * side; k++) {
        data[off + k * 4] = p ? p[8 + k * 3]! : 128
        data[off + k * 4 + 1] = p ? p[8 + k * 3 + 1]! : 128
        data[off + k * 4 + 2] = p ? p[8 + k * 3 + 2]! : 128
        data[off + k * 4 + 3] = 255
      }
    })
    const textures = new THREE.DataArrayTexture(data, side, side, count)
    textures.wrapS = textures.wrapT = THREE.RepeatWrapping
    textures.minFilter = THREE.LinearMipmapLinearFilter
    textures.magFilter = THREE.LinearFilter
    textures.generateMipmaps = true
    textures.colorSpace = THREE.SRGBColorSpace
    textures.anisotropy = this.anisotropy
    textures.needsUpdate = true
    const layers = new THREE.DataTexture(new Uint8Array(g.layers), 16, 16, THREE.RGBAFormat)
    layers.minFilter = layers.magFilter = THREE.NearestFilter
    layers.needsUpdate = true
    const rgba = new Uint8Array(GROUND_SIDE * GROUND_SIDE * 4)
    for (let k = 0; k < GROUND_SIDE * GROUND_SIDE; k++) {
      rgba[k * 4] = g.alpha[k * 3]!
      rgba[k * 4 + 1] = g.alpha[k * 3 + 1]!
      rgba[k * 4 + 2] = g.alpha[k * 3 + 2]!
      rgba[k * 4 + 3] = 255
    }
    const alpha = new THREE.DataTexture(rgba, GROUND_SIDE, GROUND_SIDE, THREE.RGBAFormat)
    alpha.minFilter = alpha.magFilter = THREE.LinearFilter
    alpha.needsUpdate = true
    return { textures, layers, alpha }
  }
}

/** The ground's Lambert material painted: its picture (map) far, the textures near. */
export function painted(shader: THREE.WebGLProgramParametersWithUniforms, p: Painted): void {
  shader.uniforms.uPaint = { value: p.textures }
  shader.uniforms.uLayers = { value: p.layers }
  shader.uniforms.uAlpha = { value: p.alpha }
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform highp sampler2DArray uPaint;
uniform sampler2D uLayers;
uniform sampler2D uAlpha;`,
    )
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
{
  float away = length(vViewPosition);
  float near = 1.0 - smoothstep(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, away);
  if (near > 0.0) {
    vec2 uv = clamp(vMapUv, 0.0, 0.99999);
    ivec2 chunk = ivec2(floor(uv * 16.0));
    vec4 ids = texelFetch(uLayers, chunk, 0) * 255.0;
    vec3 cover = texture2D(uAlpha, uv).rgb;
    vec2 at = uv * ${(16 * REPEATS).toFixed(1)};
    vec3 paint = texture(uPaint, vec3(at, ids.x)).rgb;
    if (ids.y < ${NO_LAYER - 0.5}) paint = mix(paint, texture(uPaint, vec3(at, ids.y)).rgb, cover.r);
    if (ids.z < ${NO_LAYER - 0.5}) paint = mix(paint, texture(uPaint, vec3(at, ids.z)).rgb, cover.g);
    if (ids.w < ${NO_LAYER - 0.5}) paint = mix(paint, texture(uPaint, vec3(at, ids.w)).rgb, cover.b);
    if (ids.x < ${NO_LAYER - 0.5}) diffuseColor.rgb = mix(diffuseColor.rgb, paint, near);
  }
}`,
    )
}
