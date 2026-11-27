-- Shortest Path Forever, when the player has it: the journey it guides, read through its public API
-- and told to the app on the strip, whoever started it (Twinmap, the player, another addon).
-- Without Shortest Path nothing is read and nothing is sent.
-- And what Twinmap follows (the route, or the point chosen by itself) is given to Shortest Path to
-- guide, under the name "Twinmap": its line and its arrow take the place of our arrow.
-- The journey is asked for again every few seconds instead of on Shortest Path's notices: a plan
-- ready or worked out again is read on the next look.
local _, ns = ...

local LEGS = 12 -- legs told at most: a journey across the world has fewer
local TEXT = 60 -- letters of a leg's text, and of the goal's name

local function Num(v) if type(v) == "number" and not (issecretvalue and issecretvalue(v)) then return v end end
local function Str(v) if type(v) == "string" and not (issecretvalue and issecretvalue(v)) then return v:sub(1, TEXT) end end

---------------------------------------------------------------------------
-- The way on foot to where the walk under way ends, as Shortest Path itself walks it (API.WalkPath,
-- Shortest Path 1.47 and later): its bends are told with the first leg, so the app draws the line the
-- game leads along instead of finding one of its own. Asked again when that end changes, when the
-- character strays from the line, and every so often as the character walks.
---------------------------------------------------------------------------
local BENDS = 40     -- bends told at most
local STRAY = 25     -- yards from the line's start before the way is asked again
local AGAIN = 12     -- seconds before the way is asked again while walking

local path = { key = nil, w = nil, asked = 0, from = nil, busy = false }

local function Here()
  local m = C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
  local pos = m and C_Map.GetPlayerMapPosition and C_Map.GetPlayerMapPosition(m, "player")
  if not pos then return end
  local x, y = pos.x, pos.y
  if Num(x) and Num(y) and (x > 0 or y > 0) then return { map = m, x = x, y = y } end
end

