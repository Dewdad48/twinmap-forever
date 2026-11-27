-- The walk Twinmap found on the player's own trails (the app keeps where the character walked), given
-- to Shortest Path to guide: a few points on the way to the end of the walk under way, then the
-- journey's own goal. So Shortest Path's line in the game, on the map and the minimap, keeps to ways
-- the player has walked. Only a journey another addon guides is taken this way (a guide such as
-- Zygor, Shortest Path's own), and only the one the app found the walk for: when that addon moves
-- on (a new step), it guides again, and the app finds the walk to the new goal.
-- value: { t, m = the continent's map, goal = "map x y" in percent, v = { { x, y = percent of m, z, n, w = yards north and west } } }
local _, ns = ...

local OWNER = "Twinmap Walk"
local TWINMAP = "Twinmap" -- the route Twinmap itself guides (ShortestPath.lua): never taken
local LOOK = 1 -- seconds between looks
local ARRIVE = 20 -- yards from a point for it to be reached
local PAST = 12 -- yards nearer the point after than the point itself is to it: past it, on the way

local walk      -- the walk the app sent
local given     -- the walk given to Shortest Path, and the goal it was given with
local function Num(v) if type(v) == "number" and not (issecretvalue and issecretvalue(v)) then return v end end

local function API()
  local api = ShortestPathForever and ShortestPathForever.API
  if type(api) == "table" and type(api.NavigateRoute) == "function" and type(api.Journey) == "function" then return api end
end

-- The goal the app found the walk for is the goal of this journey: the same place, to its rounding.
local function SameGoal(key, goal)
  local m, x, y = key:match("^(%d+) ([%d.]+) ([%d.]+)$")
  m, x, y = tonumber(m), tonumber(x), tonumber(y)
  return m and Num(goal.map) == m and Num(goal.x) and Num(goal.y) and math.abs(goal.x * 100 - x) <= 0.02 and math.abs(goal.y * 100 - y) <= 0.02
end

local function Checked(value)
  if type(value) ~= "table" or type(value.t) ~= "number" or type(value.m) ~= "number" or type(value.goal) ~= "string" or type(value.v) ~= "table" or #value.v == 0 then return end
  for _, p in ipairs(value.v) do
    if type(p) ~= "table" or type(p.x) ~= "number" or type(p.y) ~= "number" or type(p.n) ~= "number" or type(p.w) ~= "number" then return end
  end
  return value
end

ns.receivers.walk = function(value)
  walk = Checked(value)
end

-- The points not reached nor passed yet, from where the character stands (yards north and west).
local function Ahead(v, north, west)
  local from = 1
  for i, p in ipairs(v) do
    local d = math.sqrt((p.n - north) ^ 2 + (p.w - west) ^ 2)
    if d <= ARRIVE then from = i + 1 end
    local nextP = v[i + 1]
    if nextP then
      local toNext = math.sqrt((nextP.n - north) ^ 2 + (nextP.w - west) ^ 2)
      local between = math.sqrt((nextP.n - p.n) ^ 2 + (nextP.w - p.w) ^ 2)
      if toNext + PAST < between then from = i + 1 end
    end
  end
  local out = {}
  for i = from, #v do out[#out + 1] = v[i] end
  return out
end

local function Give(api, m, v, goal, title)
  local stops = {}
  for _, p in ipairs(v) do
    stops[#stops + 1] = { map = m, x = p.x / 100, y = p.y / 100, z = p.z, radius = ARRIVE, title = "Your path" }
  end
  stops[#stops + 1] = { map = goal.map, x = goal.x, y = goal.y, title = title, hold = true }
  return api.NavigateRoute(OWNER, stops) == true
end

local function Look()
  local api = API()
  if not api or InCombatLockdown() then return end
  local ok, journey = pcall(api.Journey)
  if not ok or type(journey) ~= "table" or type(journey.goal) ~= "table" then
    given = nil
    return
  end
  local owner = journey.owner
  if owner == TWINMAP then return end
  local north, west = UnitPosition("player")
  north, west = Num(north), Num(west)
  if not (north and west) then return end
  if owner == OWNER then
    -- Ours: points passed on the way are let go, so Shortest Path never leads back to one.
    if not given then return end
    local left = Ahead(given.v, north, west)
    if #left < #given.v and #left > 0 then
      if Give(api, given.m, left, given.goal, given.title) then given.v = left end
    end
    return
  end
  -- Another's journey: taken when the app's walk is for its goal, and given a walk not given yet.
  if not (walk and SameGoal(walk.goal, journey.goal)) then return end
  if given and given.t == walk.t then return end
  local left = Ahead(walk.v, north, west)
  if #left == 0 then return end
  local goal = { map = journey.goal.map, x = journey.goal.x, y = journey.goal.y }
  local title = type(journey.goal.title) == "string" and journey.goal.title or nil
  if Give(api, walk.m, left, goal, title) then given = { t = walk.t, m = walk.m, v = left, goal = goal, title = title } end
end

local since = 0
local frame = CreateFrame("Frame")
frame:SetScript("OnUpdate", function(_, elapsed)
  since = since + elapsed
  if since < LOOK then return end
  since = 0
  pcall(Look)
end)
