--[[
==============================================================================
  VOID ARENA  |  SERVER
  GAR Productions

  WHERE THIS GOES:
    Script (a normal Script, NOT a LocalScript)  named  "ArenaServer"
    inside   ServerScriptService

  This one script builds the entire world at runtime: lighting, the lobby,
  the arena, every RemoteEvent, and the round loop. You do not need to place
  a single Part by hand.
==============================================================================
]]

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local TweenService      = game:GetService("TweenService")
local Lighting          = game:GetService("Lighting")
local DataStoreService  = game:GetService("DataStoreService")
local Debris            = game:GetService("Debris")

local Config = require(ReplicatedStorage:WaitForChild("GameConfig"))
local P = Config.Palette

Players.RespawnTime = Config.RespawnTime

--==========================================================================
--  SMALL HELPERS
--==========================================================================

local function new(class, props, parent)
	local inst = Instance.new(class)
	for k, v in pairs(props) do
		inst[k] = v
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

local function tween(inst, time, goal, style)
	local info = TweenInfo.new(time, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local t = TweenService:Create(inst, info, goal)
	t:Play()
	return t
end

local function getHumanoid(player)
	local char = player.Character
	if not char then return nil end
	return char:FindFirstChildOfClass("Humanoid")
end

local function getRoot(player)
	local char = player.Character
	if not char then return nil end
	return char:FindFirstChild("HumanoidRootPart")
end

local function isPlayable(player)
	local hum = getHumanoid(player)
	return hum ~= nil and hum.Health > 0 and getRoot(player) ~= nil
end

--==========================================================================
--  REMOTES
--==========================================================================

local old = ReplicatedStorage:FindFirstChild("ArenaRemotes")
if old then old:Destroy() end

local Remotes = new("Folder", { Name = "ArenaRemotes" }, ReplicatedStorage)

local function makeRemote(name)
	return new("RemoteEvent", { Name = name }, Remotes)
end

local RE_State   = makeRemote("State")    -- server -> client, full HUD snapshot
local RE_Feed    = makeRemote("Feed")     -- server -> client, kill feed line
local RE_Effect  = makeRemote("Effect")   -- server -> client, one-off VFX
local RE_Ability = makeRemote("Ability")  -- client -> server, "Pulse" / "Dash"

--==========================================================================
--  WORLD :: LIGHTING & ATMOSPHERE
--==========================================================================

local function buildLighting()
	Lighting.Ambient        = Color3.fromRGB(28, 16, 52)
	Lighting.OutdoorAmbient = Color3.fromRGB(34, 18, 62)
	Lighting.Brightness     = 1.6
	Lighting.ClockTime      = 0
	Lighting.GeographicLatitude = 0
	Lighting.FogEnd         = 900
	Lighting.FogStart       = 180
	Lighting.FogColor       = P.Void
	Lighting.EnvironmentDiffuseScale  = 0.4
	Lighting.EnvironmentSpecularScale = 0.4

	for _, name in ipairs({ "VoidAtmosphere", "VoidBloom", "VoidColor" }) do
		local existing = Lighting:FindFirstChild(name)
		if existing then existing:Destroy() end
	end

	new("Atmosphere", {
		Name = "VoidAtmosphere",
		Density = 0.42,
		Offset = 0.1,
		Color = Color3.fromRGB(58, 30, 96),
		Decay = Color3.fromRGB(18, 6, 40),
		Glare = 0.25,
		Haze = 1.6,
	}, Lighting)

	new("BloomEffect", {
		Name = "VoidBloom",
		Intensity = 0.9,
		Size = 28,
		Threshold = 0.85,
	}, Lighting)

	new("ColorCorrectionEffect", {
		Name = "VoidColor",
		Brightness = -0.02,
		Contrast = 0.16,
		Saturation = 0.12,
		TintColor = Color3.fromRGB(224, 208, 255),
	}, Lighting)

	-- The starfield sky. Roblox's built-in default sky is fine and always valid,
	-- so we just tint the world dark rather than risk a broken asset ID.
	local sky = Lighting:FindFirstChildOfClass("Sky")
	if not sky then
		sky = new("Sky", { Name = "VoidSky" }, Lighting)
	end
	sky.StarCount = 8000
	sky.CelestialBodiesShown = false
end

--==========================================================================
--  WORLD :: LOBBY
--==========================================================================

local World = new("Folder", { Name = "VoidArenaWorld" }, workspace)

local function buildLobby()
	for _, name in ipairs({ "Baseplate", "SpawnLocation" }) do
		local obj = workspace:FindFirstChild(name)
		if obj then obj:Destroy() end
	end

	local folder = new("Folder", { Name = "Lobby" }, World)
	local c = Config.LobbyCenter

	local pad = new("Part", {
		Name = "LobbyPad",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(4, 92, 92),
		CFrame = CFrame.new(c) * CFrame.Angles(0, 0, math.rad(90)),
		Anchored = true,
		Material = Enum.Material.Metal,
		Color = P.Deep,
		TopSurface = Enum.SurfaceType.Smooth,
		BottomSurface = Enum.SurfaceType.Smooth,
	}, folder)

	new("Part", {
		Name = "LobbyGlow",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.6, 96, 96),
		CFrame = CFrame.new(c - Vector3.new(0, 2.4, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Anchored = true,
		CanCollide = false,
		Material = Enum.Material.Neon,
		Color = P.Purple,
		Transparency = 0.35,
	}, folder)

	-- Ring of beacons so the lobby reads as a place, not a floating disc.
	for i = 1, 10 do
		local a = (i / 10) * math.pi * 2
		local pos = c + Vector3.new(math.cos(a) * 40, 14, math.sin(a) * 40)
		new("Part", {
			Name = "Beacon",
			Size = Vector3.new(1.6, 26, 1.6),
			CFrame = CFrame.new(pos),
			Anchored = true,
			CanCollide = false,
			Material = Enum.Material.Neon,
			Color = (i % 2 == 0) and P.Cyan or P.Violet,
			Transparency = 0.15,
		}, folder)
	end

	local spawnPad = new("SpawnLocation", {
		Name = "LobbySpawn",
		Size = Vector3.new(14, 1, 14),
		CFrame = CFrame.new(c + Vector3.new(0, 2.5, 0)),
		Anchored = true,
		Neutral = true,
		Duration = 0,          -- no forcefield, it looks bad in the lobby
		Material = Enum.Material.Neon,
		Color = P.Cyan,
		Transparency = 0.25,
		TopSurface = Enum.SurfaceType.Smooth,
	}, folder)
	spawnPad.CanCollide = true

	-- Floating title above the pad.
	local signPart = new("Part", {
		Name = "TitleAnchor",
		Size = Vector3.new(1, 1, 1),
		CFrame = CFrame.new(c + Vector3.new(0, 26, 0)),
		Anchored = true,
		CanCollide = false,
		Transparency = 1,
	}, folder)

	local billboard = new("BillboardGui", {
		Name = "Title",
		Size = UDim2.fromScale(34, 9),
		AlwaysOnTop = false,
		MaxDistance = 500,
	}, signPart)

	new("TextLabel", {
		Size = UDim2.fromScale(1, 0.62),
		BackgroundTransparency = 1,
		Text = Config.GameName,
		Font = Enum.Font.GothamBlack,
		TextColor3 = P.Text,
		TextScaled = true,
	}, billboard)

	new("TextLabel", {
		Size = UDim2.fromScale(1, 0.3),
		Position = UDim2.fromScale(0, 0.66),
		BackgroundTransparency = 1,
		Text = Config.Tagline,
		Font = Enum.Font.GothamBold,
		TextColor3 = P.Cyan,
		TextScaled = true,
	}, billboard)

	return pad
end

--==========================================================================
--  WORLD :: ARENA
--
--  The floor is built as concentric rings of tiles laid out radially, so it
--  looks like a mandala and, more importantly, so "collapse the outermost
--  ring" is a single clean operation.
--==========================================================================

local arenaFolder  = nil
local ringTiles    = {}   -- ringTiles[ringIndex] = { Part, ... }
local liveTiles    = {}   -- [Part] = true, everything still standing

local function destroyArena()
	if arenaFolder then
		arenaFolder:Destroy()
		arenaFolder = nil
	end
	ringTiles = {}
	liveTiles = {}
end

local function ringColor(ring)
	-- Deep indigo at the core fading out to violet at the rim.
	local t = (ring - 1) / math.max(1, Config.Rings - 1)
	return P.Tile:Lerp(P.TileEdge, t)
end

local function buildArena()
	destroyArena()
	arenaFolder = new("Folder", { Name = "Arena" }, World)
	local c = Config.ArenaCenter

	-- Core platform.
	local core = new("Part", {
		Name = "Core",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(Config.TileThickness, Config.RingWidth * 1.1, Config.RingWidth * 1.1),
		CFrame = CFrame.new(c) * CFrame.Angles(0, 0, math.rad(90)),
		Anchored = true,
		Material = Enum.Material.Neon,
		Color = P.Cyan,
		Transparency = 0.25,
	}, arenaFolder)
	core:SetAttribute("Ring", 0)
	liveTiles[core] = true
	ringTiles[0] = { core }

	-- Rings.
	for ring = 1, Config.Rings do
		local count  = 6 * ring
		local radius = ring * Config.RingWidth
		local arc    = (2 * math.pi * radius) / count
		local tiles  = {}

		for i = 1, count do
			-- Offset every other ring by half a tile so seams don't line up.
			local angle = (i / count) * math.pi * 2 + ((ring % 2) * math.pi / count)
			local dir   = Vector3.new(math.cos(angle), 0, math.sin(angle))
			local pos   = c + dir * radius

			local tile = new("Part", {
				Name = "Tile",
				Size = Vector3.new(
					math.max(1, arc - Config.TileGap),
					Config.TileThickness,
					math.max(1, Config.RingWidth - Config.TileGap)
				),
				CFrame = CFrame.new(pos, pos + dir),
				Anchored = true,
				Material = Enum.Material.Metal,
				Color = ringColor(ring),
				TopSurface = Enum.SurfaceType.Smooth,
				BottomSurface = Enum.SurfaceType.Smooth,
			}, arenaFolder)

			tile:SetAttribute("Ring", ring)
			tile:SetAttribute("BaseColor", tile.Color)
			tiles[#tiles + 1] = tile
			liveTiles[tile] = true
		end

		ringTiles[ring] = tiles
	end

	-- Rim beacons, purely so the edge of the world is readable at a glance.
	local rim = (Config.Rings * Config.RingWidth) + 8
	for i = 1, 8 do
		local a = (i / 8) * math.pi * 2
		new("Part", {
			Name = "RimBeacon",
			Size = Vector3.new(2, 40, 2),
			CFrame = CFrame.new(c + Vector3.new(math.cos(a) * rim, 20, math.sin(a) * rim)),
			Anchored = true,
			CanCollide = false,
			Material = Enum.Material.Neon,
			Color = P.Violet,
			Transparency = 0.4,
		}, arenaFolder)
	end
end

--==========================================================================
--  THE COLLAPSE
--==========================================================================

local function dropTile(tile, warnTime)
	if not tile or not tile.Parent then return end
	if tile:GetAttribute("Doomed") then return end
	tile:SetAttribute("Doomed", true)

	local base = tile:GetAttribute("BaseColor") or tile.Color

	-- Warning flash: pulse toward the warn colour so players get a fair heads-up.
	task.spawn(function()
		local flashes = math.max(1, math.floor(warnTime / 0.28))
		for _ = 1, flashes do
			if not tile.Parent then return end
			tween(tile, 0.14, { Color = P.Warn })
			task.wait(0.14)
			if not tile.Parent then return end
			tween(tile, 0.14, { Color = base })
			task.wait(0.14)
		end
	end)

	task.delay(warnTime, function()
		if not tile.Parent then return end
		liveTiles[tile] = nil
		tile.Color = P.Warn
		tile.Material = Enum.Material.Neon
		tile.CanCollide = false
		tile.CanTouch = false
		tile.Anchored = false
		tile.AssemblyLinearVelocity = Vector3.new(0, -6, 0)
		tile.AssemblyAngularVelocity = Vector3.new(
			(math.random() - 0.5) * 2,
			(math.random() - 0.5) * 2,
			(math.random() - 0.5) * 2
		)
		tween(tile, 2.2, { Transparency = 1 })
		Debris:AddItem(tile, 2.6)
	end)
end

local function collapseRing(ring)
	local tiles = ringTiles[ring]
	if not tiles then return end
	for i, tile in ipairs(tiles) do
		task.delay(i * Config.RingStagger, function()
			dropTile(tile, Config.CrumbleWarning)
		end)
	end
	ringTiles[ring] = nil
end

local function randomLiveTile()
	local pool = {}
	for tile in pairs(liveTiles) do
		if tile.Parent and not tile:GetAttribute("Doomed") and (tile:GetAttribute("Ring") or 0) > 0 then
			pool[#pool + 1] = tile
		end
	end
	if #pool == 0 then return nil end
	return pool[math.random(1, #pool)]
end

--==========================================================================
--  ROUND STATE
--==========================================================================

local state         = "Waiting"
local stateLabel    = "WAITING FOR PLAYERS"
local timeLeft      = 0
local roundNumber   = 0
local roundActive   = false

local alive         = {}   -- [Player] = true
local eliminations  = {}   -- [Player] = number, reset each round
local lastHitBy     = {}   -- [Player] = { by = Player, at = os.clock() }
local cooldowns     = {}   -- [Player] = { Pulse = t, Dash = t }
local buffs         = {}   -- [Player] = { Overcharge = expiryTime, ... }

local function aliveList()
	local names = {}
	for player in pairs(alive) do
		if player.Parent then
			names[#names + 1] = player.Name
		end
	end
	table.sort(names)
	return names
end

local function aliveCount()
	local n = 0
	for player in pairs(alive) do
		if player.Parent then n += 1 end
	end
	return n
end

local function pushState(extra)
	local payload = {
		state      = state,
		label      = stateLabel,
		timeLeft   = math.max(0, math.floor(timeLeft + 0.5)),
		round      = roundNumber,
		alive      = aliveCount(),
		aliveNames = aliveList(),
		total      = #Players:GetPlayers(),
	}
	if extra then
		for k, v in pairs(extra) do payload[k] = v end
	end
	RE_State:FireAllClients(payload)
end

local function feed(text, color)
	RE_Feed:FireAllClients({ text = text, color = color or P.Text })
end

--==========================================================================
--  DATA (leaderstats + DataStore)
--==========================================================================

local store = nil
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	store = ok and result or nil
end

local sessionData = {}  -- [Player] = { Wins = n, Coins = n }

local function loadData(player)
	local data = { Wins = 0, Coins = 0 }
	if store then
		local ok, saved = pcall(function()
			return store:GetAsync("p_" .. player.UserId)
		end)
		if ok and type(saved) == "table" then
			data.Wins  = tonumber(saved.Wins) or 0
			data.Coins = tonumber(saved.Coins) or 0
		elseif not ok then
			warn("[VoidArena] Could not load data for " .. player.Name .. " - running unsaved.")
		end
	end
	return data
end

local function saveData(player)
	local data = sessionData[player]
	if not data or not store then return end
	pcall(function()
		store:SetAsync("p_" .. player.UserId, { Wins = data.Wins, Coins = data.Coins })
	end)
end

local function award(player, coins, wins)
	local data = sessionData[player]
	if not data then return end
	data.Coins += (coins or 0)
	data.Wins  += (wins or 0)

	local stats = player:FindFirstChild("leaderstats")
	if stats then
		local c = stats:FindFirstChild("Coins")
		local w = stats:FindFirstChild("Wins")
		if c then c.Value = data.Coins end
		if w then w.Value = data.Wins end
	end
end

--==========================================================================
--  COMBAT
--==========================================================================

local function buffActive(player, id)
	local b = buffs[player]
	return b ~= nil and b[id] ~= nil and os.clock() < b[id]
end

local function grantBuff(player, id, duration)
	buffs[player] = buffs[player] or {}
	buffs[player][id] = os.clock() + duration
end

-- Shoving a grounded Humanoid barely works, because the humanoid controller
-- fights the impulse. Popping it into Freefall for a moment lets physics win.
local function applyKnockback(character, direction, force, lift)
	local root = character:FindFirstChild("HumanoidRootPart")
	local hum  = character:FindFirstChildOfClass("Humanoid")
	if not root or not hum then return end

	hum:ChangeState(Enum.HumanoidStateType.Freefall)

	local flat = Vector3.new(direction.X, 0, direction.Z)
	if flat.Magnitude < 0.01 then
		flat = Vector3.new(math.random() - 0.5, 0, math.random() - 0.5)
	end
	flat = flat.Unit

	local impulse = (flat * force + Vector3.new(0, lift, 0)) * root.AssemblyMass
	root:ApplyImpulse(impulse)
end

local function creditHit(victim, attacker)
	if victim == attacker then return end
	lastHitBy[victim] = { by = attacker, at = os.clock() }
end

local function doPulse(player)
	local root = getRoot(player)
	if not root then return end

	local cfg    = Config.Pulse
	local radius = cfg.Radius
	local force  = cfg.Force
	if buffActive(player, "Overcharge") then
		local oc = nil
		for _, p in ipairs(Config.Powerups) do
			if p.Id == "Overcharge" then oc = p end
		end
		if oc then
			radius *= (oc.RadiusMul or 1)
			force  *= (oc.ForceMul or 1)
		end
	end

	local origin = root.Position
	local hits = 0

	for _, other in ipairs(Players:GetPlayers()) do
		if other ~= player and isPlayable(other) then
			local otherRoot = getRoot(other)
			local offset = otherRoot.Position - origin
			if offset.Magnitude <= radius then
				-- Falloff: a graze at the rim shouldn't hit like a point-blank.
				local falloff = 1 - (offset.Magnitude / radius) * 0.55
				applyKnockback(other.Character, offset, force * falloff, cfg.Lift * falloff)

				local hum = getHumanoid(other)
				if hum then
					hum:TakeDamage(cfg.Damage * falloff)
				end
				creditHit(other, player)
				RE_Effect:FireClient(other, { kind = "Hit" })
				hits += 1
			end
		end
	end

	if cfg.SelfBoost > 0 then
		applyKnockback(player.Character, root.CFrame.LookVector * -1, cfg.SelfBoost, 8)
	end

	RE_Effect:FireAllClients({
		kind = "Pulse",
		position = origin,
		radius = radius,
		color = buffActive(player, "Overcharge") and P.Violet or P.Cyan,
	})

	return hits
end

local function doDash(player)
	local root = getRoot(player)
	local hum  = getHumanoid(player)
	if not root or not hum then return end

	local dir = hum.MoveDirection
	if dir.Magnitude < 0.05 then
		dir = root.CFrame.LookVector
	end

	applyKnockback(player.Character, dir, Config.Dash.Force, Config.Dash.Lift)
	RE_Effect:FireAllClients({ kind = "Dash", position = root.Position, color = P.Violet })
end

RE_Ability.OnServerEvent:Connect(function(player, name)
	if typeof(name) ~= "string" then return end
	if not roundActive or not alive[player] or not isPlayable(player) then return end

	local cfg
	if name == "Pulse" then
		cfg = Config.Pulse
	elseif name == "Dash" then
		cfg = Config.Dash
	else
		return
	end

	cooldowns[player] = cooldowns[player] or {}
	local readyAt = cooldowns[player][name] or 0
	local now = os.clock()
	if now < readyAt then return end          -- server is the authority on cooldowns
	cooldowns[player][name] = now + cfg.Cooldown

	if name == "Pulse" then
		doPulse(player)
	else
		doDash(player)
	end
end)

--==========================================================================
--  ELIMINATION
--==========================================================================

local voidDeath = {}

local function eliminate(player, cause)
	if not alive[player] then return end
	alive[player] = nil

	local killer = nil
	local record = lastHitBy[player]
	if record and record.by and record.by.Parent and (os.clock() - record.at) <= Config.CreditWindow then
		killer = record.by
	end
	lastHitBy[player] = nil

	if killer then
		eliminations[killer] = (eliminations[killer] or 0) + 1
		award(killer, Config.CoinsPerElimination, 0)
		feed(("%s  >>  %s"):format(killer.Name, player.Name), P.Violet)
		RE_Effect:FireClient(killer, { kind = "Elimination", target = player.Name })
	else
		local line = (cause == "Void")
			and ("%s fell into the void"):format(player.Name)
			or ("%s was eliminated"):format(player.Name)
		feed(line, P.Dim)
	end

	pushState()
end

local function watchCharacter(player, character)
	local hum = character:WaitForChild("Humanoid", 5)
	if not hum then return end

	hum.MaxHealth = Config.MaxHealth
	hum.Health    = Config.MaxHealth
	hum.WalkSpeed = Config.WalkSpeed
	hum.JumpPower = Config.JumpPower
	hum.UseJumpPower = true

	hum.Died:Connect(function()
		local cause = voidDeath[player] and "Void" or "Combat"
		voidDeath[player] = nil
		eliminate(player, cause)
	end)
end

-- The void watcher. Anything below VoidY is gone, whether it walked off or
-- got pulsed off.
RunService.Heartbeat:Connect(function()
	if not roundActive then return end

	-- Snapshot first: killing a Humanoid can fire Died and mutate `alive`
	-- while we are still walking it.
	local checking = {}
	for player in pairs(alive) do
		checking[#checking + 1] = player
	end

	for _, player in ipairs(checking) do
		local root = getRoot(player)
		if root and root.Position.Y < Config.VoidY then
			local hum = getHumanoid(player)
			if hum and hum.Health > 0 then
				voidDeath[player] = true
				hum.Health = 0
			end
		end
	end
end)

--==========================================================================
--  POWERUPS
--==========================================================================

local activePowerups = {}

local function applyPowerup(player, def)
	local hum = getHumanoid(player)
	if not hum then return end

	if def.Heal then
		hum.Health = math.min(hum.MaxHealth, hum.Health + def.Heal)
	end

	if def.Id == "Surge" then
		grantBuff(player, "Surge", def.Duration)
		hum.WalkSpeed = def.WalkSpeed
		hum.JumpPower = def.JumpPower
		task.delay(def.Duration, function()
			local h = getHumanoid(player)
			if h and not buffActive(player, "Surge") then
				h.WalkSpeed = Config.WalkSpeed
				h.JumpPower = Config.JumpPower
			end
		end)
	elseif def.Id == "Overcharge" then
		grantBuff(player, "Overcharge", def.Duration)
	end

	RE_Effect:FireClient(player, { kind = "Powerup", label = def.Label, color = def.Color })
end

-- Drop references to orbs that have already been collected or expired.
local function prunePowerups()
	for i = #activePowerups, 1, -1 do
		if not activePowerups[i].Parent then
			table.remove(activePowerups, i)
		end
	end
end

local function spawnPowerup()
	prunePowerups()
	if #activePowerups >= Config.PowerupMax then return end
	local tile = randomLiveTile()
	if not tile then return end

	local def = Config.Powerups[math.random(1, #Config.Powerups)]

	local orb = new("Part", {
		Name = "Powerup_" .. def.Id,
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(4, 4, 4),
		CFrame = tile.CFrame * CFrame.new(0, 5, 0),
		Anchored = true,
		CanCollide = false,
		Material = Enum.Material.Neon,
		Color = def.Color,
		Transparency = 0.15,
	}, arenaFolder)

	local billboard = new("BillboardGui", {
		Size = UDim2.fromScale(8, 2),
		StudsOffset = Vector3.new(0, 3, 0),
		AlwaysOnTop = true,
		MaxDistance = 140,
	}, orb)

	new("TextLabel", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Text = def.Label,
		Font = Enum.Font.GothamBold,
		TextColor3 = def.Color,
		TextScaled = true,
	}, billboard)

	table.insert(activePowerups, orb)

	-- Bob + spin so it reads as pickup-able from across the arena.
	local startY = orb.Position.Y
	local spin
	spin = RunService.Heartbeat:Connect(function()
		if not orb.Parent then
			spin:Disconnect()
			return
		end
		local t = os.clock()
		orb.CFrame = CFrame.new(orb.Position.X, startY + math.sin(t * 2.2) * 1.1, orb.Position.Z)
			* CFrame.Angles(0, t * 1.6, 0)
	end)

	local taken = false
	orb.Touched:Connect(function(hit)
		if taken then return end
		local character = hit:FindFirstAncestorOfClass("Model")
		if not character then return end
		local player = Players:GetPlayerFromCharacter(character)
		if not player or not alive[player] then return end

		taken = true
		applyPowerup(player, def)
		feed(("%s picked up %s"):format(player.Name, def.Label), def.Color)
		tween(orb, 0.25, { Size = Vector3.new(12, 12, 12), Transparency = 1 })
		Debris:AddItem(orb, 0.3)
	end)

	task.delay(Config.PowerupLifetime, function()
		if orb.Parent and not taken then
			tween(orb, 0.4, { Transparency = 1 })
			Debris:AddItem(orb, 0.5)
		end
	end)
end

--==========================================================================
--  PLAYER LIFECYCLE
--==========================================================================

local function teleportToLobby(player)
	local char = player.Character
	if not char then return end
	local c = Config.LobbyCenter
	local a = math.random() * math.pi * 2
	local r = math.random() * 24
	char:PivotTo(CFrame.new(c + Vector3.new(math.cos(a) * r, 6, math.sin(a) * r)))
end

Players.PlayerAdded:Connect(function(player)
	sessionData[player] = loadData(player)
	eliminations[player] = 0
	cooldowns[player] = {}
	buffs[player] = {}

	local stats = new("Folder", { Name = "leaderstats" }, player)
	new("IntValue", { Name = "Wins",  Value = sessionData[player].Wins },  stats)
	new("IntValue", { Name = "Coins", Value = sessionData[player].Coins }, stats)

	player.CharacterAdded:Connect(function(character)
		watchCharacter(player, character)
		-- If they respawn mid-round they are a spectator until the next one.
		if not alive[player] then
			task.wait(0.1)
			teleportToLobby(player)
		end
	end)

	task.delay(1, pushState)
end)

Players.PlayerRemoving:Connect(function(player)
	saveData(player)
	alive[player]        = nil
	sessionData[player]  = nil
	eliminations[player] = nil
	cooldowns[player]    = nil
	buffs[player]        = nil
	lastHitBy[player]    = nil
	pushState()
end)

game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		saveData(player)
	end
	task.wait(1)
end)

task.spawn(function()
	while true do
		task.wait(Config.AutoSaveEvery)
		for _, player in ipairs(Players:GetPlayers()) do
			saveData(player)
		end
	end
end)

--==========================================================================
--  ROUND LOOP
--==========================================================================

local function setState(newState, label)
	state = newState
	stateLabel = label
	pushState()
end

local function countdown(seconds, label, newState)
	setState(newState, label)
	timeLeft = seconds
	while timeLeft > 0 do
		task.wait(1)
		timeLeft -= 1
		pushState()
		-- Bail out early if the lobby empties during intermission.
		if newState == "Intermission" and #Players:GetPlayers() < Config.MinPlayers then
			return false
		end
	end
	return true
end

local function eligiblePlayers()
	local list = {}
	for _, player in ipairs(Players:GetPlayers()) do
		if isPlayable(player) then
			list[#list + 1] = player
		end
	end
	return list
end

local function placeInArena(participants)
	local c = Config.ArenaCenter
	local radius = (Config.Rings - 1) * Config.RingWidth
	local n = math.max(1, #participants)
	for i, player in ipairs(participants) do
		local a = ((i - 1) / n) * math.pi * 2
		local pos = c + Vector3.new(math.cos(a) * radius, 6, math.sin(a) * radius)
		local char = player.Character
		if char then
			-- Face the centre so nobody spawns staring into the void.
			char:PivotTo(CFrame.new(pos, Vector3.new(c.X, pos.Y, c.Z)))
			local hum = char:FindFirstChildOfClass("Humanoid")
			if hum then
				hum.Health = hum.MaxHealth
				hum.WalkSpeed = Config.WalkSpeed
				hum.JumpPower = Config.JumpPower
			end
		end
	end
end

local function pickWinnerOnTimeout()
	-- Nobody got knocked out before the clock ran down: most eliminations
	-- wins, health breaks the tie.
	local best, bestScore = nil, -1
	for player in pairs(alive) do
		local hum = getHumanoid(player)
		local score = (eliminations[player] or 0) * 1000 + (hum and hum.Health or 0)
		if score > bestScore then
			best, bestScore = player, score
		end
	end
	return best
end

local function runRound()
	roundNumber += 1

	-- Reset per-round bookkeeping.
	alive = {}
	lastHitBy = {}
	for _, player in ipairs(Players:GetPlayers()) do
		eliminations[player] = 0
		cooldowns[player] = {}
		buffs[player] = {}
	end

	setState("Preparing", "ENTERING THE ARENA")
	activePowerups = {}
	buildArena()
	task.wait(1)

	local participants = eligiblePlayers()
	if #participants < Config.MinPlayers then
		setState("Waiting", "WAITING FOR PLAYERS")
		destroyArena()
		return
	end

	for _, player in ipairs(participants) do
		alive[player] = true
	end
	placeInArena(participants)

	local startCount = #participants
	-- Solo testing: the round should end when you die, not when 1 remains.
	local endThreshold = (startCount >= 2) and 1 or 0

	feed(("ROUND %d - %d fighters"):format(roundNumber, startCount), P.Cyan)
	setState("Playing", "SURVIVE")
	roundActive = true
	timeLeft = Config.RoundTime
	pushState()

	-- Random tile crumbles, running alongside the main loop.
	task.spawn(function()
		task.wait(Config.CrumbleStart)
		while roundActive do
			dropTile(randomLiveTile(), Config.CrumbleWarning)
			task.wait(Config.CrumbleInterval)
		end
	end)

	-- Powerup spawner.
	task.spawn(function()
		while roundActive do
			task.wait(Config.PowerupInterval)
			if roundActive then
				spawnPowerup()
			end
		end
	end)

	local elapsed = 0
	local nextRing = Config.Rings

	while roundActive and timeLeft > 0 do
		task.wait(1)
		elapsed += 1
		timeLeft -= 1

		if elapsed >= Config.CollapseDelay
			and nextRing >= 1
			and ((elapsed - Config.CollapseDelay) % Config.RingInterval == 0)
		then
			collapseRing(nextRing)
			feed(("THE VOID CLOSES IN - ring %d gone"):format(nextRing), P.Warn)
			nextRing -= 1
		end

		pushState()

		if aliveCount() <= endThreshold then
			break
		end
	end

	roundActive = false

	-- Work out the winner.
	local winner = nil
	if aliveCount() == 1 then
		for player in pairs(alive) do winner = player end
	elseif aliveCount() > 1 then
		winner = pickWinnerOnTimeout()
	end

	for _, player in ipairs(participants) do
		if player.Parent then
			award(player, Config.CoinsForPlaying, 0)
		end
	end

	if winner and winner.Parent then
		award(winner, Config.CoinsPerWin, 1)
		feed(("%s SURVIVED THE VOID"):format(winner.Name), P.Cyan)
	else
		feed("THE VOID TOOK EVERYONE", P.Warn)
	end

	setState("Ending", winner and "VICTOR" or "NO SURVIVORS")
	pushState({
		winner = winner and winner.Name or nil,
		winnerEliminations = winner and (eliminations[winner] or 0) or 0,
	})

	task.wait(Config.EndScreenTime)

	alive = {}
	destroyArena()
	for _, player in ipairs(Players:GetPlayers()) do
		teleportToLobby(player)
		local hum = getHumanoid(player)
		if hum then
			hum.Health = hum.MaxHealth
			hum.WalkSpeed = Config.WalkSpeed
			hum.JumpPower = Config.JumpPower
		end
	end
end

--==========================================================================
--  BOOT
--==========================================================================

buildLighting()
buildLobby()
setState("Waiting", "WAITING FOR PLAYERS")

task.spawn(function()
	while true do
		if #Players:GetPlayers() < Config.MinPlayers then
			setState("Waiting", "WAITING FOR PLAYERS")
			repeat task.wait(1) until #Players:GetPlayers() >= Config.MinPlayers
		end

		local proceed = countdown(Config.IntermissionTime, "NEXT ROUND IN", "Intermission")
		if proceed then
			local ok, err = pcall(runRound)
			if not ok then
				warn("[VoidArena] Round errored: " .. tostring(err))
				roundActive = false
				alive = {}
				destroyArena()
				for _, player in ipairs(Players:GetPlayers()) do
					teleportToLobby(player)
				end
				task.wait(3)
			end
		end
	end
end)

print("[VoidArena] Server ready - world built, round loop running.")
