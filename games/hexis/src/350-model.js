/* ===== 350-model.js =======================================================
   HEXIS 3.1 — the character sculptor.

   THE PROBLEM

   Every character in this game is a stack of `plate()` calls, and `plate()` is
   a rounded box. That was a deliberate, sensible choice at 2.x — it is cheap,
   it merges well, and a 24% bevel catches enough of a highlight that a
   silhouette reads at twenty metres.

   It also means every character is literally made of boxes. A forearm is a
   box. A thigh is a box. A head is a box with a smaller box for a face. At the
   distance the third-person camera actually sits — three to five metres — you
   are looking at the seams between them, and no amount of bevel fixes the
   fact that an elbow is two rectangular prisms meeting at a corner with a gap
   that opens every time the joint bends past forty degrees.

   THE APPROACH

   Revolve, don't stack.

   Almost everything on a body is a surface of revolution with a squashed
   cross-section: an upper arm, a forearm, a calf, a neck, a torso, a skull.
   `THREE.LatheGeometry` takes a 2D profile and spins it, which gives smooth
   tapered limbs with no seams, correct smooth-shaded normals, and — because
   Lathe emits proper UVs — somewhere for 345-texture's maps to land.

   A ball at every joint is the other half of it. A sphere at the elbow, the
   knee and the shoulder means the joint stays solid at any bend angle, which
   is the actual fix for the gap. It is the same trick a real character rig
   uses, done with geometry instead of skinning, and it costs three spheres.

   PROPORTIONS — the "not so blocky" part

   Stylised, in the Fortnite / Overwatch register rather than realistic:

     head        1 : 6.2 of total height, against a realistic 1 : 7.5. A
                 bigger head is what reads as a character rather than as a
                 mannequin, and it is the single biggest lever there is.
     shoulders   2.6 head-widths, tapering to a narrow waist — the classic
                 stylised V. Silhouette first.
     limbs       thick at the root, thin at the joint: 0.115 -> 0.075 down the
                 forearm. Real limbs taper; boxes cannot.
     hands/feet  deliberately oversized. Small hands on a stylised body look
                 like a mistake; large ones look like a decision.

   BUDGET

   About 2,400 triangles a character against roughly 600 before. That sounds
   like a lot until you notice the dressed city is 70,000 and that 80-perf.js
   already merges every plate on a joint into one mesh per material and freezes
   its matrix. Ten characters is 24k triangles and the same draw-call count as
   before. Lathe segment count drops from 12 to 8 on touch, which is the only
   concession made.

   HOW IT INSTALLS

   `Hook.before` on `BipedRig.update`, which puts it at the FRONT of the chain
   — ahead of 60-upgrade's detail pass and ahead of 80-perf's merge, so the new
   geometry is merged and frozen like everything else. The old plates are
   removed first, and anything the animation code holds a named reference to
   (the blade, the hex core, a Warden's shield, a Lancer's rifle) is left
   exactly where it is.
   ========================================================================= */

const Sculpt = {
  built: 0,
  enabled: true,
  /* Radial segments on every revolved part.
     A lathe costs (points - 1) * segments * 2 triangles, so this number is
     the single biggest lever on the character budget. Ten is where a forearm
     stops reading as faceted at the distance the camera actually sits; seven
     is where it stops on a phone screen. Going to twelve cost 40% more
     triangles for a difference that needed photo mode to see. */
  get seg() { return Input.touch ? 7 : 10; },
  /* Joint balls get half the rings of a full sphere. They are only ever seen
     as the round bit of an elbow. */
  get ring() { return Input.touch ? 4 : 5; },
  coatFar: 28 * 28
};

