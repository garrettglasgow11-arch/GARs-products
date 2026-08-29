// Package sim is the authoritative simulation.
//
// Everything a player can do is decided here and nowhere else. The client
// predicts its own movement — it has to, or a 90 ms round trip feels like
// walking through treacle — but prediction is a guess that gets corrected. The
// server never trusts a position, a hit, a kill or a score off the wire; it
// takes buttons and a look angle, and produces the world.
//
// Design notes that are load-bearing:
//
//   - Fixed timestep. One tick is 1/30 s, always. Variable-dt physics cannot
//     be reproduced by a predicting client, and a fight that resolves
//     differently depending on the server's frame time is not a fight.
//   - Movement is written once, here, in a form simple enough that the
//     JavaScript in web/js/predict.js can be a line-for-line transcription.
//     Every divergence between those two is a rubber-band.
//   - Hit resolution is an arc test on the tick the attack goes active. No
//     rewind, no lag compensation: with telegraphed melee and a 30 Hz tick,
//     favouring the server is both simpler and fairer than favouring whoever
//     has the worst connection.
package sim

import (
	"math"
	"math/rand"

	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/proto"
)

type Vec struct{ X, Y, Z float64 }

func (v Vec) Add(o Vec) Vec       { return Vec{v.X + o.X, v.Y + o.Y, v.Z + o.Z} }
func (v Vec) Sub(o Vec) Vec       { return Vec{v.X - o.X, v.Y - o.Y, v.Z - o.Z} }
func (v Vec) Scale(s float64) Vec { return Vec{v.X * s, v.Y * s, v.Z * s} }
func (v Vec) Len2D() float64      { return math.Hypot(v.X, v.Z) }

// Box is a static obstacle, axis aligned. The arena has a handful; they are
// what makes the Lancer a line-of-sight problem instead of a damage problem.
type Box struct{ MinX, MinY, MinZ, MaxX, MaxY, MaxZ float64 }

// Player is one connected client's avatar.
type Player struct {
	ID    uint16
	Name  string
	Pos   Vec
	Vel   Vec
	Yaw   float64
	Pitch float64

	HP     float64
	Energy float64
	Score  uint16
	Combo  uint8
	comboT float64

	Grounded  bool
	Jumps     int
	DashT     float64
	DashCd    float64
	DashDir   Vec
	AtkT      float64 // > 0 while an attack is in flight
	AtkDur    float64
	AtkHeavy  bool
	AtkDone   bool
	BoltCd    float64
	Guarding  bool
	Sprinting bool
	Dead      bool
	RespawnT  float64

	LastButtons uint16
	AckSeq      uint32
}

// Enemy is a server-owned hostile. Clients only ever render these; they never
// predict them, which is why their brains can be as stateful as they like.
type Enemy struct {
	ID   uint16
	Kind uint8
	Pos  Vec
	Vel  Vec
	Yaw  float64
	HP   float64
	Max  float64

	WindT   float64 // > 0 while winding up an attack
	StrikeT float64
	CoolT   float64
	Target  uint16
	Dead    bool
	deadT   float64
}

// Bolt is a projectile. Player bolts and Lancer shots share the type; Owner 0
// means the server fired it.
type Bolt struct {
	ID      uint16
	Owner   uint16
	Pos     Vec
	Dir     Vec
	Life    float64
	Dmg     float64
	Hostile bool
}

// Event is anything worth telling the clients about that is not per-tick
// state: a kill, a wave, someone joining. Drained once per tick.
type Event struct {
	Type string  `json:"t"`
	A    string  `json:"a,omitempty"`
	B    string  `json:"b,omitempty"`
	N    int     `json:"n,omitempty"`
	X    float64 `json:"x,omitempty"`
	Y    float64 `json:"y,omitempty"`
	Z    float64 `json:"z,omitempty"`
}

// World is the whole game. One per room.
type World struct {
	Tick    uint32
	Players map[uint16]*Player
	Enemies []*Enemy
	Bolts   []*Bolt
	Boxes   []Box

	Wave         int
	WaveT        float64
	betweenWaves bool

	events []Event
	nextID uint16
	rng    *rand.Rand
}

func New(seed int64) *World {
	w := &World{
		Players:      map[uint16]*Player{},
		nextID:       1000,
		rng:          rand.New(rand.NewSource(seed)),
		betweenWaves: true,
		WaveT:        5,
	}
	w.buildArena()
	return w
}