local function AskWay(api, to)
  if type(api.WalkPath) ~= "function" or InCombatLockdown() then return end
  local key = ("%s %.4f %.4f"):format(to.map, to.x, to.y)
  local north, west = UnitPosition("player")
  north, west = Num(north), Num(west)
  local now = GetTime()
  local moved = path.from and north and west and math.sqrt((north - path.from[1]) ^ 2 + (west - path.from[2]) ^ 2) or 0
  if path.key == key and path.w and (moved < STRAY or now - path.asked < AGAIN) then return end
  if path.busy and now - path.asked < AGAIN then return end
  local here = Here()
  if not here then return end
  if path.key ~= key then path.w = nil end
  path.key, path.asked, path.busy = key, now, true
  local ok = pcall(api.WalkPath, "Twinmap", here, { map = to.map, x = to.x, y = to.y }, function(found)
    path.busy = false
    if path.key ~= key then return end
    if type(found) ~= "table" or type(found.waypoints) ~= "table" then return end
    local w, m = {}, nil
    for _, p in ipairs(found.waypoints) do
      if type(p) == "table" and Num(p.map) and Num(p.x) and Num(p.y) then
        m = m or p.map
        if p.map == m then
          w[#w + 1] = math.floor(p.x * 10000 + 0.5) / 100
          w[#w + 1] = math.floor(p.y * 10000 + 0.5) / 100
        end
      end
    end
    -- Too many bends: every other one in the middle, the ends kept.
    while #w / 2 > BENDS do
      local thin = { w[1], w[2] }
      for i = 3, #w - 2, 4 do thin[#thin + 1] = w[i]; thin[#thin + 1] = w[i + 1] end
      thin[#thin + 1] = w[#w - 1]; thin[#thin + 1] = w[#w]
      w = thin
    end
    if m and #w >= 4 then
      path.w = { m = m, p = w }
      path.from = north and west and { north, west } or nil
    end
  end)
  if not ok then path.busy = false end
end

-- What the app is told: the journey, { loading = true } while its plan is searched, or that there
-- is none. Told from the first journey on, also when there is none: the app must hear it end.
local function Build()
  local api = ShortestPathForever and ShortestPathForever.API
  if not (ns.db and type(api) == "table" and type(api.Journey) == "function") then return end
  local ok, journey, why = pcall(api.Journey)
  if not ok then return end
  if type(journey) ~= "table" or type(journey.goal) ~= "table" then
    if why == "loading" then ns.db.journeyTold = true end
    if not ns.db.journeyTold then return end
    return why == "loading" and { loading = true } or {}
  end
  ns.db.journeyTold = true
  local goal, legs = journey.goal, {}
  for i, leg in ipairs(type(journey.legs) == "table" and journey.legs or {}) do
    if i > LEGS then break end
    legs[i] = { mode = Str(leg.mode), text = Str(leg.text), s = math.floor(Num(leg.seconds) or 0) }
    -- Where the leg starts and ends, as map and percent twice (Shortest Path 1.39 and later; a leg can lack either).
    local from, to = type(leg.from) == "table" and leg.from, type(leg.to) == "table" and leg.to
    if from and to and Num(from.map) and Num(from.x) and Num(from.y) and Num(to.map) and Num(to.x) and Num(to.y) then
      legs[i].p = { from.map, from.x * 100, from.y * 100, to.map, to.x * 100, to.y * 100 }
      -- How high each end is, in whole yards (Shortest Path 1.43 and later, where its planner holds it): the floor the leg starts and ends on.
      legs[i].fz, legs[i].tz = Num(from.z) and math.floor(from.z + 0.5), Num(to.z) and math.floor(to.z + 0.5)
    end
  end
  -- The walk under way: the first leg, when it is on foot.
  local first = type(journey.legs) == "table" and journey.legs[1]
  if legs[1] and legs[1].p and type(first) == "table" and first.mode == "walk" and type(first.to) == "table" then
    AskWay(api, first.to)
    if path.w and path.key == ("%s %.4f %.4f"):format(first.to.map, first.to.x, first.to.y) then legs[1].w = path.w end
  end
  local left = Num(journey.secondsLeft) or 0
  return {
    owner = Str(journey.owner),
    name = Str(goal.title),
    -- The goal as Shortest Path names it: a map of the game (often the continent's) and percent of it.
    m = Num(goal.map), x = Num(goal.x) and goal.x * 100, y = Num(goal.y) and goal.y * 100,
    legs = legs,
    -- In steps of 5 seconds: a walk must not send the strip a block every second.
    left = math.floor(left / 5 + 0.5) * 5,
  }
end

ns.sections[#ns.sections + 1] = { name = "journey", period = 2, build = Build }

---------------------------------------------------------------------------
-- Guiding: what Twinmap follows is what Shortest Path is asked to guide. The route comes first, from
-- the stop it is at to its end; with no route, the point chosen by itself. It is asked once for each
-- route and each point: a journey the player clears in Shortest Path, or that another addon
-- replaces, is not asked for again, and our arrow comes back. Shortest Path refuses in combat and
-- while it loads: the asking is tried again until it is taken.
---------------------------------------------------------------------------

local OWNER = "Twinmap"
local SYNC = 1 -- seconds between two looks

local given     -- what Shortest Path was last given: { key, base = the stop of our route its first stop is }
local live = false -- Shortest Path guides what it was given, now

-- Our arrow hides and the route waits for Shortest Path to say a stop is reached.
function ns.Guiding() return live end

-- What is to be guided: a name for it, its stops as Shortest Path takes them, and the stop of our route the first one is.
local function Wanted()
  local route, index = ns.RouteAt()
  if route and route.stops[index] then
    local stops = {}
    for i = index, #route.stops do
      local s = route.stops[i]
      stops[#stops + 1] = { map = s.m, x = s.x / 100, y = s.y / 100, title = s.name }
    end
    return "route " .. route.t, stops, index
  end
  local pin = ns.PinFollowed()
  if pin then return ("pin %s %s %s"):format(pin.m, pin.x, pin.y), { { map = pin.m, x = pin.x, y = pin.y, title = pin.name } } end
end

local function Sync()
  local api = ShortestPathForever and ShortestPathForever.API
  if not (ns.db and type(api) == "table" and type(api.NavigateRoute) == "function" and type(api.CurrentStop) == "function") then
    live = false
    return
  end
  if InCombatLockdown() then return end
  local key, stops, base = Wanted()
  if not key then
    if given and live and type(api.Cancel) == "function" then api.Cancel(OWNER) end
    given, live = nil, false
    return
  end
  local at = given and given.key == key and Num(api.CurrentStop(OWNER))
  if at then
    live = true
    -- Shortest Path reached a stop of the route: ours moves on with it.
    if given.base then ns.RouteReached(given.base + at - 1) end
    local _, index = ns.RouteAt()
    -- A skip in Twinmap put our route ahead of the journey: the journey is given again from there.
    if not (given.base and index and index > given.base + at - 1) then return end
    key, stops, base = Wanted()
    if not key then return end
  elseif given and given.key == key then
    if not live then return end -- cleared by the player or replaced: not asked again
    live = false
    -- The journey is over. At its goal, what Twinmap follows is done too.
    if type(api.Ended) == "function" and api.Ended(OWNER) == "arrived" then
      if given.base then
        local route = ns.RouteAt()
        if route then ns.RouteReached(#route.stops + 1) end
      else
        ns.Forget()
      end
    end
    return
  end
  if api.NavigateRoute(OWNER, stops) == true then given, live = { key = key, base = base }, true end
end

local since = 0
local guide = CreateFrame("Frame")
guide:SetScript("OnUpdate", function(_, elapsed)
  since = since + elapsed
  if since < SYNC then return end
  since = 0
  if not pcall(Sync) then live = false end
end)
