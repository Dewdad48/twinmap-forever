// The creature targeted, on the strip: its number and name; once nothing when the target goes.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');
const { decodeStrip } = require('./decode');

const DIR = path.join(__dirname, '..', 'TwinmapForever');
const told = (addon) => addon.strips().map(decodeStrip).filter((b) => b.section === 'target').map((b) => JSON.parse(b.text));

test('a creature targeted is told by its number and name, then that the target is gone', () => {
  const addon = loadAddon(DIR);
  addon.lua('GAME.target = "Creature-0-5250-1-11-3110-0000ABCDEF"; GAME.creatures = { ["Creature-0-5250-1-11-3110-0000ABCDEF"] = { name = "Dreadmaw Crocolisk" } }');
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.run(6);
  assert.deepEqual(told(addon).at(-1), { id: 3110, name: 'Dreadmaw Crocolisk' });
  addon.lua('GAME.target = nil');
  addon.run(6);
  const last = told(addon).at(-1);
  assert.ok(Array.isArray(last) ? last.length === 0 : Object.keys(last).length === 0);
});

test('a player targeted is not told', () => {
  const addon = loadAddon(DIR);
  addon.lua('GAME.target = "Player-5250-00ABCDEF"');
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.run(6);
  assert.deepEqual(told(addon), []);
});
