// Package hub owns the connections, the room, and the clock.
//
// The shape is the standard one for an authoritative server, and the reasons
// are worth stating because each one is a bug somebody has shipped:
//
//	one goroutine ticks       the world is never touched from two places, so
//	                          there are no locks in the simulation at all
//	one reader per client     a client that stops reading cannot stall the tick
//	one writer per client     with a bounded queue that DROPS rather than
//	                          blocks. A snapshot is a complete world state, so
//	                          the newest one is always more useful than the
//	                          backlog; queueing them behind a slow socket adds
//	                          latency to everybody else and helps nobody.
package hub

import (
	"encoding/json"
	"log"
	"math"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/proto"
	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/sim"
	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/ws"
)

// inputQueue is how many ticks of input we will hold for one client. Three is
// about 100 ms: enough to ride out jitter, short enough that a client cannot
// bank inputs and then spend them all at once.
const inputQueue = 3

type Client struct {
	ID   uint16
	Name string
	conn *ws.Conn
	room *Room

	out  chan []byte
	once sync.Once
	dead atomic.Bool

	// Written by the reader goroutine, read by the tick goroutine, guarded by
	// the room's inbox mutex.
	pending []proto.Input

	// Diagnostics, surfaced in /status and in the client HUD.
	rttMs    atomic.Int64
	dropped  atomic.Int64
	pingSent atomic.Int64
}

type Room struct {
	Name  string
	world *sim.World

	mu      sync.Mutex
	clients map[uint16]*Client

	join  chan *Client
	leave chan *Client
	quit  chan struct{}

	startedAt time.Time
	ticks     atomic.Uint64
	bytesOut  atomic.Uint64
}

func NewRoom(name string) *Room {
	r := &Room{
		Name:      name,
		world:     sim.New(time.Now().UnixNano()),
		clients:   map[uint16]*Client{},
		join:      make(chan *Client, 8),
		leave:     make(chan *Client, 8),
		quit:      make(chan struct{}),
		startedAt: time.Now(),
	}
	go r.run()
	return r
}

func (r *Room) Close() { close(r.quit) }

// Count is read by the HTTP status endpoint.
func (r *Room) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.clients)
}

// Stats is the JSON served at /status.
func (r *Room) Stats() map[string]any {
	r.mu.Lock()
	n := len(r.clients)
	peers := make([]map[string]any, 0, n)
	for _, c := range r.clients {
		peers = append(peers, map[string]any{
			"name": c.Name, "rtt_ms": c.rttMs.Load(), "dropped": c.dropped.Load(),
		})
	}
	r.mu.Unlock()
	up := time.Since(r.startedAt).Seconds()
	return map[string]any{
		"room": r.Name, "players": n, "wave": r.world.Wave,
		"tick": r.ticks.Load(), "uptime_s": math.Round(up),
		"tick_rate": proto.TickRate,
		"kbps_out":  math.Round(float64(r.bytesOut.Load()) * 8 / 1000 / math.Max(1, up)),
		"peers":     peers,
	}
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

func (r *Room) run() {
	// A ticker, not a sleep loop: sleeping for `1/30 - elapsed` accumulates
	// drift, and drift in a fixed-timestep sim is a slow desync.
	t := time.NewTicker(time.Second / proto.TickRate)
	defer t.Stop()

	for {
		select {
		case <-r.quit:
			return
		case c := <-r.join:
			r.mu.Lock()
			r.clients[c.ID] = c
			r.mu.Unlock()
		case c := <-r.leave:
			r.mu.Lock()
			delete(r.clients, c.ID)
			r.mu.Unlock()
			r.world.RemovePlayer(c.ID)
		case <-t.C:
			r.step()
		}
	}
}

func (r *Room) step() {
	r.mu.Lock()
	inputs := make(map[uint16]proto.Input, len(r.clients))
	list := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		list = append(list, c)
		if len(c.pending) > 0 {
			// Exactly one input per tick. Anything else is either a client
			// running fast — in which case it will catch up — or a client
			// trying to move twice in one tick, which is the classic speed
			// hack and is simply not possible through this door.
			inputs[c.ID] = c.pending[0]
			c.pending = c.pending[1:]
		}
	}
	r.mu.Unlock()

	r.world.Step(inputs)
	r.ticks.Add(1)

	events := r.world.DrainEvents()
	var eventJSON []byte
	if len(events) > 0 {
		if b, err := json.Marshal(map[string]any{"t": "events", "e": events}); err == nil {
			eventJSON = b
		}
	}

	now := uint64(time.Now().UnixMilli())
	buf := make([]byte, 0, 1024)
	for _, c := range list {
		snap := r.world.Snapshot(c.ID, now)
		payload := snap.Encode(buf)
		out := make([]byte, len(payload))
		copy(out, payload)
		c.send(out)
		r.bytesOut.Add(uint64(len(out)))
		if eventJSON != nil {
			c.sendText(eventJSON)
		}
	}
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Serve owns one connection for its whole life.
func (r *Room) Serve(conn *ws.Conn, name string) {
	if r.Count() >= proto.MaxPlayers {
		_ = conn.WriteText([]byte(`{"t":"full"}`))
		_ = conn.Close()
		return
	}
	p := r.world.AddPlayer(name)
	c := &Client{ID: p.ID, Name: name, conn: conn, room: r, out: make(chan []byte, 4)}

	welcome, _ := json.Marshal(map[string]any{
		"t":         "welcome",
		"v":         proto.Version,
		"id":        c.ID,
		"name":      name,
		"room":      r.Name,
		"tickRate":  proto.TickRate,
		"arenaR":    proto.ArenaRadius,
		"boxes":     r.world.Boxes,
		"roster":    r.roster(),
		"constants": constants(),
	})
	if err := conn.WriteText(welcome); err != nil {
		_ = conn.Close()
		r.world.RemovePlayer(c.ID)
		return
	}

	// Server-side RTT. The browser answers a protocol ping without involving
	// any application code, so this measures the network and nothing else.
	conn.OnPong = func() {
		if t := c.pingSent.Load(); t > 0 {
			c.rttMs.Store(time.Now().UnixMilli() - t)
		}
	}

	r.join <- c
	// Tell the room who just arrived, with the id, so every client can label
	// the avatar it is already drawing. Without the id a name is only useful
	// in the kill feed.
	r.broadcastText(map[string]any{"t": "roster", "id": c.ID, "name": name, "join": true})
	go c.writeLoop()
	c.readLoop()

	c.close()
	r.leave <- c
	r.broadcastText(map[string]any{"t": "roster", "id": c.ID, "name": name, "join": false})
}

// roster is the id -> name map a joining client needs to label everyone who
// was already here.
func (r *Room) roster() map[string]string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]string, len(r.clients))
	for id, c := range r.clients {
		out[strconv.Itoa(int(id))] = c.Name
	}
	return out
}

