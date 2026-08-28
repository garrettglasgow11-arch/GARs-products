--[[
==============================================================================
  VOID ARENA  |  CLIENT
  GAR Productions

  WHERE THIS GOES:
    LocalScript  named  "ArenaClient"
    inside   StarterPlayer > StarterPlayerScripts

  Builds the whole HUD in code (nothing to lay out by hand), handles the
  two ability buttons on touch + keyboard, plays the pulse VFX, and runs the
  spectator camera when you are out of the round.
==============================================================================
]]

local Players            = game:GetService("Players")
local ReplicatedStorage  = game:GetService("ReplicatedStorage")
local RunService         = game:GetService("RunService")
local TweenService       = game:GetService("TweenService")
local UserInputService   = game:GetService("UserInputService")
local Debris             = game:GetService("Debris")

local Config = require(ReplicatedStorage:WaitForChild("GameConfig"))
local P = Config.Palette

local Remotes    = ReplicatedStorage:WaitForChild("ArenaRemotes")
local RE_State   = Remotes:WaitForChild("State")
local RE_Feed    = Remotes:WaitForChild("Feed")
local RE_Effect  = Remotes:WaitForChild("Effect")
local RE_Ability = Remotes:WaitForChild("Ability")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

--==========================================================================
--  UI HELPERS
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

local function corner(radius, parent)
	return new("UICorner", { CornerRadius = UDim.new(0, radius) }, parent)
end

local function stroke(color, thickness, transparency, parent)
	return new("UIStroke", {
		Color = color,
		Thickness = thickness,
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}, parent)
end

local function tween(inst, time, goal, style)
	local t = TweenService:Create(
		inst,
		TweenInfo.new(time, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		goal
	)
	t:Play()
	return t
end

--==========================================================================
--  HUD CONSTRUCTION
--==========================================================================

local gui = new("ScreenGui", {
	Name = "VoidArenaHUD",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, player:WaitForChild("PlayerGui"))

-- Cinematic letterbox gradients. Cheap, and they stop the HUD from floating
-- unanchored over a busy skybox.
local topFade = new("Frame", {
	Size = UDim2.new(1, 0, 0, 170),
	BackgroundColor3 = P.Void,
	BorderSizePixel = 0,
	ZIndex = 1,
}, gui)
new("UIGradient", {
	Rotation = 90,
	Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.25),
		NumberSequenceKeypoint.new(1, 1),
	}),
}, topFade)

--== Top centre: state banner + timer ======================================

local banner = new("Frame", {
	Size = UDim2.new(0, 340, 0, 96),
	Position = UDim2.new(0.5, 0, 0, 14),
	AnchorPoint = Vector2.new(0.5, 0),
	BackgroundTransparency = 1,
	ZIndex = 4,
}, gui)

local stateLabel = new("TextLabel", {
	Size = UDim2.new(1, 0, 0, 26),
	BackgroundTransparency = 1,
	Text = "CONNECTING",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Cyan,
	TextSize = 18,
	ZIndex = 5,
}, banner)

local timerLabel = new("TextLabel", {
	Size = UDim2.new(1, 0, 0, 58),
	Position = UDim2.new(0, 0, 0, 26),
	BackgroundTransparency = 1,
	Text = "--",
	Font = Enum.Font.GothamBlack,
	TextColor3 = P.Text,
	TextSize = 54,
	ZIndex = 5,
}, banner)

--== Top left: round + alive count =========================================

local infoPanel = new("Frame", {
	Size = UDim2.new(0, 150, 0, 62),
	Position = UDim2.new(0, 16, 0, 16),
	BackgroundColor3 = P.Deep,
	BackgroundTransparency = 0.25,
	BorderSizePixel = 0,
	ZIndex = 4,
}, gui)
corner(10, infoPanel)
stroke(P.Purple, 1.4, 0.4, infoPanel)

