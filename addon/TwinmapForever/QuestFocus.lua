-- A quest the player picks over the guide's step. Clicking a quest in the tracker or the quest log
-- (the game super-tracks it) sends Shortest Path there as the player's own journey: to where its
-- objectives are done, and once they are, to where it is handed in. Zygor's arrow is hidden while
-- it lasts, and Zygor's link in Shortest Path stands aside for a journey of the player's own.
-- Back to the guide when the quest is handed in or dropped, when the player picks one of the
-- guide's own quests or clears the tracking, or when the player clears the journey away from the
-- quest. Arriving where the objectives are keeps the quest: the arrow does not flip back while
-- the mobs are killed. Kept over a /reload.
local _, ns = ...

local LOOK = 1          -- seconds between two looks
local SETTLE = 4        -- seconds after entering the world, and after a plan is asked, before a change counts as the player's
local NEAR = 80         -- yards from the journey's goal within which a journey that ends was arrived at, not cleared
local GONE = 2          -- looks in a row with no journey of the player's before it counts as cleared

local function Num(v) if type(v) == "number" and not (issecretvalue and issecretvalue(v)) then return v end end
local function Try(f, ...) if type(f) == "function" then local ok, a, b, c = pcall(f, ...); if ok then return a, b, c end end end

local function API()
  local api = ShortestPathForever and ShortestPathForever.API
  if type(api) == "table" and type(api.Journey) == "function" then return api end
end

local function SuperTracked()
  local q = Num(Try(C_SuperTrack and C_SuperTrack.GetSuperTrackedQuestID))
  return q and q > 0 and q or nil
end

local function InLog(q)
  local index = Num(Try(C_QuestLog and C_QuestLog.GetLogIndexForQuestID, q))
  return index ~= nil and index > 0
end

local function Complete(q) return Try(C_QuestLog and C_QuestLog.IsComplete, q) == true end

local function Title(q)
  local t = Try(C_QuestLog and C_QuestLog.GetTitleForQuestID, q)
  return type(t) == "string" and not (issecretvalue and issecretvalue(t)) and t or tostring(q)
end

-- The quests of the step Zygor is on: a super-track to one of them is Zygor's, not the player's.
local function ZygorQuests()
  local quests = {}
  local zgv = rawget(_G, "ZGV") or rawget(_G, "ZygorGuidesViewer")
  local step = type(zgv) == "table" and type(zgv.CurrentStep) == "table" and zgv.CurrentStep
  for _, goal in ipairs(step and type(step.goals) == "table" and step.goals or {}) do
    local q = type(goal) == "table" and Num(goal.questid or goal.questID)
    if q then quests[q] = true end
  end
  return quests, zgv ~= nil
end

-- Zygor's own arrow on screen: hidden while the player's quest leads, as it was after.
local function ZygorArrow()
  local zgv = rawget(_G, "ZGV") or rawget(_G, "ZygorGuidesViewer")
  local pointer = type(zgv) == "table" and type(zgv.Pointer) == "table" and zgv.Pointer
  local frame = pointer and pointer.ArrowFrame
  if type(frame) == "table" and type(frame.SetAlpha) == "function" then return frame end
end

local hidden = false
local function ShowZygorArrow(show)
  local frame = ZygorArrow()
  if not frame then return end
  if show then
    if hidden then pcall(frame.SetAlpha, frame, 1) end
    hidden = false
  else
    if (Num(Try(frame.GetAlpha, frame)) or 1) > 0 then pcall(frame.SetAlpha, frame, 0) end
    hidden = true
  end
end

local function Button(name)
  local b = rawget(_G, name)
  if type(b) == "table" and type(b.Click) == "function" then return b end
end

local quiet = 0      -- GetTime() before which super-track changes are not the player's
local byAddon = false -- the last super-track was set by Zygor, Shortest Path or Twinmap, not the player

-- Who set the super-tracked quest: an addon's call shows in the stack, a click in the tracker does not.
local ADDONS = { "ZygorGuidesViewer", "ShortestPathForever", "TwinmapForever" }
local addonQuest = nil -- the last quest an addon super-tracked: never taken as the player's
local function Caller(q)
  local ok, stack = pcall(debugstack, 2)
  byAddon = false
  if ok and type(stack) == "string" then
    for _, name in ipairs(ADDONS) do
      if stack:find(name, 1, true) then byAddon = true end
    end
  end
  if byAddon and Num(q) then addonQuest = q end
end
if C_SuperTrack and hooksecurefunc then
  for _, name in ipairs({ "SetSuperTrackedQuestID", "ClearAllSuperTracked", "ClearSuperTrackedContent" }) do
    if type(C_SuperTrack[name]) == "function" then hooksecurefunc(C_SuperTrack, name, Caller) end
  end
end
local ours = false   -- the last look saw the player's own journey under way
local missing = 0    -- looks in a row with none
local lastFar = nil  -- yards to the goal at the last look that had one

