-- Darrell's fork: the creature the player has targeted, by its number and name, so the app can show
-- where QuestieDB has more of it. The game tells no one where another creature stands: only what it is.
-- Nothing is sent for a player or a pet of one; once that the target is gone.
local _, ns = ...

local function Plain(v)
  if type(v) == "string" and not (issecretvalue and issecretvalue(v)) and v ~= "" then return v:sub(1, 60) end
end

local function Build()
  if not ns.db then return end
  local ok, guid = pcall(UnitGUID, "target")
  guid = ok and Plain(guid)
  -- A creature's number is the sixth part of its GUID: Creature-0-[server]-[instance]-[zone]-[number]-[spawn].
  local id = guid and tonumber(guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)%-") or guid:match("^Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)%-"))
  if not id then
    if not ns.db.targetTold then return end
    ns.db.targetTold = nil
    return {}
  end
  ns.db.targetTold = true
  local fine, name = pcall(UnitName, "target")
  local dead = select(2, pcall(UnitIsDead, "target"))
  return { id = id, name = fine and Plain(name) or nil, dead = (dead == true) and 1 or nil }
end

ns.sections[#ns.sections + 1] = { name = "target", period = 1, build = Build }