local roundLabel = new("TextLabel", {
	Size = UDim2.new(1, -16, 0, 20),
	Position = UDim2.new(0, 8, 0, 7),
	BackgroundTransparency = 1,
	Text = "ROUND -",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Dim,
	TextSize = 13,
	TextXAlignment = Enum.TextXAlignment.Left,
	ZIndex = 5,
}, infoPanel)

local aliveLabel = new("TextLabel", {
	Size = UDim2.new(1, -16, 0, 28),
	Position = UDim2.new(0, 8, 0, 26),
	BackgroundTransparency = 1,
	Text = "0 ALIVE",
	Font = Enum.Font.GothamBlack,
	TextColor3 = P.Text,
	TextSize = 22,
	TextXAlignment = Enum.TextXAlignment.Left,
	ZIndex = 5,
}, infoPanel)

--== Top right: your stats =================================================

local statsPanel = new("Frame", {
	Size = UDim2.new(0, 150, 0, 62),
	Position = UDim2.new(1, -16, 0, 16),
	AnchorPoint = Vector2.new(1, 0),
	BackgroundColor3 = P.Deep,
	BackgroundTransparency = 0.25,
	BorderSizePixel = 0,
	ZIndex = 4,
}, gui)
corner(10, statsPanel)
stroke(P.Purple, 1.4, 0.4, statsPanel)

local winsLabel = new("TextLabel", {
	Size = UDim2.new(1, -16, 0, 24),
	Position = UDim2.new(0, 8, 0, 6),
	BackgroundTransparency = 1,
	Text = "WINS  0",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Cyan,
	TextSize = 15,
	TextXAlignment = Enum.TextXAlignment.Right,
	ZIndex = 5,
}, statsPanel)

local coinsLabel = new("TextLabel", {
	Size = UDim2.new(1, -16, 0, 24),
	Position = UDim2.new(0, 8, 0, 30),
	BackgroundTransparency = 1,
	Text = "COINS  0",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Violet,
	TextSize = 15,
	TextXAlignment = Enum.TextXAlignment.Right,
	ZIndex = 5,
}, statsPanel)

--== Bottom left: kill feed ================================================

local feedFrame = new("Frame", {
	Size = UDim2.new(0, 320, 0, 150),
	Position = UDim2.new(0, 16, 1, -110),
	AnchorPoint = Vector2.new(0, 1),
	BackgroundTransparency = 1,
	ZIndex = 4,
}, gui)

new("UIListLayout", {
	SortOrder = Enum.SortOrder.LayoutOrder,
	VerticalAlignment = Enum.VerticalAlignment.Bottom,
	Padding = UDim.new(0, 4),
}, feedFrame)