-- Shortest Path plans the player's own journey to the quest: the tracked-quest binding's button,
-- with the quest super-tracked so that it is the one taken.
local function Plan(q)
  local b = Button("ShortestPathForeverTravelToTrackedQuestButton")
  if not b then return false end
  quiet = GetTime() + SETTLE
  if SuperTracked() ~= q and C_SuperTrack and C_SuperTrack.SetSuperTrackedQuestID then pcall(C_SuperTrack.SetSuperTrackedQuestID, q) end
  missing, lastFar = 0, nil
  if ns.db.focus then ns.db.focus.asked, ns.db.focus.arrived = GetTime(), nil end
  return pcall(b.Click, b, "LeftButton")
end

local function Start(q)
  if not API() or InCombatLockdown() then return end
  ns.db.focus = { quest = q, complete = Complete(q) }
  if Plan(q) then
    ShowZygorArrow(false)
    ns.Say("focus.started", { name = Title(q) })
  else
    ns.db.focus = nil
  end
end

-- Back to the guide. clear: let go of the journey to the quest that is still under way.
local function Stop(say, clear)
  local focus = ns.db and ns.db.focus
  if not focus then return end
  ns.db.focus = nil
  if say == "focus.cleared" or say == "focus.noPlace" then ns.db.focusDeclined = focus.quest end
  if clear and ours then
    local b = Button("ShortestPathForeverClearJourneyButton")
    if b then pcall(b.Click, b, "LeftButton") end
  end
  ours, missing, lastFar = false, 0, nil
  ShowZygorArrow(true)
  if say then ns.Say(say, { name = Title(focus.quest) }) end
end

-- A quest the player picked that is still picked, with nothing focused: one picked before the
-- game was started again, or before Twinmap had this. Not one an addon picked, one of the guide's
-- own, nor one the player has just let go of.
local function Adopt()
  if GetTime() < quiet or InCombatLockdown() then return end
  local q = SuperTracked()
  if not q or q == addonQuest or q == ns.db.focusDeclined or not InLog(q) then return end
  local zygor, hasZygor = ZygorQuests()
  if hasZygor and not zygor[q] then Start(q) end
end

local function Look()
  local focus = ns.db and ns.db.focus
  if not focus then return Adopt() end
  local q = focus.quest
  if not InLog(q) then return Stop("focus.done", true) end
  ShowZygorArrow(false)
  if InCombatLockdown() then return end
  -- The objectives done: on to where it is handed in.
  if Complete(q) and not focus.complete then
    focus.complete = true
    Plan(q)
    return
  end
  local api = API()
  if not api or GetTime() < quiet then return end
  local journey = Try(api.Journey)
  local mine = type(journey) == "table" and type(journey.goal) == "table" and journey.owner == nil
  if mine then
    ours, missing = true, 0
    local state = Try(api.JourneyState)
    lastFar = type(state) == "table" and Num(state.distance) or lastFar
    return
  end
  -- No journey of the player's: never planned (Shortest Path knows no place for the quest),
  -- arrived where the objectives are (kept), or cleared on purpose.
  missing = missing + 1
  if not ours then
    if not focus.arrived and GetTime() > (focus.asked or 0) + SETTLE * 2 then Stop("focus.noPlace", false) end
    return
  end
  if missing < GONE then return end
  if lastFar and lastFar <= NEAR then
    ours, focus.arrived = false, true
    return
  end
  Stop("focus.cleared", false)
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("SUPER_TRACKING_CHANGED")
frame:RegisterEvent("QUEST_TURNED_IN")
frame:RegisterEvent("QUEST_REMOVED")
frame:SetScript("OnEvent", function(_, event, a)
  if not ns.db then return end
  if event == "PLAYER_ENTERING_WORLD" then
    quiet = GetTime() + SETTLE
    -- After a /reload Shortest Path brings the journey back on its own; only the arrow and the watch are ours to restore.
    ours = ns.db.focus ~= nil
    if ns.db.focus then ns.db.focus.asked = GetTime() end
    return
  end
  local focus = ns.db.focus
  if event == "QUEST_TURNED_IN" or event == "QUEST_REMOVED" then
    if focus and tonumber(Num(a) or a) == focus.quest then Stop("focus.done", true) end
    return
  end
  -- SUPER_TRACKING_CHANGED: whose change, the player's or an addon's?
  local fromAddon = byAddon
  byAddon = false
  if GetTime() < quiet or fromAddon then return end
  local q = SuperTracked()
  ns.db.focusDeclined = nil
  local zygor, hasZygor = ZygorQuests()
  if not q then
    if focus then Stop("focus.cleared", true) end
    return
  end
  if focus and q == focus.quest then return end
  if zygor[q] then
    -- The player picked one of the guide's own quests: the guide leads again.
    if focus then Stop("focus.backToGuide", true) end
    return
  end
  if not hasZygor or not InLog(q) then return end
  Start(q)
end)

local since = 0
frame:SetScript("OnUpdate", function(_, elapsed)
  since = since + elapsed
  if since < LOOK then return end
  since = 0
  pcall(Look)
end)
