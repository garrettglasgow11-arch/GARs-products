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
  /* Per-archetype gear hooks. 355-silhouette.js registers into this; the
     sculpt calls them last so they can measure the body they attach to. */
  gear: [],
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
  // Faces are looked at from a metre away; knees are not.
  get faceSeg() { return Input.touch ? 10 : 16; },
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
  /* `seg` overrides the global segment count. Faces get a finer sphere than
     knees do: at conversation range a 10-segment ball reads as a faceted
     lump stuck to the head, and the whole face becomes a pile of pebbles.
     They merge into one buffer per material anyway, so the cost is a few
     hundred triangles on the handful of rigs that actually have a face. */
  function ball(r, mat, y = 0, squash = 1, seg) {
    const g2 = seg || Sculpt.seg;
    const geo = new THREE.SphereGeometry(r, g2, seg ? Math.round(g2 * 0.55) : Sculpt.ring);
    if (squash !== 1) geo.scale(1, 1, squash);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    return m;
  }

  /* A soft box: the rounded-box primitive the base already has, but with a
     heavier bevel so it sits next to revolved parts without looking like it
     came from a different game. */
  /* A two-sided view of a material, cached per material.

     Partial lathes — an open jacket, a collar, a hood — need DoubleSide or
     they vanish from the inside. Every version before this set `.side` on the
     material the mesh was handed, which is the rig's SHARED m.cloth or
     m.dark: one open jacket turned every cloth and dark surface on the whole
     character two-sided, so the lit interiors of the torso, the sleeves and
     the neck hole all rendered through the front and read as blown-out white
     panels stuck to the chest. Clone once, key off the original, and the
     merge still only sees two materials instead of twenty. */
  const TWO = new WeakMap();
  function twoSided(mat) {
    let c = TWO.get(mat);
    if (!c) { c = mat.clone(); c.side = THREE.DoubleSide; TWO.set(mat, c); }
    return c;
  }
  Sculpt.twoSided = twoSided;

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

  /* ======================================================================
     BUILD PROFILES

     The reason a Grunt, an Enforcer, a Warden and a Brute all looked like the
     same person in different colours is that they WERE the same person in
     different colours: one set of hard-coded radii, one head size, one stance.
     Recolouring is not a silhouette.

     So every dimension the body is made from is a multiplier now, and each
     archetype gets a profile. These are the numbers that decide whether you
     can tell what is about to hit you from thirty metres, which is the actual
     job of an enemy design.

       size      overall height
       shoulder  deltoid line width — the single strongest read there is
       chest     ribcage depth and width
       waist     the other half of the V
       arm/leg   limb thickness
       head      skull size against the body (small head = big body)
       neck      length; none at all reads as brutish
       stance    hip height — a crouch changes a silhouette more than armour
       hunch     forward chest lean
       ape       arm length, for anything that should look wrong
     ====================================================================== */
  const BUILDS = {
    hero:    { size: 1.00, shoulder: 1.00, chest: 1.00, waist: 1.00, arm: 1.00, leg: 1.00, head: 1.00, neck: 1.00, stance: 1.00, hunch: 0.00, ape: 1.00 },
    // Grunt: the baseline everything else is read against.
    soldier: { size: 0.98, shoulder: 1.02, chest: 1.00, waist: 1.06, arm: 1.02, leg: 0.98, head: 0.96, neck: 0.95, stance: 0.99, hunch: 0.04, ape: 1.00 },
    // Enforcer: armoured, upright, thick through the chest.
    heavy:   { size: 1.10, shoulder: 1.26, chest: 1.18, waist: 1.10, arm: 1.20, leg: 1.12, head: 0.88, neck: 0.70, stance: 0.97, hunch: 0.06, ape: 1.00 },
    // Warden: wide and low. A wall with legs.
    tank:    { size: 1.06, shoulder: 1.42, chest: 1.30, waist: 1.24, arm: 1.26, leg: 1.16, head: 0.80, neck: 0.45, stance: 0.90, hunch: 0.10, ape: 0.96 },
    // Brute: hunched, long-armed, almost no neck, small head. Wrong on purpose.
    titan:   { size: 1.34, shoulder: 1.58, chest: 1.34, waist: 1.10, arm: 1.42, leg: 1.20, head: 0.70, neck: 0.28, stance: 0.86, hunch: 0.26, ape: 1.18 },
    // Swarmer: small, spindly, pitched forward.
    runner:  { size: 0.80, shoulder: 0.82, chest: 0.80, waist: 0.84, arm: 0.80, leg: 1.02, head: 1.08, neck: 1.10, stance: 0.94, hunch: 0.20, ape: 1.06 },
    // Lancer: tall, narrow, long limbs. A rifle on a stick.
    lean:    { size: 1.06, shoulder: 0.90, chest: 0.86, waist: 0.86, arm: 0.88, leg: 1.14, head: 0.94, neck: 1.20, stance: 1.04, hunch: -0.04, ape: 1.10 },
    // Stalker: thin, low, coiled.
    shade:   { size: 0.96, shoulder: 0.92, chest: 0.88, waist: 0.86, arm: 0.94, leg: 1.06, head: 0.92, neck: 1.05, stance: 0.92, hunch: 0.16, ape: 1.08 },
    // Rex: ordinary man, carried well.
    mentor:  { size: 1.02, shoulder: 1.06, chest: 1.04, waist: 1.02, arm: 1.00, leg: 1.00, head: 0.96, neck: 1.00, stance: 1.00, hunch: 0.02, ape: 1.00 },
    // Kell: seven feet of him.
    kell:    { size: 1.30, shoulder: 1.48, chest: 1.28, waist: 1.08, arm: 1.30, leg: 1.22, head: 0.86, neck: 0.55, stance: 1.02, hunch: 0.08, ape: 1.06 },
    civ:     { size: 0.96, shoulder: 0.92, chest: 0.94, waist: 1.00, arm: 0.92, leg: 0.98, head: 1.02, neck: 1.00, stance: 1.00, hunch: 0.04, ape: 1.00 }
  };
  Sculpt.BUILDS = BUILDS;

  function sculpt(rig) {
    const S0 = rig.S, m = rig.mats, cfg = rig.cfg, j = rig.j;
    const keep = protectedSet(rig);
    const face = !!cfg.face;
    const B = BUILDS[cfg.build] || BUILDS[cfg.heavy ? 'heavy' : 'hero'];
    rig.__build = B;
    // Overall size rides on the rig's own scale so a cfg.scale of 1.3 and a
    // build size of 1.3 compose rather than fight.
    const S = S0 * B.size;
    rig.__S = S;

    /* --- pelvis ------------------------------------------------------- */
    strip(j.hips, keep);
    j.hips.position.y = 0.92 * S0 * B.size * B.stance;
    const wR = 0.162 * S * B.waist;
    j.hips.add(lathe([
      [wR * 0.67, -0.16 * S], [wR * 0.93, -0.10 * S], [wR, 0.0],
      [wR * 0.93, 0.06 * S], [wR * 0.77, 0.10 * S]
    ], m.dark, { squash: 0.80 }));
    j.hips.add(lathe([
      [wR, 0.02 * S], [wR * 1.07, 0.05 * S], [wR * 1.07, 0.10 * S], [wR, 0.13 * S]
    ], m.armor, { squash: 0.82 }));
    j.hips.add(chip(0.09 * S, 0.068 * S, 0.045 * S, m.trim, 0, 0.075 * S, wR * 0.82, 0.3));

    /* --- layering rails --------------------------------------------------
       Two rules, and v4 broke both of them everywhere.

       1. Every coaxial shell in a stack shares ONE squash value. A chest at
          squash 0.72 and a jacket at 0.74 are 11mm apart at the front and 4mm
          apart on the flanks — and they cross somewhere in between. That
          crossing is why the whole torso rendered as diagonal hatching.
       2. Clearances are ABSOLUTE, never a multiplier. `chR * 1.08` reads as
          "8% bigger" and lands as 4mm on a 0.2 radius, which is inside the
          depth buffer's ability to tell them apart at arm's length.

       So: one squash per family, and a garment clears the body by CLOTH, a
       plate clears the garment by PLATE, trim clears the plate by TRIM. If a
       part cannot afford its clearance, it belongs in the profile underneath
       rather than as another shell on top. That collapsed the upper arm from
       four coaxial surfaces to one.                                          */
    const SQT = 0.82;                  // torso family
    const SQA = 0.93;                  // arm family
    const SQL = 0.90;                  // leg family
    const CLOTH = 0.021 * S;           // garment over body
    const PLATE = 0.016 * S;           // armour over garment
    const TRIM = 0.010 * S;            // trim over armour
    // Same profile, pushed out along its own radius. Cheaper to read than
    // writing every number twice, and it cannot drift.
    const grow = (p, d) => p.map(([r, y]) => [r + d, y]);
    // The torso is the largest revolved surface on the character and the one
    // the key light lands flat on. At the shared segment count it reads as a
    // folded plank; four more sides costs ~90 triangles and fixes it.
    const TSEG = Sculpt.seg + (Input.touch ? 2 : 5);
    // Limbs are smaller but there are eight of them and they are all cylinders
    // pointed at the key light. Three extra sides each.
    const LSEG = Sculpt.seg + (Input.touch ? 1 : 3);

    /* --- torso -------------------------------------------------------- */
    strip(j.chest, keep);
    j.chest.rotation.x = B.hunch * 0.5;
    const shR = 0.210 * S * B.shoulder;
    const chR = 0.194 * S * B.chest;
    const wsR = 0.124 * S * B.waist;
    const nkR = 0.060 * S * (0.72 + B.neck * 0.28);

    /* One surface from waist to trapezius. The pectoral shelf and the rib
       taper are bends in this profile, not shells bolted over it. The V comes
       from the RATIO of waist to shoulder; widening the shoulder alone just
       gives a barrel. The last two points roll the neck hole inward and back
       down, so no angle can see the inside of the chest — which, with an
       open-front jacket and an open-top collar, every angle could. */
    const TORSO = [
      [wsR * 0.96, -0.02 * S],
      [wsR * 1.00, 0.04 * S],
      [wsR * 1.13, 0.15 * S],
      [chR * 0.94, 0.26 * S],
      [chR * 1.00, 0.355 * S],
      [chR * 0.98, 0.445 * S],
      [shR, 0.530 * S],
      [shR * 0.74, 0.608 * S],
      [nkR * 1.28, 0.660 * S],
      [nkR * 0.90, 0.666 * S],
      [nkR * 0.84, 0.638 * S]
    ];
    j.chest.add(lathe(TORSO, m.suit, { squash: SQT, seg: TSEG }));

    /* --- the jacket ---------------------------------------------------- */
    const jacket = cfg.jacket !== false;
    const open = 0.40;
    const jkR = (y) => {                              // jacket radius at height
      for (let i = 1; i < 8; i++) {
        const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
        if (y <= y1 || i === 7) {
          const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0 || 1)));
          return r0 + (r1 - r0) * t + CLOTH;
        }
      }
      return chR + CLOTH;
    };
    if (jacket) {
      const JK = grow(TORSO.slice(0, 8), CLOTH);
      JK.unshift([wsR * 1.02 + CLOTH, -0.13 * S]);     // a hem below the belt
      const jk = lathe(JK, m.cloth, {
        squash: SQT, seg: TSEG, phiStart: open / 2, phiLength: Math.PI * 2 - open
      });
      jk.material = twoSided(m.cloth);
      j.chest.add(jk);

      /* Lapels: partial lathes riding the jacket's own curve, one clearance
         out. v4 used flat boxes, which cut through the jacket at the sides
         and read as two white planks nailed to the chest. */
      for (const side of [-1, 1]) {
        const lp = lathe([
          [jkR(0.30 * S) + TRIM * 0.9, 0.300 * S],
          [jkR(0.40 * S) + TRIM * 1.4, 0.400 * S],
          [jkR(0.49 * S) + TRIM * 1.5, 0.490 * S],
          [jkR(0.56 * S) + TRIM * 1.0, 0.562 * S]
        ], m.dark, {
          squash: SQT,
          phiStart: side > 0 ? open / 2 - 0.02 : -open / 2 - 0.28,
          phiLength: 0.30
        });
        lp.material = twoSided(m.dark);
        j.chest.add(lp);
      }

      /* Collar: rises, then folds back down. The fold is what closes the rim
         — an open-top lathe let you look straight down the neck. */
      const cR = nkR * 1.30 + CLOTH;
      const col = lathe([
        [cR * 0.98, 0.590 * S], [cR * 1.06, 0.652 * S], [cR * 1.02, 0.702 * S],
        [cR * 0.90, 0.696 * S], [cR * 0.94, 0.604 * S]
      ], m.cloth, {
        squash: 0.90, phiStart: open / 2 + 0.16, phiLength: Math.PI * 2 - open - 0.32
      });
      col.material = twoSided(m.cloth);
      j.chest.add(col);

      // Zip: sits in the OPENING, on the shirt, so it never touches the
      // jacket surface at all.
      j.chest.add(chip(0.011 * S, 0.46 * S, 0.018 * S, m.armor,
        0, 0.28 * S, (chR + 0.004 * S) * SQT, 0.3));
      for (const side of [-1, 1]) {
        const pk = chip(0.070 * S, 0.052 * S, 0.026 * S, m.armor,
          side * 0.105 * S, 0.135 * S, jkR(0.135 * S) * SQT + 0.004 * S, 0.3);
        pk.rotation.y = side * -0.30;
        j.chest.add(pk);
      }
    }

    // Collarbones: on the garment, one clearance out, and short enough to
    // stay off the deltoid line.
    for (const side of [-1, 1]) {
      const cb = chip(shR * 0.50, 0.020 * S, 0.040 * S, m.armor,
        side * shR * 0.40, 0.548 * S,
        (jacket ? jkR(0.548 * S) : shR * 0.72) * SQT * 0.62 + PLATE, 0.35);
      cb.rotation.z = side * -0.12;
      cb.rotation.y = side * -0.18;
      j.chest.add(cb);
    }

    if (rig.hex && rig.hex.parent && !rig.hex.__resized) {
      rig.hex.__resized = true;
      rig.hex.geometry.dispose();
      rig.hex.geometry = new THREE.CylinderGeometry(0.062 * S, 0.062 * S, 0.030 * S, 6);
      rig.hex.position.set(0, 0.42 * S, (chR + 0.006 * S) * SQT + 0.010 * S);
    }

    if (rig.__tier > 0 && j.chest) {
      const cz = (jacket ? jkR(0.50 * S) : chR) * SQT;
      for (let i = 0; i < Math.min(4, rig.__tier); i++) {
        const cv = chip((0.13 - i * 0.016) * S, 0.017 * S, 0.022 * S, m.trim,
          0, (0.500 - i * 0.036) * S, cz * 0.80 + PLATE, 0.3);
        cv.rotation.x = -0.20;
        j.chest.add(cv);
      }
    }

    /* --- neck and head -------------------------------------------------- */
    strip(j.head, keep);
    j.head.position.y = 0.665 * S;
    /* Head scale. v4 ran at 1.30 and every character was a bobblehead: the
       skull alone was a fifth of standing height before the hair went on.
       1.12 lands around 1/6.4 with hair, which is the stylised-but-not-silly
       band Fortnite sits in. */
    const H = 1.12 * B.head;
    const nR = nkR;
    j.head.add(lathe([
      [nR * 0.96, -0.055 * S], [nR * 1.06, 0.010 * S],
      [nR * 1.02, 0.062 * S], [nR * 0.92, 0.090 * S]
    ], m.dark, { squash: 0.90 }));

    /* Skull profile, kept on the rig so the face can ask how wide the head is
       at a given height. v4 placed every feature at the head's EQUATOR radius
       regardless of height, so the eyes and mouth floated in front of the
       face on a flat plane and shimmered against it. */
    const SKULL = [
      [0.0001, -0.128 * S * H],
      [0.058 * S * H, -0.112 * S * H],
      [0.092 * S * H, -0.058 * S * H],
      [0.106 * S * H, 0.0],
      [0.110 * S * H, 0.050 * S * H],
      [0.101 * S * H, 0.098 * S * H],
      [0.072 * S * H, 0.138 * S * H],
      [0.0001, 0.156 * S * H]
    ];
    const skull = lathe(SKULL, face ? (rig.faceSkin || m.dark) : m.dark, { squash: 0.96 });
    const SKY = 0.150 * S;
    skull.position.y = SKY;
    skull.scale.z = 1.07;
    j.head.add(skull);
    rig.skull = skull;
    rig.__skull = { p: SKULL, y: SKY, sx: 1, sz: 1.07 * 0.96 };

    if (face) buildFace(rig, j, m, S, H, cfg);
    else buildHelmet(rig, j, m, S, H, cfg);

    if (cfg.hood) {
      const hood = lathe([
        [0.118 * S * H + CLOTH, SKY - 0.05 * S], [0.150 * S * H + CLOTH, SKY + 0.05 * S],
        [0.150 * S * H + CLOTH, SKY + 0.13 * S], [0.100 * S * H + CLOTH, SKY + 0.20 * S]
      ], m.cloth, { squash: 1.04, phiStart: 0.55, phiLength: Math.PI * 2 - 1.1 });
      hood.material = twoSided(m.cloth);
      j.head.add(hood);
    }
    if (cfg.crest) {
      j.head.add(taper(0.045 * S, 0.010 * S, 0.20 * S, 0.085 * S, m.trim,
        0, SKY + 0.14 * S, -0.03 * S));
    }

    /* --- arms ---------------------------------------------------------- */
    for (const side of [-1, 1]) {
      const arm = side < 0 ? rig.armL : rig.armR;
      if (!arm) continue;
      strip(arm.sh, keep);
      strip(arm.el, keep);
      if (arm.hand) strip(arm.hand, keep);

      arm.sh.position.set(side * 0.252 * S0 * B.shoulder * 0.92, 0.520 * S, 0);
      const upR = 0.073 * S * B.arm;
      const elR = 0.055 * S * B.arm;
      const wrR = 0.045 * S * B.arm;
      const upL = 0.290 * S * B.ape;
      const foL = 0.262 * S * B.ape;
      arm.el.position.y = -upL;

      /* ONE surface for the whole upper arm. The deltoid cap, the bicep and
         the taper into the elbow are bends in this profile. v4 stacked a
         sphere, a limb cylinder, a bicep lathe and a sleeve inside a 4mm
         band and they shredded each other. */
      const UP = [
        [0.0001, 0.098 * S],
        [upR * 0.94, 0.062 * S],
        [upR * 1.20, 0.010 * S],
        [upR * 1.14, -0.055 * S],
        [upR * 1.00, -upL * 0.44],
        [elR * 1.20, -upL * 0.78],
        [elR * 1.06, -upL],
        [elR * 0.92, -upL - 0.022 * S]
      ];
      arm.sh.add(lathe(UP, m.suit, { squash: SQA, seg: LSEG }));

      if (jacket) {
        // Sleeve: the same surface a clothing-thickness out, stopping short
        // of the elbow so the cuff edge reads as a hem.
        const SL = grow(UP.slice(1, 6), CLOTH);
        SL.push([elR * 1.20 + CLOTH * 0.7, -upL * 0.80]);
        SL.push([elR * 1.14 + CLOTH * 0.2, -upL * 0.82]);
        arm.sh.add(lathe(SL, m.cloth, { squash: SQA, seg: LSEG }));
      }
      if (cfg.pauldron) {
        /* A cap that sits ON the shoulder, not a wing off it. v4 ran to
           1.95x the arm radius, which put the outer edge nearly twice the
           torso's own half-width out on each side. */
        const base = (jacket ? upR * 1.20 + CLOTH : upR * 1.20);
        const pd = lathe([
          [base * 0.42, 0.118 * S],
          [base * 1.02 + PLATE, 0.062 * S],
          [base * 1.16 + PLATE, -0.014 * S],
          [base * 1.10 + PLATE, -0.086 * S],
          [base * 0.96 + PLATE, -0.098 * S]
        ], m.armor, { squash: 0.90, seg: LSEG });
        arm.sh.add(pd);
        arm.sh.add(chip(0.030 * S, 0.011 * S, 0.10 * S, m.trim,
          side * base * 0.86, 0.060 * S, 0, 0.35));
      }

      /* Forearm, elbow included in the profile, and a gaunttlet over the
         lower half at one plate clearance. */
      const FO = [
        [0.0001, 0.070 * S],
        [elR * 1.08, 0.030 * S],
        [elR * 1.14, -0.022 * S],
        [elR * 1.00, -foL * 0.38],
        [wrR * 1.12, -foL * 0.78],
        [wrR, -foL],
        [wrR * 0.86, -foL - 0.016 * S]
      ];
      arm.el.add(lathe(FO, m.suit, { squash: SQA, seg: LSEG }));
      arm.el.add(lathe(grow(FO.slice(3, 6), PLATE), m.armor, { squash: SQA, seg: LSEG }));
      for (let i = 0; i < 3; i++) {
        arm.el.add(chip(0.009 * S, 0.009 * S, 0.018 * S, m.trim,
          (-0.017 + i * 0.017) * S, -foL * 0.70,
          (wrR + PLATE) * SQA + 0.006 * S, 0.3));
      }

      if (arm.hand) {
        arm.hand.position.y = -foL - 0.018 * S;
        buildHand(rig, arm, side, m, S * (0.94 + B.arm * 0.06));
      }
    }

    /* --- legs ---------------------------------------------------------- */
    for (const side of [-1, 1]) {
      const leg = side < 0 ? rig.legL : rig.legR;
      if (!leg) continue;
      strip(leg.hip, keep);
      strip(leg.kn, keep);
      strip(leg.ft, keep);

      leg.hip.position.set(side * 0.118 * S0 * B.waist, -0.06 * S, 0);
      const thR = 0.096 * S * B.leg;
      const knR = 0.070 * S * B.leg;
      const anR = 0.052 * S * B.leg;
      const thL = 0.43 * S, cfL = 0.39 * S;
      leg.kn.position.y = -thL;
      leg.ft.position.y = -cfL;

      const TH = [
        [0.0001, 0.108 * S],
        [thR * 0.96, 0.070 * S],
        [thR * 1.14, 0.010 * S],
        [thR * 1.06, -thL * 0.34],
        [knR * 1.22, -thL * 0.80],
        [knR * 1.06, -thL],
        [knR * 0.94, -thL - 0.02 * S]
      ];
      leg.hip.add(lathe(TH, m.suit, { squash: SQL, seg: LSEG }));
      // Outseam, in the gap between thigh and any plate: a dark line that
      // gives the leg a front and a side.
      leg.hip.add(chip(0.010 * S, 0.34 * S, 0.010 * S, m.dark,
        side * (thR * 1.06 + 0.004 * S), -thL * 0.42, 0.02 * S, 0.3));

      /* Calf lives in the shin profile as a back-heavy bulge rather than a
         separate blob hung off the rear. */
      const CF = [
        [0.0001, 0.076 * S],
        [knR * 1.10, 0.036 * S],
        [knR * 1.16, -0.020 * S],
        [knR * 1.06, -cfL * 0.30],
        [anR * 1.30, -cfL * 0.66],
        [anR * 1.04, -cfL],
        [anR * 0.90, -cfL - 0.018 * S]
      ];
      leg.kn.add(lathe(CF, m.suit, { squash: SQL, seg: LSEG }));
      leg.kn.add(lathe([
        [knR * 0.80, -cfL * 0.16], [knR * 1.02, -cfL * 0.36], [knR * 0.72, -cfL * 0.60]
      ], m.suit, { squash: 0.70, pos: [0, 0, -knR * 0.42] }));
      // Kneepad: one plate clearance over the knee bend of the shin.
      leg.kn.add(lathe(grow(CF.slice(1, 4), PLATE), m.armor, { squash: SQL, seg: LSEG }));

      buildBoot(leg.ft, m, S * (0.94 + B.leg * 0.06));
    }

    /* --- long coat ------------------------------------------------------ */
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
        for (const sd of [-1, 1]) {
          const f = taper(w[i] * 0.44 * S, w[i] * 0.30 * S, h[i] * 0.94 * S, 0.07 * S, m.cloth,
            sd * w[i] * 0.47 * S, -h[i] * 0.48 * S, 0.012 * S);
          f.rotation.y = sd * 0.55;
          f.rotation.z = sd * -0.06;
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
      pack.position.set(0, 0.36 * S, -chR * 0.82);
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

    /* Per-archetype gear runs last, so it can measure the body it is going
       onto. 355-silhouette.js registers into this. */
    for (const fn of Sculpt.gear) {
      try { fn(rig, { S, B, m, j, cfg, keep, lathe, ball, soft, chip, limbGeo, taper, plate }); }
      catch (e) { console.error('[model] gear', e); }
    }

    for (const arm of [rig.armL, rig.armR]) if (arm && arm.hand) arm.hand.userData.detailed = true;
    for (const leg of [rig.legL, rig.legR]) if (leg && leg.ft) leg.ft.userData.detailed = true;
    if (j.chest) j.chest.userData.detailed = true;

    Sculpt.built++;
  }

  /* --- the face --------------------------------------------------------- */
  /* --- the face ---------------------------------------------------------
     Every feature is placed against the skull's ACTUAL surface at its own
     height, read back out of the profile the head was lathed from. v4 used
     the equator radius for everything, so the eyes, brows and mouth all sat
     on one flat plane hanging in front of a round head — which is why the
     face shimmered and read as a mask rather than a face. */
  function buildFace(rig, j, m, S, H, cfg) {
    const skin = rig.faceSkin || m.dark;
    const SK = rig.__skull;

    // Skull half-width at a world-local height y, in x and in z.
    function surf(y) {
      const yl = (y - SK.y);
      const p = SK.p;
      if (yl <= p[0][1]) return 0;
      for (let i = 1; i < p.length; i++) {
        if (yl <= p[i][1]) {
          const t = (yl - p[i - 1][1]) / (p[i][1] - p[i - 1][1] || 1);
          return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
        }
      }
      return 0;
    }
    const sx = (y) => surf(y) * SK.sx;
    const sz = (y) => surf(y) * SK.sz;

    const U = S * H;                       // one head unit
    const browY = SK.y + 0.062 * U;
    const eyeY = SK.y + 0.036 * U;
    const noseY = SK.y - 0.004 * U;
    const mouthY = SK.y - 0.062 * U;
    const chinY = SK.y - 0.104 * U;

    /* Chin and jaw are MASS added to the lower skull, sharing its centre, so
       they blend instead of sitting on it. A taper laid across the jaw — what
       v4 did — flattens the whole lower face into a slab, because taper()
       scales its own bevel away along X. */
    const FS = Sculpt.faceSeg;
    const chin = ball(0.050 * U, skin, 0, 1, FS);
    chin.scale.set(0.96, 0.74, 0.92);
    chin.position.set(0, chinY + 0.014 * U, sz(chinY) * 0.26);
    j.head.add(chin);

    for (const side of [-1, 1]) {
      /* These are MASS, not features: each one has to sit far enough inside
         the skull that only a swell of it clears the surface. v6 pushed them
         out to 0.6 of the local half-width and every one read as a separate
         pebble glued to the face. */
      const jw = ball(0.056 * U, skin, 0, 1, FS);
      jw.scale.set(0.66, 0.80, 0.94);
      jw.position.set(side * sx(mouthY) * 0.44, mouthY - 0.012 * U, sz(mouthY) * 0.06);
      j.head.add(jw);

      const ck = ball(0.042 * U, skin, 0, 1, FS);
      ck.scale.set(0.94, 0.66, 0.72);
      ck.position.set(side * sx(eyeY) * 0.44, eyeY - 0.034 * U, sz(eyeY) * 0.44);
      j.head.add(ck);

      // Brow ridge: a swell over the eye, not a bar in front of it.
      const br = ball(0.048 * U, skin, 0, 1, FS);
      br.scale.set(0.98, 0.40, 0.60);
      br.position.set(side * sx(browY) * 0.34, browY - 0.004 * U, sz(browY) * 0.48);
      j.head.add(br);
    }

    // Nose: a bridge running down off the brow, then a tip.
    const bridge = ball(0.024 * U, skin, 0, 1, FS);
    bridge.scale.set(0.58, 2.05, 1.00);
    bridge.position.set(0, (browY + noseY) / 2, sz(noseY) * 0.74);
    j.head.add(bridge);
    const tip = ball(0.018 * U, skin, 0, 1, FS);
    tip.scale.set(1.14, 0.86, 1.08);
    tip.position.set(0, noseY - 0.008 * U, sz(noseY) * 0.86);
    j.head.add(tip);

    for (const side of [-1, 1]) {
      const ear = ball(0.032 * U, skin, 0, 1, FS);
      ear.scale.set(0.32, 1.18, 0.82);
      ear.position.set(side * sx(eyeY) * 0.94, eyeY - 0.014 * U, -0.012 * U);
      ear.rotation.z = side * -0.10;
      j.head.add(ear);
    }

    const white = rig.eyeWhite || (rig.eyeWhite = new THREE.MeshStandardMaterial({
      color: '#eef4fb', roughness: 0.22, metalness: 0
    }));
    const iris = rig.eyeIris || (rig.eyeIris = new THREE.MeshBasicMaterial({
      color: cfg.eye || cfg.trim || '#5FE3FF', fog: false
    }));
    const eyeR = 0.031 * U;
    const eyeX = sx(eyeY) * 0.50;
    // Set the ball INTO the head: only the front cap of it clears the skin.
    const eyeZ = sz(eyeY) * 0.80 - eyeR * 0.30;
    rig.eyes = [];
    rig.lids = [];
    for (const side of [-1, 1]) {
      const e = ball(eyeR, white, 0, 1, FS);
      e.scale.set(1.14, 0.84, 0.66);
      e.position.set(side * eyeX, eyeY, eyeZ);
      j.head.add(e);

      /* Iris as a shallow ball nested just proud of the white, not a flat
         disc floating at the equator. A disc on a sphere at 2mm is the single
         worst z-fight in the whole rig and it lands on the character's eyes. */
      const ir = ball(eyeR * 0.56, iris, 0, 1, FS);
      ir.scale.set(1.0, 1.0, 0.46);
      ir.position.set(side * eyeX, eyeY, eyeZ + eyeR * 0.62);
      j.head.add(ir);
      rig.eyes.push(ir);

      const lid = ball(eyeR * 1.06, skin, 0, 1, FS);
      lid.scale.set(1.20, 0.46, 0.80);
      lid.position.set(side * eyeX, eyeY + eyeR * 0.68, eyeZ - eyeR * 0.10);
      j.head.add(lid);
      rig.lids.push(lid);
    }

    rig.brows = [];
    for (const side of [-1, 1]) {
      const b2 = ball(0.030 * U, rig.faceHair || m.dark, 0, 1, FS);
      b2.scale.set(1.55, 0.34, 0.52);
      b2.position.set(side * eyeX, eyeY + eyeR * 1.28, sz(browY) * 0.80);
      b2.rotation.z = side * -0.16;
      j.head.add(b2);
      rig.brows.push(b2);
    }

    // Mouth: an upper and a lower lip with a line between them, laid on the
    // skull's surface at mouth height rather than at the equator.
    const lipMat = rig.faceLip || (rig.faceLip = new THREE.MeshStandardMaterial({
      color: cfg.lip || '#a3675c', roughness: 0.62, metalness: 0
    }));
    const mz = sz(mouthY) * 0.90;
    const upper = ball(0.021 * U, lipMat, 0, 1, FS);
    upper.scale.set(1.95, 0.38, 0.54);
    upper.position.set(0, mouthY + 0.008 * U, mz);
    j.head.add(upper);
    const lower = ball(0.020 * U, lipMat, 0, 1, FS);
    lower.scale.set(1.70, 0.44, 0.54);
    lower.position.set(0, mouthY - 0.008 * U, mz);
    j.head.add(lower);
    const line = ball(0.019 * U, rig.faceMouth || m.dark, 0, 1, FS);
    line.scale.set(2.05, 0.15, 0.44);
    line.position.set(0, mouthY, mz + 0.004 * U);
    j.head.add(line);

    if (cfg.mask) {
      const mask = lathe([
        [sx(mouthY - 0.03 * U) + 0.008 * U, mouthY - 0.034 * U],
        [sx(mouthY) + 0.010 * U, mouthY],
        [sx(noseY) + 0.008 * U, noseY + 0.014 * U]
      ], rig.faceMask || m.armor, { squash: SK.sz, phiStart: -0.66, phiLength: 1.32 });
      mask.material = twoSided(rig.faceMask || m.armor);
      j.head.add(mask);
    }

    if (cfg.hair !== false) buildHair(rig, j, m, S, H, cfg);
  }

  /* --- hair -------------------------------------------------------------
     A cap that clears the skull by a real thickness at every height, plus a
     fringe that HANGS. A taper is built along its own +Y, so a strand meant
     to fall over the brow has to be rotated most of the way over; a small
     negative tilt leaves it jutting forward like a visor. */
  function buildHair(rig, j, m, S, H, cfg) {
    const hairA = rig.faceHair || m.dark;
    const hairB = rig.faceHairLit || hairA;
    const SK = rig.__skull, U = S * H, T = 0.012 * U;
    const p = SK.p;
    const sq = SK.sz / SK.sx;
    // Skull half-width at a skull-local height.
    const r = (yl) => {
      for (let i = 1; i < p.length; i++)
        if (yl <= p[i][1]) {
          const t = (yl - p[i - 1][1]) / (p[i][1] - p[i - 1][1] || 1);
          return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
        }
      return 0.0001;
    };

    /* A hairline, which v5 did not have: the cap starts ABOVE the brow, so it
       cannot swallow the eyes. The previous cut started at the temple line and
       the whole upper face disappeared under it, with the brow and cheek
       masses poking back out through the fringe as pale hexagons. */
    const HL = 0.072 * U;                          // hairline height, skull-local
    const cap = [];
    for (let yl = HL; yl <= 0.140 * U; yl += 0.022 * U) cap.push([r(yl) + T, SK.y + yl]);
    cap.push([r(0.150 * U) * 0.55 + T, SK.y + 0.150 * U]);
    cap.push([0.0001, SK.y + 0.156 * U + T]);
    j.head.add(lathe(cap, hairA, { squash: sq }));

    /* The back and sides carry on down past the hairline — hair does not stop
       level all the way round. A partial lathe centred on -Z, so the face
       stays clear. */
    const back = [];
    for (let yl = -0.052 * U; yl <= HL + 0.004 * U; yl += 0.024 * U)
      back.push([r(yl) + T, SK.y + yl]);
    const bk = lathe(back, hairA, {
      squash: sq, phiStart: Math.PI - 1.30, phiLength: 2.60
    });
    bk.material = twoSided(hairA);
    j.head.add(bk);

    /* Fringe. A taper is built along its own +Y, so a strand that should fall
       over the brow has to be rotated most of the way over — anything short of
       ~2.8 rad leaves it jutting out of the crown like a horn, which is what
       v5 shipped. Everything here hangs from the hairline forward edge. */
    const topY = SK.y + HL, frontZ = r(HL) * SK.sz;
    const styles = {
      /* taper() is built ROOT-DOWN — it already hangs at zero rotation. Every
         version up to v8 pitched the fringe by ~2.9 rad "so it would hang",
         which flipped each strand up out of the crown; the character shipped
         with a mohawk of horns and a bald forehead for four rounds. Positive
         pitch swings the tip backwards, so a fringe leaning over the brow is
         a small NEGATIVE number. */
      // x, y-from-hairline, z-from-front, halfWidth, length, rollZ, pitchX, lit
      /* Strands are wider than their spacing on purpose: at 0.058 wide on a
         0.046 pitch they stood apart as separate blades and the fringe read
         as a row of spikes. Overlapping them makes one mass with cut edges,
         which is what hair looks like at this level of stylisation. */
      swept: [
        [0.000, 0.030, 0.004, 0.082, 0.090, 0.00, -0.30, 1],
        [0.046, 0.028, 0.000, 0.070, 0.082, -0.16, -0.26, 1],
        [-0.046, 0.028, 0.000, 0.070, 0.082, 0.16, -0.26, 0],
        [0.080, 0.020, -0.016, 0.058, 0.070, -0.30, -0.18, 0],
        [-0.080, 0.020, -0.016, 0.058, 0.070, 0.30, -0.18, 0],
        [0.030, 0.048, -0.030, 0.066, 0.108, -0.08, -0.42, 1],
        [-0.030, 0.048, -0.030, 0.066, 0.108, 0.08, -0.42, 0]
      ],
      crop: [
        [0.000, 0.026, 0.002, 0.090, 0.050, 0.00, -0.22, 1],
        [0.054, 0.022, -0.006, 0.072, 0.046, -0.14, -0.16, 0],
        [-0.054, 0.022, -0.006, 0.072, 0.046, 0.14, -0.16, 0]
      ],
      long: [
        [0.000, 0.026, 0.004, 0.092, 0.100, 0.00, -0.28, 1],
        [0.050, 0.024, -0.002, 0.070, 0.092, -0.18, -0.22, 1],
        [-0.050, 0.024, -0.002, 0.070, 0.092, 0.18, -0.22, 0],
        [0.094, -0.030, -0.058, 0.046, 0.200, -0.26, 0.20, 0],
        [-0.094, -0.030, -0.058, 0.046, 0.200, 0.26, 0.20, 0],
        [0.000, -0.052, -0.134, 0.116, 0.195, 0.00, 0.11, 0]
      ]
    };
    for (const [x, dy, z, w, h, rz, rx, lit] of (styles[cfg.hairStyle] || styles.swept)) {
      const c = taper(w * U, w * 0.34 * U, h * U, w * 0.60 * U,
        lit ? hairB : hairA, x * U, topY + dy * U, frontZ * 1.00 + z * U);
      c.rotation.z = rz;
      c.rotation.x = rx;
      j.head.add(c);
    }

    /* Sideburns hug the side of the head and stop at the jaw. v4 hung them a
       full half-width out at 3cm thick and they read as tusks. */
    for (const side of [-1, 1]) {
      const sb = taper(0.018 * U, 0.009 * U, 0.058 * U, 0.012 * U,
        hairA, side * (r(0.010 * U) * 0.97), SK.y + 0.020 * U, -0.004 * U);
      sb.rotation.x = 0.04;
      sb.rotation.z = side * 0.05;
      j.head.add(sb);
    }
  }

  /* --- helmet -----------------------------------------------------------
     Built off the same skull profile the bare head uses, one shell thickness
     out, so a helmeted head and a bare head have the same silhouette weight
     and the same neck join. v4's helmet used hard-coded heights tuned to an
     older, larger skull and floated above it. */
  function buildHelmet(rig, j, m, S, H, cfg) {
    const SK = rig.__skull, U = S * H, p = SK.p, T = 0.014 * U;
    const at = (i, k) => [p[i][0] * (k || 1) + T, SK.y + p[i][1]];
    j.head.add(lathe([
      [p[1][0] * 0.72 + T, SK.y + p[1][1] - 0.010 * U],
      at(2), at(3), at(4), at(5), at(6),
      [0.0001, SK.y + p[7][1] + T]
    ], m.armor, { squash: SK.sz / SK.sx }));

    const browY = SK.y + 0.052 * U, jawY = SK.y - 0.070 * U;
    const rz = (y) => {
      const yl = y - SK.y;
      for (let i = 1; i < p.length; i++)
        if (yl <= p[i][1]) {
          const t = (yl - p[i - 1][1]) / (p[i][1] - p[i - 1][1] || 1);
          return (p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t) * SK.sz;
        }
      return 0;
    };
    // Visor: a recessed dark band with a lit strip standing proud inside it.
    j.head.add(chip(0.126 * U, 0.062 * U, 0.040 * U, m.dark,
      0, SK.y + 0.016 * U, rz(SK.y + 0.016 * U) * 0.80 + T, 0.45));
    const v = chip(0.146 * U, 0.030 * U, 0.026 * U, m.trim,
      0, SK.y + 0.022 * U, rz(SK.y + 0.022 * U) * 0.80 + T + 0.012 * U, 0.4);
    j.head.add(v);
    rig.visor = v;
    // Breather, and a brow ridge so the front has a top edge.
    j.head.add(chip(0.080 * U, 0.050 * U, 0.044 * U, m.dark,
      0, jawY + 0.020 * U, rz(jawY + 0.020 * U) * 0.74 + T, 0.45));
    const brow = chip(0.118 * U, 0.022 * U, 0.034 * U, m.armor,
      0, browY, rz(browY) * 0.80 + T, 0.35);
    brow.rotation.x = -0.22;
    j.head.add(brow);
  }

  /* --- hands ------------------------------------------------------------
     Four fingers and a thumb, with a curl joint. The previous version was one
     block with two grooves cut into it, which at any distance under three
     metres read as a four-prong fork rather than a hand. Fingers cost twelve
     triangles each at this bevel and they merge into the palm's material, so
     the whole hand is still one draw submission. */
  function buildHand(rig, arm, side, m, S) {
    const hw = 0.076 * S, hh = 0.112 * S, hd = 0.100 * S;
    arm.hand.add(soft(hw * 2, hh, hd, m.dark, 0, -0.050 * S, 0.004 * S, 0.46));
    arm.hand.add(chip(hw * 1.9, 0.022 * S, hd * 0.9, m.armor, 0, -0.008 * S, 0.012 * S, 0.4));
    // Knuckle bar.
    arm.hand.add(chip(hw * 1.8, 0.020 * S, 0.030 * S, m.armor, 0, -0.098 * S, 0.040 * S, 0.3));

    const fingers = new THREE.Group();
    fingers.position.set(0, -0.100 * S, 0.006 * S);
    /* Two segments each, short and thick. The first version ran 0.052-0.060
       per segment, which on a 1.8 m body is a 10 cm finger — the hand came
       out as a set of claws. Real fingers are shorter than they feel, and a
       stylised hand wants them shorter still. */
    const len = [0.030, 0.035, 0.033, 0.027];
    for (let i = 0; i < 4; i++) {
      const fx = (-0.0345 + i * 0.023) * S;
      const seg1 = chip(0.022 * S, len[i] * S, 0.028 * S, m.dark, fx, -len[i] * 0.5 * S, 0.004 * S, 0.44);
      const knuckle = new THREE.Group();
      knuckle.position.set(0, -len[i] * S, 0.002 * S);
      const seg2 = chip(0.020 * S, len[i] * 0.78 * S, 0.026 * S, m.dark, fx, -len[i] * 0.39 * S, 0.007 * S, 0.44);
      knuckle.add(seg2);
      // A resting hand is never flat. A third of a curl at the second joint
      // is what stops it reading as a rake.
      knuckle.rotation.x = -0.42;
      fingers.add(seg1, knuckle);
    }
    arm.hand.add(fingers);
    arm.fingers = fingers;

    const thumb = new THREE.Group();
    thumb.position.set(side * 0.060 * S, -0.048 * S, 0.026 * S);
    thumb.rotation.z = side * 0.95;
    thumb.rotation.x = -0.42;
    thumb.add(chip(0.026 * S, 0.048 * S, 0.028 * S, m.dark, 0, -0.024 * S, 0, 0.45));
    const tip = chip(0.023 * S, 0.038 * S, 0.026 * S, m.dark, 0, -0.019 * S, 0.004 * S, 0.45);
    const tg = new THREE.Group();
    tg.position.y = -0.048 * S;
    tg.rotation.x = -0.35;
    tg.add(tip);
    thumb.add(tg);
    arm.hand.add(thumb);
    arm.thumb = thumb;
    arm.hand.add(chip(0.075 * S, 0.011 * S, 0.016 * S, m.trim, 0, -0.086 * S, 0.048 * S, 0.3));
  }

  /* --- boots ------------------------------------------------------------ */
  function buildBoot(ft, m, S) {
    ft.add(lathe([
      [0.052 * S, 0.10 * S], [0.086 * S, 0.055 * S], [0.090 * S, -0.02 * S], [0.074 * S, -0.075 * S]
    ], m.dark, { squash: 0.94 }));
    ft.add(soft(0.115 * S, 0.078 * S, 0.24 * S, m.dark, 0, -0.075 * S, 0.055 * S, 0.44));
    ft.add(soft(0.126 * S, 0.030 * S, 0.275 * S, m.armor, 0, -0.108 * S, 0.058 * S, 0.35));
    // Tread: four bars under the sole. Only ever seen mid-jump, and exactly
    // then it is the thing the camera is pointed at.
    for (let i = 0; i < 4; i++)
      ft.add(chip(0.118 * S, 0.012 * S, 0.030 * S, m.dark, 0, -0.122 * S, (-0.03 + i * 0.055) * S, 0.2));
    ft.add(taper(0.105 * S, 0.082 * S, 0.062 * S, 0.09 * S, m.armor, 0, -0.062 * S, 0.165 * S));
    // Tongue and two lace bars.
    ft.add(chip(0.070 * S, 0.075 * S, 0.030 * S, m.cloth || m.dark, 0, -0.030 * S, 0.112 * S, 0.35));
    for (let i = 0; i < 2; i++)
      ft.add(chip(0.082 * S, 0.010 * S, 0.014 * S, m.trim, 0, (-0.012 - i * 0.030) * S, 0.122 * S, 0.3));
    ft.add(chip(0.080 * S, 0.010 * S, 0.016 * S, m.trim, 0, -0.030 * S, 0.126 * S, 0.3));
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
      if (this.lids && this.lids.length) {
        this.blinkT = (this.blinkT === undefined ? Math.random() * 4 : this.blinkT) - d;
        if (this.blinkT <= 0) {
          this.blinkT = 2.4 + Math.random() * 4.5;
          this.blinkK = 1;
        }
        this.blinkK = Math.max(0, (this.blinkK || 0) - d * 9);
        const shut = Math.sin(clamp(this.blinkK, 0, 1) * Math.PI);
        // The lid slides down over the eye rather than the eye shrinking —
        // scaling the eyeball is the tell that gives away a fake blink.
        for (const l of this.lids) {
          if (l.__y0 === undefined) l.__y0 = l.position.y;
          l.position.y = l.__y0 - shut * (l.__y0 * 0.0 + 0.030 * this.S);
          l.scale.y = 0.40 + shut * 0.85;
        }
      }
      // Brows drop and pull in on an attack. Two rotations, and it is the
      // difference between a face and a mask.
      if (this.brows && this.brows.length) {
        const angry = (st.atk >= 0 || st.punch >= 0) ? 1 : 0;
        this.browK = damp(this.browK || 0, angry, 9, d);
        for (let i = 0; i < this.brows.length; i++) {
          const side = i === 0 ? -1 : 1;
          const b = this.brows[i];
          if (b.__z0 === undefined) { b.__z0 = b.rotation.z; b.__y0 = b.position.y; }
          b.rotation.z = b.__z0 + side * -0.34 * this.browK;
          b.position.y = b.__y0 - 0.012 * this.S * this.browK;
        }
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
