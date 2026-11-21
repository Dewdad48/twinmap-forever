// The art of the arrow (Arrow.lua), drawn here and kept as .tga beside the addon's code:
//   node art.js
// Arrow.tga: the arrow pointing up, white with a black edge, tinted ivory or gold in the game.
// NoWay.tga: a dashed grey ring on a black edge, where the game tells no direction.
// Both 128 pixels square, drawn at 64 in the game, in units of those 64 from the middle, up being +y.
const fs = require('fs')
const path = require('path')

const SIZE = 128, K = SIZE / 64, SAMPLES = 4
// The arrow: a tip, two wings and a notch between them; its edge reaches this far out of the shape.
const ARROW = [[0, 25], [17, -15], [0, -5], [-17, -15]], EDGE = 1.5
// The ring: its radius, the black under it and the grey over it (half widths), and how many dashes.
const RING = 13, RING_BLACK = 2.5, RING_GREY = 1, DASHES = 10, GREY = 158

function inside([x, y], poly) {
  let ins = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins
  }
  return ins
}

function toSegment([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}

// The colour of a point, [r, g, b, a] from 0 to 255, or null where nothing is drawn.
const paints = {
  Arrow(p) {
    if (inside(p, ARROW)) return [255, 255, 255, 255]
    const near = Math.min(...ARROW.map((a, i) => toSegment(p, a, ARROW[(i + 1) % ARROW.length])))
    return near <= EDGE ? [0, 0, 0, 255] : null
  },
  NoWay([x, y]) {
    const off = Math.abs(Math.hypot(x, y) - RING)
    const dash = Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI / DASHES)) % 2 === 0
    if (off <= RING_GREY && dash) return [GREY, GREY, GREY, 255]
    return off <= RING_BLACK ? [0, 0, 0, 255] : null
  },
}

// A 32-bit .tga, its rows from the top, each pixel the average of SAMPLES x SAMPLES points.
function draw(paint) {
  const out = Buffer.alloc(18 + SIZE * SIZE * 4)
  out[2] = 2
  out.writeUInt16LE(SIZE, 12)
  out.writeUInt16LE(SIZE, 14)
  out[16] = 32
  out[17] = 0x28
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const sum = [0, 0, 0, 0]
      for (let j = 0; j < SAMPLES; j++) {
        for (let i = 0; i < SAMPLES; i++) {
          const x = (col + (i + 0.5) / SAMPLES) / K - 32, y = 32 - (row + (j + 0.5) / SAMPLES) / K
          const c = paint([x, y])
          if (!c) continue
          for (let n = 0; n < 3; n++) sum[n] += c[n] * c[3] / 255
          sum[3] += c[3]
        }
      }
      const o = 18 + (row * SIZE + col) * 4, a = sum[3] / (SAMPLES * SAMPLES)
      const rgb = sum[3] ? sum.slice(0, 3).map((v) => Math.round(v * 255 / sum[3])) : [0, 0, 0]
      out[o] = rgb[2]; out[o + 1] = rgb[1]; out[o + 2] = rgb[0]; out[o + 3] = Math.round(a)
    }
  }
  return out
}

const build = () => Object.fromEntries(Object.entries(paints).map(([name, paint]) => [name, draw(paint)]))

module.exports = { build }

if (require.main === module) {
  for (const [name, tga] of Object.entries(build())) fs.writeFileSync(path.join(__dirname, 'TwinmapForever', name + '.tga'), tga)
}
