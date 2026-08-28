--[[
==============================================================================
  VOID ARENA  |  GAME CONFIG
  GAR Productions

  WHERE THIS GOES:
    ModuleScript  named  "GameConfig"   inside   ReplicatedStorage

  Every number the game uses lives in this one file. Tweak, hit Play, done.
  You never need to open the other two scripts unless you want to.
==============================================================================
]]

local Config = {}

Config.GameName = "VOID ARENA"
Config.Tagline  = "LAST ONE STANDING"

--==========================================================================
--  ROUND FLOW
--==========================================================================

-- 1 lets you test completely alone. Set this to 2 when you publish.
Config.MinPlayers       = 1

Config.IntermissionTime = 20    -- lobby countdown between rounds
Config.RoundTime        = 150   -- hard cap. The collapsing floor usually ends it first.
Config.EndScreenTime    = 8     -- how long the winner screen stays up

--==========================================================================
--  ARENA GEOMETRY
--==========================================================================

Config.ArenaCenter   = Vector3.new(0, 300, 0)
Config.LobbyCenter   = Vector3.new(0, 50, 1400)  -- kept far away so you never see one from the other

Config.Rings         = 7     -- rings of tiles around the core
Config.RingWidth     = 11    -- studs from one ring to the next
Config.TileThickness = 3
Config.TileGap       = 0.9   -- visual seam between neighbouring tiles

Config.VoidY         = 130   -- fall below this Y and the void takes you

--==========================================================================
--  THE COLLAPSE  (this is what actually ends rounds)
--==========================================================================

Config.CollapseDelay   = 14    -- seconds of calm before the void starts eating
Config.RingInterval    = 15    -- seconds between each outer ring dissolving
Config.RingStagger     = 0.06  -- delay between individual tiles in a collapsing ring

Config.CrumbleStart    = 8     -- when random single-tile crumbles begin
Config.CrumbleInterval = 2.4   -- seconds between random crumbles
Config.CrumbleWarning  = 1.7   -- warning flash time before a tile drops out

--==========================================================================
--  ABILITIES
--  No aiming required - both are built for touch. Force values are
--  multiplied by the target's mass, so they feel the same for everyone.
--==========================================================================

Config.Pulse = {
	Name      = "PULSE",
	Cooldown  = 3.5,
	Radius    = 27,   -- studs
	Force     = 58,   -- outward shove
	Lift      = 26,   -- upward shove (this is what pops people off the edge)
	Damage    = 14,
	SelfBoost = 0,    -- set > 0 if you want firing to also shove yourself
}

Config.Dash = {
	Name     = "DASH",
	Cooldown = 5,
	Force    = 74,
	Lift     = 14,
}

Config.CreditWindow = 6  -- seconds you stay "credited" for a hit before their death counts as yours

--==========================================================================
--  CHARACTER
--==========================================================================

Config.MaxHealth  = 100
Config.WalkSpeed  = 20
Config.JumpPower  = 52
Config.RespawnTime = 2

--==========================================================================
--  POWERUPS  (spawn on live tiles during a round)
--==========================================================================

Config.PowerupInterval = 11    -- seconds between spawns
Config.PowerupLifetime = 22    -- despawns if nobody grabs it
Config.PowerupMax      = 4     -- max on the floor at once

Config.Powerups = {
	{
		Id       = "Mend",
		Label    = "MEND",
		Color    = Color3.fromRGB(0, 245, 196),
		Heal     = 45,
	},
	{
		Id       = "Surge",
		Label    = "SURGE",
		Color    = Color3.fromRGB(255, 214, 64),
		Duration = 12,
		WalkSpeed = 30,
		JumpPower = 70,
	},
	{
		Id       = "Overcharge",
		Label    = "OVERCHARGE",
		Color    = Color3.fromRGB(187, 85, 255),
		Duration = 15,
		RadiusMul = 1.55,
		ForceMul  = 1.5,
	},
}

--==========================================================================
--  REWARDS
--==========================================================================

Config.CoinsPerWin         = 25
Config.CoinsPerElimination = 8
Config.CoinsForPlaying     = 3

--==========================================================================
--  LOOK & FEEL
--==========================================================================

Config.Palette = {
	Void      = Color3.fromRGB(3, 0, 13),
	Deep      = Color3.fromRGB(24, 14, 48),
	Tile      = Color3.fromRGB(38, 26, 74),
	TileEdge  = Color3.fromRGB(66, 44, 122),
	Purple    = Color3.fromRGB(136, 51, 255),
	Violet    = Color3.fromRGB(187, 85, 255),
	Cyan      = Color3.fromRGB(0, 245, 196),
	Warn      = Color3.fromRGB(255, 96, 64),
	Text      = Color3.fromRGB(232, 216, 255),
	Dim       = Color3.fromRGB(90, 74, 136),
}

-- Optional. Paste your own audio asset IDs (as strings, e.g. "rbxassetid://123456").
-- Left blank on purpose so nothing plays a dead/wrong sound. See README.
Config.Sounds = {
	Pulse     = "",
	Dash      = "",
	Crumble   = "",
	Eliminate = "",
	RoundStart= "",
	Victory   = "",
}

--==========================================================================
--  SAVING
--==========================================================================

-- Studio can't reach DataStores unless "Enable Studio Access to API Services"
-- is on. The game handles that failure quietly - you just won't keep progress
-- while testing. Published games save normally.
Config.DataStoreName = "VoidArena_v1"
Config.AutoSaveEvery = 120

return Config
