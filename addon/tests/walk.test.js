// "Your path" stops are given no more: a journey still under "Twinmap Walk" is let go once, and a
// walk the app still sends is not taken.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');

const DIR = path.join(__dirname, '..', 'TwinmapForever');
const SP = (owner) => `
  SP = { cancelled = {}, calls = {} }
  ShortestPathForever = { API = {
    Journey = function() return SP.journey end,
    Cancel = function(owner) SP.cancelled[#SP.cancelled + 1] = owner; SP.journey = nil; return true end,
    NavigateRoute = function(owner) SP.calls[#SP.calls + 1] = owner; return true end,
    CurrentStop = function() return nil, "none" end,
  } }
  SP.journey = { owner = "${owner}", goal = { map = 1411, x = 0.5, y = 0.4, title = "Kill Razormane" } }`;

function start(owner) {
  const addon = loadAddon(DIR);
  addon.lua(SP(owner) + ' GAME.north, GAME.west, GAME.facing = 0, 0, 0');
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  return addon;
}

test('a journey left under "Twinmap Walk" is let go after login', () => {
  const addon = start('Twinmap Walk');
  addon.run(4);
  assert.equal(addon.lua('return table.concat(SP.cancelled, ",")'), 'Twinmap Walk');
});

test("Zygor's journey is left alone, and a walk from the app is not taken", () => {
  const addon = start('Zygor');
  addon.lua(`(...).receivers.walk({ t = 9, m = 1414, goal = "1411 50.00 40.00", v = { { x = 60, y = 40, n = 100, w = 0 } } })`);
  addon.run(4);
  assert.equal(addon.lua('return #SP.cancelled + #SP.calls'), 0);
});
