const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAddon } = require('./client');
const { decodeStrip } = require('./decode');

const DIR = path.join(__dirname, '..', 'TwinmapForever');
const KEY = 'Catubbio Sucameli';

// A gnome warlock with some money, a backpack, one bag, the reagent bag, a keyring and two things worn.
const WORLD = `GAME.surname, GAME.level, GAME.race, GAME.class, GAME.money = "Sucameli", 24, "Gnome", "WARLOCK", 3440
  GAME.bags = { [0] = { size = 16, items = { [1] = { 6948, 1 }, [3] = { 159, 5 } } }, [1] = { size = 6, items = {} }, [5] = { size = 12, items = { [2] = { 2447, 7 } } }, [-2] = { size = 4, items = { [1] = { 5396, 1 } } } }
  GAME.worn = { [1] = { 4245, 30, 35 }, [5] = { 6097 } }`;

function enterWorld(before = WORLD) {
  const addon = loadAddon(DIR);
  if (before) addon.lua(before);
  addon.fire('PLAYER_LOGIN');
  addon.lua('local ns = ...; ns.db.mode = "fast"');
  addon.fire('PLAYER_ENTERING_WORLD');
  return addon;
}
const sheets = (addon) => addon.strips().map(decodeStrip).filter((b) => b.section === 'sheet').map((b) => JSON.parse(b.text));
// The app says it holds this character's sheet up to rev, under code.
const appHolds = (addon, code, rev) => addon.lua(`local ns = ...; ns.receivers.sheet({ ["${KEY}"] = { code = "${code}", rev = ${rev} } })`);

test('the whole sheet goes out at first, with who, money, bags with the reagent bag and the keyring, and what is worn', () => {
  const addon = enterWorld();
  addon.run(10);
  const [sent] = sheets(addon);
  assert.equal(sent.key, KEY);
  assert.match(sent.code, /^[0-9a-f]{8}$/);
  assert.deepEqual(sent.p, {
    who: { name: KEY, race: 'Gnome', class: 'WARLOCK', level: 24 },
    money: 3440,
    bags: [{ b: 0, n: 16, s: [[1, 6948, 1], [3, 159, 5]] }, { b: 1, n: 6, s: [] }, { b: 5, n: 12, s: [[2, 2447, 7]] }, { b: -2, n: 4, s: [[1, 5396, 1]] }],
    gear: [[1, 4245, 30, 35], [5, 6097]],
  });
  assert.equal(sent.p.bank, undefined, 'the bank went out before it was ever open');
});

test('what the app holds is not sent again; a purchase sends money and bags only', () => {
  const addon = enterWorld();
  addon.run(10);
  const first = sheets(addon).at(-1);
  appHolds(addon, first.code, first.rev);
  addon.run(40);
  assert.equal(sheets(addon).length, 1, 'the sheet went out again after the app had it');

  addon.lua('GAME.money = 3415; GAME.bags[0].items[3] = { 159, 10 }');
  addon.run(4);
  const bought = sheets(addon).at(-1);
  assert.deepEqual(Object.keys(bought.p).sort(), ['bags', 'money']);
  assert.equal(bought.money, undefined);
  assert.equal(bought.p.money, 3415);
  assert.ok(bought.rev > first.rev);
});

test('a change the app has not taken goes out again every half minute, until it has', () => {
  const addon = enterWorld();
  addon.run(10);
  const first = sheets(addon).at(-1);
  addon.run(65);
  assert.equal(sheets(addon).length, 3, 'not sent again while the app did not have it');
  appHolds(addon, first.code, first.rev);
  addon.run(65);
  assert.equal(sheets(addon).length, 3);
});

test('what changed while the app was closed reaches it when it opens, across a /reload', () => {
  const addon = enterWorld();
  addon.run(10);
  const first = sheets(addon).at(-1);
  // The app took it and closed: its word stays among the parts the addon keeps.
  addon.lua(`TwinmapForeverDB.inbox = { id = "test", seq = 1, parts = { sheet = { ["${KEY}"] = { code = "${first.code}", rev = ${first.rev} } } } }`);
  addon.lua('local ns = ...; ns.receivers.sheet(TwinmapForeverDB.inbox.parts.sheet)');
  addon.run(10);
  const before = sheets(addon).length;

  addon.lua('GAME.money = 9000');
  addon.run(4);
  addon.lua('GAME.level = 25');
  addon.reload();
  addon.fire('PLAYER_LOGIN');
  addon.fire('PLAYER_ENTERING_WORLD');
  addon.lua('GAME.worn[5] = nil');
  addon.run(10);
  const after = sheets(addon).slice(before);
  const last = after.at(-1);
  assert.equal(last.code, first.code, 'a /reload started the sheet over');
  assert.deepEqual(Object.keys(last.p).sort(), ['gear', 'money', 'who']);
  assert.equal(last.p.money, 9000);
  assert.equal(last.p.who.level, 25);
});

test('the bank goes out once open, and stays as it was seen after it closes', () => {
  const addon = enterWorld(WORLD + `
    GAME.bags[-1] = { size = 24, items = { [2] = { 2589, 20 } } }
    GAME.bags[6] = { size = 8, items = {} }`);
  addon.run(10);
  const first = sheets(addon).at(-1);
  assert.equal(first.p.bank, undefined);
  appHolds(addon, first.code, first.rev);

  addon.fire('BANKFRAME_OPENED');
  addon.run(4);
  assert.deepEqual(sheets(addon).at(-1).p, { bank: [{ b: -1, n: 24, s: [[2, 2589, 20]] }, { b: 6, n: 8, s: [] }] });
  addon.fire('BANKFRAME_CLOSED');
  appHolds(addon, first.code, sheets(addon).at(-1).rev);
  const count = sheets(addon).length;
  addon.lua('GAME.bags[-1].items[2] = nil');
  addon.run(10);
  assert.equal(sheets(addon).length, count, 'the bank was read while closed');
});

test('an app that holds another sheet gets this one whole; an app ahead of it gets it whole, past its revision', () => {
  const addon = enterWorld();
  addon.run(10);
  const first = sheets(addon).at(-1);

  appHolds(addon, 'deadbeef', 50);
  addon.lua('GAME.money = 1');
  addon.run(4);
  assert.deepEqual(Object.keys(sheets(addon).at(-1).p).sort(), ['bags', 'gear', 'money', 'who']);

  appHolds(addon, first.code, 50);
  addon.run(4);
  const again = sheets(addon).at(-1);
  assert.equal(again.code, first.code);
  assert.ok(again.rev > 50, `revision ${again.rev}`);
  assert.deepEqual(Object.keys(again.p).sort(), ['bags', 'gear', 'money', 'who']);
});

test('in a fight the sheet waits', () => {
  const addon = enterWorld();
  addon.run(10);
  const first = sheets(addon).at(-1);
  appHolds(addon, first.code, first.rev);
  addon.lua('GAME.combat, GAME.money = true, 100');
  addon.run(10);
  assert.equal(sheets(addon).length, 1);
  addon.lua('GAME.combat = false');
  addon.run(4);
  assert.equal(sheets(addon).at(-1).p.money, 100);
});
