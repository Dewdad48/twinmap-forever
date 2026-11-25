-- Zygor Guides Viewer (Forever edition), when the player has it: the guide it shows, the step it is
-- on, that step's lines, and where its arrow points, told to the app on the strip. Read only: the
-- guide is never moved on, and nothing of Zygor's own guides is kept or sent beyond the step on screen.
-- Without Zygor nothing is read and nothing is sent.
local _, ns = ...

local GOALS = 10 -- lines told at most, of the step and its sticky steps
local TEXT = 70  -- letters of a line, and of the guide's name

local function Num(v) if type(v) == "number" and not (issecretvalue and issecretvalue(v)) then return v end end

-- The words as the player reads them, without colours, pictures or links.
local function Plain(v)
  if type(v) ~= "string" or (issecretvalue and issecretvalue(v)) then return end
  v = v:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|T.-|t", ""):gsub("|A.-|a", ""):gsub("|H.-|h(.-)|h", "%1"):gsub("|n", " ")
  v = v:gsub("%s+", " "):match("^%s*(.-)%s*$")
  if v ~= "" then return v:sub(1, TEXT) end
end

-- A place as Zygor holds it (a map of the game and 0 to 1), as the strip tells places: map and percent.
local function Place(m, x, y)
  m, x, y = Num(m), Num(x), Num(y)
  if m and x and y and x >= 0 and x <= 1 and y >= 0 and y <= 1 then return m, math.floor(x * 10000 + 0.5) / 100, math.floor(y * 10000 + 0.5) / 100 end
end

local function Build()
  local zgv = rawget(_G, "ZGV")
  if not (ns.db and type(zgv) == "table") then return end
  local guide, step = zgv.CurrentGuide, zgv.CurrentStep
  if type(guide) ~= "table" or type(step) ~= "table" then
    -- Told once there is none, so the app hears the guide end.
    if not ns.db.zygorTold then return end
    return {}
  end
  ns.db.zygorTold = true
  -- The lines as Zygor's own window writes them (Skins/Default/ViewerFrame.lua): a hidden line
  -- left out, a line with no words of its own ("?") told by its tip, and the tip under a line when
  -- Zygor is set to show tips below. Then the lines of the sticky steps Zygor shows with it.
  local profile = type(zgv.db) == "table" and type(zgv.db.profile) == "table" and zgv.db.profile or {}
  local goals = {}
  local function Add(row) if #goals < GOALS then goals[#goals + 1] = row end end
  local function Lines(st, sticky)
    for _, goal in ipairs(type(st.goals) == "table" and st.goals or {}) do
      if #goals >= GOALS then return end
      local ok, status = pcall(goal.GetStatus, goal)
      if ok and status ~= "hidden" then
        local fine, text = pcall(goal.GetText, goal, true, false)
        text = fine and type(text) == "string" and text or ""
        local tip = Plain(goal.tooltip)
        local row
        if text ~= "?" and text ~= "" then
          text = Plain(text)
          if text then row = { t = text, s = (status == "complete" and 1) or ((status == "impossible" or status == "obsolete") and 2) or 0 } end
        elseif tip then
          row, tip = { t = tip, s = 3 }, nil
        end
        if row then
          local m, x, y = Place(goal.map, goal.x, goal.y)
          if m then row.m, row.x, row.y = m, x, y end
          if sticky then row.k = 1 end
          Add(row)
          if tip and profile.tooltipsbelow then Add({ t = tip, s = 3, k = sticky and 1 or nil }) end
        end
      end
    end
  end
  Lines(step)
  if profile.stickyon and type(zgv.GetStickiesAt) == "function" then
    local ok, stickies = pcall(zgv.GetStickiesAt, zgv, zgv.CurrentStepNum)
    if ok and type(stickies) == "table" then
      for _, sticky in ipairs(stickies) do
        if type(sticky) == "table" and sticky ~= step then Lines(sticky, true) end
      end
    end
  end
  local out = {
    -- The guide's own name, without the folders of Zygor's menu: "Hillsbrad Foothills (20-30)".
    g = Plain(type(guide.title_short or guide.title) == "string" and (guide.title_short or guide.title):match("([^\\]+)$")),
    n = Num(zgv.CurrentStepNum),
    of = type(guide.steps) == "table" and #guide.steps or nil,
    goals = goals,
  }
  -- Where Zygor's arrow points now: the goal it is walking the player to.
  local way = type(zgv.Pointer) == "table" and type(zgv.Pointer.ArrowFrame) == "table" and zgv.Pointer.ArrowFrame.waypoint
  if type(way) == "table" then
    local m, x, y = Place(way.m, way.x, way.y)
    if m then out.m, out.x, out.y, out.name = m, x, y, Plain(way.title) end
  end
  return out
end

ns.sections[#ns.sections + 1] = { name = "zygor", period = 2, build = Build }
