// Darrell's fork: the 3D ground made closer to the game's, each part with a switch in Settings to
// turn it off again (kept in this screen's browser storage, read when the 3D view is made).
// - Shadows: the sun's light kept off ground that a hill stands between it and the sun.
// - Rock: a cliff has almost nothing in the top-down picture laid over it, so a line of pixels is
//   pulled down its whole face in streaks. On steep ground the picture is blurred across the slope
//   (its colour kept, its streaks gone) and given layered rock of its own, from where it is in the world.
// - Ground: the game's own textures near the camera (ground3d.ts). Buildings: the game's, simplified (buildings3d.ts).
// - The pole over the player's arrow when far (arrow3d.ts).
import type * as THREE from 'three'

export type Realism = 'shadows' | 'rock' | 'ground' | 'buildings' | 'stem' | 'cities'
const KEY = 'twinmap.fork.3d'
const DEFAULTS: Record<Realism, boolean> = { shadows: true, rock: true, ground: true, buildings: true, stem: true, cities: true }

function read(): Record<Realism, boolean> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Realism, boolean>>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function realismOn(part: Realism): boolean {
  return read()[part]
}

export function setRealism(part: Realism, on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [part]: on }))
  } catch {
    // No storage here: the switch holds until the view is made again.
  }
}

/** Steep ground as rock, in a Lambert material with a picture (map). */
export function rocky(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRockAt;\nvarying vec3 vRockUp;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockAt = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvec3 rockN = mat3(modelMatrix) * objectNormal;\nvRockUp = dot(rockN, rockN) > 1e-6 ? normalize(rockN) : vec3(0.0, 1.0, 0.0);')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vRockAt;
varying vec3 vRockUp;
float rockHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rockNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rockHash(i), rockHash(i + vec2(1.0, 0.0)), u.x), mix(rockHash(i + vec2(0.0, 1.0)), rockHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rockFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * rockNoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
// Rock of the face: bands that lie level (strata), broken by noise, seen from the two sides a cliff can face.
float rockOf(vec3 p, vec3 n) {
  vec3 w = abs(n);
  w = w / max(w.x + w.z, 1e-3);
  float onX = rockFbm(vec2(p.z * 0.09, p.y * 0.55 + rockFbm(p.zy * 0.05) * 3.0));
  float onZ = rockFbm(vec2(p.x * 0.09, p.y * 0.55 + rockFbm(p.xy * 0.05) * 3.0));
  float bands = onX * w.x + onZ * w.z;
  float grit = rockNoise(p.xz * 0.9 + p.y * 0.7);
  return 0.72 + 0.5 * bands + 0.12 * (grit - 0.5);
}`,
    )
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
{
  float steep = smoothstep(0.42, 0.72, 1.0 - clamp(vRockUp.y, 0.0, 1.0));
  if (steep > 0.0) {
    // Across the slope, in the picture: its downhill way turned a quarter.
    vec2 down = normalize(vRockUp.xz + vec2(1e-4));
    vec2 across = vec2(-down.y, down.x) / vec2(textureSize(map, 0));
    vec3 blur = vec3(0.0);
    for (int k = -3; k <= 3; k++) blur += texture2D(map, vMapUv + across * float(k) * 2.5).rgb;
    blur /= 7.0;
    diffuseColor.rgb = mix(diffuseColor.rgb, blur * rockOf(vRockAt, vRockUp), steep);
  }
}`,
    )
}
