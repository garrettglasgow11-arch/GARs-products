// Package proto is the wire format, and the single source of truth for the
// simulation constants the client has to agree with.
//
// Two channels over one socket:
//
//	binary  the hot path — inputs up, snapshots down, 30 times a second
//	text    JSON, for anything that is not per-tick: hello, welcome, events
//
// The split matters. A snapshot for eight players and twelve enemies is 214
// bytes packed and about 2.4 KB as JSON; at 30 Hz that is the difference
// between 51 kbit/s and 576 kbit/s per client, and between a parse you can
// ignore and one that shows up in the client's frame time.
//
// Everything positional is fixed point: centimetres in an int16, giving
// ±327.67 m of range at 1 cm precision. The arena is a 60 m disc, so that is
// four times the headroom needed and half the bytes a float32 would cost.
package proto

import (
	"encoding/binary"
	"math"
)

// Protocol version. The client refuses to play against a mismatch rather than
// silently misreading a snapshot, which is the failure mode that costs a day.
const Version = 3

// Message type tags. The first byte of every packet.
const (
	CInput byte = 0x01 // client -> server, binary
	CPing  byte = 0x03 // client -> server, binary

	SWelcome  byte = 0x81 // server -> client, text (JSON)
	SSnapshot byte = 0x82 // server -> client, binary
	SEvent    byte = 0x83 // server -> client, text (JSON)
	SPong     byte = 0x84 // server -> client, binary
)

// Button bits in the input packet.
const (
	BtnJump uint16 = 1 << iota
	BtnDash
	BtnAttack
	BtnHeavy
	BtnGuard
	BtnBolt
	BtnUlt
	BtnRespawn
)

// ---------------------------------------------------------------------------
// Simulation constants.
//
// The client predicts the local player with these exact numbers. They live
// here, in the package the server is built from, and are emitted to the client
// inside the welcome message rather than duplicated in JavaScript — a constant
// that exists twice is a constant that will disagree.
// ---------------------------------------------------------------------------

const (
	TickRate   = 30             // server ticks per second
	TickDT     = 1.0 / TickRate // seconds per tick
	SnapshotHz = 30             // snapshots per second (== tick rate)

	ArenaRadius  = 60.0
	Gravity      = 26.0
	MoveSpeed    = 7.2
	SprintSpeed  = 14.0
	GroundAccel  = 26.0
	AirAccel     = 12.0
	JumpVel      = 10.6
	DoubleJump   = 9.4
	DashSpeed    = 30.0
	DashTime     = 0.16
	DashCost     = 18.0
	DashCool     = 0.55
	PlayerRadius = 0.45
	PlayerHeight = 1.8

	MaxHP       = 100.0
	MaxEnergy   = 100.0
	EnergyRegen = 16.0

	LightDamage  = 16.0
	LightReach   = 3.6
	LightArc     = 1.6
	LightWindup  = 0.12
	LightRecover = 0.22
	LightCost    = 6.0

	HeavyDamage  = 42.0
	HeavyReach   = 4.4
	HeavyArc     = 2.4
	HeavyWindup  = 0.30
	HeavyRecover = 0.42
	HeavyCost    = 22.0

	BoltDamage = 14.0
	BoltSpeed  = 46.0
	BoltCost   = 8.0
	BoltCool   = 0.22
	BoltLife   = 2.0

	GuardDrain = 14.0
	GuardCut   = 0.25 // damage multiplier while guarding

	RespawnDelay = 3.0
	MaxPlayers   = 8
	MaxEnemies   = 24
	MaxBolts     = 64
)

// Player state flags, packed into one byte of the snapshot.
const (
	StDead uint8 = 1 << iota
	StDash
	StGround
	StGuard
	StAttack
	StHeavy
	StSprint
)

// Enemy kinds. Kept small on purpose: three shapes that need three different
// answers from the player, rather than ten that need one.
const (
	EnemyGrunt uint8 = iota
	EnemyLancer
	EnemyBrute
)