local feedOrder = 0
local function addFeedLine(text, color)
	feedOrder += 1
	local line = new("TextLabel", {
		Size = UDim2.new(1, 0, 0, 22),
		BackgroundColor3 = P.Void,
		BackgroundTransparency = 0.4,
		Text = "  " .. text,
		Font = Enum.Font.GothamMedium,
		TextColor3 = color or P.Text,
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Left,
		LayoutOrder = feedOrder,
		ZIndex = 5,
	}, feedFrame)
	corner(5, line)

	task.delay(6, function()
		tween(line, 0.6, { TextTransparency = 1, BackgroundTransparency = 1 })
		Debris:AddItem(line, 0.7)
	end)

	-- Never let the feed grow past a screenful.
	local lines = {}
	for _, child in ipairs(feedFrame:GetChildren()) do
		if child:IsA("TextLabel") then
			lines[#lines + 1] = child
		end
	end
	if #lines > 6 then
		table.sort(lines, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
		lines[1]:Destroy()
	end
end

--== Bottom right: ability buttons =========================================

local abilityFrame = new("Frame", {
	Size = UDim2.new(0, 220, 0, 110),
	Position = UDim2.new(1, -20, 1, -24),
	AnchorPoint = Vector2.new(1, 1),
	BackgroundTransparency = 1,
	ZIndex = 6,
}, gui)

local buttons = {}

local function makeAbilityButton(id, label, key, accent, xOffset)
	local holder = new("Frame", {
		Size = UDim2.new(0, 96, 0, 96),
		Position = UDim2.new(0, xOffset, 0, 8),
		BackgroundTransparency = 1,
		ZIndex = 6,
	}, abilityFrame)

	local button = new("TextButton", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = P.Deep,
		BackgroundTransparency = 0.15,
		Text = "",
		AutoButtonColor = false,
		ZIndex = 6,
	}, holder)
	corner(48, button)
	stroke(accent, 2.2, 0.15, button)

	-- Cooldown shade: fills from the bottom and drains as the ability recharges.
	local shade = new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		Position = UDim2.fromScale(0, 1),
		AnchorPoint = Vector2.new(0, 1),
		BackgroundColor3 = P.Void,
		BackgroundTransparency = 0.35,
		BorderSizePixel = 0,
		ZIndex = 7,
	}, button)
	corner(48, shade)

	local title = new("TextLabel", {
		Size = UDim2.new(1, 0, 0, 24),
		Position = UDim2.new(0, 0, 0.5, -18),
		BackgroundTransparency = 1,
		Text = label,
		Font = Enum.Font.GothamBlack,
		TextColor3 = accent,
		TextSize = 17,
		ZIndex = 8,
	}, button)

	local hint = new("TextLabel", {
		Size = UDim2.new(1, 0, 0, 16),
		Position = UDim2.new(0, 0, 0.5, 4),
		BackgroundTransparency = 1,
		Text = UserInputService.TouchEnabled and "TAP" or key,
		Font = Enum.Font.GothamBold,
		TextColor3 = P.Dim,
		TextSize = 12,
		ZIndex = 8,
	}, button)

	buttons[id] = {
		holder = holder,
		button = button,
		shade  = shade,
		title  = title,
		hint   = hint,
		accent = accent,
		readyAt = 0,
		cooldown = (id == "Pulse") and Config.Pulse.Cooldown or Config.Dash.Cooldown,
	}
	return buttons[id]
end

makeAbilityButton("Dash",  Config.Dash.Name,  "Q", P.Violet, 0)
makeAbilityButton("Pulse", Config.Pulse.Name, "E", P.Cyan,   112)

--== Centre: big result / status overlay ===================================

local overlay = new("TextLabel", {
	Size = UDim2.new(1, 0, 0, 120),
	Position = UDim2.new(0, 0, 0.36, 0),
	BackgroundTransparency = 1,
	Text = "",
	Font = Enum.Font.GothamBlack,
	TextColor3 = P.Text,
	TextSize = 56,
	TextTransparency = 1,
	ZIndex = 9,
}, gui)

local overlaySub = new("TextLabel", {
	Size = UDim2.new(1, 0, 0, 34),
	Position = UDim2.new(0, 0, 0.36, 110),
	BackgroundTransparency = 1,
	Text = "",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Cyan,
	TextSize = 20,
	TextTransparency = 1,
	ZIndex = 9,
}, gui)

local function showOverlay(text, sub, color, hold)
	overlay.Text = text
	overlay.TextColor3 = color or P.Text
	overlaySub.Text = sub or ""

	overlay.TextTransparency = 1
	overlaySub.TextTransparency = 1
	overlay.TextSize = 40
	tween(overlay, 0.35, { TextTransparency = 0, TextSize = 56 }, Enum.EasingStyle.Back)
	tween(overlaySub, 0.35, { TextTransparency = 0 })

	task.delay(hold or 3, function()
		if overlay.Text == text then
			tween(overlay, 0.5, { TextTransparency = 1 })
			tween(overlaySub, 0.5, { TextTransparency = 1 })
		end
	end)
end

--== Screen flash (taking a hit) ===========================================

local flash = new("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = P.Warn,
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ZIndex = 10,
}, gui)

local function screenFlash(color, strength)
	flash.BackgroundColor3 = color or P.Warn
	flash.BackgroundTransparency = 1 - (strength or 0.35)
	tween(flash, 0.45, { BackgroundTransparency = 1 })
