// A quest the player picks over Zygor's step: Shortest Path is sent there as the player's own journey,
// Zygor's arrow hides, objectives done sends it to the hand-in, and handing it in gives the guide back.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');

const DIR = path.join(__dirname, '..', 'TwinmapForever');
const WORLD = `
  Q = { log = { [1885] = 5, [889] = 3 }, complete = {}, tracked = nil, clicks = {} }
  C_SuperTrack.GetSuperTrackedQuestID = function() return Q.tracked or 0 end
  C_SuperTrack.SetSuperTrackedQuestID = function(q) Q.tracked = q end
  C_QuestLog = C_QuestLog or {}
  C_QuestLog.GetLogIndexForQuestID = function(q) return Q.log[q] end
  C_QuestLog.IsComplete = function(q) return Q.complete[q] == true end
  C_QuestLog.GetTitleForQuestID = function(q) return q == 1885 and "The Shattered Hand" or "Centaur Bracers" end
  ARROW = { alpha = 1, SetAlpha = function(self, a) self.alpha = a end, GetAlpha = function(self) return self.alpha end }
  ZGV = { CurrentStep = { goals = { { questid = 889 } } }, Pointer = { ArrowFrame = ARROW } }
  local function Button(name) _G[name] = { Click = function() Q.clicks[#Q.clicks + 1] = name end } end
  Button("ShortestPathForeverTravelToTrackedQuestButton")
  Button("ShortestPathForeverClearJourneyButton")
  ShortestPathForever = { API = {
    Journey = function() return Q.journey end,
    JourneyState = function() return { distance = Q.far } end,
  } }`;
const clicks = (addon) => addon.lua('return table.concat(Q.clicks, ",")').replace(/ShortestPathForever|Button/g, '');

function start() {
  const addon = loadAddon(DIR);
  addon.lua(WORLD);
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.run(5);
  return addon;
}
function pick(addon, q) {
  addon.lua(`Q.tracked = ${q}`);
  addon.fire('SUPER_TRACKING_CHANGED');
}

test('picking a quest not on the guide\'s step sends the journey there, held until it is handed in', () => {
  const addon = start();
  pick(addon, 1885);
  assert.equal(clicks(addon), 'TravelToTrackedQuest');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 0, "Zygor's arrow hidden");
  addon.lua('Q.journey = { goal = { map = 1454, x = 0.5, y = 0.5 } }; Q.far = 2600');
  addon.run(6);
  // The objectives done: planned again, to the hand-in.
  addon.lua('Q.complete[1885] = true');
  addon.run(2);
  assert.equal(clicks(addon), 'TravelToTrackedQuest,TravelToTrackedQuest');
  addon.run(6);
  // Handed in: the guide leads again.
  addon.lua('Q.log[1885] = nil');
  addon.fire('QUEST_TURNED_IN', '1885');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 1);
  assert.equal(addon.lua('local ns = ...; return ns.db.focus == nil'), 'true');
});

test('arriving where the objectives are keeps the quest; clearing the journey far off gives the guide back', () => {
  const addon = start();
  pick(addon, 1885);
  addon.lua('Q.journey = { goal = { map = 1454, x = 0.5, y = 0.5 } }; Q.far = 30');
  addon.run(6);
  addon.lua('Q.journey = nil');
  addon.run(4);
  assert.equal(addon.lua('local ns = ...; return ns.db.focus ~= nil'), 'true', 'arrived: kept');
  pick(addon, 0);
  assert.equal(addon.lua('local ns = ...; return ns.db.focus == nil'), 'true', 'tracking cleared: back to the guide');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 1);
});

test("one of the guide's own quests is not taken over", () => {
  const addon = start();
  pick(addon, 889);
  assert.equal(clicks(addon), '');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 1);
});

test('a quest Shortest Path finds no place for gives the guide back', () => {
  const addon = start();
  pick(addon, 1885);
  addon.run(12);
  assert.equal(addon.lua('local ns = ...; return ns.db.focus == nil'), 'true');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 1);
});

test('a quest already picked when the game starts is taken, to its hand-in when its objectives are done', () => {
  const addon = loadAddon(DIR);
  addon.lua(WORLD + ' Q.tracked = 1885; Q.complete[1885] = true');
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.run(6);
  assert.equal(clicks(addon), 'TravelToTrackedQuest');
  assert.equal(Number(addon.lua('return ARROW.alpha')), 0);
});

test("a quest the guide's step holds is not taken at start", () => {
  const addon = loadAddon(DIR);
  addon.lua(WORLD + ' Q.tracked = 889');
  addon.fire('PLAYER_LOGIN');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.run(6);
  assert.equal(clicks(addon), '');
});