// ---------------------------------------------------------------------------
// Fixed point
// ---------------------------------------------------------------------------

// Fix converts metres to the wire's centimetre int16.
func Fix(v float64) int16 {
	x := math.Round(v * 100)
	if x > 32767 {
		x = 32767
	} else if x < -32768 {
		x = -32768
	}
	return int16(x)
}

// Unfix is the inverse, used by tests and by the replay tool.
func Unfix(v int16) float64 { return float64(v) / 100 }

// FixAngle maps a radian angle onto the full int16 range, which gives about
// 0.005 degrees of precision — far finer than anyone can see a character turn.
func FixAngle(a float64) int16 {
	a = math.Mod(a, 2*math.Pi)
	if a < 0 {
		a += 2 * math.Pi
	}
	return int16(int32(a/(2*math.Pi)*65536) - 32768)
}

func UnfixAngle(v int16) float64 {
	return (float64(v) + 32768) / 65536 * 2 * math.Pi
}

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

// Input is one sampled frame of intent. The client sends one per rendered
// frame, capped at 60 Hz; the server buffers them and consumes one per tick.
//
// Wire layout, 14 bytes:
//
//	0      type (CInput)
//	1..4   seq        uint32  monotonic per client, echoed back in the snapshot
//	5..6   buttons    uint16
//	7      moveX      int8    -100..100
//	8      moveY      int8    -100..100
//	9..10  yaw        int16   fixed angle
//	11..12 pitch      int16   fixed angle, cosmetic only (aim of the bolt)
//	13     dtMs       uint8   client frame time, clamped, for input smoothing
type Input struct {
	Seq     uint32
	Buttons uint16
	MoveX   float64
	MoveY   float64
	Yaw     float64
	Pitch   float64
	DtMs    uint8
}

const InputSize = 14

func (in *Input) Encode(b []byte) []byte {
	var buf [InputSize]byte
	buf[0] = CInput
	binary.LittleEndian.PutUint32(buf[1:], in.Seq)
	binary.LittleEndian.PutUint16(buf[5:], in.Buttons)
	buf[7] = byte(int8(clampF(in.MoveX, -1, 1) * 100))
	buf[8] = byte(int8(clampF(in.MoveY, -1, 1) * 100))
	binary.LittleEndian.PutUint16(buf[9:], uint16(FixAngle(in.Yaw)))
	binary.LittleEndian.PutUint16(buf[11:], uint16(FixAngle(in.Pitch)))
	buf[13] = in.DtMs
	return append(b, buf[:]...)
}

// DecodeInput returns false rather than panicking on a short or malformed
// packet: the input path is reachable by anyone who can open a socket.
func DecodeInput(b []byte) (Input, bool) {
	if len(b) < InputSize || b[0] != CInput {
		return Input{}, false
	}
	var in Input
	in.Seq = binary.LittleEndian.Uint32(b[1:])
	in.Buttons = binary.LittleEndian.Uint16(b[5:])
	in.MoveX = float64(int8(b[7])) / 100
	in.MoveY = float64(int8(b[8])) / 100
	in.Yaw = UnfixAngle(int16(binary.LittleEndian.Uint16(b[9:])))
	in.Pitch = UnfixAngle(int16(binary.LittleEndian.Uint16(b[11:])))
	in.DtMs = b[13]
	// A client can say anything. Clamp here, once, so no caller has to.
	in.MoveX = clampF(in.MoveX, -1, 1)
	in.MoveY = clampF(in.MoveY, -1, 1)
	if m := math.Hypot(in.MoveX, in.MoveY); m > 1 {
		in.MoveX /= m
		in.MoveY /= m
	}
	return in, true
}

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

// PlayerState is one player's slice of a snapshot. 14 bytes.
type PlayerState struct {
	ID      uint16
	X, Y, Z float64
	Yaw     float64
	HP      uint8
	Energy  uint8
	Flags   uint8
	Combo   uint8
	Score   uint16
}

