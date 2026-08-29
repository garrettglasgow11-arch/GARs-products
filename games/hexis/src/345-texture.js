/* ===== 345-texture.js =====================================================
   HEXIS 3.1 — surfaces.

   Up to 2.4.6 there is not one image in this game. Statics are vertex-coloured
   boxes with procedural detail injected into the shader — panel lines, contact
   AO, a wet sheen — and characters are flat-coloured `MeshStandardMaterial`.
   That is why everything reads as *painted*: a concrete wall, a denim jacket
   and a steel shutter are all the same perfectly smooth surface with a
   different hex value on it.

   This adds real textures without adding a single downloaded byte. Every map
   here is drawn into a canvas at load, once, and shared. The whole library is
   nine 256px textures plus their derived normal maps — under 3 MB of VRAM,
   against the 16 MB one 2048px PBR set would cost.

   Two delivery paths, because the two kinds of geometry have different needs:

     characters   real UVs (every plate comes from a BoxGeometry), so the maps
                  go on as `map` / `normalMap` / `roughnessMap` and three does
                  the rest.
     statics      one merged mesh per material with world-scale geometry and
                  no useful UVs. Sampled TRIPLANAR in the existing static
                  shader off `vWPos`, which is already a varying there.

   The triplanar path picks the dominant axis and takes ONE sample rather than
   blending three. Blending is the textbook version and it is three texture
   fetches on every covered pixel — on a phone, at full screen coverage, that
   is the most expensive thing in the frame. The seam a single sample leaves
   at exactly 45 degrees is invisible on a noise-driven texture, and the
   saving is two thirds of the cost.
   ========================================================================= */