// constants is the movement table the client predicts with. Sending it rather
// than hardcoding it in JavaScript is the difference between "tune the server
// and the client agrees" and "tune the server and every client rubber-bands".
func constants() map[string]float64 {
	return map[string]float64{
		"gravity": proto.Gravity, "move": proto.MoveSpeed, "sprint": proto.SprintSpeed,
		"groundAccel": proto.GroundAccel, "airAccel": proto.AirAccel,
		"jump": proto.JumpVel, "doubleJump": proto.DoubleJump,
		"dashSpeed": proto.DashSpeed, "dashTime": proto.DashTime,
		"dashCost": proto.DashCost, "dashCool": proto.DashCool,
		"radius": proto.PlayerRadius, "height": proto.PlayerHeight,
		"maxHP": proto.MaxHP, "maxEnergy": proto.MaxEnergy,
		"energyRegen": proto.EnergyRegen, "guardDrain": proto.GuardDrain,
		"lightCost": proto.LightCost, "heavyCost": proto.HeavyCost, "boltCost": proto.BoltCost,
		"tickDT": proto.TickDT,
	}
}

func (c *Client) readLoop() {
	c.conn.ReadTimeout = 30 * time.Second
	for {
		msg, err := c.conn.Read()
		if err != nil {
			return
		}
		if !msg.Binary {
			// Text is only ever chat or a name change; both are cheap and
			// neither touches the simulation.
			var m struct {
				T    string `json:"t"`
				Text string `json:"text"`
			}
			if json.Unmarshal(msg.Data, &m) == nil && m.T == "chat" && len(m.Text) > 0 {
				if len(m.Text) > 160 {
					m.Text = m.Text[:160]
				}
				c.room.broadcastText(map[string]any{"t": "chat", "from": c.Name, "text": m.Text})
			}
			continue
		}
		if len(msg.Data) == 0 {
			continue
		}
		switch msg.Data[0] {
		case proto.CInput:
			in, ok := proto.DecodeInput(msg.Data)
			if !ok {
				continue
			}
			c.room.mu.Lock()
			// Bound the queue. A client that floods gets its oldest inputs
			// dropped, which costs it responsiveness and costs nobody else
			// anything.
			if len(c.pending) >= inputQueue {
				c.pending = c.pending[1:]
				c.dropped.Add(1)
			}
			c.pending = append(c.pending, in)
			c.room.mu.Unlock()
		case proto.CPing:
			// Echo straight back on the writer. The client owns the clock
			// maths; the server just has to be fast and honest.
			if len(msg.Data) >= 9 {
				out := make([]byte, 17)
				out[0] = proto.SPong
				copy(out[1:9], msg.Data[1:9])
				putU64(out[9:], uint64(time.Now().UnixMilli()))
				c.send(out)
			}
		}
	}
}

func (c *Client) writeLoop() {
	ping := time.NewTicker(5 * time.Second)
	defer ping.Stop()
	for {
		select {
		case b, ok := <-c.out:
			if !ok {
				return
			}
			var err error
			if len(b) > 0 && (b[0] == proto.SSnapshot || b[0] == proto.SPong) {
				err = c.conn.WriteBinary(b)
			} else {
				err = c.conn.WriteText(b)
			}
			if err != nil {
				c.dead.Store(true)
				_ = c.conn.Close()
				return
			}
		case <-ping.C:
			c.pingSent.Store(time.Now().UnixMilli())
			if err := c.conn.Ping(); err != nil {
				c.dead.Store(true)
				_ = c.conn.Close()
				return
			}
		}
	}
}

// send never blocks. A full queue means this client is behind; the newest
// snapshot supersedes whatever is stuck in there, so drop the oldest.
func (c *Client) send(b []byte) {
	if c.dead.Load() {
		return
	}
	select {
	case c.out <- b:
	default:
		select {
		case <-c.out:
			c.dropped.Add(1)
		default:
		}
		select {
		case c.out <- b:
		default:
		}
	}
}

func (c *Client) sendText(b []byte) { c.send(b) }

func (c *Client) close() {
	c.once.Do(func() {
		c.dead.Store(true)
		close(c.out)
		_ = c.conn.Close()
	})
}

func (r *Room) broadcastText(v map[string]any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, c := range r.clients {
		c.sendText(b)
	}
}

func putU64(b []byte, v uint64) {
	for i := 0; i < 8; i++ {
		b[i] = byte(v >> (8 * i))
	}
}

func init() { log.SetFlags(log.Ltime) }