// EnemyState is one hostile. 12 bytes.
type EnemyState struct {
	ID      uint16
	Kind    uint8
	X, Y, Z float64
	Yaw     float64
	HP      uint8
	Flags   uint8
}

// BoltState is one projectile in flight. 8 bytes.
type BoltState struct {
	ID      uint16
	X, Y, Z float64
}

// Snapshot is the authoritative world at one tick.
//
//	0       type (SSnapshot)
//	1..4    tick        uint32
//	5..8    ackSeq      uint32   last input from THIS client that was applied
//	9..16   serverMs    uint64   for clock sync and the ping estimate
//	17      yourID lo,  18 hi    uint16
//	19      nPlayers    uint8
//	20      nEnemies    uint8
//	21      nBolts      uint8
//	22..    records
type Snapshot struct {
	Tick     uint32
	AckSeq   uint32
	ServerMs uint64
	YourID   uint16
	Players  []PlayerState
	Enemies  []EnemyState
	Bolts    []BoltState
}

const snapHeader = 22

func (s *Snapshot) Encode(buf []byte) []byte {
	out := buf[:0]
	var h [snapHeader]byte
	h[0] = SSnapshot
	binary.LittleEndian.PutUint32(h[1:], s.Tick)
	binary.LittleEndian.PutUint32(h[5:], s.AckSeq)
	binary.LittleEndian.PutUint64(h[9:], s.ServerMs)
	binary.LittleEndian.PutUint16(h[17:], s.YourID)
	h[19] = byte(len(s.Players))
	h[20] = byte(len(s.Enemies))
	h[21] = byte(len(s.Bolts))
	out = append(out, h[:]...)

	var rec [16]byte
	for _, p := range s.Players {
		binary.LittleEndian.PutUint16(rec[0:], p.ID)
		binary.LittleEndian.PutUint16(rec[2:], uint16(Fix(p.X)))
		binary.LittleEndian.PutUint16(rec[4:], uint16(Fix(p.Y)))
		binary.LittleEndian.PutUint16(rec[6:], uint16(Fix(p.Z)))
		binary.LittleEndian.PutUint16(rec[8:], uint16(FixAngle(p.Yaw)))
		rec[10] = p.HP
		rec[11] = p.Energy
		rec[12] = p.Flags
		rec[13] = p.Combo
		binary.LittleEndian.PutUint16(rec[14:], p.Score)
		out = append(out, rec[:16]...)
	}
	for _, e := range s.Enemies {
		binary.LittleEndian.PutUint16(rec[0:], e.ID)
		rec[2] = e.Kind
		binary.LittleEndian.PutUint16(rec[3:], uint16(Fix(e.X)))
		binary.LittleEndian.PutUint16(rec[5:], uint16(Fix(e.Y)))
		binary.LittleEndian.PutUint16(rec[7:], uint16(Fix(e.Z)))
		binary.LittleEndian.PutUint16(rec[9:], uint16(FixAngle(e.Yaw)))
		rec[11] = e.HP
		rec[12] = e.Flags
		out = append(out, rec[:13]...)
	}
	for _, b := range s.Bolts {
		binary.LittleEndian.PutUint16(rec[0:], b.ID)
		binary.LittleEndian.PutUint16(rec[2:], uint16(Fix(b.X)))
		binary.LittleEndian.PutUint16(rec[4:], uint16(Fix(b.Y)))
		binary.LittleEndian.PutUint16(rec[6:], uint16(Fix(b.Z)))
		out = append(out, rec[:8]...)
	}
	return out
}

// SnapshotSize is what one tick costs on the wire, for the bandwidth readout.
func SnapshotSize(players, enemies, bolts int) int {
	return snapHeader + players*16 + enemies*13 + bolts*8
}

func clampF(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