const Tex = {
  size: 256,
  cache: new Map(),
  /* Off below this quality scale. The scaler already trades pixels for frame
     rate; on a device that has run out of both, the texture fetch is the next
     thing to give up. */
  minQuality: 0.66,
  enabled: true,

  /* --- canvas plumbing -------------------------------------------------- */
  canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size || this.size;
    return c;
  },

  /* Value noise on a canvas, tileable by construction: the lattice wraps, so
     the right edge is the left edge and there is no visible repeat seam. */
  noiseInto(ctx, size, cells, octaves, alpha) {
    const img = ctx.createImageData(size, size);
    const grid = [];
    for (let o = 0; o < octaves; o++) {
      const n = cells << o;
      const g = new Float32Array(n * n);
      for (let i = 0; i < g.length; i++) g[i] = Math.random();
      grid.push({ n, g });
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0, amp = 1, total = 0;
        for (const { n, g } of grid) {
          const fx = x / size * n, fy = y / size * n;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = smooth(fx - x0), ty = smooth(fy - y0);
          // Wrap the lattice so the texture tiles.
          const i00 = (y0 % n) * n + (x0 % n);
          const i10 = (y0 % n) * n + ((x0 + 1) % n);
          const i01 = ((y0 + 1) % n) * n + (x0 % n);
          const i11 = ((y0 + 1) % n) * n + ((x0 + 1) % n);
          const a = g[i00] + (g[i10] - g[i00]) * tx;
          const b = g[i01] + (g[i11] - g[i01]) * tx;
          v += (a + (b - a) * ty) * amp;
          total += amp;
          amp *= 0.5;
        }
        v /= total;
        const k = (y * size + x) * 4;
        const c = Math.round(v * 255);
        img.data[k] = img.data[k + 1] = img.data[k + 2] = c;
        img.data[k + 3] = alpha === undefined ? 255 : alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  /* A texture from a draw function, cached by key. */
  make(key, draw, opts = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const size = opts.size || this.size;
    const c = this.canvas(size);
    const x = c.getContext('2d');
    draw(x, size);
    /* Normalise the mean.

       three multiplies `map` by `color`, so a greyscale albedo darkens
       whatever colour the material had. The obvious compensation — scale the
       colour back up by 1/mean — blows out any bright albedo: skin at
       #e8b988 is 0.91 in red, and 0.91 * 1.9 clips to white. That is exactly
       what happened, and it turned every face into a blank white slab.

       Normalising the texture to a known, high mean bounds the compensation
       to about 1.18, which no sensible albedo clips at. The texture still
       carries all of its contrast; it just sits near white instead of near
       mid grey. */
    const TARGET = 0.85;
    try {
      const img = x.getImageData(0, 0, size, size);
      let sum = 0;
      for (let i = 0; i < img.data.length; i += 4) sum += img.data[i];
      const mean = (sum / (img.data.length / 4)) / 255;
      if (mean > 0.02 && !opts.keepLevels) {
        const k = TARGET / mean;
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = Math.min(255, img.data[i] * k);
          img.data[i + 1] = Math.min(255, img.data[i + 1] * k);
          img.data[i + 2] = Math.min(255, img.data[i + 2] * k);
        }
        x.putImageData(img, 0, 0);
      }
    } catch (e) { /* tainted canvas is impossible here, but never fatal */ }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Mipmaps are not optional here: a fabric weave on a character at 30 m
    // without them is a crawling moiré that reads as broken rendering.
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = opts.aniso || 4;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.needsUpdate = true;
    t.userData = { canvas: c, key };
    this.cache.set(key, t);
    return t;
  },

  /* Height -> normal, by central difference on the source canvas. Cheaper and
     more predictable than authoring a normal map by hand, and it means every
     surface's bump automatically matches its own albedo. */
  normalFrom(tex, strength = 1.4, key) {
    const k = (key || tex.userData.key) + ':n';
    if (this.cache.has(k)) return this.cache.get(k);
    const src = tex.userData.canvas;
    const size = src.width;
    const sctx = src.getContext('2d');
    const sd = sctx.getImageData(0, 0, size, size).data;
    const c = this.canvas(size);
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    const at = (i, j) => sd[(((j + size) % size) * size + ((i + size) % size)) * 4] / 255;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const dx = (at(i + 1, j) - at(i - 1, j)) * strength;
        const dy = (at(i, j + 1) - at(i, j - 1)) * strength;
        // Normalise (-dx, -dy, 1) into 0..1 tangent space.
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const o = (j * size + i) * 4;
        img.data[o] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        img.data[o + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
        img.data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    t.userData = { canvas: c, key: k };
    this.cache.set(k, t);
    return t;
  },

  /* --- the library -------------------------------------------------------
     Every one of these is greyscale. Colour comes from the material, so one
     texture serves a navy jacket, an ox-blood jacket and a grey one. */

  // Woven cloth: two perpendicular thread runs with a slub in each.
  fabric() {
    return this.make('fabric', (x, s) => {
      x.fillStyle = '#808080'; x.fillRect(0, 0, s, s);
      const step = 4;
      for (let i = 0; i < s; i += step) {
        x.fillStyle = 'rgba(255,255,255,0.10)';
        x.fillRect(i, 0, 2, s);
        x.fillStyle = 'rgba(0,0,0,0.10)';
        x.fillRect(0, i, s, 2);
      }
      // Slubs: the irregular thick threads that stop a weave reading as graph
      // paper.
      for (let i = 0; i < 220; i++) {
        x.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.08) + ')';
        const horiz = Math.random() < 0.5;
        const len = 6 + Math.random() * 26;
        if (horiz) x.fillRect(Math.random() * s, Math.random() * s, len, 2);
        else x.fillRect(Math.random() * s, Math.random() * s, 2, len);
      }
      x.globalAlpha = 0.35;
      const n = this.canvas(s), nx = n.getContext('2d');
      this.noiseInto(nx, s, 16, 3);
      x.drawImage(n, 0, 0);
      x.globalAlpha = 1;
    });
  },

  // Denim: a diagonal twill, which is the single detail that makes a jacket
  // read as denim rather than as blue cloth.
  denim() {
    return this.make('denim', (x, s) => {
      x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, s, s);
      x.lineWidth = 2;
      for (let i = -s; i < s * 2; i += 5) {
        x.strokeStyle = 'rgba(255,255,255,0.13)';
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + s, s); x.stroke();
        x.strokeStyle = 'rgba(0,0,0,0.10)';
        x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + 2 + s, s); x.stroke();
      }
      for (let i = 0; i < 900; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.14) + ')';
        x.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
      x.globalAlpha = 0.28;
      const n = this.canvas(s), nx = n.getContext('2d');
      this.noiseInto(nx, s, 8, 3);
      x.drawImage(n, 0, 0);
      x.globalAlpha = 1;
    });
  },

  // Leather: a cell pattern, worn brighter on the raised parts.
  leather() {
    return this.make('leather', (x, s) => {
      x.fillStyle = '#6e6e6e'; x.fillRect(0, 0, s, s);
      // Scatter points, then draw a soft blob at each: cheap Voronoi-ish grain.
      for (let i = 0; i < 420; i++) {
        const px = Math.random() * s, py = Math.random() * s;
        const r = 3 + Math.random() * 7;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
      for (let i = 0; i < 260; i++) {
        const px = Math.random() * s, py = Math.random() * s;
        x.strokeStyle = 'rgba(0,0,0,0.12)';
        x.lineWidth = 1;
        x.beginPath();
        x.arc(px, py, 3 + Math.random() * 8, Math.random() * 6, Math.random() * 6 + 1);
        x.stroke();
      }
    });
  },

  // Brushed metal panel with a seam grid and rivets.
  panel() {
    return this.make('panel', (x, s) => {
      x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.10) + ')';
        x.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 20, 1);
      }
      const half = s / 2;
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2;
      x.strokeRect(1, 1, half - 2, s - 2);
      x.strokeRect(half + 1, 1, half - 2, s - 2);
      x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
      x.strokeRect(3, 3, half - 6, s - 6);
      x.strokeRect(half + 3, 3, half - 6, s - 6);
      for (const [rx, ry] of [[10, 10], [half - 10, 10], [10, s - 10], [half - 10, s - 10],
                              [half + 10, 10], [s - 10, 10], [half + 10, s - 10], [s - 10, s - 10]]) {
        const g = x.createRadialGradient(rx, ry - 1, 0, rx, ry, 4);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        x.fillStyle = g;
        x.beginPath(); x.arc(rx, ry, 4, 0, Math.PI * 2); x.fill();
      }
    });
  },

  // Skin: fine pores plus a very low-frequency mottle, so a face is not one
  // flat colour under a hard light.
  skin() {
    return this.make('skin', (x, s) => {
      x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, s, s);
      const n = this.canvas(s), nx = n.getContext('2d');
      this.noiseInto(nx, s, 4, 2);
      x.globalAlpha = 0.22; x.drawImage(n, 0, 0); x.globalAlpha = 1;
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.05) + ')';
        x.beginPath();
        x.arc(Math.random() * s, Math.random() * s, 0.6 + Math.random() * 0.9, 0, Math.PI * 2);
        x.fill();
      }
    }, { size: 128 });
  },

  // Poured concrete: aggregate, form-board lines and staining.
  concrete() {
    return this.make('concrete', (x, s) => {
      x.fillStyle = '#8f8f8f'; x.fillRect(0, 0, s, s);
      const n = this.canvas(s), nx = n.getContext('2d');
      this.noiseInto(nx, s, 6, 4);
      x.globalAlpha = 0.5; x.drawImage(n, 0, 0); x.globalAlpha = 1;
      for (let i = 0; i < 900; i++) {
        const r = 1 + Math.random() * 3;
        x.fillStyle = Math.random() < 0.5
          ? 'rgba(255,255,255,' + (Math.random() * 0.18) + ')'
          : 'rgba(0,0,0,' + (Math.random() * 0.18) + ')';
        x.beginPath(); x.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); x.fill();
      }
      // Form-board seams, so a wall has a construction method.
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < s; i += 64) x.fillRect(0, i, s, 2);
      // Streaks under the seams — where water runs.
      for (let i = 0; i < 40; i++) {
        const px = Math.random() * s, py = Math.floor(Math.random() * 4) * 64;
        const g = x.createLinearGradient(0, py, 0, py + 40);
        g.addColorStop(0, 'rgba(0,0,0,0.16)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(px, py, 3 + Math.random() * 8, 40);
      }
    });
  },

  // Rusted plate, for the Undercity and the Foundry.
  rust() {
    return this.make('rust', (x, s) => {
      x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, s, s);
      const n = this.canvas(s), nx = n.getContext('2d');
      this.noiseInto(nx, s, 5, 4);
      x.globalAlpha = 0.65; x.drawImage(n, 0, 0); x.globalAlpha = 1;
      for (let i = 0; i < 150; i++) {
        const px = Math.random() * s, py = Math.random() * s, r = 4 + Math.random() * 22;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.30)');
        g.addColorStop(0.6, 'rgba(120,120,120,0.16)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
    });
  },

  /* Windows: the one texture that is not greyscale, because a tower face is
     mostly window and the lit/dark pattern IS the building. Emissive, drawn
     with a few colour temperatures so a skyline is not one shade of blue. */
  windows() {
    return this.make('windows', (x, s) => {
      x.fillStyle = '#0a0e16'; x.fillRect(0, 0, s, s);
      const cols = 8, rows = 12;
      const cw = s / cols, ch = s / rows;
      const lit = ['#cfe6ff', '#9fc4ff', '#ffd9a0', '#7fd8ff', '#ffb37a'];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * cw + 2, py = r * ch + 2, w = cw - 4, h = ch - 5;
          x.fillStyle = '#131a26';
          x.fillRect(px, py, w, h);
          if (Math.random() < 0.42) {
            const col = lit[(Math.random() * lit.length) | 0];
            x.globalAlpha = 0.35 + Math.random() * 0.6;
            x.fillStyle = col;
            x.fillRect(px, py, w, h);
            // A silhouette in some of them. One dark rectangle is enough to
            // suggest the floor is occupied.
            if (Math.random() < 0.22) {
              x.globalAlpha = 0.5;
              x.fillStyle = '#05070c';
              x.fillRect(px + w * (0.2 + Math.random() * 0.5), py + h * 0.35, w * 0.18, h * 0.65);
            }
            x.globalAlpha = 1;
          }
          x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1;
          x.strokeRect(px, py, w, h);
        }
      }
      // Floor slabs between the bands.
      x.fillStyle = 'rgba(0,0,0,0.55)';
      for (let r = 0; r < rows; r++) x.fillRect(0, r * ch, s, 3);
    }, { keepLevels: true });
  },

  /* Hazard stripes, for the Foundry and anything the level wants to say
     "do not stand here" about. */
  hazard() {
    return this.make('hazard', (x, s) => {
      x.fillStyle = '#909090'; x.fillRect(0, 0, s, s);
      x.strokeStyle = '#303030'; x.lineWidth = 18;
      for (let i = -s; i < s * 2; i += 44) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + s, s); x.stroke();
      }
      for (let i = 0; i < 500; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.12) + ')';
        x.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    });
  },

  /* --- application ------------------------------------------------------- */

  /* Give a character material a full set. `kind` picks the texture; `scale`
     is how many times it repeats across one plate. Plates are small, so the
     repeat is what controls apparent thread size — not the texture's own
     resolution. */
  /* Repeat is a property of the Texture, not of the material, so a naive
     implementation clones one per material — ten characters times four
     materials times two maps is eighty GPU uploads of the same image. The
     variant is cached by (kind, scale) instead: every rig that wants fabric
     at 3x shares one texture object, and the upload happens once. */
  variant(kind, scale) {
    const key = kind + '@' + scale;
    if (this.cache.has(key)) return this.cache.get(key);
    const src = this[kind] ? this[kind]() : this.fabric();
    const t = src.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(scale, scale);
    t.userData = src.userData;
    t.needsUpdate = true;
    this.cache.set(key, t);
    return t;
  },
  normalVariant(kind, scale, strength) {
    const key = kind + '@' + scale + ':n';
    if (this.cache.has(key)) return this.cache.get(key);
    const base = this[kind] ? this[kind]() : this.fabric();
    const src = this.normalFrom(base, strength);
    const t = src.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(scale, scale);
    t.userData = src.userData;
    t.needsUpdate = true;
    this.cache.set(key, t);
    return t;
  },

  dress(mat, kind, scale = 2, bump = 1) {
    if (!this.enabled || !mat || mat.__dressed) return mat;
    mat.__dressed = kind;
    const map = this.variant(kind, scale);
    mat.map = map;
    /* Compensate for the map darkening the albedo, but never past the point
       where a channel clips. A bright skin tone can only take about 1.1x
       before red saturates and the face renders white. */
    if (mat.color) {
      const c = mat.color;
      const headroom = 1 / Math.max(0.001, Math.max(c.r, c.g, c.b));
      c.multiplyScalar(Math.min(1 / 0.85, headroom));
    }
    if (bump > 0) {
      mat.normalMap = this.normalVariant(kind, scale, 1.6 * bump);
      mat.normalScale = new THREE.Vector2(0.7 * bump, 0.7 * bump);
      // The albedo doubles as a roughness break-up: the raised threads on a
      // weave are shinier than the valleys, which is true and free.
      mat.roughnessMap = map;
    }
    mat.needsUpdate = true;
    return mat;
  }
};

