# HEXIS: STORMLINK

The second build. Same world, different problem: up to eight people in one
arena, on one authoritative server, over a real network.

```
go run ./cmd/stormlink            # http://localhost:8080
go run ./cmd/stormlink -addr :9000 -room "Storm Deck"
go build -o stormlink ./cmd/stormlink
```

Open the page in as many tabs, phones or machines as you like; they all land in
the same room. `/status` returns JSON: player count, wave, tick, uptime,
outbound bandwidth, and each peer's server-measured round trip.

**Zero dependencies.** `go.mod` has no `require` block. The WebSocket server is
`internal/ws` — about 300 lines of RFC 6455, the subset a game actually needs.
That is deliberate: a game server you can build on a machine with nothing but
the Go toolchain is a game server you can actually deploy.

**No build step for the client.** The browser loads five ES modules straight off
disk. A reload is the build.

---

## Why it is shaped like this

A multiplayer action game has one hard problem and it is not graphics.

If the server decides everything and the client waits for confirmation, a
90 ms round trip means every button press lands 90 ms late and the game feels
like walking through treacle. If the client decides everything, the first
person to open the console wins. The answer is the standard one, and every part
of it is here:

**The server owns the world.** `internal/sim` runs a fixed 30 Hz tick. Clients
send buttons and a look angle; they never send a position, a hit or a score.
One input is consumed per tick per player — a client that floods gets its
oldest inputs dropped, which costs it responsiveness and costs nobody else
anything. The classic speed hack (send twice as many move packets) is not
possible through that door.

**The client predicts itself.** `web/js/predict.js` runs the same movement code
on the same inputs, immediately. When the truth arrives it snaps to the
authoritative state and replays every input the server has not acknowledged
yet. If prediction and simulation agree, the replay lands exactly where the
client already was and nothing moves.

**Both step at 1/30 s.** This is the part that is easy to get wrong. Predicting
with the render delta and sending at some capped rate diverges on *every frame*,
because damped acceleration is not linear and the client integrated 1/144 s at
a time where the server integrated 1/30 s. The client here accumulates time and
steps in fixed chunks, one input packet per chunk, and interpolates between the
last two steps for the picture — so a 144 Hz display gets 144 distinct
positions out of a 30 Hz simulation and the correction goes to zero.

Measured in-engine, moving continuously: **about a dozen corrections a minute**,
against 118 in ten seconds before the change.

**Everything else is interpolated, not extrapolated.** Remote players, enemies
and projectiles are drawn between the two snapshots bracketing *(now − delay)*,
where the delay is one tick plus measured jitter, floored at 60 ms. Rendering
the newest snapshot directly gives 30 discrete positions a second; extrapolating
forward means every direction change overshoots and snaps back. A tenth of a
second of deliberate lag on things you do not control is invisible.

**A slow client cannot slow anyone down.** One reader goroutine and one writer
goroutine per client, with a bounded queue that *drops* rather than blocks. A
snapshot is a complete world state, so the newest one always supersedes the
backlog.

**The wire is packed binary.** A snapshot for eight players and twelve enemies
is 214 bytes; the same thing as JSON is about 2.4 KB. At 30 Hz that is 51 kbit/s
against 576. Positions are centimetres in an `int16` — ±327 m of range for a
60 m arena, at half the cost of a float. Two clients fighting a wave measure
**16 kbit/s** outbound in total.

---

## What you play

An eight-player co-op wave arena on a 60 m disc with cover you can read from
across it.

- **Movement** — run, sprint, dash with i-frames, double jump.
- **Combat** — light chain, heavy that costs real charge, a ranged bolt, and a
  guard that cuts damage to a quarter while it drains you. Combo multiplies
  damage, so pressure pays and turtling does not.
- **Three hostiles, three answers.** The Grunt closes. The Lancer needs line of
  sight, so it is a cover problem rather than a damage problem — and it strafes,
  so the cover has to be used rather than stood behind. The Brute has four times
  the health and a wind-up you can read from across the arena.
- **Waves** scale with the wave number *and* the head count, so a duo is not
  fighting a wave built for eight. Everyone gets health and full charge between
  waves.

Controls are on the connect screen. Touch gets a stick, a look area and six
buttons. `Enter` opens chat.

---

## The net panel

Top right, always visible, because a multiplayer game that hides your
connection is asking you to guess whether it is the game or the network.

- **ping** — an explicit ping/pong, not inferred from snapshot arrival, which
  is quantised to the tick rate and would report 33 ms that is not there.
- **jitter** — variance in that round trip. It sets the interpolation delay.
- **traffic** — both directions, measured, not estimated.
- **predict** — how many times reconciliation had to move you. On a clean
  connection this should barely climb while you play.
- **the graph** — one bar per received snapshot, height = time since the last
  one. A flat row is a healthy 30 Hz stream; a yellow or red bar is a late or
  dropped packet, and it is exactly what a stutter looks like from the inside.

The server measures its own round trip separately, using protocol pings the
browser answers in its network stack without waking any JavaScript. Comparing
the two numbers tells you whether latency is the network or the client's frame
time — on loopback the server reads ~1 ms while a busy client reads ~80 ms, and
that gap is the client, not the wire.

---

## Layout

```
cmd/stormlink/main.go     flags, static files, /ws, /status, graceful shutdown
internal/ws/              RFC 6455, server side, no dependencies
internal/proto/           the wire format AND the shared simulation constants
internal/sim/             the authoritative world: movement, combat, AI, waves
internal/hub/             rooms, clients, the tick loop, the broadcast
web/index.html            the client shell
web/js/net.js             socket, packet codec, clock and RTT estimation
web/js/predict.js         prediction and reconciliation
web/js/render.js          generated geometry, interpolation, camera
web/js/hud.js             HUD and the netgraph
web/vendor/three.min.js   three.js r128, MIT — vendored so it runs offline
```

The movement constants live in `internal/proto` and are **sent to the client in
the welcome message** rather than duplicated in JavaScript. Tune the server and
every client agrees; a constant that exists in two places is a constant that
will eventually disagree, and the symptom is a rubber-band nobody can
reproduce.