end

--== Spectator bar =========================================================

local spectateBar = new("TextButton", {
	Size = UDim2.new(0, 260, 0, 40),
	Position = UDim2.new(0.5, 0, 1, -22),
	AnchorPoint = Vector2.new(0.5, 1),
	BackgroundColor3 = P.Deep,
	BackgroundTransparency = 0.2,
	Text = "",
	AutoButtonColor = false,
	Visible = false,
	ZIndex = 6,
}, gui)
corner(10, spectateBar)
stroke(P.Purple, 1.4, 0.35, spectateBar)

local spectateLabel = new("TextLabel", {
	Size = UDim2.fromScale(1, 1),
	BackgroundTransparency = 1,
	Text = "SPECTATING",
	Font = Enum.Font.GothamBold,
	TextColor3 = P.Text,
	TextSize = 14,
	ZIndex = 7,
}, spectateBar)

--==========================================================================
--  ABILITY INPUT
--==========================================================================

local canAct = false  -- true only while you are alive in a live round

local function fireAbility(id)
	local entry = buttons[id]
	if not entry then return end
	if not canAct then return end
	if os.clock() < entry.readyAt then return end

	-- Predict the cooldown locally so the button feels instant. The server
	-- runs the same check and is the one that actually counts.
	entry.readyAt = os.clock() + entry.cooldown
	entry.shade.Size = UDim2.new(1, 0, 1, 0)
	tween(entry.button, 0.08, { BackgroundTransparency = 0.4 })
	tween(entry.button, 0.3, { BackgroundTransparency = 0.15 })

	RE_Ability:FireServer(id)
end

buttons.Pulse.button.Activated:Connect(function() fireAbility("Pulse") end)
buttons.Dash.button.Activated:Connect(function() fireAbility("Dash") end)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.E then
		fireAbility("Pulse")
	elseif input.KeyCode == Enum.KeyCode.Q then
		fireAbility("Dash")
	end
end)

-- Gamepad, because Studio Lite players often have a controller paired.
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.ButtonR2 then
		fireAbility("Pulse")
	elseif input.KeyCode == Enum.KeyCode.ButtonL2 then
		fireAbility("Dash")
	end
end)

--==========================================================================
--  COOLDOWN + BUTTON STATE RENDERING
--==========================================================================

RunService.RenderStepped:Connect(function()
	local now = os.clock()
	for _, entry in pairs(buttons) do
		local remaining = entry.readyAt - now
		if remaining > 0 then
			local pct = math.clamp(remaining / entry.cooldown, 0, 1)
			entry.shade.Size = UDim2.new(1, 0, pct, 0)
			entry.hint.Text = string.format("%.1f", remaining)
			entry.title.TextColor3 = P.Dim
		else
			entry.shade.Size = UDim2.new(1, 0, 0, 0)
			entry.hint.Text = UserInputService.TouchEnabled and "TAP"
				or ((entry == buttons.Pulse) and "E" or "Q")
			entry.title.TextColor3 = canAct and entry.accent or P.Dim
		end
		entry.holder.Visible = canAct or remaining > 0
	end
end)

--==========================================================================
--  CAMERA SHAKE
--==========================================================================

local shakeAmount = 0

local function shake(amount)
	shakeAmount = math.min(3.2, shakeAmount + amount)
end

-- This has to run AFTER Roblox's own camera update, otherwise the default
-- camera script simply overwrites our offset every frame and nothing shakes.
RunService:BindToRenderStep("VoidArenaShake", Enum.RenderPriority.Camera.Value + 1, function(dt)
	if shakeAmount <= 0.001 then return end
	shakeAmount = math.max(0, shakeAmount - dt * 6)
	local a = shakeAmount
	camera.CFrame = camera.CFrame * CFrame.Angles(
		math.rad((math.random() - 0.5) * a),
		math.rad((math.random() - 0.5) * a),
		math.rad((math.random() - 0.5) * a)
	)
end)

