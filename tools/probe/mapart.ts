// Which table holds the tiles of the world map's pictures (UiMapArtTile), and what Orgrimmar's are.
import { openClientFiles } from '../../app/src/main/client-files'
import { readTable } from '../../app/src/shared/wdc5'
const cf = openClientFiles(process.argv[2]!)
const tryTable = (id: number) => { try { const b = cf.read(id, true); return b ? readTable(b) : null } catch (e) { return null } }
const xart = tryTable(1957217)!
console.log('UiMapXMapArt fields', xart.fields, 'rows', xart.rows.length)
const orgArt = xart.rows.filter((r) => [1454, 85, 321].includes(r.int(2)) || [1454, 85, 321].includes(r.int(1)))
console.log('org rows', orgArt.slice(0, 5).map((r) => [r.id, ...Array.from({ length: xart.fields }, (_, f) => r.int(f))]))
for (let id = 1957195; id <= 1957232; id++) {
  const t = tryTable(id)
  if (!t || !t.rows.length) continue
  const r = t.rows[0]!
  console.log(id, 'fields', t.fields, 'rows', t.rows.length, 'first', [r.id, ...Array.from({ length: t.fields }, (_, f) => { try { return r.int(f) } catch { return '?' } })].join(','))
}
