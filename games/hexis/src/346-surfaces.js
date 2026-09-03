/* ===== 346-surfaces.js ====================================================
   HEXIS 3.5 — the rest of the surfaces.

   345 shipped nine maps and wired exactly one of them into the world: every
   solid in every zone sampled `concrete`, whatever it was. A brick wall, a
   tunnel floor, a foundry catwalk and the Spire's lobby were the same grey
   noise at the same scale, and the only thing telling them apart was vertex
   colour — which is where 2.4.6 started.

   This adds eighteen more generators and, more importantly, spends them:

     · a WALL texture and a FLOOR texture per zone, picked by the same
       dominant-axis test the triplanar sample already does, so a horizontal
       face gets gravel and the wall above it gets tile for one extra sampler
       and one extra branch;
     · character surfaces that mean something — camouflage on the Response
       Team, carbon on heavy armour, scales on Kell, knit on civilians;
     · props, which had none at all.

   Everything is still drawn into a canvas at load and shared. Eighteen more
   256px greyscale maps and their normals is about 3 MB more VRAM, and it is
   generated in roughly 40 ms on a desktop.
   ========================================================================= */

Object.assign(Tex, {

  /* --- masonry and ground ---------------------------------------------- */

  // Running bond. The half-course offset is the whole read; a grid of
  // rectangles is tile, not brick.
  brick() {
    return this.make('brick', (x, s) => {
      const bh = s / 8, bw = s / 4;
      x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, s, s);        // mortar
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) ? bw / 2 : 0;
        for (let col = -1; col < 5; col++) {
          const bx = col * bw + off + 1.5, by = row * bh + 1.5;
          const v = 150 + Math.random() * 55;
          x.fillStyle = `rgb(${v},${v},${v})`;
          x.fillRect(bx, by, bw - 3, bh - 3);
          // A lit top edge and a shaded bottom, so the courses read in relief.
          x.fillStyle = 'rgba(255,255,255,0.16)';
          x.fillRect(bx, by, bw - 3, 1.5);
          x.fillStyle = 'rgba(0,0,0,0.20)';
          x.fillRect(bx, by + bh - 4.5, bw - 3, 1.5);
        }
      }
      x.globalAlpha = 0.30;
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 24, 3);
      x.drawImage(n, 0, 0); x.globalAlpha = 1;
    });
  },

  // Asphalt: coarse aggregate, then a polish pass so it is not uniform grit.
  asphalt() {
    return this.make('asphalt', (x, s) => {
      x.fillStyle = '#6e6e6e'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 4200; i++) {
        const g = 40 + Math.random() * 150;
        x.fillStyle = `rgba(${g},${g},${g},${0.25 + Math.random() * 0.5})`;
        const r = 0.7 + Math.random() * 2.2;
        x.beginPath(); x.arc(Math.random() * s, Math.random() * s, r, 0, 6.283); x.fill();
      }
      // Wear polish: broad soft lighter bands, the tracks traffic leaves.
      x.globalAlpha = 0.22;
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 3, 2);
      x.drawImage(n, 0, 0); x.globalAlpha = 1;
    });
  },

  // Packed gravel.
  gravel() {
    return this.make('gravel', (x, s) => {
      x.fillStyle = '#5c5c5c'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        const r = 2 + Math.random() * 6;
        const cx = Math.random() * s, cy = Math.random() * s;
        const g = 90 + Math.random() * 130;
        x.fillStyle = `rgb(${g},${g},${g})`;
        x.beginPath();
        // Irregular pebble: a circle with the radius jittered per step.
        for (let a = 0; a < 6.283; a += 0.7) {
          const rr = r * (0.7 + Math.random() * 0.5);
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath(); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.18)';
        x.fillRect(cx - r, cy + r * 0.6, r * 2, 1.5);
      }
    });
  },

  // Square tile with grout and per-tile tone.
  tile() {
    return this.make('tile', (x, s) => {
      const n = 6, t = s / n;
      x.fillStyle = '#4e4e4e'; x.fillRect(0, 0, s, s);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const v = 165 + Math.random() * 60;
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        x.fillStyle = 'rgba(255,255,255,0.14)';
        x.fillRect(i * t + 2, j * t + 2, t - 4, 2);
      }
      x.globalAlpha = 0.16;
      const q = this.canvas(s); this.noiseInto(Tex.ctx2d(q), s, 20, 2);
      x.drawImage(q, 0, 0); x.globalAlpha = 1;
    });
  },

  // Rough plaster.
  stucco() {
    return this.make('stucco', (x, s) => {
      x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, s, s);
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 26, 4);
      x.globalAlpha = 0.55; x.drawImage(n, 0, 0); x.globalAlpha = 1;
      for (let i = 0; i < 1600; i++) {
        x.fillStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.1})`;
        x.beginPath(); x.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 0, 6.283); x.fill();
      }
    });
  },

  // Veined marble.
  marble() {
    return this.make('marble', (x, s) => {
      x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, s, s);
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 5, 4);
      x.globalAlpha = 0.30; x.drawImage(n, 0, 0); x.globalAlpha = 1;
      // Veins: a few wandering strokes, each with hairlines beside it.
      for (let v = 0; v < 7; v++) {
        let px = Math.random() * s, py = -10, ang = 1.2 + Math.random() * 0.8;
        x.strokeStyle = `rgba(60,60,60,${0.20 + Math.random() * 0.2})`;
        x.lineWidth = 1 + Math.random() * 3;
        x.beginPath(); x.moveTo(px, py);
        while (py < s + 10) {
          ang += (Math.random() - 0.5) * 0.6;
          px += Math.cos(ang) * 9; py += Math.abs(Math.sin(ang)) * 9 + 3;
          x.lineTo(px, py);
        }
        x.stroke();
      }
    });
  },

  /* --- metal ------------------------------------------------------------ */

  // Diamond plate. Two mirrored runs of lozenges is what makes it read.
  tread() {
    return this.make('tread', (x, s) => {
      x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, s, s);
      const draw = (dir) => {
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const cx = i * (s / 8) + (j % 2 ? s / 16 : 0) + s / 16;
          const cy = j * (s / 8) + s / 16;
          x.save(); x.translate(cx, cy); x.rotate(dir * 0.62);
          x.fillStyle = 'rgba(255,255,255,0.34)';
          x.fillRect(-11, -3, 22, 6);
          x.fillStyle = 'rgba(0,0,0,0.30)';
          x.fillRect(-11, 2, 22, 2.5);
          x.restore();
        }
      };
      draw(1); draw(-1);
      x.globalAlpha = 0.18;
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 22, 2);
      x.drawImage(n, 0, 0); x.globalAlpha = 1;
    });
  },

  // Vertical corrugated sheet.
  corrugate() {
    return this.make('corrugate', (x, s) => {
      const p = s / 10;
      for (let i = 0; i < s; i++) {
        const t = (i % p) / p;
        const v = 110 + Math.sin(t * 6.283) * 70;
        x.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
        x.fillRect(i, 0, 1, s);
      }
      // Fixing bolts along two rails, and streaked wear down the flutes.
      for (let j = 0; j < 2; j++) for (let i = 0; i < 10; i++) {
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.beginPath(); x.arc(i * p + p / 2, j * (s / 2) + 14, 2.6, 0, 6.283); x.fill();
      }
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
        x.fillRect(Math.random() * s, Math.random() * s, 1, 10 + Math.random() * 40);
      }
    });
  },

  // Perforated grate: round holes in a staggered grid.
  grate() {
    return this.make('grate', (x, s) => {
      x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, s, s);
      const n = 8, p = s / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const cx = i * p + (j % 2 ? p / 2 : 0) + p / 2, cy = j * p + p / 2;
        x.fillStyle = '#1e1e1e';
        x.beginPath(); x.arc(cx, cy, p * 0.30, 0, 6.283); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 1.4;
        x.beginPath(); x.arc(cx, cy - 0.8, p * 0.32, 3.4, 6.0); x.stroke();
      }
    });
  },

  // Woven wire mesh.
  mesh() {
    return this.make('mesh', (x, s) => {
      x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, s, s);
      const p = 10;
      for (let i = 0; i < s; i += p) {
        x.fillStyle = 'rgba(230,230,230,0.85)'; x.fillRect(i, 0, 3, s);
        x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(i + 3, 0, 1.5, s);
      }
      for (let j = 0; j < s; j += p) {
        x.fillStyle = 'rgba(210,210,210,0.70)'; x.fillRect(0, j, s, 3);
        x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, j + 3, s, 1.5);
      }
    });
  },

  // Painted metal, chipped back to bare steel at the edges of the chips.
  chipped() {
    return this.make('chipped', (x, s) => {
      x.fillStyle = '#a6a6a6'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) {
        const cx = Math.random() * s, cy = Math.random() * s, r = 2 + Math.random() * 9;
        x.fillStyle = 'rgba(40,40,40,0.55)';
        x.beginPath();
        for (let a = 0; a < 6.283; a += 0.8) {
          const rr = r * (0.5 + Math.random() * 0.8);
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath(); x.fill();
        // The bright lip a chip leaves where the paint has lifted.
        x.strokeStyle = 'rgba(255,255,255,0.30)'; x.lineWidth = 1; x.stroke();
      }
      x.globalAlpha = 0.22;
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 18, 3);
      x.drawImage(n, 0, 0); x.globalAlpha = 1;
    });
  },

  /* --- tech ------------------------------------------------------------- */

  // Circuit traces and pads. Right angles only — a curved trace reads organic.
  circuit() {
    return this.make('circuit', (x, s) => {
      x.fillStyle = '#5c5c5c'; x.fillRect(0, 0, s, s);
      x.lineCap = 'square';
      for (let t = 0; t < 46; t++) {
        let px = Math.floor(Math.random() * 16) * 16, py = Math.floor(Math.random() * 16) * 16;
        x.strokeStyle = `rgba(235,235,235,${0.35 + Math.random() * 0.4})`;
        x.lineWidth = 1 + Math.random() * 2;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 3 + Math.random() * 4; k++) {
          if (Math.random() < 0.5) px += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + (Math.random() * 3 | 0));
          else py += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + (Math.random() * 3 | 0));
          x.lineTo(px, py);
        }
        x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.55)';
        x.beginPath(); x.arc(px, py, 3, 0, 6.283); x.fill();
      }
      for (let i = 0; i < 26; i++) {
        x.fillStyle = 'rgba(20,20,20,0.55)';
        x.fillRect(Math.random() * s, Math.random() * s, 8 + Math.random() * 22, 6 + Math.random() * 12);
      }
    });
  },

  // 2x2 twill carbon fibre.
  carbon() {
    return this.make('carbon', (x, s) => {
      const c = s / 16;
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const over = ((i + j) >> 1) % 2 === 0;
        const v = over ? 150 : 96;
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(i * c, j * c, c, c);
        // Fibre direction inside each cell.
        x.strokeStyle = over ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.22)';
        x.lineWidth = 1;
        for (let k = 1; k < c; k += 3) {
          x.beginPath();
          if (over) { x.moveTo(i * c, j * c + k); x.lineTo(i * c + c, j * c + k); }
          else { x.moveTo(i * c + k, j * c); x.lineTo(i * c + k, j * c + c); }
          x.stroke();
        }
      }
    });
  },

  /* --- cloth and organics ----------------------------------------------- */

  // Three-tone blob camouflage.
  camo() {
    return this.make('camo', (x, s) => {
      x.fillStyle = '#b4b4b4'; x.fillRect(0, 0, s, s);
      const blob = (fill, count, rad) => {
        x.fillStyle = fill;
        for (let i = 0; i < count; i++) {
          const cx = Math.random() * s, cy = Math.random() * s;
          x.beginPath();
          for (let a = 0; a < 6.283; a += 0.5) {
            const rr = rad * (0.55 + Math.random() * 0.9);
            const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
            a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
          }
          x.closePath(); x.fill();
        }
      };
      blob('rgba(120,120,120,0.95)', 16, 26);
      blob('rgba(70,70,70,0.90)', 12, 18);
      blob('rgba(180,180,180,0.55)', 10, 12);
    });
  },

  // Chunky rib knit.
  knit() {
    return this.make('knit', (x, s) => {
      x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, s, s);
      const cw = 10, ch = 8;
      for (let j = 0; j < s / ch; j++) for (let i = 0; i < s / cw; i++) {
        const cx = i * cw + cw / 2, cy = j * ch + ch / 2;
        x.strokeStyle = 'rgba(255,255,255,0.24)'; x.lineWidth = 2.4;
        x.beginPath();
        x.moveTo(cx - cw / 2, cy + ch / 2); x.lineTo(cx, cy - ch / 2); x.lineTo(cx + cw / 2, cy + ch / 2);
        x.stroke();
        x.strokeStyle = 'rgba(0,0,0,0.20)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(cx - cw / 2, cy + ch / 2 + 1.6); x.lineTo(cx, cy - ch / 2 + 1.6);
        x.lineTo(cx + cw / 2, cy + ch / 2 + 1.6); x.stroke();
      }
    });
  },

  // Overlapping armour scales.
  scale() {
    return this.make('scale', (x, s) => {
      x.fillStyle = '#6e6e6e'; x.fillRect(0, 0, s, s);
      const w = s / 8, h = s / 10;
      for (let j = -1; j < 11; j++) for (let i = -1; i < 9; i++) {
        const cx = i * w + (j % 2 ? w / 2 : 0), cy = j * h;
        const v = 140 + Math.random() * 55;
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.beginPath(); x.ellipse(cx + w / 2, cy + h, w * 0.56, h * 0.95, 0, Math.PI, 0); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.6; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.18)';
        x.beginPath(); x.ellipse(cx + w / 2, cy + h * 0.72, w * 0.30, h * 0.36, 0, Math.PI, 0); x.fill();
      }
    });
  },

  // Planked wood with grain and the odd knot.
  wood() {
    return this.make('wood', (x, s) => {
      const pw = s / 4;
      for (let p = 0; p < 4; p++) {
        const base = 120 + Math.random() * 50;
        x.fillStyle = `rgb(${base},${base},${base})`;
        x.fillRect(p * pw, 0, pw, s);
        for (let i = 0; i < 70; i++) {
          const y = Math.random() * s;
          x.strokeStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0,0)`;
          x.strokeStyle = Math.random() < 0.5
            ? `rgba(255,255,255,${0.04 + Math.random() * 0.08})`
            : `rgba(0,0,0,${0.05 + Math.random() * 0.09})`;
          x.lineWidth = 0.8 + Math.random() * 2;
          x.beginPath(); x.moveTo(p * pw, y);
          for (let k = 0; k <= pw; k += 8) x.lineTo(p * pw + k, y + Math.sin(k * 0.09 + p) * 2.5);
          x.stroke();
        }
        if (Math.random() < 0.7) {
          const kx = p * pw + 10 + Math.random() * (pw - 20), ky = Math.random() * s;
          for (let r = 9; r > 0; r -= 2) {
            x.strokeStyle = `rgba(0,0,0,${0.10 + (9 - r) * 0.02})`; x.lineWidth = 1.6;
            x.beginPath(); x.ellipse(kx, ky, r, r * 0.62, 0.4, 0, 6.283); x.stroke();
          }
        }
        x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(p * pw, 0, 2, s);
      }
    });
  },

  // Crystalline frost.
  frost() {
    return this.make('frost', (x, s) => {
      x.fillStyle = '#a8a8a8'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) {
        const cx = Math.random() * s, cy = Math.random() * s;
        const arms = 6, len = 6 + Math.random() * 20;
        x.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.45})`;
        x.lineWidth = 0.8 + Math.random();
        for (let a = 0; a < arms; a++) {
          const ang = (a / arms) * 6.283 + Math.random() * 0.2;
          x.beginPath(); x.moveTo(cx, cy);
          x.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          x.stroke();
          const mx = cx + Math.cos(ang) * len * 0.55, my = cy + Math.sin(ang) * len * 0.55;
          x.beginPath(); x.moveTo(mx, my);
          x.lineTo(mx + Math.cos(ang + 1.0) * len * 0.3, my + Math.sin(ang + 1.0) * len * 0.3);
          x.moveTo(mx, my);
          x.lineTo(mx + Math.cos(ang - 1.0) * len * 0.3, my + Math.sin(ang - 1.0) * len * 0.3);
          x.stroke();
        }
      }
      x.globalAlpha = 0.25;
      const n = this.canvas(s); this.noiseInto(Tex.ctx2d(n), s, 12, 3);
      x.drawImage(n, 0, 0); x.globalAlpha = 1;
    });
  },

  // Cracked glass, for shattered windows and the Lattice.
  cracked() {
    return this.make('cracked', (x, s) => {
      x.fillStyle = '#b0b0b0'; x.fillRect(0, 0, s, s);
      const hub = [];
      for (let i = 0; i < 5; i++) hub.push([Math.random() * s, Math.random() * s]);
      for (const [hx, hy] of hub) {
        for (let a = 0; a < 14; a++) {
          const ang = Math.random() * 6.283;
          let px = hx, py = hy;
          x.strokeStyle = `rgba(30,30,30,${0.30 + Math.random() * 0.4})`;
          x.lineWidth = 0.7 + Math.random() * 1.6;
          x.beginPath(); x.moveTo(px, py);
          for (let k = 0; k < 5; k++) {
            px += Math.cos(ang + (Math.random() - 0.5) * 0.7) * (8 + Math.random() * 20);
            py += Math.sin(ang + (Math.random() - 0.5) * 0.7) * (8 + Math.random() * 20);
            x.lineTo(px, py);
          }
          x.stroke();
        }
      }
    });
  }
});

/* ==========================================================================
   SPENDING THEM
   ========================================================================== */
(function surfacePass() {
  const g = window.HEXIS;
  if (!g || typeof Tex === 'undefined' || !Tex.enabled) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[surf] ' + n, e); } };

  /* A wall map and a floor map for every zone. The pairs are chosen so the
     two never share a frequency — gravel under tile reads as two materials,
     gravel under concrete reads as noise on noise. */
  const ZONE_SURF = {
    house: ['stucco', 'wood'],
    arena: ['concrete', 'asphalt'],
    city: ['brick', 'asphalt'],
    undercity: ['tile', 'gravel'],
    foundry: ['corrugate', 'tread'],
    spire: ['marble', 'marble'],
    lattice: ['circuit', 'circuit']
  };
  const DEFAULT_SURF = ['concrete', 'asphalt'];

  step('zone-surfaces', () => {
    if (typeof makeStaticMaterial !== 'function') return;

    /* The zone has to be identified BEFORE its builder runs, because
       Zone.finish() asks for the material at the end of the build. loadZone
       is handed a builder function, not a name — but the builders are named
       functions, so `buildUndercity` is the name. */
    Hook.before(Game.prototype, 'loadZone', function (builder) {
      const n = (builder && builder.name) || '';
      Tex.__zone = n.startsWith('build') ? n.slice(5).toLowerCase() : '';
    }, 'surf35:zoneTag');

    const cache = new Map();
    const pair = () => {
      const z = Tex.__zone || 'city';
      const key = z;
      if (cache.has(key)) return cache.get(key);
      const [w, f] = ZONE_SURF[z] || DEFAULT_SURF;
      const v = {
        wall: Tex[w] ? Tex[w]() : Tex.concrete(),
        floor: Tex[f] ? Tex[f]() : Tex.asphalt()
      };
      v.wallNrm = Tex.normalFrom(v.wall, 1.1);
      cache.set(key, v);
      return v;
    };

    const prev = makeStaticMaterial;
    makeStaticMaterial = function (opts = {}) {
      const m = prev(opts);                       // 345 has already run
      const u = m.userData && m.userData.u;
      if (!u || !u.uTex) return m;
      const p = pair();
      // Glow geometry keeps the window sheet 345 gave it.
      if (!opts.glow) {
        u.uTex.value = p.wall;
        u.uTexNrm.value = p.wallNrm;
      }
      u.uTexFloor = { value: opts.glow ? p.wall : p.floor };

      const prevCompile = m.onBeforeCompile;
      m.onBeforeCompile = (sh) => {
        prevCompile(sh);                          // 345 injects its block here
        sh.uniforms.uTexFloor = u.uTexFloor;
        /* Reach into the block 345 just wrote and split its one fetch in two.
           The dominant-axis test above it has already decided which way the
           face points; all this needs is to spend that decision twice. */
        sh.fragmentShader = sh.fragmentShader
          .replace('uniform sampler2D uTex;', 'uniform sampler2D uTex;\nuniform sampler2D uTexFloor;')
          .replace(
            'vec3 t = texture2D( uTex, tuv ).rgb;',
            'vec3 t = ( an.y > max( an.x, an.z ) )\n' +
            '   ? texture2D( uTexFloor, tuv ).rgb\n' +
            '   : texture2D( uTex, tuv ).rgb;'
          );
      };
      /* Capture the zone the material was BUILT for. Reading Tex.__zone at
         call time meant the key changed the moment the player travelled, and
         three.js recompiles a program whose cache key has moved — a shader
         rebuild on every zone load, for materials that had not changed. */
      const zoneAtBuild = Tex.__zone || '';
      const key = m.customProgramCacheKey;
      m.customProgramCacheKey = () => (key ? key() : '') + '|sf' + zoneAtBuild;
      return m;
    };
  });

  /* ------------------------------------------------------------ CHARACTERS
     345 dressed every rig identically. Surface is a readability channel like
     silhouette and colour: a soldier in camouflage, a heavy in carbon and
     Kell in scales are three different threats before you read a health bar. */
  step('character-surfaces', () => {
    if (typeof BipedRig === 'undefined') return;
    const BY_BUILD = {
      heavy: ['carbon', 4.0], tank: ['carbon', 3.4], titan: ['scale', 3.0],
      kell: ['scale', 2.6], runner: ['mesh', 4.2], lean: ['fabric', 3.2],
      shade: ['leather', 2.6], civ: ['knit', 2.4], mentor: ['fabric', 3.0]
    };
    Hook.before(BipedRig.prototype, 'update', function () {
      if (this.__surf || !this.mats || !this.cfg) return;
      this.__surf = true;
      const m = this.mats;
      // The Response Team wear issued kit.
      if (this.cfg.team) { Tex.dress(m.suit, 'camo', 2.6, 0.8); return; }
      const b = BY_BUILD[this.cfg.build];
      if (!b || !m.armor) return;
      /* Swap the maps rather than re-running dress(). dress() also
         compensates the albedo for the map darkening it, and running that
         twice on one material doubles the compensation and blows the colour
         out — which is the bug that turned every face white in 3.1. */
      m.armor.map = Tex.variant(b[0], b[1]);
      m.armor.roughnessMap = m.armor.map;
      m.armor.normalMap = Tex.normalVariant(b[0], b[1], 1.28);
      m.armor.__dressed = b[0];
      m.armor.needsUpdate = true;
    }, 'surf35:rig');
  });

  /* ----------------------------------------------------------------- PROPS
     Objective props had no surface at all — they were the last flat-shaded
     things left in a scene where everything else had one. */
  step('prop-surfaces', () => {
    if (typeof JobProp === 'undefined') return;
    // On the prop's own update, not on the frame: a prop that exists gets
    // dressed once, and a scene with no props costs nothing.
    Hook.after(JobProp.prototype, 'update', function () {
      if (this.__surf || !this.grp) return;
      this.__surf = true;
      this.grp.traverse(o => {
        if (o.isMesh && o.material && o.material.isMeshStandardMaterial)
          Tex.dress(o.material, 'chipped', 1.6, 0.9);
      });
    }, 'surf35:props');
  });

  console.log('[hexis 3.5] surfaces online: ' + done.join(', ') +
    '  ·  ' + Tex.cache.size + ' maps');
})();
