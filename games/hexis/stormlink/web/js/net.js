/* net.js — the wire.
 *
 * Mirrors internal/proto/proto.go byte for byte. If you change one, change the
 * other; the version field exists so a mismatch is a message rather than a
 * mystery.
 *
 * Two things live here that are easy to get wrong and expensive to debug:
 *
 *   clock   The server stamps every snapshot with its own wall clock. We keep
 *           a running estimate of (serverTime - clientTime) using the minimum
 *           observed offset rather than the average, because the minimum is
 *           the sample with the least queueing delay in it and is therefore
 *           the closest to the truth. This is the same reasoning NTP uses.
 *
 *   rtt     Measured with an explicit ping/pong rather than inferred from
 *           snapshot arrival, because snapshot arrival is quantised to the
 *           tick rate and would report 33 ms of latency that is not there.
 */

export const MSG = {
  INPUT: 0x01, PING: 0x03,
  WELCOME: 0x81, SNAPSHOT: 0x82, EVENT: 0x83, PONG: 0x84
};

export const BTN = {
  JUMP: 1 << 0, DASH: 1 << 1, ATTACK: 1 << 2, HEAVY: 1 << 3,
  GUARD: 1 << 4, BOLT: 1 << 5, ULT: 1 << 6, RESPAWN: 1 << 7
};

export const FLAG = {
  DEAD: 1 << 0, DASH: 1 << 1, GROUND: 1 << 2, GUARD: 1 << 3,
  ATTACK: 1 << 4, HEAVY: 1 << 5, SPRINT: 1 << 6
};

const TAU = Math.PI * 2;
const unfix = (v) => v / 100;
const unang = (v) => (v + 32768) / 65536 * TAU;
const fixang = (a) => {
  a %= TAU; if (a < 0) a += TAU;
  return (Math.round(a / TAU * 65536) - 32768) | 0;
};

