// Trial of the city maps: makes them into a folder from the game's files.
import { openClientFiles } from '../../app/src/main/client-files'
import { makeCities, UI_MAP_ART_TILE, UI_MAP_X_MAP_ART } from '../../app/src/main/cities'
import { gameMaps, UI_MAP_ASSIGNMENT_FILE, UI_MAP_FILE } from '../../app/src/shared/maps'
import { readTable } from '../../app/src/shared/wdc5'
const cf = openClientFiles(process.argv[2]!)
const t = (id: number) => readTable(cf.read(id, true)!)
const maps = gameMaps(t(UI_MAP_FILE), t(UI_MAP_ASSIGNMENT_FILE))
console.log(makeCities(maps, t(UI_MAP_X_MAP_ART), t(UI_MAP_ART_TILE), (id) => cf.read(id, true), process.argv[3]!))
