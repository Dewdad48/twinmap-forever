// Which table holds the tiles of the world map's pictures (UiMapArtTile), and what Orgrimmar's are.
import { openClientFiles } from '../../app/src/main/client-files'
import { readTable } from '../../app/src/shared/wdc5'
const cf = openClientFiles(process.argv[2]!)
const tryTable = (id: number) => { try { const b = cf.read(id, true); return b ? readTable(b) : null } catch (e) { return null } }
const xart = tryTable(1957217)!
console.log('UiMapXMapArt fields', xart.fields, 'rows', xart.rows.length)
console.log('xart rows', xart.rows.slice(0, 60).map((r) => `${r.parent}:${r.int(0)}/${r.int(1)}`).join(' '))
const ui = tryTable(1957206)!
console.log('city maps', ui.rows.filter((r) => /orgrimmar|thunder bluff|undercity|stormwind|ironforge|darnassus/i.test(r.text(0))).map((r) => `${r.id} ${r.text(0)}`).join(' | '))
for (let id = 1957195; id <= 1957232; id++) {
  const t = tryTable(id)
  if (!t || !t.rows.length) continue
  const r = t.rows[0]!
  console.log(id, 'fields', t.fields, 'rows', t.rows.length, 'first', [r.id, ...Array.from({ length: t.fields }, (_, f) => { try { return r.int(f) } catch { return '?' } })].join(','))
}
