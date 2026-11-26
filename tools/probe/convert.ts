// Trial of the 3D conversion on a few blocks round Orgrimmar: sizes and time.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { openClientFiles } from '../../app/src/main/client-files'
import { convertWorld3d } from '../../app/src/main/world3d'
const cf = openClientFiles(process.argv[2]!), out = process.argv[3]!
const only = new Set<number>()
for (let c = 39; c <= 41; c++) for (let r = 27; r <= 29; r++) only.add(r * 64 + c)
const t = Date.now()
console.log(convertWorld3d((id) => cf.read(id, true), out, only), (Date.now() - t) / 1000, 's')
const walk = (d: string): [number, number] => readdirSync(d).reduce<[number, number]>((a, n) => { const p = join(d, n), s = statSync(p); if (s.isDirectory()) { const [x, y] = walk(p); return [a[0] + x, a[1] + y] } return [a[0] + 1, a[1] + s.size] }, [0, 0])
for (const d of ['kalimdor/ground', 'gtex', 'wmo2']) { try { const [n, b] = walk(join(out, d)); console.log(d, n, 'files', (b / 1e6).toFixed(1), 'MB') } catch { console.log(d, 'none') } }
