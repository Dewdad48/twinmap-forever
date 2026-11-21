// The arrow's art in the addon is what addon/art.js draws: run `node art.js` after changing it.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { build } = require('../art.js')

test('the arrow and the ring in the addon are the ones art.js draws', () => {
  for (const [name, tga] of Object.entries(build())) {
    assert.ok(tga.equals(fs.readFileSync(path.join(__dirname, '..', 'TwinmapForever', name + '.tga'))), name + '.tga is out of date')
  }
})