// buildArena lays out the obstacles. Deliberately few and large: cover you can
// read from across the disc beats a scatter of crates you have to learn.
func (w *World) buildArena() {
	add := func(cx, cz, sx, sy, sz float64) {
		w.Boxes = append(w.Boxes, Box{
			MinX: cx - sx/2, MinY: 0, MinZ: cz - sz/2,
			MaxX: cx + sx/2, MaxY: sy, MaxZ: cz + sz/2,
		})
	}
	// A cross of low walls through the middle, offset so there is no symmetric
	// stalemate spot, plus four corner blocks you can get on top of.
	add(0, -14, 22, 2.4, 1.6)
	add(0, 16, 18, 2.4, 1.6)
	add(-18, 2, 1.6, 3.2, 20)
	add(20, -2, 1.6, 3.2, 16)
	for _, p := range [][2]float64{{-32, -32}, {32, -32}, {-32, 32}, {32, 32}} {
		add(p[0], p[1], 9, 4.5, 9)
	}
	add(0, 0, 6, 1.1, 6) // centre plinth: high ground worth fighting for
}

func (w *World) id() uint16 {
	w.nextID++
	if w.nextID == 0 {
		w.nextID = 1000
	}
	return w.nextID
}

func (w *World) emit(e Event) {
	if len(w.events) < 64 {
		w.events = append(w.events, e)
	}
}