(function texturePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[tex] ' + n, e); } };

  if (SAFE) { console.log('[hexis 3.1] textures skipped (safe mode)'); return; }

  /* ------------------------------------------------------------- STATICS
     One triplanar sample folded into the material the whole world already
     uses. `vWPos` and `vWNrm` are existing varyings, so this costs a uniform,
     a branch on the dominant axis and one texture fetch.

     Two textures, picked per zone rather than per surface: a base for
     everything, and an emissive window sheet that only lights the faces the
     geometry has already marked as glowing. The zone builders tag glow with
     a separate merged mesh, so "windows only on window geometry" needs no
     per-vertex data at all — the glow mesh IS the window geometry. */
  step('statics', () => {
    const base = Tex.concrete();
    const wnd = Tex.windows();
    const baseNrm = Tex.normalFrom(base, 1.1);

    const prev = makeStaticMaterial;
    makeStaticMaterial = function (opts = {}) {
      const m = prev(opts);
      if (!m.userData.u) return m;
      const u = m.userData.u;
      u.uTex = { value: opts.glow ? wnd : base };
      u.uTexNrm = { value: baseNrm };
      u.uTexScale = { value: opts.texScale || 0.42 };
      u.uTexAmt = { value: opts.texAmt === undefined ? 1 : opts.texAmt };

      const prevCompile = m.onBeforeCompile;
      m.onBeforeCompile = (sh) => {
        prevCompile(sh);
        Object.assign(sh.uniforms, u);
        sh.fragmentShader =
          'uniform sampler2D uTex;\nuniform sampler2D uTexNrm;\n' +
          'uniform float uTexScale;\nuniform float uTexAmt;\n' +
          sh.fragmentShader.replace(
            '#include <specularmap_fragment>',
            `{
               if ( uTexAmt > 0.001 ) {
                 // Dominant-axis triplanar. One fetch, not three: blending
                 // costs 2 extra dependent reads on every covered pixel and
                 // buys a seam nobody can find on a noise texture.
                 vec3 an = abs( vWNrm );
                 vec2 tuv;
                 if ( an.y > max( an.x, an.z ) )      tuv = vWPos.xz;
                 else if ( an.x > an.z )              tuv = vWPos.zy;
                 else                                 tuv = vWPos.xy;
                 tuv *= uTexScale;
                 vec3 t = texture2D( uTex, tuv ).rgb;
                 // Authored around mid grey, so this modulates rather than
                 // replaces — the vertex colour still decides what it is.
                 float fade = 1.0 - smoothstep( 40.0, 120.0, length( vViewPosition ) );
                 diffuseColor.rgb *= mix( vec3( 1.0 ), t * 2.0, uTexAmt * fade );
               }
             }
             #include <specularmap_fragment>`
          );
      };
      const key = m.customProgramCacheKey;
      m.customProgramCacheKey = () => (key ? key() : '') + '|tex' + (opts.glow ? 'W' : 'B');
      return m;
    };

    // Quality LOD: the scaler already gives up pixels first; this is the next
    // thing to drop, and it drops to nothing rather than to something blurry.
    Hook.after(Game.prototype, 'applyQuality', function () {
      if (!this.zone || !this.zone.group) return;
      const want = this._q < Tex.minQuality ? 0 : 1;
      this.zone.group.traverse(o => {
        const u = o.material && o.material.userData && o.material.userData.u;
        if (u && u.uTexAmt) u.uTexAmt.value = want;
      });
    }, 'tex31:staticLod');
  });

  /* ------------------------------------------------------------ CHARACTERS
     BipedRig builds five materials per rig in its constructor. Rather than
     rewrite that, dress them on the way out — the rig has just been built and
     nothing has drawn with them yet. The mapping is by role, so an enemy in
     armour and Hexis in a jacket get the surface each one should have. */
  step('characters', () => {
    const dressRig = (rig) => {
      if (!rig || !rig.mats || rig.__tex) return;
      rig.__tex = true;
      const m = rig.mats;
      // Cloth wants a weave, armour wants a panel, the under-suit wants a
      // fine fabric, and the dark parts want leather.
      Tex.dress(m.suit, 'fabric', 3, 0.9);
      Tex.dress(m.cloth, 'denim', 2.2, 1.15);
      // Panel tiles a seam grid and eight rivets per repeat. At 1.4 repeats
      // per plate that put one enormous seam across every small piece of
      // armour; at 4 it reads as brushed plate with fine hardware, which is
      // what it is for.
      Tex.dress(m.armor, 'panel', 4, 0.7);
      Tex.dress(m.dark, 'leather', 2.4, 1.0);
      // `trim` is MeshBasicMaterial and emissive by intent — a texture on it
      // would only make the one self-lit element on the character dirty.
    };
    Hook.before(BipedRig.prototype, 'update', function () { dressRig(this); }, 'tex31:charDress');
    if (g.rig) dressRig(g.rig);
    Tex.dressRig = dressRig;
  });

  /* ------------------------------------------------------------------ SKIN
     Faces are built from their own materials inside makeHexis rather than
     from rig.mats, so they need naming individually. Worth it: the face is
     the one surface the camera is ever close to. */
  step('faces', () => {
    Hook.after(Game.prototype, 'loadZone', function () {
      const fp = this.rig && this.rig.faceParts;
      if (!fp || fp.__tex) return;
      fp.__tex = true;
      Tex.dress(fp.skin, 'skin', 1.6, 0.55);
      Tex.dress(fp.hairDark, 'fabric', 3.2, 1.3);
      Tex.dress(fp.hairLit, 'fabric', 3.2, 1.3);
    }, 'tex31:face');
  });

  /* ---------------------------------------------------------------- REPORT */
  step('report', () => {
    CLOCK.in(4, () => {
      let bytes = 0;
      for (const t of Tex.cache.values()) {
        const c = t.userData.canvas;
        bytes += c.width * c.height * 4 * 1.34;   // + mip chain
      }
      console.log('[hexis 3.1] textures: ' + Tex.cache.size + ' generated, ~' +
        (bytes / 1048576).toFixed(1) + ' MB VRAM');
    });
  });

  console.log('[hexis 3.1] textures online:', done.join(', '));
})();