export class Net {
  constructor() {
    this.ws = null;
    this.id = 0;
    this.seq = 0;
    this.connected = false;
    this.welcome = null;
    this.snapshot = null;        // newest
    this.prev = null;            // the one before, for interpolation
    this.history = [];           // recent snapshots, for the netgraph
    this.events = [];
    this.chat = [];

    this.rtt = 0;                // smoothed, ms
    this.rttMin = Infinity;
    this.jitter = 0;
    this.offset = null;          // serverTime - clientTime, ms
    this.lastRecv = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.packets = 0;
    this.lostAcks = 0;

    this._pingAt = 0;
    this._inBuf = new ArrayBuffer(14);
    this._inView = new DataView(this._inBuf);
    this.onWelcome = () => {};
    this.onEvent = () => {};
    this.onClose = () => {};
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;

      ws.onopen = () => { this.connected = true; };
      ws.onerror = () => { if (!settled) { settled = true; reject(new Error('connection refused')); } };
      ws.onclose = () => {
        this.connected = false;
        this.onClose();
        if (!settled) { settled = true; reject(new Error('connection closed')); }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          this.bytesIn += ev.data.length;
          let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.t === 'welcome') {
            this.welcome = m; this.id = m.id;
            if (!settled) { settled = true; resolve(m); }
            this.onWelcome(m);
          } else if (m.t === 'events') {
            for (const e of m.e) { this.events.push(e); this.onEvent(e); }
            if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
          } else if (m.t === 'roster') {
            this.onEvent(m);
          } else if (m.t === 'chat') {
            this.chat.push(m);
            if (this.chat.length > 40) this.chat.shift();
            this.onEvent(m);
          } else if (m.t === 'full') {
            if (!settled) { settled = true; reject(new Error('the room is full')); }
          }
          return;
        }
        const buf = new Uint8Array(ev.data);
        this.bytesIn += buf.length;
        if (!buf.length) return;
        if (buf[0] === MSG.SNAPSHOT) this._snapshot(ev.data);
        else if (buf[0] === MSG.PONG) this._pong(ev.data);
      };
    });
  }

  close() { if (this.ws) this.ws.close(); }

  /* --- snapshots -------------------------------------------------------- */
  _snapshot(raw) {
    const d = new DataView(raw);
    const s = {
      tick: d.getUint32(1, true),
      ack: d.getUint32(5, true),
      serverMs: Number(d.getBigUint64(9, true)),
      you: d.getUint16(17, true),
      recvAt: performance.now(),
      players: [], enemies: [], bolts: []
    };
    const np = d.getUint8(19), ne = d.getUint8(20), nb = d.getUint8(21);
    let o = 22;
    for (let i = 0; i < np; i++, o += 16) {
      s.players.push({
        id: d.getUint16(o, true),
        x: unfix(d.getInt16(o + 2, true)), y: unfix(d.getInt16(o + 4, true)), z: unfix(d.getInt16(o + 6, true)),
        yaw: unang(d.getInt16(o + 8, true)),
        hp: d.getUint8(o + 10), energy: d.getUint8(o + 11),
        flags: d.getUint8(o + 12), combo: d.getUint8(o + 13),
        score: d.getUint16(o + 14, true)
      });
    }
    for (let i = 0; i < ne; i++, o += 13) {
      s.enemies.push({
        id: d.getUint16(o, true), kind: d.getUint8(o + 2),
        x: unfix(d.getInt16(o + 3, true)), y: unfix(d.getInt16(o + 5, true)), z: unfix(d.getInt16(o + 7, true)),
        yaw: unang(d.getInt16(o + 9, true)),
        hp: d.getUint8(o + 11), flags: d.getUint8(o + 12)
      });
    }
    for (let i = 0; i < nb; i++, o += 8) {
      s.bolts.push({
        id: d.getUint16(o, true),
        x: unfix(d.getInt16(o + 2, true)), y: unfix(d.getInt16(o + 4, true)), z: unfix(d.getInt16(o + 6, true))
      });
    }

    // Clock estimate. The minimum offset seen is the least-delayed sample.
    const local = performance.timeOrigin + s.recvAt;
    const off = s.serverMs - local;
    this.offset = this.offset === null ? off : Math.min(this.offset + 0.02, Math.max(off, this.offset - 200));
    if (off < this.offset) this.offset = off;

    if (this.snapshot && s.tick <= this.snapshot.tick) return;   // stale or reordered
    this.prev = this.snapshot;
    this.snapshot = s;
    this.packets++;
    this.lastRecv = s.recvAt;
    this.history.push({ t: s.recvAt, tick: s.tick, bytes: raw.byteLength });
    if (this.history.length > 120) this.history.shift();
  }

  /* --- input ------------------------------------------------------------ */
  sendInput(buttons, moveX, moveY, yaw, pitch, dtMs) {
    if (!this.connected || this.ws.readyState !== 1) return 0;
    const v = this._inView;
    const seq = ++this.seq;
    v.setUint8(0, MSG.INPUT);
    v.setUint32(1, seq, true);
    v.setUint16(5, buttons, true);
    v.setInt8(7, Math.max(-100, Math.min(100, Math.round(moveX * 100))));
    v.setInt8(8, Math.max(-100, Math.min(100, Math.round(moveY * 100))));
    v.setInt16(9, fixang(yaw), true);
    v.setInt16(11, fixang(pitch), true);
    v.setUint8(13, Math.max(0, Math.min(255, Math.round(dtMs))));
    this.ws.send(this._inBuf);
    this.bytesOut += 14;
    return seq;
  }

  /* --- ping ------------------------------------------------------------- */
  ping() {
    if (!this.connected || this.ws.readyState !== 1) return;
    const b = new ArrayBuffer(9);
    const v = new DataView(b);
    v.setUint8(0, MSG.PING);
    v.setBigUint64(1, BigInt(Math.round(performance.timeOrigin + performance.now())), true);
    this.ws.send(b);
    this.bytesOut += 9;
  }

  _pong(raw) {
    const d = new DataView(raw);
    const sent = Number(d.getBigUint64(1, true));
    const now = performance.timeOrigin + performance.now();
    const rtt = now - sent;
    if (rtt < 0 || rtt > 5000) return;
    this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
    this.rttMin = Math.min(this.rttMin, rtt);
    this.jitter = this.jitter * 0.85 + Math.abs(rtt - this.rtt) * 0.15;
  }

  /* Interpolation clock: render remote entities this far in the past so there
     is always a pair of snapshots to interpolate between. One tick of buffer
     plus the measured jitter, floored at 60 ms — less than that and a single
     late packet becomes a visible stutter. */
  get interpDelay() {
    return Math.max(60, 1000 / (this.welcome ? this.welcome.tickRate : 30) + this.jitter * 2);
  }
}