(function modelPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[model] ' + n, e); } };
  const V2 = (x, y) => new THREE.Vector2(x, y);

  /* ======================================================================
     PRIMITIVES
     ====================================================================== */

  /* A surface of revolution from a profile of [radius, height] pairs, with an
     optional depth squash so a cross-section can be an oval rather than a
     circle — which is what a chest, a forearm and a skull all actually are. */
  function lathe(profile, mat, opts = {}) {
    const pts = profile.map(p => V2(Math.max(0.0001, p[0]), p[1]));
    const geo = new THREE.LatheGeometry(pts, opts.seg || Sculpt.seg,
      opts.phiStart || 0, opts.phiLength || Math.PI * 2);
    if (opts.squash && opts.squash !== 1) geo.scale(1, 1, opts.squash);
    if (opts.wide && opts.wide !== 1) geo.scale(opts.wide, 1, 1);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
    m.castShadow = true;
    if (opts.side) m.material = mat;
    return m;
  }

  /* A tapered limb: fat at the root, thin at the joint, with a rounded cap at
     each end so it never shows a hard rim through a sleeve. Built root-down,
     because that is how the rig hangs its joints. */
  function limbGeo(rTop, rBot, len, mat, squash = 0.92) {
    // Seven points, not ten. Each extra point costs `seg * 2` triangles on
    // every limb of every character on screen, and the two it buys — a second
    // ring in each end cap — are hidden inside the joint ball anyway.
    const capT = rTop * 0.7, capB = rBot * 0.78;
    const p = [
      [0.0001, -len - capB],
      [rBot * 0.80, -len - capB * 0.5],
      [rBot, -len],
      // A slight bulge two thirds up reads as muscle rather than as a cone.
      [rBot + (rTop - rBot) * 0.5, -len * 0.5],
      [rTop * 1.03, -len * 0.18],
      [rTop, 0],
      [rTop * 0.72, capT * 0.7],
      [0.0001, capT]
    ];
    return lathe(p, mat, { squash });
  }

  /* A joint ball. This is the part that makes a bent elbow solid. */
  function ball(r, mat, y = 0, squash = 1) {
    const geo = new THREE.SphereGeometry(r, Sculpt.seg, Sculpt.ring);
    if (squash !== 1) geo.scale(1, 1, squash);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    return m;
  }

  /* A soft box: the rounded-box primitive the base already has, but with a
     heavier bevel so it sits next to revolved parts without looking like it
     came from a different game. */
  function soft(w, h, d, mat, x, y, z, k = 0.42) {
    return plate(w, h, d, mat, x, y, z, k);
  }

  /* The same shape at one subdivision instead of two: 12 triangles against
     48. Used for anything under about four centimetres, where the extra
     subdivision is smaller than a pixel at any distance you will see it. */
  function chip(w, h, d, mat, x, y, z, k = 0.35) {
    const m = new THREE.Mesh(roundedBox(w, h, d, bev(w, h, d, k), 1), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  /* ======================================================================
     STRIP — remove what we are replacing, keep what the code holds on to
     ====================================================================== */

  /* Which objects must survive the strip.

     This has the same trap RigOpt.protect fell into and 360-perf.js fixes:
     a naive walk of the rig finds `rig.j`, descends into it, finds `j.head`
     and marks it WITH ITS ENTIRE SUBTREE. Since every part of a character
     hangs off a joint, that protects the whole rig — the strip removes
     nothing and the new geometry is simply added on top of the old.

     That is not a hypothetical: the first cut of this module shipped it, and
     the result was a character wearing both models at once. The head kept its
     original box skull, box faceplate and full-face white mask, which is
     what the "flat white slab for a face" was — the sculpted head was behind
     it the whole time.

     So: joints are collected first and protected as NODES only. Everything
     else the animation code holds by name keeps its whole subtree. */
  function protectedSet(rig) {
    const keep = new Set();
    const joints = new Set();
    const addJoint = (o) => { if (o && o.isObject3D) { joints.add(o); keep.add(o); } };
    if (rig.j) for (const k in rig.j) addJoint(rig.j[k]);
    for (const limb of [rig.armL, rig.armR, rig.legL, rig.legR]) {
      if (!limb) continue;
      for (const k in limb) addJoint(limb[k]);
    }
    if (rig.coat) for (const c of rig.coat) addJoint(c && c.g);
    addJoint(rig.root);

    const mark = (o) => { if (o && o.traverse) o.traverse(n => keep.add(n)); };
    const scan = (obj, depth) => {
      if (!obj || depth > 2) return;
      for (const k in obj) {
        const v = obj[k];
        if (!v) continue;
        if (v.isObject3D) {
          if (k === 'root' || joints.has(v)) continue;
          mark(v);
        } else if (Array.isArray(v)) {
          v.forEach(x => { if (x && x.isObject3D && !joints.has(x)) mark(x); });
        } else if (typeof v === 'object' && !v.isMaterial && !v.isBufferGeometry &&
                   !v.isVector3 && !v.isColor && !v.isTexture) {
          scan(v, depth + 1);
        }
      }
    };
    scan(rig, 0);
    return keep;
  }

  function strip(joint, keep) {
    for (let i = joint.children.length - 1; i >= 0; i--) {
      const c = joint.children[i];
      if (!c.isMesh || keep.has(c)) continue;
      joint.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
  }

  /* ======================================================================
     THE BODY
     ====================================================================== */

  function sculpt(rig) {
    const S = rig.S, m = rig.mats, cfg = rig.cfg, j = rig.j;
    const keep = protectedSet(rig);
    const face = !!cfg.face;
    const heavy = !!cfg.heavy;
    const slim = cfg.slim ? 0.86 : 1;

    /* --- pelvis ------------------------------------------------------- */
    strip(j.hips, keep);
    j.hips.add(lathe([
      [0.108 * S, -0.16 * S], [0.150 * S, -0.10 * S], [0.162 * S, 0.0],
      [0.150 * S, 0.06 * S], [0.124 * S, 0.10 * S]
    ], m.dark, { squash: 0.80, wide: heavy ? 1.12 : 1 }));
    // Belt: a real band with a buckle, so the torso and the legs are two
    // garments rather than one tube.
    j.hips.add(lathe([
      [0.162 * S, 0.02 * S], [0.174 * S, 0.05 * S], [0.174 * S, 0.10 * S], [0.162 * S, 0.13 * S]
    ], m.armor, { squash: 0.82, wide: heavy ? 1.12 : 1 }));
    j.hips.add(chip(0.09 * S, 0.068 * S, 0.045 * S, m.trim, 0, 0.075 * S, 0.132 * S, 0.3));

    /* --- torso -------------------------------------------------------- */
    strip(j.chest, keep);
    const chestW = (heavy ? 1.16 : 1) * slim;
    // The V: narrow at the waist, widest at the deltoid line, tucked back in
    // at the collar. This profile is the whole stylised read.
    /* Radii, not diameters. The base rig's ribcage plate is 0.42 S across and
       its upper chest 0.48 S, so 0.21 S is the widest this can be without the
       character reading as a barrel — which is exactly what the first cut of
       this did. The V comes from the RATIO between waist and shoulder, not
       from making the shoulder bigger. */
    j.chest.add(lathe([
      [0.128 * S, 0.02 * S],
      [0.152 * S, 0.14 * S],
      [0.184 * S, 0.28 * S],
      [0.205 * S, 0.42 * S],
      [0.206 * S, 0.52 * S],
      [0.168 * S, 0.60 * S],
      [0.100 * S, 0.655 * S]
    ], m.suit, { squash: 0.72, wide: chestW }));

    // Pectoral shelf and abdominal break — two shallow revolved bands rather
    // than sculpted muscle. At this scale that is all the read needs.
    j.chest.add(lathe([
      [0.196 * S, 0.34 * S], [0.208 * S, 0.40 * S], [0.200 * S, 0.47 * S]
    ], m.armor, { squash: 0.76, wide: chestW }));

    /* --- the jacket ----------------------------------------------------
       A partial revolve: `phiLength` short of a full turn leaves the front
       open, which is how you get an open jacket out of a lathe. The lapels
       and the collar are separate so they can flare. */
    if (cfg.coat || cfg.jacket !== false) {
      const open = 0.62;                       // radians of gap at the front
      const jk = lathe([
        [0.150 * S, -0.05 * S],
        [0.178 * S, 0.08 * S],
        [0.205 * S, 0.28 * S],
        [0.222 * S, 0.44 * S],
        [0.214 * S, 0.545 * S],
        [0.160 * S, 0.60 * S]
      ], m.cloth, {
        squash: 0.74, wide: chestW,
        phiStart: open / 2, phiLength: Math.PI * 2 - open
      });
      jk.material = m.cloth;
      // Open geometry, so it has to be two-sided or you see through the back
      // of the lapel every time the camera swings round.
      jk.material.side = THREE.DoubleSide;
      j.chest.add(jk);

      // Lapels: tapered panels folded back off the opening.
      for (const side of [-1, 1]) {
        const lap = taper(0.105 * S, 0.045 * S, 0.38 * S, 0.045 * S, m.cloth,
          side * 0.088 * S, 0.34 * S, 0.146 * S);
        lap.rotation.z = side * 0.22;
        lap.rotation.y = side * -0.42;
        j.chest.add(lap);
      }
      // Stand collar, revolved and tipped outwards.
      // A collar that reaches the jaw swallows the face. This stops at the
      // base of the neck and only tips out at the very top.
      const col = lathe([
        [0.108 * S, 0.585 * S], [0.126 * S, 0.645 * S], [0.134 * S, 0.688 * S]
      ], m.cloth, { squash: 0.86, phiStart: 0.5, phiLength: Math.PI * 2 - 1.0 });
      col.material.side = THREE.DoubleSide;
      j.chest.add(col);
    }

    // Hex core — the name, worn on the chest. Rebuilt only if the base one was
    // removed; normally it is a named reference and survives the strip.
    if (!rig.hex || !rig.hex.parent) {
      const hex = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068 * S, 0.068 * S, 0.035 * S, 6), m.trim);
      hex.rotation.x = Math.PI / 2;
      hex.position.set(0, 0.44 * S, 0.150 * S);
      j.chest.add(hex);
      rig.hex = hex;
    }

    /* The base rig builds the hex core at 0.11 S radius — 22 cm across on a
       1.8 m body, which with an unlit emissive material reads as a car
       headlight bolted to the sternum. It survives the strip because the
       animation code holds it by name, so it is resized rather than rebuilt. */
    if (rig.hex && rig.hex.parent && !rig.hex.__resized) {
      rig.hex.__resized = true;
      rig.hex.geometry.dispose();
      rig.hex.geometry = new THREE.CylinderGeometry(0.068 * S, 0.068 * S, 0.035 * S, 6);
      rig.hex.position.set(0, 0.44 * S, 0.150 * S);
    }

    /* --- neck and head -------------------------------------------------- */
    strip(j.head, keep);
    /* Stylisation multiplier on the head. 1.35 put the skull at 30 cm across
       on a 1.8 m body, which is past cartoon and into bobblehead. 1.18 lands
       at about 26 cm — clearly stylised, still a person. */
    const H = 1.30;
    j.head.add(lathe([
      [0.052 * S, -0.05 * S], [0.058 * S, 0.01 * S], [0.055 * S, 0.055 * S]
    ], m.dark, { squash: 0.92 }));

    // Skull: an egg, widest just above the ear line, flattened at the back.
    const skull = lathe([
      [0.0001, -0.132 * S * H],
      [0.062 * S * H, -0.116 * S * H],
      [0.096 * S * H, -0.062 * S * H],
      [0.108 * S * H, 0.0],
      [0.112 * S * H, 0.052 * S * H],
      [0.103 * S * H, 0.100 * S * H],
      [0.074 * S * H, 0.140 * S * H],
      [0.0001, 0.158 * S * H]
    ], face ? (rig.faceSkin || m.dark) : m.dark, { squash: 0.96 });
    skull.position.y = 0.20 * S;
    skull.scale.z = 1.06;                        // slightly long front to back
    j.head.add(skull);
    rig.skull = skull;

    if (face) {
      const skin = rig.faceSkin || m.dark;
      const HR = 0.108 * S * H;                 // skull radius at the eye line
      const HZ = HR * 1.02;                     // ...and its depth after squash

      /* The first cut of this face was a stack of flat boxes glued to the
         front of the skull: a brow chip, two socket chips, a full-width mask
         and a mouth bar. Every one of them was a plane facing the camera, so
         a head built out of a smooth revolved skull rendered as a slab —
         precisely the blockiness this whole pass exists to remove.

         The rule now: nothing is stuck ON the face. Features are either part
         of the skull's own silhouette (jaw, nose, ears) or set INTO it (eyes,
         mouth), positioned so their outer surface lands flush with the skull
         rather than proud of it. */

      /* No jaw box. The first attempt hung a tapered slab under the skull for
         a jaw; `taper` scales a unit-width rounded box in X, which scales its
         bevel with it, so a narrow taper comes out with an almost hard edge —
         a flat-fronted slab across the entire lower face. The skull profile
         already reaches below the mouth line, so the jaw only needs a chin. */
      const chin = ball(0.040 * S * H, skin, 0);
      chin.scale.set(1.10, 0.70, 0.90);
      chin.position.set(0, 0.118 * S, 0.046 * S * H);
      j.head.add(chin);

      // Cheekbones: two flattened balls, which is what turns a sphere into a
      // face at this level of abstraction.
      for (const side of [-1, 1]) {
        const ck = ball(0.034 * S * H, skin, 0);
        ck.scale.set(0.85, 0.52, 0.70);
        ck.position.set(side * 0.058 * S * H, 0.176 * S, 0.074 * S * H);
        j.head.add(ck);
      }

      // Nose: a tapered wedge off the centre line, small and low.
      const nose = taper(0.026 * S * H, 0.044 * S * H, 0.052 * S * H, 0.052 * S * H,
        skin, 0, 0.196 * S, 0.104 * S * H);
      nose.rotation.x = 0.12;
      j.head.add(nose);

      // Ears.
      for (const side of [-1, 1]) {
        const ear = ball(0.032 * S * H, skin, 0);
        ear.scale.set(0.40, 1.20, 0.86);
        ear.position.set(side * 0.104 * S * H, 0.198 * S, -0.004 * S);
        j.head.add(ear);
      }

      // Eyes. Large — that is the stylisation — and seated so the front of
      // the ball is flush with the skull surface rather than floating off it.
      const white = rig.eyeWhite || (rig.eyeWhite = new THREE.MeshStandardMaterial({
        color: '#eef4fb', roughness: 0.22, metalness: 0
      }));
      const iris = rig.eyeIris || (rig.eyeIris = new THREE.MeshBasicMaterial({
        color: cfg.eye || cfg.trim || '#5FE3FF', fog: false
      }));
      const eyeR = 0.034 * S * H;
      const eyeX = 0.054 * S * H, eyeY = 0.212 * S;
      rig.eyes = [];
      for (const side of [-1, 1]) {
        const e = ball(eyeR, white);
        e.scale.set(1, 0.94, 0.62);
        e.position.set(side * eyeX, eyeY, HZ - eyeR * 0.62);
        j.head.add(e);
        const ir = new THREE.Mesh(new THREE.CircleGeometry(eyeR * 0.62, 10), iris);
        ir.position.set(side * eyeX, eyeY, HZ + 0.001 * S);
        j.head.add(ir);
        rig.eyes.push(ir);
        // Upper lid: a thin curved slice of skin over the top of the ball, so
        // the eye is set under a brow rather than painted on.
        const lid = ball(eyeR * 1.06, skin, 0);
        lid.scale.set(1, 0.42, 0.62);
        lid.position.set(side * eyeX, eyeY + eyeR * 0.68, HZ - eyeR * 0.66);
        j.head.add(lid);
      }

      // Brows: small tapered wedges following the lid, angled inwards.
      for (const side of [-1, 1]) {
        const b2 = taper(0.052 * S * H, 0.026 * S * H, 0.016 * S * H, 0.020 * S * H,
          rig.faceHair || m.dark, side * eyeX, eyeY + eyeR * 1.25, HZ - eyeR * 0.35);
        b2.rotation.z = side * -0.20;
        b2.rotation.y = side * 0.25;
        j.head.add(b2);
      }

      // Mouth: a shallow inset, not a bar stuck on the chin.
      const mouth = ball(0.017 * S * H, rig.faceMouth || m.dark, 0);
      mouth.scale.set(1.9, 0.30, 0.45);
      mouth.position.set(0, 0.152 * S, HZ * 0.88);
      j.head.add(mouth);

      // The half-mask is opt-in and covers the mouth only. It was full-face
      // and near-white, which turned the one surface the camera gets close to
      // into a blank panel.
      if (cfg.mask) {
        const mask = lathe([
          [0.086 * S * H, 0.132 * S], [0.098 * S * H, 0.158 * S], [0.086 * S * H, 0.182 * S]
        ], rig.faceMask || m.armor, { squash: 0.98, phiStart: -0.62, phiLength: 1.24 });
        mask.material.side = THREE.DoubleSide;
        j.head.add(mask);
      }

      /* Hair.

         The first version was six tapered clumps radiating off the crown with
         a shared outward tilt, which produced a spiked halo — a crown of
         blades rather than a haircut.

         This is a fitted cap plus a fringe. The cap is a revolved shell that
         follows the skull and stops at the hairline, so there is hair
         *everywhere* there should be; the fringe is four short pieces angled
         DOWN and FORWARD over the brow, which is how hair falls. The two
         side pieces sweep back past the ears rather than out. */
      if (cfg.hair !== false) {
        const hairA = rig.faceHair || m.dark;
        const hairB = rig.faceHairLit || hairA;
        const HRR = 0.108 * S * H;

        // One closed cap over the whole crown, front included. The two-piece
        // version left a gap at the hairline that showed bare skull between
        // the fringe pieces.
        // Every radius here has to clear the skull profile underneath, or
        // the crown pokes through the cap and the character goes bald on top.
        const cap = lathe([
          [HRR * 1.10, 0.212 * S],
          [HRR * 1.13, 0.268 * S],
          [HRR * 1.06, 0.324 * S],
          [HRR * 0.80, 0.382 * S],
          [0.0001, 0.418 * S]
        ], hairA, { squash: 0.99 });
        j.head.add(cap);

        /* Fringe. A taper is built along its own +Y, so a piece that should
           hang DOWN over the brow needs to be rotated most of the way over —
           the first pass used a small negative tilt, which left every strand
           jutting forwards off the forehead like a visor. */
        const fringe = [
          [0.000, 0.318, 0.070, 0.062, 0.088, 0.00, 2.45, hairB],
          [0.052, 0.314, 0.062, 0.052, 0.078, -0.20, 2.35, hairB],
          [-0.052, 0.314, 0.062, 0.052, 0.078, 0.20, 2.35, hairA],
          [0.088, 0.306, 0.038, 0.044, 0.066, -0.38, 2.25, hairA],
          [-0.088, 0.306, 0.038, 0.044, 0.066, 0.38, 2.25, hairA]
        ];
        for (const [x, y, z, w, h, rz, rx, mat] of fringe) {
          const c = taper(w * S * H, w * 0.34 * S * H, h * S * H, w * 0.66 * S * H,
            mat, x * S * H, y * S, z * S * H);
          c.rotation.z = rz;
          c.rotation.x = rx;
          j.head.add(c);
        }
        // Side sweeps, back past the ear.
        for (const side of [-1, 1]) {
          const sw = taper(0.058 * S * H, 0.026 * S * H, 0.115 * S * H, 0.050 * S * H,
            hairA, side * 0.098 * S * H, 0.268 * S, -0.030 * S * H);
          sw.rotation.z = side * 0.42;
          sw.rotation.x = 0.30;
          j.head.add(sw);
        }
      }
    } else {
      // Helmet: a smooth shell with a visor band, for anything that is not
      // meant to have a readable face.
      j.head.add(lathe([
        [0.0001, 0.318 * S], [0.070 * S, 0.300 * S], [0.108 * S, 0.245 * S],
        [0.120 * S, 0.180 * S], [0.112 * S, 0.120 * S], [0.088 * S, 0.088 * S]
      ], m.armor, { squash: 0.96 }));
      j.head.add(chip(0.185 * S, 0.042 * S, 0.055 * S, m.trim, 0, 0.205 * S, 0.098 * S, 0.4));
      j.head.add(chip(0.150 * S, 0.070 * S, 0.045 * S, m.dark, 0, 0.150 * S, 0.100 * S, 0.45));
    }
    if (cfg.hood) {
      const hood = lathe([
        [0.135 * S, 0.10 * S], [0.185 * S, 0.20 * S], [0.190 * S, 0.30 * S], [0.130 * S, 0.36 * S]
      ], m.cloth, { squash: 1.05, phiStart: 0.55, phiLength: Math.PI * 2 - 1.1 });
      hood.material.side = THREE.DoubleSide;
      j.head.add(hood);
    }
    if (cfg.crest) {
      j.head.add(taper(0.05 * S, 0.012 * S, 0.24 * S, 0.10 * S, m.trim, 0, 0.34 * S, -0.03 * S));
    }

    /* --- arms ---------------------------------------------------------- */
    for (const side of [-1, 1]) {
      const tag = side < 0 ? 'L' : 'R';
      const arm = side < 0 ? rig.armL : rig.armR;
      if (!arm) continue;
      strip(arm.sh, keep);
      strip(arm.el, keep);
      if (arm.hand) strip(arm.hand, keep);

      const upR = 0.078 * S * (heavy ? 1.22 : 1);
      const elR = 0.062 * S * (heavy ? 1.18 : 1);
      // Deltoid ball at the shoulder: solid at any raise angle.
      arm.sh.add(ball(upR * 1.28, m.suit, 0, 0.92));
      arm.sh.add(limbGeo(upR, elR, 0.30 * S, m.suit));
      // Sleeve cuff over the bicep, so the jacket has a sleeve.
      if (cfg.coat || cfg.jacket !== false) {
        arm.sh.add(lathe([
          [upR * 1.16, 0.03 * S], [upR * 1.22, -0.06 * S], [elR * 1.24, -0.26 * S]
        ], m.cloth, { squash: 0.95 }));
      }
      if (cfg.pauldron) {
        const pd = lathe([
          [0.055 * S, 0.09 * S], [0.135 * S, 0.045 * S], [0.150 * S, -0.03 * S], [0.135 * S, -0.075 * S]
        ], m.armor, { squash: 0.86 });
        pd.position.set(side * 0.025 * S, 0.02 * S, 0);
        arm.sh.add(pd);
        arm.sh.add(chip(0.036 * S, 0.013 * S, 0.12 * S, m.trim, side * 0.10 * S, 0.055 * S, 0, 0.35));
      }

      // Elbow ball, then a forearm that tapers hard into the wrist.
      arm.el.add(ball(elR * 1.16, m.suit, 0, 0.94));
      arm.el.add(limbGeo(elR, 0.046 * S, 0.27 * S, m.suit));
      // Gauntlet: a revolved cuff plus a lit strip. The strip is the read that
      // says the arm is the weapon.
      arm.el.add(lathe([
        [elR * 1.08, -0.10 * S], [elR * 1.14, -0.17 * S], [0.052 * S, -0.27 * S]
      ], m.armor, { squash: 0.94 }));
      for (let i = 0; i < 3; i++) {
        arm.el.add(chip(0.010 * S, 0.010 * S, 0.022 * S, m.trim,
          (-0.019 + i * 0.019) * S, -0.20 * S, 0.046 * S, 0.3));
      }

      if (arm.hand) {
        // A mitt, not a claw: one mass with a thumb and two shallow finger
        // splits. Oversized on purpose.
        const hw = 0.075 * S, hh = 0.115 * S, hd = 0.098 * S;
        const palm = soft(hw * 2, hh, hd, m.dark, 0, -0.055 * S, 0.004 * S, 0.46);
        arm.hand.add(palm);
        arm.hand.add(chip(hw * 1.9, 0.022 * S, hd * 0.9, m.armor, 0, -0.012 * S, 0.012 * S, 0.4));
        // Fingers as one block with two grooves cut by dark slivers — three
        // separate finger meshes at this scale is detail nobody can resolve
        // and geometry everybody pays for.
        const fing = taper(hw * 1.92, hw * 1.74, 0.070 * S, hd * 0.96, m.dark,
          0, -0.142 * S, 0.010 * S);
        arm.hand.add(fing);
        // Two shallow grooves, inset rather than proud. Standing them off the
        // surface in a contrasting material turned the hand into a four-prong
        // fork at any distance under three metres.
        for (const gx of [-0.020, 0.020]) {
          arm.hand.add(chip(0.005 * S, 0.056 * S, hd * 0.55, m.dark,
            gx * S, -0.150 * S, 0.052 * S, 0.2));
        }
        // A lathe for a thumb is 120 triangles for something the size of a
        // fingernail. A chip is twelve and reads identically.
        const thumb = chip(0.034 * S, 0.075 * S, 0.040 * S, m.dark, 0, 0, 0, 0.45);
        thumb.position.set(side * 0.062 * S, -0.078 * S, 0.030 * S);
        thumb.rotation.z = side * 1.05;
        thumb.rotation.x = -0.35;
        arm.hand.add(thumb);
        arm.hand.add(chip(0.075 * S, 0.011 * S, 0.016 * S, m.trim, 0, -0.108 * S, 0.050 * S, 0.3));
        arm.fingers = fing;
      }
    }

    /* --- legs ---------------------------------------------------------- */
    for (const side of [-1, 1]) {
      const leg = side < 0 ? rig.legL : rig.legR;
      if (!leg) continue;
      strip(leg.hip, keep);
      strip(leg.kn, keep);
      strip(leg.ft, keep);

      const thR = 0.098 * S * (heavy ? 1.2 : 1);
      const knR = 0.072 * S * (heavy ? 1.16 : 1);
      leg.hip.add(ball(thR * 1.18, m.suit, 0, 0.94));
      leg.hip.add(limbGeo(thR, knR, 0.44 * S, m.suit));
      // Thigh seam, so trousers read as trousers.
      leg.hip.add(chip(0.012 * S, 0.36 * S, 0.012 * S, m.dark, side * thR * 0.9, -0.22 * S, 0.02 * S, 0.3));

      leg.kn.add(ball(knR * 1.14, m.suit, 0, 0.95));
      // Knee pad, revolved so it wraps rather than sitting on top like a tile.
      leg.kn.add(lathe([
        [knR * 1.02, 0.045 * S], [knR * 1.22, -0.02 * S], [knR * 1.16, -0.09 * S]
      ], m.armor, { squash: 0.92 }));
      leg.kn.add(limbGeo(knR, 0.052 * S, 0.40 * S, m.suit));

      // Boot: a flared cuff, a rounded foot mass, a sole and a toe cap. The
      // flare is what makes the leg silhouette stop being a stick.
      leg.ft.add(lathe([
        [0.052 * S, 0.10 * S], [0.082 * S, 0.055 * S], [0.086 * S, -0.02 * S], [0.072 * S, -0.075 * S]
      ], m.dark, { squash: 0.94 }));
      const foot = soft(0.115 * S, 0.078 * S, 0.24 * S, m.dark, 0, -0.075 * S, 0.055 * S, 0.44);
      leg.ft.add(foot);
      leg.ft.add(soft(0.126 * S, 0.030 * S, 0.275 * S, m.armor, 0, -0.108 * S, 0.058 * S, 0.35));
      leg.ft.add(taper(0.105 * S, 0.082 * S, 0.062 * S, 0.09 * S, m.armor, 0, -0.062 * S, 0.165 * S));
      leg.ft.add(chip(0.080 * S, 0.010 * S, 0.016 * S, m.trim, 0, -0.030 * S, 0.126 * S, 0.3));
    }

    /* --- coat ------------------------------------------------------------
       BipedRig builds the coat groups; this replaces their contents with a
       shaped panel and adds the side flaps that give it a back and two sides
       instead of one slab. */
    /* BipedRig builds a three-segment coat whenever `cfg.coat` is set, and
       `makeHexis` sets it. Those panels are chest-parented, full body width
       and reach the ankles — with the jacket above them the result is a
       barrel with a head on top. Hexis wears a JACKET; per the Part One lore
       it is "dark blue, almost black", not a duster. So a rig that has the
       jacket loses the long coat, and only the archetypes that were designed
       around one keep it. */
    const longCoat = !!cfg.coat && cfg.jacket === false;
    if (rig.coat && rig.coat.length && !longCoat) {
      for (const c of rig.coat) c.g.visible = false;
      rig.coatHas = false;
    } else if (rig.coat && rig.coat.length && !rig.__coatDressed) {
      rig.__coatDressed = true;
      const w = [0.40, 0.37, 0.31], h = [0.32, 0.30, 0.26];
      for (let i = 0; i < rig.coat.length; i++) {
        const grp = rig.coat[i].g;
        strip(grp, keep);
        grp.add(taper(w[i] * S, w[i] * 0.86 * S, h[i] * S, 0.085 * S, m.cloth,
          0, -h[i] * S / 2, -0.01 * S));
        for (const side of [-1, 1]) {
          const f = taper(w[i] * 0.44 * S, w[i] * 0.30 * S, h[i] * 0.94 * S, 0.07 * S, m.cloth,
            side * w[i] * 0.47 * S, -h[i] * 0.48 * S, 0.012 * S);
          f.rotation.y = side * 0.55;
          f.rotation.z = side * -0.06;
          grp.add(f);
        }
        if (i === rig.coat.length - 1) {
          grp.add(chip(w[i] * 0.98 * S, 0.022 * S, 0.09 * S, m.trim, 0, -h[i] * S + 0.012 * S, -0.01 * S, 0.3));
        }
      }
      rig.coatState = rig.coat.map(() => ({ x: 0, z: 0, vx: 0, vz: 0 }));
      rig.coatPrev = new THREE.Vector3();
      rig.root.getWorldPosition(rig.coatPrev);
      rig.coatHas = true;
    }

    /* --- back unit ------------------------------------------------------ */
    if (cfg.pauldron || cfg.face) {
      const pack = new THREE.Group();
      pack.position.set(0, 0.36 * S, -0.17 * S);
      pack.add(soft(0.30 * S, 0.28 * S, 0.10 * S, m.armor, 0, 0, 0, 0.4));
      pack.add(chip(0.34 * S, 0.045 * S, 0.12 * S, m.dark, 0, 0.15 * S, 0, 0.4));
      const cores = [];
      for (const side of [-1, 1]) {
        const nz = new THREE.Group();
        nz.position.set(side * 0.115 * S, -0.02 * S, -0.055 * S);
        nz.add(lathe([
          [0.030 * S, 0.06 * S], [0.048 * S, 0.0], [0.052 * S, -0.05 * S], [0.038 * S, -0.075 * S]
        ], m.dark, { rot: [Math.PI / 2, 0, 0] }));
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.030 * S, 0.038 * S, 0.035 * S, 8),
          new THREE.MeshBasicMaterial({
            color: cfg.trim, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          }));
        core.rotation.x = Math.PI / 2;
        core.position.z = -0.075 * S;
        nz.add(core);
        pack.add(nz);
        cores.push(core);
      }
      j.chest.add(pack);
      rig.ventPack = pack;
      rig.ventCores = cores;
    }

    /* --- rank chevrons -------------------------------------------------
       Coloured by tier, so in a crowd of nine you can see which two are the
       Brutes before they wind up. Built here rather than in a later hook so
       they merge with the rest of the trim instead of costing a draw call
       each. */
    if (rig.__tier > 0 && j.chest) {
      for (let i = 0; i < Math.min(4, rig.__tier); i++) {
        j.chest.add(chip((0.16 - i * 0.018) * S, 0.020 * S, 0.026 * S, m.trim,
          0, (0.52 - i * 0.042) * S, 0.152 * S, 0.3));
      }
    }

    /* 60-upgrade.js adds its own fingers, boot caps and chest vents on the
       rig's first update, positioned for the old boxy proportions — on top of
       the hands, boots and back unit built above. It skips any part already
       flagged `detailed`, so flagging them here suppresses the duplicate
       geometry while still letting that pass set `_detailed`, which is what
       80-perf's merge is gated on. Clearing the flag instead would cost the
       merge and every draw call it saves. */
    for (const arm of [rig.armL, rig.armR]) if (arm && arm.hand) arm.hand.userData.detailed = true;
    for (const leg of [rig.legL, rig.legR]) if (leg && leg.ft) leg.ft.userData.detailed = true;
    if (j.chest) j.chest.userData.detailed = true;

    Sculpt.built++;
  }

  /* ======================================================================
     INSTALL
     ====================================================================== */
  step('sculpt', () => {
    // Faces are opt-in per rig. The four humanoids that should have one get
    // it; every hostile keeps a helmet, which is also a readability rule —
    // if it has a face, it is not something you hit.
    const faceCfg = (rig, opts) => {
      if (!rig || !rig.cfg) return rig;
      Object.assign(rig.cfg, opts);
      rig.faceSkin = rig.faceSkin || new THREE.MeshStandardMaterial({
        color: opts.skin || '#e8b988', roughness: 0.72, metalness: 0.02
      });
      rig.faceHair = rig.faceHair || new THREE.MeshStandardMaterial({
        color: opts.hairDark || '#3d2113', roughness: 0.62, metalness: 0.04
      });
      rig.faceHairLit = rig.faceHairLit || new THREE.MeshStandardMaterial({
        color: opts.hairLit || '#6b3a1c', roughness: 0.6, metalness: 0.05
      });
      rig.faceMask = rig.faceMask || new THREE.MeshStandardMaterial({
        color: opts.maskColor || '#aab6c6', roughness: 0.6, metalness: 0.12
      });
      rig.faceMouth = rig.faceMouth || new THREE.MeshStandardMaterial({
        color: '#2e1a18', roughness: 0.85, metalness: 0
      });
      // makeHexis builds its own face materials and stores them here. The
      // strip removes the plates that used them, so re-point the record at
      // the materials the sculpt actually uses — 345-texture dresses whatever
      // is in this object.
      rig.faceParts = { skin: rig.faceSkin, hairDark: rig.faceHair, hairLit: rig.faceHairLit, maskMat: rig.faceMask };
      return rig;
    };
    Sculpt.faceCfg = faceCfg;

    // The player rig is built before this module loads.
    if (g.rig) faceCfg(g.rig, { face: true, mask: false, eye: '#5FE3FF' });

    // Anything built later goes through the same door.
    const baseMentor = typeof makeMentor === 'function' ? makeMentor : null;
    if (baseMentor) {
      makeMentor = function () {
        return faceCfg(baseMentor(), { face: true, hair: true, eye: '#bfefff', skin: '#c9a07a', hairDark: '#20242c' });
      };
    }
    const baseCiv = typeof makeCivilian === 'function' ? makeCivilian : null;
    if (baseCiv) {
      makeCivilian = function (o) {
        const r = baseCiv(o);
        return faceCfg(r, {
          face: true, hair: true, jacket: true,
          skin: RND.pick(['#e8b988', '#c98a5e', '#8d5a3b', '#f0cba6', '#6b4229']),
          hairDark: RND.pick(['#241812', '#3d2113', '#141414', '#5a4630'])
        });
      };
    }

    Hook.before(BipedRig.prototype, 'update', function () {
      if (this.__sculpted || !Sculpt.enabled) return;
      this.__sculpted = true;
      this.__m3 = true;              // supersedes the 3.0 plating pass
      try { sculpt(this); } catch (e) { console.error('[model] sculpt', e); }
    }, 'model31:sculpt');
  });

  /* --- the coat solve -----------------------------------------------------
     The base swing is driven by raw speed: `drive = sp * 0.055`. Speed has no
     direction, so the coat trails backwards whether you are running forward,
     backpedalling or strafing — and 3.0 made backpedalling the default
     movement mode, which makes that wrong most of the time.

     Two-axis spring off velocity resolved into the rig's own frame, with
     stiffness falling down the chain so the tail keeps moving after the top
     has settled. That difference is cloth versus a hinged board. */
  step('coat', () => {
    const world = new THREE.Vector3();
    Hook.after(BipedRig.prototype, 'update', function (r, dt, s) {
      if (!this.coatHas || !this.coat || !this.coatState) return;
      const d = clamp(dt || 0.016, 1 / 240, 0.1);
      this.root.getWorldPosition(world);

      const cam = g.camera ? g.camera.position : null;
      if (cam && world.distanceToSquared(cam) > Sculpt.coatFar) {
        this.coatPrev.copy(world);
        for (const st of this.coatState) {
          st.x = damp(st.x, 0.12, 4, d); st.z = damp(st.z, 0, 4, d);
          st.vx = st.vz = 0;
        }
        this.applyCoat();
        return;
      }

      const vx = (world.x - this.coatPrev.x) / d;
      const vz = (world.z - this.coatPrev.z) / d;
      this.coatPrev.copy(world);
      const yaw = this.root.rotation.y;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const fwd = clamp((vx * sy + vz * cy) * 0.040, -1.4, 1.4);
      const side = clamp((vx * cy - vz * sy) * 0.034, -1.1, 1.1);
      const st0 = s || {};
      const air = st0.grounded === false ? clamp(-(st0.velY || 0) * 0.028, 0, 0.5) : 0;
      const dash = st0.dashing ? 0.85 : 0;
      const climb = st0.climbing ? 0.4 : 0;
      const stride = Math.sin(this.phase * 1.4) * 0.045;

      for (let i = 0; i < this.coatState.length; i++) {
        const st = this.coatState[i];
        const k = 1 - i * 0.20;
        const restX = 0.12 + fwd * 0.62 * k + air * k + dash * k + climb * k + stride * (1 - k);
        const restZ = -side * 0.55 * k;
        const stiff = 96 - i * 24, damping = 12.5 - i * 1.8;
        st.vx += (restX - st.x) * stiff * d;
        st.vz += (restZ - st.z) * stiff * d;
        st.vx -= st.vx * damping * d;
        st.vz -= st.vz * damping * d;
        st.x = clamp(st.x + st.vx * d, -0.55, 1.6);
        st.z = clamp(st.z + st.vz * d, -0.85, 0.85);
      }
      this.applyCoat();
    }, 'model31:coat');

    BipedRig.prototype.applyCoat = function () {
      for (let i = 0; i < this.coat.length; i++) {
        const grp = this.coat[i].g, st = this.coatState[i];
        grp.rotation.x = st.x;
        grp.rotation.z = st.z;
        this.coat[i].v = 0;
      }
    };
  });

  /* --- vents, eyes and fingers ------------------------------------------ */
  step('anim', () => {
    Hook.after(BipedRig.prototype, 'update', function (r, dt, s) {
      const d = dt || 0.016;
      const st = s || {};
      if (this.ventCores) {
        const hot = (st.dashing ? 1 : 0) + clamp((st.speed || 0) / 18, 0, 0.7);
        this.ventHeat = damp(this.ventHeat || 0, hot, 9, d);
        const k = 0.35 + this.ventHeat * 0.9;
        for (const c of this.ventCores) {
          c.material.opacity = clamp(k, 0, 1);
          c.scale.set(1 + this.ventHeat * 0.9, 1, 1 + this.ventHeat * 0.9);
        }
        if (this.ventPack) this.ventPack.position.z = (-0.17 - this.ventHeat * 0.02) * this.S;
      }
      // A blink. Two frames every few seconds, and its absence is the reason
      // a stylised face reads as a mannequin.
      if (this.eyes && this.eyes.length) {
        this.blinkT = (this.blinkT === undefined ? Math.random() * 4 : this.blinkT) - d;
        if (this.blinkT <= 0) {
          this.blinkT = 2.4 + Math.random() * 4.5;
          this.blinkK = 1;
        }
        this.blinkK = Math.max(0, (this.blinkK || 0) - d * 9);
        const open = 1 - Math.sin(clamp(this.blinkK, 0, 1) * Math.PI);
        for (const e of this.eyes) e.scale.y = Math.max(0.05, open);
      }
      // Fists close on a punch.
      const punchAmt = st.punch >= 0 ? clamp(st.punch / 0.48, 0, 1) : 0;
      if (this.armR && this.armR.fingers) this.armR.fingers.rotation.x = damp(this.armR.fingers.rotation.x, punchAmt * 1.0, 14, d);
      if (this.armL && this.armL.fingers) this.armL.fingers.rotation.x = damp(this.armL.fingers.rotation.x, punchAmt * 0.55, 12, d);
    }, 'model31:anim');

    let cool = 0;
    Hook.after(Game.prototype, 'updatePlayer', function (r, dt) {
      cool -= dt || 0.016;
      if (cool > 0) return;
      const rig = this.rig;
      if (!rig || !rig.ventCores || !(rig.ventHeat > 0.75)) return;
      cool = 0.045;
      const p = this.player.pos;
      FX.spark(p.clone().add(V3(rand(-0.3, 0.3), 1.25, rand(-0.3, 0.3))),
        2, this.hurtT > 0 ? '#ff8a70' : '#5FE3FF', 2.4, 3, 0.35);
    }, 'model31:ventFx');
  });

  /* --- archetype tagging --------------------------------------------------
     Runs on the spawn event, which fires from the Foe constructor — before
     the rig's first update, and therefore before the sculpt reads it. */
  step('rank', () => {
    Bus.on('enemy:spawned', (e) => {
      if (!e || !e.rig || e.rig.__sculpted) return;
      const def = (typeof ENEMY_DEFS !== 'undefined' && ENEMY_DEFS[e.kind]) || null;
      e.rig.__tier = def ? def.tier : (e.enf ? 2 : 1);
      e.rig.cfg.heavy = !!def && (def.tier >= 4 || e.kind === 'warden');
      // Brute, Warden and Stalker were designed around a duster; everything
      // else gets the jacket shell.
      if (e.kind === 'brute' || e.kind === 'warden' || e.kind === 'stalker') e.rig.cfg.jacket = false;
    });
    Hook.before(Enemy.prototype, 'update', function () {
      if (this.rig && this.rig.__tier === undefined) this.rig.__tier = this.enf ? 2 : 1;
    }, 'model31:tagBase');
  });

  /* --- Hexis specifics ---------------------------------------------------- */
  step('hexis', () => {
    Hook.after(Game.prototype, 'updatePlayer', function () {
      const rig = this.rig;
      if (!rig) return;
      if (rig.hex) {
        const chargeK = clamp(this.energy / Math.max(1, this.stats.maxEnergy), 0, 1);
        rig.hex.scale.setScalar(0.9 + chargeK * 0.35 + (this.abil.charging ? this.abil.charge * 0.7 : 0));
      }
      if (rig.eyeIris) {
        // The eyes carry the state the HUD also carries, so you can read your
        // own character without looking at the corner of the screen.
        const hurt = this.hurtT > 0;
        const charging = this.abil.charging;
        rig.eyeIris.color.set(hurt ? '#ff7a5a' : charging ? '#ffffff' : (this.blackout ? '#9fdcff' : '#5FE3FF'));
      }
    }, 'model31:hexisCore');
  });

  step('report', () => {
    CLOCK.in(6, () => {
      const info = g.renderer && g.renderer.info;
      let tris = 0;
      if (g.rig && g.rig.root) g.rig.root.traverse(o => {
        if (o.isMesh && o.geometry && o.geometry.attributes.position)
          tris += o.geometry.attributes.position.count / 3;
      });
      console.log('[hexis 3.1] model: ' + Sculpt.built + ' rigs sculpted, player ' +
        Math.round(tris) + ' tris' +
        (info ? ', ' + info.render.calls + ' draw calls / ' +
          (info.render.triangles / 1000).toFixed(0) + 'k tris this frame' : ''));
    });
  });

  console.log('[hexis 3.1] model online:', done.join(', '));
})();