// DrainEvents hands the tick's events to the hub and clears them.
func (w *World) DrainEvents() []Event {
	if len(w.events) == 0 {
		return nil
	}
	out := w.events
	w.events = nil
	return out
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

func (w *World) AddPlayer(name string) *Player {
	p := &Player{
		ID:     w.id(),
		Name:   name,
		HP:     proto.MaxHP,
		Energy: proto.MaxEnergy,
	}
	w.spawnPlayer(p)
	w.Players[p.ID] = p
	w.emit(Event{Type: "join", A: name})
	return p
}

func (w *World) RemovePlayer(id uint16) {
	if p, ok := w.Players[id]; ok {
		w.emit(Event{Type: "leave", A: p.Name})
		delete(w.Players, id)
	}
}

func (w *World) spawnPlayer(p *Player) {
	a := w.rng.Float64() * 2 * math.Pi
	r := 34 + w.rng.Float64()*14
	p.Pos = Vec{math.Cos(a) * r, 0, math.Sin(a) * r}
	p.Vel = Vec{}
	p.HP = proto.MaxHP
	p.Energy = proto.MaxEnergy
	p.Dead = false
	p.RespawnT = 0
	p.Combo = 0
	p.AtkT = 0
	p.DashT = 0
	// Face the middle: nobody wants to spawn looking at the wall.
	p.Yaw = math.Atan2(-p.Pos.X, -p.Pos.Z)
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

// Step advances the world by exactly one tick. `inputs` maps a player id to
// the single input consumed this tick; a player with nothing buffered gets
// their previous buttons with no new edges, which is the right way to coast
// through one dropped packet rather than stuttering.
func (w *World) Step(inputs map[uint16]proto.Input) {
	dt := proto.TickDT
	w.Tick++

	for id, p := range w.Players {
		in, ok := inputs[id]
		if !ok {
			in = proto.Input{Buttons: p.LastButtons, Yaw: p.Yaw, Seq: p.AckSeq}
		}
		w.stepPlayer(p, in, dt)
		p.AckSeq = in.Seq
		p.LastButtons = in.Buttons
	}
	w.stepEnemies(dt)
	w.stepBolts(dt)
	w.stepWaves(dt)
}

// StepPlayerMovement is the part the client predicts. It is exported and kept
// free of world state beyond the collision boxes precisely so that the
// JavaScript copy can be checked against it line by line.
func (w *World) stepPlayer(p *Player, in proto.Input, dt float64) {
	p.Yaw = in.Yaw
	p.Pitch = in.Pitch

	if p.Dead {
		p.RespawnT -= dt
		pressed := in.Buttons &^ p.LastButtons
		if p.RespawnT <= 0 && (pressed&proto.BtnRespawn != 0 || p.RespawnT < -6) {
			w.spawnPlayer(p)
		}
		return
	}

	pressed := in.Buttons &^ p.LastButtons
	held := in.Buttons

	// --- timers ---
	if p.DashCd > 0 {
		p.DashCd -= dt
	}
	if p.BoltCd > 0 {
		p.BoltCd -= dt
	}
	if p.comboT > 0 {
		p.comboT -= dt
		if p.comboT <= 0 {
			p.Combo = 0
		}
	}

	// --- guard ---
	p.Guarding = held&proto.BtnGuard != 0 && p.Energy > 1 && p.AtkT <= 0
	if p.Guarding {
		p.Energy -= proto.GuardDrain * dt
		if p.Energy <= 0 {
			p.Energy = 0
			p.Guarding = false
		}
	}

	// --- attacks ---
	if p.AtkT > 0 {
		p.AtkT -= dt
		windup := proto.LightWindup
		if p.AtkHeavy {
			windup = proto.HeavyWindup
		}
		// The active frame is the moment the swing has finished winding up.
		if !p.AtkDone && p.AtkDur-p.AtkT >= windup {
			p.AtkDone = true
			w.resolveMelee(p)
		}
		if p.AtkT <= 0 {
			p.AtkT = 0
		}
	} else if !p.Guarding {
		if pressed&proto.BtnHeavy != 0 && p.Energy >= proto.HeavyCost {
			p.Energy -= proto.HeavyCost
			p.AtkHeavy = true
			p.AtkDur = proto.HeavyWindup + proto.HeavyRecover
			p.AtkT = p.AtkDur
			p.AtkDone = false
		} else if pressed&proto.BtnAttack != 0 && p.Energy >= proto.LightCost {
			p.Energy -= proto.LightCost
			p.AtkHeavy = false
			p.AtkDur = proto.LightWindup + proto.LightRecover
			p.AtkT = p.AtkDur
			p.AtkDone = false
		}
	}

	// --- bolt ---
	if pressed&proto.BtnBolt != 0 && p.BoltCd <= 0 && p.Energy >= proto.BoltCost && !p.Guarding {
		p.Energy -= proto.BoltCost
		p.BoltCd = proto.BoltCool
		dir := Vec{math.Sin(p.Yaw), math.Sin(-p.Pitch) * 0.8, math.Cos(p.Yaw)}
		n := math.Sqrt(dir.X*dir.X + dir.Y*dir.Y + dir.Z*dir.Z)
		if n > 0 {
			dir = dir.Scale(1 / n)
		}
		w.Bolts = append(w.Bolts, &Bolt{
			ID: w.id(), Owner: p.ID,
			Pos: p.Pos.Add(Vec{0, 1.2, 0}).Add(dir.Scale(0.8)),
			Dir: dir, Life: proto.BoltLife, Dmg: proto.BoltDamage,
		})
	}

	// --- movement ---
	// Camera-relative: the client sends stick input, the server rotates it by
	// the look angle. Doing it this way means the client and server agree even
	// when the camera is mid-turn.
	sy, cy := math.Sin(p.Yaw), math.Cos(p.Yaw)
	wishX := in.MoveX*cy + in.MoveY*sy
	wishZ := -in.MoveX*sy + in.MoveY*cy
	mag := math.Hypot(wishX, wishZ)

	p.Sprinting = held&proto.BtnDash != 0 && mag > 0.2 && p.Energy > 2 && p.DashT <= 0 && p.Grounded
	target := proto.MoveSpeed
	if p.Sprinting {
		target = proto.SprintSpeed
		p.Energy -= 11 * dt
	}
	if p.Guarding {
		target *= 0.45
	}

	if pressed&proto.BtnDash != 0 && p.DashCd <= 0 && p.Energy >= proto.DashCost {
		p.Energy -= proto.DashCost
		p.DashT = proto.DashTime
		p.DashCd = proto.DashCool
		if mag > 0.01 {
			p.DashDir = Vec{wishX / mag, 0, wishZ / mag}
		} else {
			p.DashDir = Vec{sy, 0, cy}
		}
	}

	if p.DashT > 0 {
		p.DashT -= dt
		p.Vel.X = p.DashDir.X * proto.DashSpeed
		p.Vel.Z = p.DashDir.Z * proto.DashSpeed
		if p.Vel.Y < -2 {
			p.Vel.Y = -2
		}
	} else {
		accel := proto.GroundAccel
		if !p.Grounded {
			accel = proto.AirAccel
		}
		p.Vel.X = damp(p.Vel.X, wishX*target, accel*0.5, dt)
		p.Vel.Z = damp(p.Vel.Z, wishZ*target, accel*0.5, dt)
	}

	p.Vel.Y -= proto.Gravity * dt
	if p.Vel.Y < -55 {
		p.Vel.Y = -55
	}
	if pressed&proto.BtnJump != 0 {
		if p.Grounded {
			p.Vel.Y = proto.JumpVel
			p.Jumps = 1
		} else if p.Jumps < 2 {
			p.Jumps++
			p.Vel.Y = proto.DoubleJump
		}
	}

	w.move(p, dt)

	// --- regen ---
	if !p.Sprinting && !p.Guarding && p.Energy < proto.MaxEnergy {
		p.Energy += proto.EnergyRegen * dt
		if p.Energy > proto.MaxEnergy {
			p.Energy = proto.MaxEnergy
		}
	}
}

// move integrates and resolves collision. Axis-separated, cheap, and stable —
// the same shape as the client's copy.
func (w *World) move(p *Player, dt float64) {
	r := proto.PlayerRadius

	p.Pos.X += p.Vel.X * dt
	p.Pos.Z += p.Vel.Z * dt
	// Horizontal: push out of any box whose vertical span we overlap.
	for _, b := range w.Boxes {
		if p.Pos.Y+proto.PlayerHeight < b.MinY || p.Pos.Y > b.MaxY {
			continue
		}
		px, pz, ok := pushOutXZ(p.Pos.X, p.Pos.Z, r, b)
		if ok {
			p.Pos.X, p.Pos.Z = px, pz
		}
	}
	// Arena wall.
	if d := math.Hypot(p.Pos.X, p.Pos.Z); d > proto.ArenaRadius-r {
		k := (proto.ArenaRadius - r) / d
		p.Pos.X *= k
		p.Pos.Z *= k
		p.Vel.X *= 0.2
		p.Vel.Z *= 0.2
	}

	p.Pos.Y += p.Vel.Y * dt
	p.Grounded = false
	// Standing on a box: only when falling onto its top face.
	for _, b := range w.Boxes {
		if p.Pos.X+r < b.MinX || p.Pos.X-r > b.MaxX || p.Pos.Z+r < b.MinZ || p.Pos.Z-r > b.MaxZ {
			continue
		}
		if p.Vel.Y <= 0 && p.Pos.Y <= b.MaxY && p.Pos.Y > b.MaxY-0.8 {
			p.Pos.Y = b.MaxY
			p.Vel.Y = 0
			p.Grounded = true
		} else if p.Vel.Y > 0 && p.Pos.Y+proto.PlayerHeight > b.MinY && p.Pos.Y < b.MinY {
			p.Pos.Y = b.MinY - proto.PlayerHeight
			p.Vel.Y = 0
		}
	}
	if p.Pos.Y <= 0 {
		p.Pos.Y = 0
		p.Vel.Y = 0
		p.Grounded = true
	}
	if p.Grounded {
		p.Jumps = 0
	}
}

func pushOutXZ(x, z, r float64, b Box) (float64, float64, bool) {
	cx := clamp(x, b.MinX, b.MaxX)
	cz := clamp(z, b.MinZ, b.MaxZ)
	dx, dz := x-cx, z-cz
	d2 := dx*dx + dz*dz
	if d2 >= r*r {
		return x, z, false
	}
	d := math.Sqrt(d2)
	if d < 1e-6 {
		// Dead centre: push along whichever axis is shallower.
		if math.Abs(x-b.MinX) < math.Abs(b.MaxX-x) {
			return b.MinX - r, z, true
		}
		return b.MaxX + r, z, true
	}
	k := (r - d) / d
	return x + dx*k, z + dz*k, true
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

func (w *World) resolveMelee(p *Player) {
	dmg, reach, arc := proto.LightDamage, proto.LightReach, proto.LightArc
	if p.AtkHeavy {
		dmg, reach, arc = proto.HeavyDamage, proto.HeavyReach, proto.HeavyArc
	}
	fx, fz := math.Sin(p.Yaw), math.Cos(p.Yaw)
	hit := false
	for _, e := range w.Enemies {
		if e.Dead {
			continue
		}
		d := e.Pos.Sub(p.Pos)
		if math.Abs(d.Y) > 3 {
			continue
		}
		dist := d.Len2D()
		if dist > reach+0.6 {
			continue
		}
		if dist > 0.01 {
			if (d.X/dist)*fx+(d.Z/dist)*fz < math.Cos(arc/2) {
				continue
			}
		}
		w.hurtEnemy(e, dmg, p)
		hit = true
	}
	if hit {
		if p.Combo < 250 {
			p.Combo++
		}
		p.comboT = 3.0
		p.Energy += 3
		if p.Energy > proto.MaxEnergy {
			p.Energy = proto.MaxEnergy
		}
	}
}

func (w *World) hurtEnemy(e *Enemy, dmg float64, by *Player) {
	if e.Dead {
		return
	}
	// A combo is a real multiplier, so pressure pays and turtling does not.
	mul := 1 + float64(by.Combo)*0.02
	if mul > 2 {
		mul = 2
	}
	e.HP -= dmg * mul
	e.WindT = 0
	if e.HP <= 0 {
		e.Dead = true
		by.Score += uint16(10 + e.Kind*10)
		w.emit(Event{Type: "kill", A: by.Name, N: int(e.Kind), X: e.Pos.X, Y: e.Pos.Y, Z: e.Pos.Z})
	}
}

func (w *World) hurtPlayer(p *Player, dmg float64, from Vec) {
	if p.Dead {
		return
	}
	if p.Guarding {
		dmg *= proto.GuardCut
		p.Energy -= 6
		if p.Energy < 0 {
			p.Energy = 0
		}
	}
	if p.DashT > 0 {
		return // i-frames on the dash: the whole point of having one
	}
	p.HP -= dmg
	p.Combo = 0
	d := p.Pos.Sub(from)
	if l := d.Len2D(); l > 0.01 {
		p.Vel.X += d.X / l * 5
		p.Vel.Z += d.Z / l * 5
	}
	if p.HP <= 0 {
		p.HP = 0
		p.Dead = true
		p.RespawnT = proto.RespawnDelay
		w.emit(Event{Type: "down", A: p.Name, X: p.Pos.X, Y: p.Pos.Y, Z: p.Pos.Z})
	}
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

type enemyDef struct {
	hp, speed, reach, dmg, wind, cool, radius float64
	ranged                                    bool
}

var enemyDefs = map[uint8]enemyDef{
	proto.EnemyGrunt:  {hp: 70, speed: 5.0, reach: 2.6, dmg: 9, wind: 0.65, cool: 1.1, radius: 0.5},
	proto.EnemyLancer: {hp: 60, speed: 3.6, reach: 40, dmg: 16, wind: 1.30, cool: 2.6, radius: 0.5, ranged: true},
	proto.EnemyBrute:  {hp: 230, speed: 3.2, reach: 3.4, dmg: 24, wind: 0.90, cool: 1.8, radius: 0.85},
}

func (w *World) stepEnemies(dt float64) {
	live := w.Enemies[:0]
	for _, e := range w.Enemies {
		if e.Dead {
			e.deadT += dt
			if e.deadT < 1.2 {
				live = append(live, e)
			}
			continue
		}
		w.stepEnemy(e, dt)
		live = append(live, e)
	}
	w.Enemies = live
}

func (w *World) stepEnemy(e *Enemy, dt float64) {
	def := enemyDefs[e.Kind]
	target := w.nearestPlayer(e.Pos)
	if target == nil {
		e.Vel.X, e.Vel.Z = damp(e.Vel.X, 0, 6, dt), damp(e.Vel.Z, 0, 6, dt)
		w.moveEnemy(e, dt, def.radius)
		return
	}
	e.Target = target.ID
	d := target.Pos.Sub(e.Pos)
	dist := d.Len2D()
	want := math.Atan2(d.X, d.Z)
	e.Yaw += angDiff(e.Yaw, want) * math.Min(1, 6*dt)

	if e.CoolT > 0 {
		e.CoolT -= dt
	}

	if e.WindT > 0 {
		// Committed. Winding up holds still, which is what makes the tell
		// readable and the dodge meaningful.
		e.WindT -= dt
		e.Vel.X = damp(e.Vel.X, 0, 10, dt)
		e.Vel.Z = damp(e.Vel.Z, 0, 10, dt)
		if e.WindT <= 0 {
			e.CoolT = def.cool
			if def.ranged {
				dir := target.Pos.Add(Vec{0, 1, 0}).Sub(e.Pos.Add(Vec{0, 1.4, 0}))
				n := math.Sqrt(dir.X*dir.X + dir.Y*dir.Y + dir.Z*dir.Z)
				if n > 0 {
					dir = dir.Scale(1 / n)
				}
				w.Bolts = append(w.Bolts, &Bolt{
					ID: w.id(), Owner: 0, Hostile: true,
					Pos: e.Pos.Add(Vec{0, 1.4, 0}), Dir: dir,
					Life: 2.5, Dmg: def.dmg,
				})
			} else if dist < def.reach+1.0 {
				w.hurtPlayer(target, def.dmg, e.Pos)
			}
		}
	} else if e.CoolT <= 0 && w.inRange(e, target, def) {
		e.WindT = def.wind
	} else {
		// Approach, or for the Lancer, hold a distance and reposition.
		speed := def.speed
		dir := Vec{}
		if def.ranged {
			switch {
			case dist < 18:
				dir = Vec{-d.X / dist, 0, -d.Z / dist}
			case dist > 34:
				dir = Vec{d.X / dist, 0, d.Z / dist}
			default:
				// Strafe: keeps the Lancer from standing in one place, which
				// is the difference between cover mattering and not.
				dir = Vec{-d.Z / dist, 0, d.X / dist}
				speed *= 0.7
			}
		} else if dist > 0.01 {
			dir = Vec{d.X / dist, 0, d.Z / dist}
		}
		e.Vel.X = damp(e.Vel.X, dir.X*speed, 8, dt)
		e.Vel.Z = damp(e.Vel.Z, dir.Z*speed, 8, dt)
	}

	// Separation, so a wave arrives as a crowd rather than as one body.
	for _, o := range w.Enemies {
		if o == e || o.Dead {
			continue
		}
		dx, dz := e.Pos.X-o.Pos.X, e.Pos.Z-o.Pos.Z
		d2 := dx*dx + dz*dz
		min := def.radius + enemyDefs[o.Kind].radius
		if d2 > min*min || d2 < 1e-6 {
			continue
		}
		dd := math.Sqrt(d2)
		push := (min - dd) / min * 8
		e.Vel.X += dx / dd * push * dt
		e.Vel.Z += dz / dd * push * dt
	}

	w.moveEnemy(e, dt, def.radius)
}

func (w *World) inRange(e *Enemy, t *Player, def enemyDef) bool {
	d := t.Pos.Sub(e.Pos)
	if math.Abs(d.Y) > 3 {
		return false
	}
	dist := d.Len2D()
	if dist > def.reach {
		return false
	}
	// A ranged attacker needs to actually see you. This is the whole reason
	// the arena has walls in it.
	if def.ranged {
		return w.lineOfSight(e.Pos.Add(Vec{0, 1.4, 0}), t.Pos.Add(Vec{0, 1.0, 0}))
	}
	return true
}

func (w *World) moveEnemy(e *Enemy, dt, r float64) {
	e.Pos.X += e.Vel.X * dt
	e.Pos.Z += e.Vel.Z * dt
	for _, b := range w.Boxes {
		if e.Pos.Y+1.8 < b.MinY || e.Pos.Y > b.MaxY {
			continue
		}
		if x, z, ok := pushOutXZ(e.Pos.X, e.Pos.Z, r, b); ok {
			e.Pos.X, e.Pos.Z = x, z
		}
	}
	if d := math.Hypot(e.Pos.X, e.Pos.Z); d > proto.ArenaRadius-r {
		k := (proto.ArenaRadius - r) / d
		e.Pos.X *= k
		e.Pos.Z *= k
	}
	e.Vel.Y -= proto.Gravity * dt
	e.Pos.Y += e.Vel.Y * dt
	grounded := false
	for _, b := range w.Boxes {
		if e.Pos.X+r < b.MinX || e.Pos.X-r > b.MaxX || e.Pos.Z+r < b.MinZ || e.Pos.Z-r > b.MaxZ {
			continue
		}
		if e.Vel.Y <= 0 && e.Pos.Y <= b.MaxY && e.Pos.Y > b.MaxY-0.9 {
			e.Pos.Y, e.Vel.Y, grounded = b.MaxY, 0, true
		}
	}
	if e.Pos.Y <= 0 {
		e.Pos.Y, e.Vel.Y, grounded = 0, 0, true
	}
	_ = grounded
}

func (w *World) nearestPlayer(from Vec) *Player {
	var best *Player
	bd := math.Inf(1)
	for _, p := range w.Players {
		if p.Dead {
			continue
		}
		d := p.Pos.Sub(from).Len2D()
		if d < bd {
			bd, best = d, p
		}
	}
	return best
}

// lineOfSight is a slab test against every box. With seven boxes that is
// cheaper than any acceleration structure would be to maintain.
func (w *World) lineOfSight(a, b Vec) bool {
	d := b.Sub(a)
	length := math.Sqrt(d.X*d.X + d.Y*d.Y + d.Z*d.Z)
	if length < 1e-6 {
		return true
	}
	inv := Vec{safeInv(d.X), safeInv(d.Y), safeInv(d.Z)}
	for _, bx := range w.Boxes {
		t1 := (bx.MinX - a.X) * inv.X
		t2 := (bx.MaxX - a.X) * inv.X
		t3 := (bx.MinY - a.Y) * inv.Y
		t4 := (bx.MaxY - a.Y) * inv.Y
		t5 := (bx.MinZ - a.Z) * inv.Z
		t6 := (bx.MaxZ - a.Z) * inv.Z
		tmin := math.Max(math.Max(math.Min(t1, t2), math.Min(t3, t4)), math.Min(t5, t6))
		tmax := math.Min(math.Min(math.Max(t1, t2), math.Max(t3, t4)), math.Max(t5, t6))
		if tmax >= math.Max(tmin, 0) && tmin <= 1 {
			return false
		}
	}
	return true
}

func safeInv(v float64) float64 {
	if math.Abs(v) < 1e-9 {
		return math.Inf(1)
	}
	return 1 / v
}

// ---------------------------------------------------------------------------
// Bolts
// ---------------------------------------------------------------------------

func (w *World) stepBolts(dt float64) {
	live := w.Bolts[:0]
	for _, b := range w.Bolts {
		b.Life -= dt
		if b.Life <= 0 {
			continue
		}
		step := proto.BoltSpeed * dt
		prev := b.Pos
		b.Pos = b.Pos.Add(b.Dir.Scale(step))
		if !w.lineOfSight(prev, b.Pos) {
			continue
		}
		hit := false
		if b.Hostile {
			for _, p := range w.Players {
				if p.Dead {
					continue
				}
				if segNear(prev, b.Pos, p.Pos.Add(Vec{0, 0.9, 0})) < 0.8 {
					w.hurtPlayer(p, b.Dmg, prev)
					hit = true
					break
				}
			}
		} else {
			owner := w.Players[b.Owner]
			for _, e := range w.Enemies {
				if e.Dead {
					continue
				}
				if segNear(prev, b.Pos, e.Pos.Add(Vec{0, 0.9, 0})) < 0.9 {
					if owner != nil {
						w.hurtEnemy(e, b.Dmg, owner)
					} else {
						e.HP -= b.Dmg
						if e.HP <= 0 {
							e.Dead = true
						}
					}
					hit = true
					break
				}
			}
		}
		if hit {
			continue
		}
		if math.Hypot(b.Pos.X, b.Pos.Z) > proto.ArenaRadius || b.Pos.Y < 0 || b.Pos.Y > 40 {
			continue
		}
		if len(live) < proto.MaxBolts {
			live = append(live, b)
		}
	}
	w.Bolts = live
}

// segNear is the distance from a point to a segment — the swept test that
// stops a fast bolt tunnelling through a body between two ticks.
func segNear(a, b, p Vec) float64 {
	ab := b.Sub(a)
	l2 := ab.X*ab.X + ab.Y*ab.Y + ab.Z*ab.Z
	if l2 < 1e-9 {
		return math.Sqrt(sq(p.X-a.X) + sq(p.Y-a.Y) + sq(p.Z-a.Z))
	}
	ap := p.Sub(a)
	t := clamp((ap.X*ab.X+ap.Y*ab.Y+ap.Z*ab.Z)/l2, 0, 1)
	c := a.Add(ab.Scale(t))
	return math.Sqrt(sq(p.X-c.X) + sq(p.Y-c.Y) + sq(p.Z-c.Z))
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------

func (w *World) stepWaves(dt float64) {
	if len(w.Players) == 0 {
		return
	}
	if w.betweenWaves {
		w.WaveT -= dt
		if w.WaveT <= 0 {
			w.startWave()
		}
		return
	}
	alive := 0
	for _, e := range w.Enemies {
		if !e.Dead {
			alive++
		}
	}
	if alive == 0 {
		w.betweenWaves = true
		w.WaveT = 8
		w.emit(Event{Type: "wave_clear", N: w.Wave})
		// Everyone gets a breather and their charge back between waves.
		for _, p := range w.Players {
			if !p.Dead {
				p.HP = math.Min(proto.MaxHP, p.HP+35)
			}
			p.Energy = proto.MaxEnergy
		}
	}
}

func (w *World) startWave() {
	w.Wave++
	w.betweenWaves = false
	// Budget scales with the wave and with how many people are actually here,
	// so a duo is not fighting a wave built for eight.
	heads := len(w.Players)
	if heads < 1 {
		heads = 1
	}
	budget := 3 + w.Wave*2 + (heads-1)*2
	for budget > 0 && len(w.Enemies) < proto.MaxEnemies {
		var kind uint8
		switch {
		case w.Wave >= 4 && w.rng.Float64() < 0.22:
			kind = proto.EnemyBrute
			budget -= 4
		case w.Wave >= 2 && w.rng.Float64() < 0.3:
			kind = proto.EnemyLancer
			budget -= 2
		default:
			kind = proto.EnemyGrunt
			budget--
		}
		w.spawnEnemy(kind)
	}
	w.emit(Event{Type: "wave", N: w.Wave})
}

func (w *World) spawnEnemy(kind uint8) {
	def := enemyDefs[kind]
	a := w.rng.Float64() * 2 * math.Pi
	r := proto.ArenaRadius - 6
	e := &Enemy{
		ID:   w.id(),
		Kind: kind,
		Pos:  Vec{math.Cos(a) * r, 0, math.Sin(a) * r},
		HP:   def.hp, Max: def.hp,
	}
	e.Yaw = math.Atan2(-e.Pos.X, -e.Pos.Z)
	w.Enemies = append(w.Enemies, e)
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

// Snapshot builds the view for one client. The only per-client fields are the
// ack and the id, so the record arrays could be shared — they are rebuilt here
// for clarity, and at eight players that is not a cost worth optimising.
func (w *World) Snapshot(for_ uint16, serverMs uint64) proto.Snapshot {
	s := proto.Snapshot{Tick: w.Tick, ServerMs: serverMs, YourID: for_}
	if me, ok := w.Players[for_]; ok {
		s.AckSeq = me.AckSeq
	}
	for _, p := range w.Players {
		var fl uint8
		if p.Dead {
			fl |= proto.StDead
		}
		if p.DashT > 0 {
			fl |= proto.StDash
		}
		if p.Grounded {
			fl |= proto.StGround
		}
		if p.Guarding {
			fl |= proto.StGuard
		}
		if p.AtkT > 0 {
			fl |= proto.StAttack
			if p.AtkHeavy {
				fl |= proto.StHeavy
			}
		}
		if p.Sprinting {
			fl |= proto.StSprint
		}
		s.Players = append(s.Players, proto.PlayerState{
			ID: p.ID, X: p.Pos.X, Y: p.Pos.Y, Z: p.Pos.Z, Yaw: p.Yaw,
			HP: u8(p.HP), Energy: u8(p.Energy), Flags: fl, Combo: p.Combo, Score: p.Score,
		})
	}
	for _, e := range w.Enemies {
		var fl uint8
		if e.Dead {
			fl |= proto.StDead
		}
		if e.WindT > 0 {
			fl |= proto.StAttack
		}
		s.Enemies = append(s.Enemies, proto.EnemyState{
			ID: e.ID, Kind: e.Kind, X: e.Pos.X, Y: e.Pos.Y, Z: e.Pos.Z, Yaw: e.Yaw,
			HP: u8(e.HP / e.Max * 100), Flags: fl,
		})
	}
	for _, b := range w.Bolts {
		s.Bolts = append(s.Bolts, proto.BoltState{ID: b.ID, X: b.Pos.X, Y: b.Pos.Y, Z: b.Pos.Z})
	}
	return s
}

// ---------------------------------------------------------------------------

func damp(a, b, lambda, dt float64) float64 {
	return a + (b-a)*(1-math.Exp(-lambda*dt))
}

func angDiff(a, b float64) float64 {
	d := math.Mod(b-a, 2*math.Pi)
	if d > math.Pi {
		d -= 2 * math.Pi
	}
	if d < -math.Pi {
		d += 2 * math.Pi
	}
	return d
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func sq(v float64) float64 { return v * v }

func u8(v float64) uint8 {
	if v <= 0 {
		return 0
	}
	if v >= 255 {
		return 255
	}
	return uint8(v)
}
