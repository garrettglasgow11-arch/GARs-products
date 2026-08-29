/* predict.js — client-side prediction and reconciliation for the local player.
 *
 * The problem this solves: at 90 ms round trip, a server-authoritative game
 * that waits for confirmation before it moves you feels like it is running
 * underwater. So the client runs the same movement code the server does, on
 * the same inputs, immediately — and then corrects itself when the truth
 * arrives.
 *
 * The loop, per snapshot:
 *
 *   1. the server tells us where we were after input N was applied
 *   2. snap our authoritative state to that
 *   3. replay every input after N that the server has not seen yet
 *   4. the result is where we should be *now*, given what we have sent
 *
 * If step() here and stepPlayer() in sim.go agree, step 4 lands exactly where
 * the client already was and nothing moves. Where they disagree — because of
 * a collision the client resolved differently, or a hit the client did not
 * know about — the difference is smoothed out over a few frames rather than
 * teleported, because a visible snap is worse than a small lie.
 *
 * The movement here is a transcription of World.stepPlayer. Keep it that way:
 * every clever divergence is a rubber-band nobody will be able to reproduce.
 */

import { BTN } from './net.js';

export class Predictor {
  constructor(consts, boxes, arenaR) {
    this.C = consts;
    this.boxes = boxes || [];
    this.arenaR = arenaR || 60;

    // Authoritative state, as last confirmed by the server.
    this.auth = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, jumps: 0, dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, energy: 100 };
    // Predicted state, what we actually draw.
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.grounded = true;
    this.energy = 100;