--==========================================================================
--  VFX
--==========================================================================

local function pulseRing(position, radius, color)
	local sphere = new("Part", {
		Name = "PulseFX",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(3, 3, 3),
		CFrame = CFrame.new(position),
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 0.3,
	}, workspace)

	tween(sphere, 0.35, {
		Size = Vector3.new(radius * 2, radius * 2, radius * 2),
		Transparency = 1,
	})
	Debris:AddItem(sphere, 0.5)

	-- A flat ring on the floor reads better than the sphere alone.
	local disc = new("Part", {
		Name = "PulseDisc",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.4, 4, 4),
		CFrame = CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90)),
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 0.2,
	}, workspace)

	tween(disc, 0.4, {
		Size = Vector3.new(0.4, radius * 2.1, radius * 2.1),
		Transparency = 1,
	})
	Debris:AddItem(disc, 0.6)

	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if root then
		local dist = (root.Position - position).Magnitude
		if dist < radius * 2 then
			shake(1.8 * (1 - dist / (radius * 2)))
		end
	end
end

local function dashTrail(position, color)
	local streak = new("Part", {
		Name = "DashFX",
		Size = Vector3.new(5, 0.6, 5),
		CFrame = CFrame.new(position - Vector3.new(0, 2.6, 0)),
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 0.35,
	}, workspace)
	tween(streak, 0.3, { Size = Vector3.new(14, 0.2, 14), Transparency = 1 })
	Debris:AddItem(streak, 0.4)
end

RE_Effect.OnClientEvent:Connect(function(data)
	if type(data) ~= "table" then return end

	if data.kind == "Pulse" then
		pulseRing(data.position, data.radius or Config.Pulse.Radius, data.color or P.Cyan)
	elseif data.kind == "Dash" then
		dashTrail(data.position, data.color or P.Violet)
	elseif data.kind == "Hit" then
		screenFlash(P.Warn, 0.32)
		shake(1.2)
	elseif data.kind == "Elimination" then
		showOverlay("ELIMINATED " .. tostring(data.target), "+" .. Config.CoinsPerElimination .. " COINS", P.Violet, 2)
	elseif data.kind == "Powerup" then
		screenFlash(data.color or P.Cyan, 0.22)
		showOverlay(tostring(data.label), "", data.color or P.Cyan, 1.5)
	end
end)

--==========================================================================
--  KILL FEED
--==========================================================================

RE_Feed.OnClientEvent:Connect(function(data)
	if type(data) ~= "table" or type(data.text) ~= "string" then return end
	addFeedLine(data.text, data.color)
end)

--==========================================================================
--  STATE / HUD SYNC
--==========================================================================

local currentState = "Waiting"
local aliveNames = {}
local spectateIndex = 1
local lastWinner = nil

local function formatTime(seconds)
	if seconds >= 60 then
		return string.format("%d:%02d", math.floor(seconds / 60), seconds % 60)
	end
	return tostring(seconds)
end

