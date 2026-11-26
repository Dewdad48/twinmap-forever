// Which tables hold the game's quest areas (QuestPOIBlob, QuestPOIPoint), and what quest 788 (Legging It? any) has.
import { openClientFiles } from '../../app/src/main/client-files'
import { readTable } from '../../app/src/shared/wdc5'
const cf = openClientFiles(process.argv[2]!)
const tryTable = (id: number) => { try { const b = cf.read(id, true); return b ? readTable(b) : null } catch { return null } }
for (let id = 1251870; id <= 1251895; id++) {
  const t = tryTable(id)
  if (!t || !t.rows.length) continue
  const r = t.rows[0]!
  console.log(id, 'fields', t.fields, 'rows', t.rows.length, 'parent', r.parent, 'first', [r.id, ...Array.from({ length: t.fields }, (_, f) => { try { return r.int(f) } catch { return '?' } })].join(','))
}
