/* render.js — the picture.
 *
 * Everything is generated: no models, no textures, no image files. That is
 * carried over from the single-file build on purpose — it is what lets the
 * whole client be four JavaScript files and one HTML page.
 *
 * The one thing here that is really about networking rather than graphics is
 * INTERPOLATION. Remote players and every enemy are drawn at a fixed delay
 * behind the newest snapshot, between the two snapshots that bracket that
 * moment. Rendering the newest snapshot directly would mean 30 discrete
 * positions a second — visibly steppy — and extrapolating forward would mean
 * every direction change overshoots and snaps back. A hundred milliseconds of
 * deliberate lag on things you do not control is invisible, and it is the
 * cheapest smoothness there is.
 */

const T = () => window.THREE;
const TAU = Math.PI * 2;

const PAL = {
  void: 0x05070c, deck: 0x131a26, line: 0x1d2c44,
  arc: 0x5fe3ff, core: 0x2b6bff, threat: 0xff5a3c,
  gold: 0xffc64d, violet: 0xb48cff, bone: 0xe8f4ff, venom: 0x7cffb2
};
const ENEMY_COLOR = [PAL.threat, PAL.violet, 0xff8a4d];
const ENEMY_SCALE = [1, 1, 1.5];

export class Renderer {
  constructor(canvas) {
    const THREE = T();
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.outputEncoding = THREE.sRGBEncoding;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PAL.void, 0.009);
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 600);

    this.scene.add(new THREE.HemisphereLight(0x3f5f96, 0x090c14, 0.7));
    const sun = new THREE.DirectionalLight(0x9fc4ff, 1.2);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    const back = new THREE.DirectionalLight(0x4a7fd8, 0.5);
    back.position.set(-30, 20, -30);
    this.scene.add(back);

    this.players = new Map();
    this.enemies = new Map();
    this.bolts = new Map();

    this.cam = { yaw: Math.PI, pitch: 0.22, dist: 7.5, target: new THREE.Vector3() };
    this._v = new THREE.Vector3();
    this.shake = 0;
  }

  buildArena(arenaR, boxes) {
    const THREE = T();
    const g = new THREE.Group();

    // Floor disc with a grid inscribed on it, so speed is legible.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(arenaR, 72),
      new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.9, metalness: 0.1 })
    );
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);

    const lines = [];
    for (let i = -arenaR; i <= arenaR; i += 5) {
      const h = Math.sqrt(Math.max(0, arenaR * arenaR - i * i));
      lines.push(i, 0.02, -h, i, 0.02, h, -h, 0.02, i, h, 0.02, i);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PAL.line })));

    // Rim: a ring of lit posts so the edge of the world is unmistakable.
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2.2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 0.7, metalness: 0.4 })
      );
      post.position.set(Math.cos(a) * arenaR, 1.1, Math.sin(a) * arenaR);
      g.add(post);
      if (i % 4 === 0) {
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.14, 0.7),
          new THREE.MeshBasicMaterial({ color: PAL.arc })
        );
        lamp.position.set(Math.cos(a) * arenaR, 2.35, Math.sin(a) * arenaR);
        g.add(lamp);
      }
    }

    // Obstacles, from the server's own list. The client never invents cover.
    for (const b of boxes || []) {
      const sx = b.MaxX - b.MinX, sy = b.MaxY - b.MinY, sz = b.MaxZ - b.MinZ;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: 0x1c2431, roughness: 0.75, metalness: 0.3 })
      );
      m.position.set((b.MinX + b.MaxX) / 2, (b.MinY + b.MaxY) / 2, (b.MinZ + b.MaxZ) / 2);
      g.add(m);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 0.96, 0.08, sz * 0.96),
        new THREE.MeshBasicMaterial({ color: PAL.core })
      );
      trim.position.set(m.position.x, b.MaxY + 0.05, m.position.z);
      g.add(trim);
    }

    this.scene.add(g);
    this.arena = g;
    this.arenaR = arenaR;
  }

  /* --- avatars ----------------------------------------------------------
     Six boxes and a blade. It reads at 40 m, it costs one draw call per
     material, and it can be tinted per player without cloning geometry. */
  makeAvatar(color, isYou) {
    const THREE = T();
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x161d2b, roughness: 0.65, metalness: 0.25 });
    const trim = new THREE.MeshBasicMaterial({ color });
    const box = (w, h, d, y, m, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(0, y, z);
      g.add(b);
      return b;
    };
    box(0.52, 0.62, 0.34, 1.16, suit);           // torso
    box(0.30, 0.30, 0.30, 1.66, suit);           // head
    const visor = box(0.24, 0.06, 0.04, 1.70, trim, 0.16);
    box(0.56, 0.07, 0.36, 1.42, trim);           // chest line
    const legL = box(0.19, 0.72, 0.22, 0.44, suit); legL.position.x = -0.15;
    const legR = box(0.19, 0.72, 0.22, 0.44, suit); legR.position.x = 0.15;
    const armL = box(0.15, 0.55, 0.17, 1.14, suit); armL.position.x = -0.36;
    const armR = box(0.15, 0.55, 0.17, 1.14, suit); armR.position.x = 0.36;

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 1.2, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xeafcff })
    );
    blade.position.set(0.42, 1.35, 0.35);
    g.add(blade);
    const aura = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 1.34, 0.34),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    blade.add(aura);

    // Ground contact ring — the cheapest way to make a character read as
    // standing on the floor rather than hovering above it.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);

    this.scene.add(g);
    return { g, legL, legR, armL, armR, blade, aura, ring, visor, trim, phase: 0, isYou };
  }

  makeEnemy(kind) {
    const THREE = T();
    const g = new THREE.Group();
    const c = ENEMY_COLOR[kind] || PAL.threat;
    const s = ENEMY_SCALE[kind] || 1;
    const body = new THREE.MeshStandardMaterial({ color: 0x241a1e, roughness: 0.8, metalness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: c });
    const add = (w, h, d, y, m) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), m);
      b.position.y = y * s;
      g.add(b);
      return b;
    };
    add(0.52, 0.66, 0.34, 1.1, body);
    add(0.28, 0.26, 0.28, 1.62, body);
    const eye = add(0.20, 0.05, 0.04, 1.66, glow);
    eye.position.z = 0.16 * s;
    add(0.16, 0.66, 0.2, 0.4, body).position.x = -0.14 * s;
    // The tell: a plate that lights during the wind-up. This is the entire
    // readability contract of the fight, so it is big and it is on the front.
    const tell = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 * s, 0.16 * s, 0.1 * s),
      new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0 })
    );
    tell.position.set(0, 1.45 * s, 0.2 * s);
    g.add(tell);

    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.09),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false })
    );
    bar.position.y = 2.05 * s;
    g.add(bar);

    this.scene.add(g);
    return { g, tell, bar, eye, kind, s };
  }

  makeBolt() {
    const THREE = T();
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xeaf9ff })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshBasicMaterial({ color: PAL.arc, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.add(halo);
    this.scene.add(m);
    return m;
  }

  /* --- interpolation ----------------------------------------------------
     Find the pair of snapshots bracketing (now - delay) and blend. Falling
     back to the newest snapshot when there is only one is correct on the
     first frame and never again. */
  static lerpAngle(a, b, t) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return a + d * t;
  }

  update(net, local, dt, now) {
    const THREE = T();
    const snap = net.snapshot;
    if (!snap) return;
    const prev = net.prev;
    const renderAt = now - net.interpDelay;
    let t = 1;
    if (prev && snap.recvAt > prev.recvAt) {
      t = (renderAt - prev.recvAt) / (snap.recvAt - prev.recvAt);
      t = Math.max(0, Math.min(1, t));
    }
    const blend = (a, b, k) => a + (b - a) * k;

    // --- players ---
    const seenP = new Set();
    for (const p of snap.players) {
      seenP.add(p.id);
      let av = this.players.get(p.id);
      if (!av) {
        const col = p.id === net.id ? PAL.arc : hashColor(p.id);
        av = this.makeAvatar(col, p.id === net.id);
        this.players.set(p.id, av);
      }
      let x = p.x, y = p.y, z = p.z, yaw = p.yaw;
      if (p.id === net.id && local) {
        // Never interpolate yourself: you are predicted, and a blend between
        // prediction and a 100 ms-old truth is the definition of input lag.
        x = local.x; y = local.y; z = local.z; yaw = local.yaw;
      } else if (prev) {
        const q = prev.players.find(o => o.id === p.id);
        if (q) {
          x = blend(q.x, p.x, t); y = blend(q.y, p.y, t); z = blend(q.z, p.z, t);
          yaw = Renderer.lerpAngle(q.yaw, p.yaw, t);
        }
      }
      av.g.position.set(x, y, z);
      av.g.rotation.y = yaw;
      av.g.visible = !(p.flags & 1);

      // Animation from state, not from a clip: a run cycle driven by speed,
      // a swing driven by the attack flag. Two lines, reads correctly.
      const moving = (p.flags & 4) ? 1 : 0.35;
      av.phase += dt * (p.flags & 64 ? 16 : 9) * moving;
      const sw = Math.sin(av.phase) * ((p.flags & 64) ? 0.7 : 0.45);
      av.legL.rotation.x = sw; av.legR.rotation.x = -sw;
      av.armL.rotation.x = -sw * 0.7; av.armR.rotation.x = sw * 0.7;
      const atk = (p.flags & 16) ? 1 : 0;
      av.blade.rotation.z = blend(av.blade.rotation.z, atk ? -2.1 : -0.25, 1 - Math.exp(-22 * dt));
      av.aura.material.opacity = 0.25 + atk * 0.5;
      av.ring.material.opacity = (p.flags & 8) ? 0.9 : 0.4;
      av.ring.scale.setScalar((p.flags & 8) ? 1.5 : 1);
      av.visor.material.color.setHex((p.flags & 8) ? PAL.gold : (p.id === net.id ? PAL.arc : hashColor(p.id)));
    }
    for (const [id, av] of this.players) {
      if (seenP.has(id)) continue;
      this.scene.remove(av.g);
      this.players.delete(id);
    }

    // --- enemies ---
    const seenE = new Set();
    for (const e of snap.enemies) {
      seenE.add(e.id);
      let m = this.enemies.get(e.id);
      if (!m) { m = this.makeEnemy(e.kind); this.enemies.set(e.id, m); }
      let x = e.x, y = e.y, z = e.z, yaw = e.yaw;
      if (prev) {
        const q = prev.enemies.find(o => o.id === e.id);
        if (q) {
          x = blend(q.x, e.x, t); y = blend(q.y, e.y, t); z = blend(q.z, e.z, t);
          yaw = Renderer.lerpAngle(q.yaw, e.yaw, t);
        }
      }
      m.g.position.set(x, y, z);
      m.g.rotation.y = yaw;
      const dead = (e.flags & 1) !== 0;
      m.g.visible = !dead;
      m.tell.material.opacity = (e.flags & 16) ? 0.35 + Math.sin(now * 0.02) * 0.35 : 0;
      m.bar.scale.x = Math.max(0.01, e.hp / 100);
      m.bar.lookAt(this.camera.position);
    }
    for (const [id, m] of this.enemies) {
      if (seenE.has(id)) continue;
      this.scene.remove(m.g);
      this.enemies.delete(id);
    }

    // --- bolts ---
    const seenB = new Set();
    for (const b of snap.bolts) {
      seenB.add(b.id);
      let m = this.bolts.get(b.id);
      if (!m) { m = this.makeBolt(); this.bolts.set(b.id, m); }
      let x = b.x, y = b.y, z = b.z;
      if (prev) {
        const q = prev.bolts.find(o => o.id === b.id);
        if (q) { x = blend(q.x, b.x, t); y = blend(q.y, b.y, t); z = blend(q.z, b.z, t); }
      }
      m.position.set(x, y, z);
      m.rotation.x += dt * 12; m.rotation.y += dt * 9;
    }
    for (const [id, m] of this.bolts) {
      if (seenB.has(id)) continue;
      this.scene.remove(m);
      this.bolts.delete(id);
    }
  }

  /* Third-person spring arm with a pull-in so the camera never ends up
     inside the obstacle you just backed into. */
  updateCamera(target, dt, boxes) {
    const THREE = T();
    const c = this.cam;
    c.target.set(target.x, target.y + 1.5, target.z);
    const dir = this._v.set(
      Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      Math.cos(c.yaw) * Math.cos(c.pitch)
    );
    let want = c.dist;
    // March the ray out and stop short of anything solid.
    for (const b of boxes || []) {
      for (let s = 1; s <= 8; s++) {
        const d = (want * s) / 8;
        const px = c.target.x + dir.x * d, py = c.target.y + dir.y * d, pz = c.target.z + dir.z * d;
        if (px > b.MinX - 0.3 && px < b.MaxX + 0.3 && py > b.MinY && py < b.MaxY + 0.3 &&
            pz > b.MinZ - 0.3 && pz < b.MaxZ + 0.3) { want = Math.min(want, d - 0.4); break; }
      }
    }
    want = Math.max(1.6, want);
    this._cur = this._cur === undefined ? want : this._cur + (want - this._cur) * (1 - Math.exp(-14 * dt));
    const sh = this.shake > 0 ? this.shake : 0;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.4);
    this.camera.position.set(
      c.target.x + dir.x * this._cur + (Math.random() - 0.5) * sh,
      Math.max(0.6, c.target.y + dir.y * this._cur + (Math.random() - 0.5) * sh),
      c.target.z + dir.z * this._cur + (Math.random() - 0.5) * sh
    );
    this.camera.lookAt(c.target);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.r.setSize(w, h, false);
  }

  draw() { this.r.render(this.scene, this.camera); }
}

/* A stable colour per player id, so the same person is the same colour for
   everybody in the room without the server having to assign one. */
function hashColor(id) {
  const h = (id * 2654435761) % 360;
  const c = new (T().Color)();
  c.setHSL(h / 360, 0.75, 0.62);
  return c.getHex();
}