RE_State.OnClientEvent:Connect(function(data)
	if type(data) ~= "table" then return end

	local previousState = currentState
	currentState = data.state or "Waiting"
	aliveNames = data.aliveNames or {}

	stateLabel.Text = data.label or ""
	roundLabel.Text = "ROUND " .. tostring(data.round or 0)
	aliveLabel.Text = tostring(data.alive or 0) .. " ALIVE"

	if currentState == "Waiting" then
		timerLabel.Text = tostring(data.total or 0) .. "/" .. tostring(Config.MinPlayers)
		stateLabel.TextColor3 = P.Dim
	elseif currentState == "Playing" then
		timerLabel.Text = formatTime(data.timeLeft or 0)
		stateLabel.TextColor3 = (data.timeLeft or 99) <= 10 and P.Warn or P.Cyan
	else
		timerLabel.Text = formatTime(data.timeLeft or 0)
		stateLabel.TextColor3 = P.Violet
	end

	-- Am I in the fight?
	local iAmAlive = false
	for _, name in ipairs(aliveNames) do
		if name == player.Name then
			iAmAlive = true
			break
		end
	end
	canAct = (currentState == "Playing") and iAmAlive

	spectateBar.Visible = (currentState == "Playing") and not iAmAlive and #aliveNames > 0

	if currentState == "Playing" and previousState ~= "Playing" then
		if iAmAlive then
			showOverlay("SURVIVE", "PULSE them off the edge", P.Cyan, 2.5)
		end
		-- Reset predicted cooldowns for the new round.
		for _, entry in pairs(buttons) do
			entry.readyAt = 0
		end
	end

	if currentState == "Ending" and previousState ~= "Ending" then
		if data.winner then
			if data.winner == player.Name then
				showOverlay("VICTORY", "+" .. Config.CoinsPerWin .. " COINS", P.Cyan, Config.EndScreenTime)
			else
				showOverlay(string.upper(data.winner) .. " WINS", tostring(data.winnerEliminations or 0) .. " ELIMINATIONS", P.Violet, Config.EndScreenTime)
			end
		else
			showOverlay("NO SURVIVORS", "the void takes all", P.Warn, Config.EndScreenTime)
		end
		lastWinner = data.winner
	end
end)

--==========================================================================
--  SPECTATOR CAMERA
--==========================================================================

local function currentSpectateTarget()
	if #aliveNames == 0 then return nil end
	if spectateIndex > #aliveNames then spectateIndex = 1 end
	local target = Players:FindFirstChild(aliveNames[spectateIndex])
	if target and target.Character then
		return target
	end
	return nil
end

spectateBar.Activated:Connect(function()
	spectateIndex += 1
	if spectateIndex > #aliveNames then spectateIndex = 1 end
end)

RunService.Heartbeat:Connect(function()
	if currentState ~= "Playing" then
		-- Hand the camera back to our own character.
		local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if hum and camera.CameraSubject ~= hum then
			camera.CameraSubject = hum
		end
		return
	end

	if canAct then
		local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if hum and camera.CameraSubject ~= hum then
			camera.CameraSubject = hum
		end
		return
	end

	local target = currentSpectateTarget()
	if target then
		local hum = target.Character:FindFirstChildOfClass("Humanoid")
		if hum then
			camera.CameraSubject = hum
			spectateLabel.Text = "SPECTATING  " .. string.upper(target.Name) .. "   (TAP TO SWITCH)"
		end
	end
end)

--==========================================================================
--  LEADERSTATS MIRROR
--  Mobile hides the default player list a lot, so we surface it ourselves.
--==========================================================================

local function bindStats()
	local stats = player:WaitForChild("leaderstats", 20)
	if not stats then return end

	local wins  = stats:WaitForChild("Wins", 10)
	local coins = stats:WaitForChild("Coins", 10)

	if wins then
		winsLabel.Text = "WINS  " .. wins.Value
		wins.Changed:Connect(function(v)
			winsLabel.Text = "WINS  " .. v
			tween(winsLabel, 0.15, { TextSize = 20 })
			task.delay(0.15, function() tween(winsLabel, 0.25, { TextSize = 15 }) end)
		end)
	end

	if coins then
		coinsLabel.Text = "COINS  " .. coins.Value
		coins.Changed:Connect(function(v)
			coinsLabel.Text = "COINS  " .. v
			tween(coinsLabel, 0.15, { TextSize = 20 })
			task.delay(0.15, function() tween(coinsLabel, 0.25, { TextSize = 15 }) end)
		end)
	end
end

task.spawn(bindStats)

--==========================================================================
--  RESPAWN HOUSEKEEPING
--==========================================================================

player.CharacterAdded:Connect(function(character)
	local hum = character:WaitForChild("Humanoid", 5)
	if hum then
		camera.CameraSubject = hum
	end
	shakeAmount = 0
	flash.BackgroundTransparency = 1
end)

showOverlay(Config.GameName, Config.Tagline, P.Cyan, 3.5)
print("[VoidArena] Client HUD ready.")
