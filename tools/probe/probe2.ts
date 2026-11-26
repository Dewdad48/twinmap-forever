import { openClientFiles } from '../../app/src/main/client-files'
import { decodeBlp } from '../../app/src/shared/blp'
import { chunksOf, groundLayers, buildingRoot, buildingGroup } from '../../app/src/shared/world3d'
const cf = openClientFiles(process.argv[2]!)
const read = (id: number) => { try { return cf.read(id, true) } catch { return null } }
const wdt = read(782779)!
const cs = chunksOf(wdt)
const mphd = cs.find((c) => c.tag === 'MPHD')!.data.readUInt32LE(0); console.log('MPHD flags', mphd.toString(16))
const maid = cs.find((c) => c.tag === 'MAID')!.data
const col = 40, row = 28, blk = row * 64 + col
const g = groundLayers(read(maid.readUInt32LE(blk * 32 + 12))!, !!(mphd & 0x84))!
console.log('textures', g.textures, 'layers0', Array.from(g.layers.subarray(0, 16)))
let s = [0, 0, 0]; for (let i = 0; i < g.alpha.length; i++) s[i % 3] += g.alpha[i]!; console.log('alpha means', s.map((x) => (x / (g.alpha.length / 3)).toFixed(1)))
for (const t of g.textures.slice(0, 3)) { const img = decodeBlp(read(t)!); let r=0,gg=0,b=0; for (let i=0;i<img.width*img.height;i++){r+=img.rgb[i*3]!;gg+=img.rgb[i*3+1]!;b+=img.rgb[i*3+2]!} const k=img.width*img.height; console.log('tex', t, img.width, Math.round(r/k), Math.round(gg/k), Math.round(b/k)) }
const root = read(7964229)!
for (const lod of [0, 1, 2, 3]) {
  const r = buildingRoot(root, lod)!; let v = 0, t = 0, out = 0, miss = 0
  for (const gr of r.groups) { if (!gr.outside) continue; out++; const f = read(gr.file); if (!f) { miss++; continue } const m = buildingGroup(f); if (!m) continue; v += m.positions.length / 3; t += m.indices.length / 3 }
  console.log('lod', lod, 'outside groups', out, 'missing', miss, 'verts', v, 'tris', t)
}
const r0 = buildingRoot(root, 0)!; console.log('materials', r0.materials.length, r0.materials.slice(0, 6))
