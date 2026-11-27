-- Twinmap once gave Shortest Path stops of its own on the way ("Your path", under the name
-- "Twinmap Walk"), from the trails the character had walked. They led back where the character had
-- been, so they are given no more: a journey still under that name is let go once, after login,
-- and the guide that started it (Zygor, the player) takes over again on its next step.
local _, ns = ...

local OWNER = "Twinmap Walk"
local WAIT = 3 -- seconds after entering the world: Shortest Path restores its journey first

local function LetGo()
  local api = ShortestPathForever and ShortestPathForever.API
  if type(api) ~= "table" or type(api.Journey) ~= "function" or type(api.Cancel) ~= "function" then return end
  local ok, journey = pcall(api.Journey)
  if ok and type(journey) == "table" and journey.owner == OWNER then pcall(api.Cancel, OWNER) end
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:SetScript("OnEvent", function(self)
  self:UnregisterEvent("PLAYER_ENTERING_WORLD")
  if C_Timer and C_Timer.After then C_Timer.After(WAIT, LetGo) else LetGo() end
end)

-- The app may still send a walk; it is no longer taken.
ns.receivers = ns.receivers or {}
ns.receivers.walk = function() end
