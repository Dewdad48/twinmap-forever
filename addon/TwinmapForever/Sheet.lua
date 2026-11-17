-- The character sheet, for the app to keep: who the character is, money, bags, bank and what is
-- worn. Each piece carries the revision of its last change, saved with the character
-- (TwinmapForeverSheet). The app tells back, as its part "sheet", the code and revision it holds
-- for each character; whatever changed after that goes out on the strip, and again every so often,
-- until the app says it has it. So what changed while the app was closed reaches it when it opens.
-- The code is drawn once, with the sheet: a sheet started again (its saved file lost) has another
-- one, and the app then takes it whole. An app ahead of the sheet (the game closed before it
-- saved) is sent everything again, under a revision past the app's.
-- Section "sheet": { key = full name, code, rev, p = { piece = data, ... } }, only the pieces newer
-- than what the app holds; nothing at all when it holds everything.
--   who   { name, race, class, level }   race and class as the game's tokens ("Gnome", "WARLOCK")
--   money copper
--   bags  { { b = container, n = slots, s = { { slot, item, count }, ... } }, ... } backpack, bags, keyring
--   bank  the same for the bank and its bags, as they were when last open
--   gear  { { slot, item, durability, most }, ... } durability missing for what does not wear
local _, ns = ...

local BAGS = { 0, 1, 2, 3, 4, -2 } -- backpack, the four bags, keyring
local BANK = { -1, 5, 6, 7, 8, 9, 10 } -- the bank, and its six bags
local WORN = 19 -- equipment slots, head to tabard

local function Ok(ok, ...) if ok then return ... end end
local function Try(f, ...) if f then return Ok(pcall(f, ...)) end end
local function IsSecret(v) return issecretvalue and issecretvalue(v) end
local function Num(v) if type(v) == "number" and not IsSecret(v) then return v end end
local function Str(v) if type(v) == "string" and not IsSecret(v) and v ~= "" then return v end end

-- On Forever a character has a name and a surname, in the two values the game gives.
local function Key()
  local name, surname = Try(UnitFullName, "player")
  name, surname = Str(name), Str(surname)
  return name and (surname and name .. " " .. surname or name)
end

-- What a container holds, slot by slot; nothing for a container that is not there.
-- ponytail: the item's number only, so "of the Bear" and "of the Eagle" are one; the link when Items needs it.
local function Container(bag)
  local size = C_Container and Num(Try(C_Container.GetContainerNumSlots, bag)) or 0
  if size <= 0 then return nil end
  local held = {}
  for slot = 1, size do
    local info = Try(C_Container.GetContainerItemInfo, bag, slot)
    local item = type(info) == "table" and Num(info.itemID)
    if item then held[#held + 1] = { slot, item, Num(info.stackCount) or 1 } end
  end
  return { b = bag, n = size, s = held }
end

local function Containers(list)
  local out = {}
  for _, bag in ipairs(list) do out[#out + 1] = Container(bag) end
  return out
end

local function Worn()
  local out = {}
  for slot = 1, WORN do
    local item = Num(Try(GetInventoryItemID, "player", slot))
    if item then
      local now, most = Try(GetInventoryItemDurability, slot)
      out[#out + 1] = { slot, item, Num(now), Num(most) }
    end
  end
  return out
end

local bankOpen = false

-- The pieces as the game tells them now. The bank only while it is open: the game tells it no other time.
local function Read()
  local _, race = Try(UnitRace, "player")
  local _, class = Try(UnitClass, "player")
  local pieces = {
    who = { name = Key(), race = Str(race), class = Str(class), level = Num(Try(UnitLevel, "player")) },
    money = Num(Try(GetMoney)),
    bags = Containers(BAGS),
    gear = Worn(),
  }
  if bankOpen then pieces.bank = Containers(BANK) end
  return pieces
end

local function NewCode() return string.format("%04x%04x", math.random(0, 0xffff), math.random(0, 0xffff)) end

-- The saved sheet, made right if it is missing or not ours.
local function Saved()
  local s = TwinmapForeverSheet
  if type(s) ~= "table" or type(s.code) ~= "string" or not Num(s.rev) or type(s.pieces) ~= "table" then
    s = { code = NewCode(), rev = 0, pieces = {} }
    TwinmapForeverSheet = s
  end
  return s
end

-- A piece whose text changed takes the next revision.
local function Update(s)
  for name, data in pairs(Read()) do
    local held = s.pieces[name]
    if not held or ns.Json(held.data) ~= ns.Json(data) then
      s.rev = s.rev + 1
      s.pieces[name] = { rev = s.rev, data = data }
    end
  end
end

-- The app's word: { [key] = { code, rev } }, what it holds of each character's sheet.
ns.receivers = ns.receivers or {} -- Inbox.lua, which calls them, is loaded after this file
local told = {}
ns.receivers.sheet = function(value) told = type(value) == "table" and value or {} end

local function Build()
  local key = ns.ready and Key()
  if not key then return end
  local s = Saved()
  Update(s)
  local word = told[key]
  local since = 0
  if type(word) == "table" and word.code == s.code and Num(word.rev) then
    if word.rev > s.rev then
      -- The app has more than this sheet remembers: everything again, past the app's revision.
      s.rev = word.rev + 1
      for _, piece in pairs(s.pieces) do piece.rev = s.rev end
    else
      since = word.rev
    end
  end
  if s.rev <= since then return end
  local p = {}
  for name, piece in pairs(s.pieces) do
    if piece.rev > since then p[name] = piece.data end
  end
  return { key = key, code = s.code, rev = s.rev, p = p }
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("BANKFRAME_OPENED")
frame:RegisterEvent("BANKFRAME_CLOSED")
frame:SetScript("OnEvent", function(_, event) bankOpen = event == "BANKFRAME_OPENED" end)

ns.sections[#ns.sections + 1] = { name = "sheet", period = 2, build = Build }
