// The step of Zygor Guides Viewer (Forever) on the strip: with the addon, without it, and when its guide ends.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');
const { decodeStrip } = require('./decode');

const DIR = path.join(__dirname, '..', 'TwinmapForever');

function enterWorld(before) {
  const addon = loadAddon(DIR);
  if (before) addon.lua(before);
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  return addon;
}
const told = (addon) => addon.strips().map(decodeStrip).filter((b) => b.section === 'zygor').map((b) => JSON.parse(b.text));

// A stand-in Zygor: its globals as the Forever edition 1.6 holds them.
const ZYGOR = `
  local function Goal(status, text, map, x, y, tooltip)
    return { map = map, x = x, y = y, tooltip = tooltip, GetStatus = function() return status end, GetText = function() return text end }
  end
  local sticky = { goals = { Goal("incomplete", "|cffffffffKill 2 Syndicate Rogues|r (8/10)") } }
  ZGV = { CurrentStepNum = 14,
    CurrentGuide = { title_short = "Leveling Guides\\\\Horde\\\\Hillsbrad Foothills (20-30)", steps = { 1, 2, 3 } },
    CurrentStep = { goals = {
      Goal("complete", "|cff00ff00Talk to|r |Hunit:1|hDeathstalker Lesh|h", 1424, 0.5512, 0.3049),
      Goal("incomplete", "|TInterface\\\\Icons\\\\x:0|t Accept |cffffff00'Time To Strike'|r"),
      Goal("passive", "?", nil, nil, nil, "Walks around."),
      Goal("passive", ""),
      Goal("hidden", "Not shown") } },
    db = { profile = { stickyon = true } },
    GetStickiesAt = function() return { sticky } end,
    Pointer = { ArrowFrame = { waypoint = { m = 1424, x = 0.5512, y = 0.3049, title = "Deathstalker Lesh" } } } }`;

test('without Zygor nothing is told of a guide', () => {
  const addon = enterWorld();
  addon.run(8);
  assert.deepEqual(told(addon), []);
});

test('the step goes out with its plain lines and where the arrow points; then that the guide ended', () => {
  const addon = enterWorld(ZYGOR);
  addon.run(8);
  assert.deepEqual(told(addon).at(-1), {
    g: 'Hillsbrad Foothills (20-30)', n: 14, of: 3, m: 1424, x: 55.12, y: 30.49, name: 'Deathstalker Lesh',
    goals: [{ t: 'Talk to Deathstalker Lesh', s: 1, m: 1424, x: 55.12, y: 30.49 }, { t: "Accept 'Time To Strike'", s: 0 }, { t: 'Walks around.', s: 3 }, { t: 'Kill 2 Syndicate Rogues (8/10)', s: 0, k: 1 }],
  });
  addon.lua('ZGV.CurrentGuide = nil; ZGV.CurrentStep = nil');
  addon.run(6);
  const last = told(addon).at(-1);
  assert.ok(Array.isArray(last) ? last.length === 0 : Object.keys(last).length === 0);
});
