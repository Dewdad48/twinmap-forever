// The walk the app found on the player's own trails, given to Shortest Path to guide: a journey another
// addon guides is taken for the same goal, points passed are let go, and Twinmap's own route is never taken.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');

const DIR = path.join(__dirname, '..', 'TwinmapForever');

// SP.journey: what Journey() answers; SP.calls: what it was asked to guide.
const SP = `
  SP = { calls = {} }
  ShortestPathForever = { API = {
    Journey = function() if SP.journey then return SP.journey end return nil, "none" end,
    NavigateRoute = function(owner, stops)
      local names = {}
      for i, s in ipairs(stops) do names[i] = ("%s %.3f %.3f"):format(s.title or "?", s.x, s.y) end
      SP.calls[#SP.calls + 1] = owner .. ": " .. table.concat(names, ", ")
      SP.journey = { owner = owner, goal = SP.journey.goal }
      return true
    end,
    CurrentStop = function() return nil, "none" end,
  } }
  SP.journey = { owner = "Zygor", goal = { map = 1411, x = 0.5123, y = 0.4011, title = "Kill Razormane" } }`;
const WALK = `(...).receivers.walk({ t = 9, m = 1414, goal = "1411 51.23 40.11", v = {
  { x = 60, y = 40, n = 100, w = 0 }, { x = 61, y = 41, n = 200, w = 0 }, { x = 62, y = 42, n = 300, w = 0 } } })`;
const calls = (addon) => addon.lua('return table.concat(SP.calls, " | ")');

function start(before) {
  const addon = loadAddon(DIR);
  addon.lua(SP + (before || ''));
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  return addon;
}

test("Zygor's journey is taken with the walk for its goal, its goal kept last", () => {
  const addon = start(' GAME.north, GAME.west, GAME.facing = 0, 0, 0');
  addon.lua(WALK);
  addon.run(3);
  assert.equal(calls(addon), 'Twinmap Walk: Your path 0.600 0.400, Your path 0.610 0.410, Your path 0.620 0.420, Kill Razormane 0.512 0.401');
  addon.run(3);
  assert.equal(calls(addon).split(' | ').length, 1, 'given once');
  // Past the first point, on the way to the second: it is let go.
  addon.lua('GAME.north = 150');
  addon.run(3);
  assert.equal(calls(addon).split(' | ').at(-1), 'Twinmap Walk: Your path 0.610 0.410, Your path 0.620 0.420, Kill Razormane 0.512 0.401');
});

test('a walk for another goal is not given, nor is Twinmap\'s own route taken', () => {
  const addon = start(' GAME.north, GAME.west, GAME.facing = 0, 0, 0');
  addon.lua(WALK.replace('51.23', '12.00'));
  addon.run(3);
  assert.equal(calls(addon), '');
  addon.lua('SP.journey.owner = "Twinmap"');
  addon.lua(WALK);
  addon.run(3);
  assert.equal(calls(addon), '');
});

test('a walk far out of its way to keep to trails is not given', () => {
  const addon = start(' GAME.north, GAME.west, GAME.facing = 0, 0, 0');
  // 300 yards north as the crow flies, but the trail swings 250 yards west and back.
  addon.lua(WALK.replace('n = 100, w = 0', 'n = 50, w = 250').replace('n = 200, w = 0', 'n = 200, w = 250'));
  addon.run(3);
  assert.equal(calls(addon), '');
});