    // Inputs we have sent and the server has not yet acknowledged.
    this.pending = [];
    // Visual error, decayed to zero. This is the anti-snap.
    this.err = { x: 0, y: 0, z: 0 };
    this.corrections = 0;
    this.maxError = 0;
  }

  /* Record an input as sent. Replayed until the server acks it. */
  push(seq, buttons, moveX, moveY, yaw) {
    this.pending.push({ seq, buttons, moveX, moveY, yaw });
    // A client this far behind is not going to catch up by replaying more.
    if (this.pending.length > 120) this.pending.shift();
  }

  /* Reconcile against the authoritative state for `ack`. */
  reconcile(me, ack) {
    if (!me) return;
    const before = { x: this.pos.x, y: this.pos.y, z: this.pos.z };

    this.auth.x = me.x; this.auth.y = me.y; this.auth.z = me.z;
    this.auth.energy = me.energy;
    // Velocity is not on the wire — it is derivable and would cost 6 bytes a
    // player a tick. Carry our own prediction forward instead; it is right
    // whenever the prediction was right, and when it is wrong the position
    // correction dominates anyway.
    const st = { ...this.auth, vx: this.vel.x, vy: this.vel.y, vz: this.vel.z, grounded: this.grounded };

    // Drop everything the server has already consumed.
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();

    // Replay the rest at exactly the server's timestep.
    for (const inp of this.pending) this.step(st, inp, this.C.tickDT);

    const dx = st.x - before.x, dy = st.y - before.y, dz = st.z - before.z;
    const err = Math.hypot(dx, dy, dz);
    this.maxError = Math.max(this.maxError * 0.98, err);
    if (err > 0.02) this.corrections++;
    if (err > 4) {
      // Something genuinely different happened — a teleport, a respawn, a
      // knockback we never saw. Accept it outright; smoothing a four-metre
      // error just makes the player drift through a wall.
      this.err.x = this.err.y = this.err.z = 0;
    } else {
      // Keep drawing where we were and let the error bleed out.
      this.err.x += before.x - st.x;
      this.err.y += before.y - st.y;
      this.err.z += before.z - st.z;
    }

    this.pos.x = st.x; this.pos.y = st.y; this.pos.z = st.z;
    this.vel.x = st.vx; this.vel.y = st.vy; this.vel.z = st.vz;
    this.grounded = st.grounded;
    this.energy = st.energy;
    Object.assign(this.auth, st);
  }

  /* Apply one input locally, right now, before the server has seen it. */
  apply(buttons, moveX, moveY, yaw, dt) {
    const st = {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      vx: this.vel.x, vy: this.vel.y, vz: this.vel.z,
      grounded: this.grounded, jumps: this.auth.jumps,
      dashT: this.auth.dashT, dashCd: this.auth.dashCd,
      dashX: this.auth.dashX, dashZ: this.auth.dashZ,
      energy: this.energy, lastButtons: this.auth.lastButtons || 0
    };
    this.step(st, { buttons, moveX, moveY, yaw }, dt);
    this.pos.x = st.x; this.pos.y = st.y; this.pos.z = st.z;
    this.vel.x = st.vx; this.vel.y = st.vy; this.vel.z = st.vz;
    this.grounded = st.grounded;
    this.energy = st.energy;
    this.auth.jumps = st.jumps; this.auth.dashT = st.dashT; this.auth.dashCd = st.dashCd;
    this.auth.dashX = st.dashX; this.auth.dashZ = st.dashZ;
    this.auth.lastButtons = st.lastButtons;

    // Bleed the visual error away at about 12/s — fast enough to converge in
    // a few frames, slow enough that you never see a jump.
    const k = 1 - Math.exp(-12 * dt);
    this.err.x -= this.err.x * k;
    this.err.y -= this.err.y * k;
    this.err.z -= this.err.z * k;
  }

  /* Where to draw: prediction plus the un-bled error. */
  render() {
    return { x: this.pos.x + this.err.x, y: this.pos.y + this.err.y, z: this.pos.z + this.err.z };
  }

  /* ---------------------------------------------------------------------
     The transcription of sim.World.stepPlayer. Movement only: attacks,
     damage and scoring are server business and are never predicted, because
     predicting a hit you did not get is the worst feeling in a game like
     this. The costs ARE predicted so the energy bar does not lag.
     --------------------------------------------------------------------- */
  step(st, inp, dt) {
    const C = this.C;
    const pressed = inp.buttons & ~(st.lastButtons || 0);
    const held = inp.buttons;
    st.lastButtons = inp.buttons;

    if (st.dashCd > 0) st.dashCd -= dt;

    const guarding = (held & BTN.GUARD) !== 0 && st.energy > 1;
    if (guarding) {
      st.energy -= C.guardDrain * dt;
      if (st.energy < 0) st.energy = 0;
    }

    const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
    const wishX = inp.moveX * cy + inp.moveY * sy;
    const wishZ = -inp.moveX * sy + inp.moveY * cy;
    const mag = Math.hypot(wishX, wishZ);

    const sprinting = (held & BTN.DASH) !== 0 && mag > 0.2 && st.energy > 2 && st.dashT <= 0 && st.grounded;
    let target = sprinting ? C.sprint : C.move;
    if (sprinting) st.energy -= 11 * dt;
    if (guarding) target *= 0.45;

    if ((pressed & BTN.DASH) && st.dashCd <= 0 && st.energy >= C.dashCost) {
      st.energy -= C.dashCost;
      st.dashT = C.dashTime;
      st.dashCd = C.dashCool;
      if (mag > 0.01) { st.dashX = wishX / mag; st.dashZ = wishZ / mag; }
      else { st.dashX = sy; st.dashZ = cy; }
    }

    if (st.dashT > 0) {
      st.dashT -= dt;
      st.vx = st.dashX * C.dashSpeed;
      st.vz = st.dashZ * C.dashSpeed;
      if (st.vy < -2) st.vy = -2;
    } else {
      const accel = st.grounded ? C.groundAccel : C.airAccel;
      st.vx = damp(st.vx, wishX * target, accel * 0.5, dt);
      st.vz = damp(st.vz, wishZ * target, accel * 0.5, dt);
    }

    st.vy -= C.gravity * dt;
    if (st.vy < -55) st.vy = -55;
    if (pressed & BTN.JUMP) {
      if (st.grounded) { st.vy = C.jump; st.jumps = 1; }
      else if (st.jumps < 2) { st.jumps++; st.vy = C.doubleJump; }
    }

    this.move(st, dt);

    if (!sprinting && !guarding && st.energy < C.maxEnergy) {
      st.energy = Math.min(C.maxEnergy, st.energy + C.energyRegen * dt);
    }
  }

  move(st, dt) {
    const r = this.C.radius, h = this.C.height;
    st.x += st.vx * dt;
    st.z += st.vz * dt;
    for (const b of this.boxes) {
      if (st.y + h < b.MinY || st.y > b.MaxY) continue;
      const cx = clamp(st.x, b.MinX, b.MaxX), cz = clamp(st.z, b.MinZ, b.MaxZ);
      const dx = st.x - cx, dz = st.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        if (Math.abs(st.x - b.MinX) < Math.abs(b.MaxX - st.x)) st.x = b.MinX - r;
        else st.x = b.MaxX + r;
        continue;
      }
      const k = (r - d) / d;
      st.x += dx * k; st.z += dz * k;
    }
    const dd = Math.hypot(st.x, st.z);
    if (dd > this.arenaR - r) {
      const k = (this.arenaR - r) / dd;
      st.x *= k; st.z *= k; st.vx *= 0.2; st.vz *= 0.2;
    }

    st.y += st.vy * dt;
    st.grounded = false;
    for (const b of this.boxes) {
      if (st.x + r < b.MinX || st.x - r > b.MaxX || st.z + r < b.MinZ || st.z - r > b.MaxZ) continue;
      if (st.vy <= 0 && st.y <= b.MaxY && st.y > b.MaxY - 0.8) {
        st.y = b.MaxY; st.vy = 0; st.grounded = true;
      } else if (st.vy > 0 && st.y + h > b.MinY && st.y < b.MinY) {
        st.y = b.MinY - h; st.vy = 0;
      }
    }
    if (st.y <= 0) { st.y = 0; st.vy = 0; st.grounded = true; }
    if (st.grounded) st.jumps = 0;
  }
}

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
