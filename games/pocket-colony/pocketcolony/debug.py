"""Beta tester menu: diagnostics, toggles, cheats and a self-test suite.

Opened with F3 or from the pause menu.  Everything here is drawn with the same
bitmap fonts as the rest of the game, in the 3x5 face so it fits.
"""
import math
import os
import platform
import sys
import time

import pygame

from . import art, save, world
from .pixel import COL, VH, VW, bar, frame, panel, rect, text, text_c, text_w

TABS = ('DIAG', 'TOGGLE', 'CHEAT', 'TEST', 'LOG')


class Debug:
    def __init__(self):
        self.tab = 0
        self.scroll = 0
        self.log = []
        self.results = []
        self.t0 = time.time()
        self.say('BETA MENU READY')

    def say(self, msg):
        self.log.append('%7.1f  %s' % (time.time() - self.t0, msg))
        del self.log[:-140]

    # ── update ─────────────────────────────────────────────────────────
    def update(self, g, dt, inp):
        if inp.back:
            g.mode = 'play'
            return
        # keep the sim running behind the menu so diagnostics stay live
        g.world.update(dt * getattr(g, 'sim_speed', 1.0), _Null())

    # ── draw ───────────────────────────────────────────────────────────
    def draw(self, g, s):
        s.fill(COL['black'])
        rect(s, 0, 0, VW, 11, COL['dirt2'])
        text(s, 'BETA TESTER MENU', 3, 3, COL['amber'], small=True)
        text(s, 'F3 EXIT', VW - 38, 3, COL['dim'], small=True)
        tw = VW // len(TABS)
        for i, name in enumerate(TABS):
            on = i == self.tab
            rect(s, i * tw, 12, tw - 1, 11, COL['dirt3'] if on else COL['dirt1'])
            text_c(s, name, i * tw + tw // 2, 15,
                   COL['ink'] if on else COL['gray'], small=True)
            if g.ui.hit(i * tw, 12, tw - 1, 11):
                self.tab = i
                self.scroll = 0
        y = 27
        body = (self.draw_diag, self.draw_toggles, self.draw_cheats,
                self.draw_tests, self.draw_log)[self.tab]
        body(g, s, y)

    # ── panes ──────────────────────────────────────────────────────────
    def row(self, s, y, k, v, col='paper'):
        text(s, k[:17], 4, y, COL['gray'], small=True)
        text(s, str(v)[:21], 92, y, COL[col] if isinstance(col, str) else col, small=True)
        return y + 8

    def draw_diag(self, g, s, y):
        w = g.world
        ms = g.frame_ms[-60:] or [0]
        y = self.row(s, y, 'FPS', '%.1f' % g.fps,
                     'leaf' if g.fps > 45 else ('amber' if g.fps > 25 else 'red'))
        y = self.row(s, y, 'FRAME MS AVG/MAX', '%.2f / %.2f' % (sum(ms) / len(ms), max(ms)))
        y = self.row(s, y, 'SIM SPEED', '%.1fX' % getattr(g, 'sim_speed', 1.0))
        y = self.row(s, y, 'ZONE', w.zone.upper())
        y = self.row(s, y, 'PLAYER XY', '%d , %d' % (w.player.x, w.player.y))
        y = self.row(s, y, 'CAMERA XY', '%d , %d' % (w.cam[0], w.cam[1]))
        y = self.row(s, y, 'MAP TILES', '%d X %d' % (w.map.w, w.map.h))
        y += 3
        y = self.row(s, y, 'ANTS', '%d (W%d S%d)' % (len(w.ants), g.st.workers, g.st.soldiers))
        y = self.row(s, y, 'ENEMIES', len(w.enemies))
        y = self.row(s, y, 'ITEMS ON GROUND', len(w.items))
        y = self.row(s, y, 'APHIDS', len(w.aphids))
        y = self.row(s, y, 'BUG NESTS', len(w.nests))
        y = self.row(s, y, 'PARTICLES', len(w.parts))
        y += 3
        st = g.st
        y = self.row(s, y, 'RESOURCES', ' '.join('%d' % getattr(st, r) for r in save.RES))
        y = self.row(s, y, 'STORE CAP', st.cap())
        y = self.row(s, y, 'EGGS', '%d / %d  P=%.2f'
                     % (st.eggs, save.egg_cap(st.lv('nursery')), st.egg_p))
        y = self.row(s, y, 'QUEEN', st.queen_blocked() or 'LAYING',
                     'red' if st.queen_blocked() else 'leaf')
        y = self.row(s, y, 'CHAMBERS', ' '.join('%s%d' % (k[0].upper(), v)
                                                for k, v in sorted(st.ch.items())))
        y += 3
        p = st.path()
        try:
            sz = os.path.getsize(p)
        except OSError:
            sz = 0
        y = self.row(s, y, 'SAVE BYTES', sz)
        y = self.row(s, y, 'SAVE VER', save.SAVE_VERSION)
        y = self.row(s, y, 'SPRITES BAKED', len(art.baked))
        y = self.row(s, y, 'PYTHON', platform.python_version())
        y = self.row(s, y, 'PYGAME', pygame.version.ver)
        y = self.row(s, y, 'SDL', '.'.join(map(str, pygame.get_sdl_version())))
        y = self.row(s, y, 'PLATFORM', sys.platform)
        # frame time graph
        gy = VH - 40
        text(s, 'FRAME MS', 4, gy - 9, COL['gray'], small=True)
        rect(s, 4, gy, VW - 8, 32, COL['dirt0'])
        frame(s, 4, gy, VW - 8, 32, COL['dirt2'])
        rect(s, 4, gy + 32 - 16, VW - 8, 1, COL['dirt3'])       # 16.6ms line
        for i, v in enumerate(ms[-(VW - 10):]):
            hgt = max(1, min(30, int(v)))
            rect(s, 5 + i, gy + 31 - hgt, 1, hgt,
                 COL['leaf'] if v < 17 else (COL['amber'] if v < 34 else COL['red']))

    TOGGLES = (
        ('SHOW HITBOXES', 'show_hitbox'),
        ('SHOW TARGET LINES', 'show_targets'),
        ('SHOW TILE GRID', 'show_grid'),
        ('SHOW FPS OVERLAY', 'show_fps'),
        ('GOD MODE', 'god'),
        ('NOCLIP', 'noclip'),
        ('FREEZE SPAWNS', 'freeze_spawns'),
    )

    def draw_toggles(self, g, s, y):
        for label, key in self.TOGGLES:
            cur = self.get(g, key)
            if g.ui.button(s, 4, y, VW - 8, 13, label, small=True,
                           tone='go' if cur else 'plain'):
                self.set(g, key, not cur)
                self.say('%s = %s' % (key.upper(), not cur))
            text(s, 'ON' if cur else 'OFF', VW - 22, y + 4,
                 COL['ink'] if cur else COL['dim'], small=True)
            y += 15
        y += 4
        text(s, 'SIM SPEED', 4, y, COL['gray'], small=True)
        y += 9
        for i, mult in enumerate((0.0, 1.0, 2.0, 5.0)):
            bw = (VW - 8) // 4 - 2
            on = abs(getattr(g, 'sim_speed', 1.0) - mult) < 1e-6
            if g.ui.button(s, 4 + i * (bw + 2), y, bw, 14,
                           'STOP' if mult == 0 else '%gX' % mult,
                           small=True, tone='go' if on else 'plain'):
                g.sim_speed = mult
                self.say('SIM SPEED %g' % mult)

    def get(self, g, key):
        if key in ('god', 'freeze_spawns', 'noclip'):
            return getattr(g.world, key)
        return getattr(g, 'dbg_' + key, False)

    def set(self, g, key, val):
        if key in ('god', 'freeze_spawns', 'noclip'):
            setattr(g.world, key, val)
        else:
            setattr(g, 'dbg_' + key, val)

    def draw_cheats(self, g, s, y):
        st, w = g.st, g.world
        cheats = [
            ('+500 ALL RESOURCES', lambda: [st.add(r, 500) for r in save.RES]),
            ('FILL NURSERY', lambda: setattr(st, 'eggs', save.egg_cap(st.lv('nursery')))),
            ('ALL CHAMBERS +1', lambda: [st.ch.__setitem__(
                c['id'], min(c['hi'], st.lv(c['id']) + 1)) for c in save.CHAMBERS]),
            ('MAX ALL CHAMBERS', lambda: [st.ch.__setitem__(c['id'], c['hi'])
                                          for c in save.CHAMBERS]),
            ('HEAL TO FULL', lambda: setattr(st, 'hp', float(st.max_hp()))),
            ('SPAWN WORKER', lambda: (setattr(st, 'workers', st.workers + 1),
                                      w.sync_ants())),
            ('SPAWN SOLDIER', lambda: (setattr(st, 'soldiers', st.soldiers + 1),
                                       w.sync_ants())),
            ('SPAWN ENEMY HERE', lambda: self.spawn_enemy(g)),
            ('KILL ALL ENEMIES', lambda: [w.kill_enemy(e) for e in list(w.enemies)]),
            ('DROP 10 ITEMS', lambda: [w.spawn_item() for _ in range(10)]),
            ('TELEPORT TO SURFACE', lambda: w.enter('surface')),
            ('TELEPORT TO COLONY', lambda: w.enter('colony')),
            ('FORCE SAVE', lambda: st.save()),
            ('WIPE SAVE + RESTART', lambda: self.wipe(g)),
        ]
        for label, fn in cheats:
            if g.ui.button(s, 4, y, VW - 8, 13, label, small=True,
                           tone='bad' if 'WIPE' in label else 'plain'):
                fn()
                st.clamp_all()
                w.sync_ants()
                self.say('CHEAT: %s' % label)
            y += 15

    def spawn_enemy(self, g):
        w = g.world
        kind = list(world.ENEMY)[len(w.enemies) % len(world.ENEMY)]
        x, y = w.map.free_spot(w.rng, w.player.x, w.player.y, 40)
        w.enemies.append(world.Enemy(x, y, kind, 1))

    def wipe(self, g):
        g.st.wipe()
        g.world = world.World(g.st)
        self.say('SAVE WIPED')

    # ── self tests ─────────────────────────────────────────────────────
    def draw_tests(self, g, s, y):
        if g.ui.button(s, 4, y, VW - 8, 14, 'RUN SELF TESTS', tone='go', small=True):
            self.results = run_tests(g)
            self.say('SELF TESTS: %d/%d PASSED'
                     % (sum(1 for r in self.results if r[1]), len(self.results)))
        y += 18
        if not self.results:
            text(s, 'NO RESULTS YET', 4, y, COL['dim'], small=True)
            return
        ok = sum(1 for r in self.results if r[1])
        text(s, '%d / %d PASSED' % (ok, len(self.results)), 4, y,
             COL['leaf'] if ok == len(self.results) else COL['red'], small=True)
        y += 11
        for name, good, note in self.results:
            text(s, 'OK ' if good else 'XX ', 4, y,
                 COL['leaf'] if good else COL['red'], small=True)
            text(s, name, 16, y, COL['paper'], small=True)
            if note:
                text(s, note[:36], 16, y + 6, COL['dim'], small=True)
                y += 6
            y += 8
            if y > VH - 10:
                return

    def draw_log(self, g, s, y):
        if g.ui.button(s, 4, y, 60, 12, 'CLEAR', small=True):
            self.log = []
        y += 16
        for line in self.log[-((VH - y) // 7):]:
            text(s, line[:38], 4, y, COL['gray'], small=True)
            y += 7


class _Null:
    """Empty input so the sim keeps ticking while a menu is up."""
    mx = my = 0.0
    attack = action = back = False
    tap = held = None


def run_tests(g):
    """Assertions over the pure rules plus a few live-world invariants."""
    out = []

    def check(name, fn):
        try:
            note = fn()
            out.append((name, True, note or ''))
        except AssertionError as e:
            out.append((name, False, str(e)))
        except Exception as e:                    # noqa: BLE001 - report, don't crash
            out.append((name, False, '%s: %s' % (type(e).__name__, e)))

    def t_save_roundtrip():
        a = save.State()
        a.leaf, a.eggs, a.ch['queen'] = 123.5, 4, 3
        b = save.State()
        assert b.load_dict(a.to_dict()), 'load_dict refused the dict'
        assert abs(b.leaf - a.leaf) < 1e-9, 'leaf differs'
        assert b.ch == a.ch, 'chambers differ'
        return 'ok'

    def t_save_rejects_old():
        d = save.State().to_dict()
        d['v'] = 999
        assert not save.State().load_dict(d), 'accepted a future version'
        return 'rejects v999'

    def t_cap_clamp():
        st = save.State()
        st.leaf = 1e9
        st.tick(0.1)
        assert st.leaf == st.cap(), 'got %s want %s' % (st.leaf, st.cap())
        return 'clamps to %d' % st.cap()

    def t_add_never_exceeds():
        st = save.State()
        st.add('leaf', 1e9)
        assert st.leaf <= st.cap(), 'add blew the cap'
        return 'ok'

    def t_queen_costs():
        st = save.State()
        st.meat = 50
        before = st.leaf
        for _ in range(400):
            st.tick(0.25)
        assert st.eggs > 0, 'laid no eggs in 100s'
        assert st.leaf < before or st.eggs == 0, 'eggs were free'
        return '%d eggs' % st.eggs

    def t_hatch_gated():
        st = save.State()
        st.eggs = 5
        for r in save.RES:
            st.add(r, 500)
        assert not st.can_hatch('soldier'), 'soldier hatched with no barracks'
        st.ch['barracks'] = 1
        assert st.can_hatch('soldier'), 'soldier still blocked at barracks 1'
        return 'barracks gate holds'

    def t_upgrade_pays():
        st = save.State()
        for r in save.RES:
            st.add(r, 900)
        cost = st.chamber_cost('queen')
        before = st.leaf
        assert st.upgrade('queen'), 'upgrade refused'
        assert abs((before - st.leaf) - cost['leaf']) < 1e-6, 'wrong leaf charged'
        return 'charged %s' % cost

    def t_costs_rise():
        st = save.State()
        a = sum(st.chamber_cost('queen').values())
        st.ch['queen'] = 5
        b = sum(st.chamber_cost('queen').values())
        assert b > a, 'lv5 not dearer than lv1'
        return '%d -> %d' % (a, b)

    def t_sprites():
        missing = [n for n in art.SPRITES if n not in art.baked]
        assert not missing, 'unbaked: %s' % missing[:3]
        for n, spec in art.SPRITES.items():
            w = len(spec['rows'][0])
            assert all(len(r) == w for r in spec['rows']), '%s ragged' % n
        return '%d sprites' % len(art.SPRITES)

    def t_rot_rings():
        for n in art.rots:
            assert len(art.rots[n]) == art.ROT_STEPS, '%s ring short' % n
        return '%d rings x %d' % (len(art.rots), art.ROT_STEPS)

    def t_colony_connected():
        from collections import deque
        m = g.world.colony
        sx, sy = m.nodes['E']
        start = (sx // world.TILE, sy // world.TILE)
        seen, q = {start}, deque([start])
        while q:
            x, y = q.popleft()
            for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + d[0], y + d[1])
                if n not in seen and not m.solid_tile(*n):
                    seen.add(n)
                    q.append(n)
        bad = [k for k, (px, py) in m.nodes.items()
               if (px // world.TILE, py // world.TILE) not in seen]
        assert not bad, 'unreachable: %s' % bad
        return '%d tiles reachable' % len(seen)

    def t_spawns_walkable():
        for m in (g.world.colony, g.world.surface):
            assert not m.blocked(m.spawn[0], m.spawn[1], 3), 'spawn inside rock'
        return 'both spawns clear'

    def t_entities_in_bounds():
        w = g.world
        for e in w.ants + w.enemies + [w.player]:
            assert 0 <= e.x <= w.map.pw() and 0 <= e.y <= w.map.ph(), \
                'entity outside map at %d,%d' % (e.x, e.y)
        return '%d entities' % (len(w.ants) + len(w.enemies) + 1)

    def t_roster_matches():
        w = g.world
        nw = sum(1 for a in w.ants if a.kind == 'worker')
        ns = sum(1 for a in w.ants if a.kind == 'soldier')
        assert nw == g.st.workers and ns == g.st.soldiers, \
            'sprites %d/%d vs state %d/%d' % (nw, ns, g.st.workers, g.st.soldiers)
        return 'w%d s%d' % (nw, ns)

    def t_idle_bounded():
        st = save.State()
        st.ch['farm'] = 5
        st.grant_idle(10 ** 9)
        assert st.dew <= st.cap(), 'idle overflowed the store'
        return 'capped at %d' % st.cap()

    for name, fn in (
            ('SAVE ROUNDTRIP', t_save_roundtrip),
            ('SAVE VERSION GUARD', t_save_rejects_old),
            ('CAP CLAMP ON TICK', t_cap_clamp),
            ('ADD RESPECTS CAP', t_add_never_exceeds),
            ('QUEEN EATS FOOD', t_queen_costs),
            ('HATCH GATING', t_hatch_gated),
            ('UPGRADE CHARGES', t_upgrade_pays),
            ('COSTS ESCALATE', t_costs_rise),
            ('SPRITE INTEGRITY', t_sprites),
            ('ROTATION RINGS', t_rot_rings),
            ('COLONY CONNECTED', t_colony_connected),
            ('SPAWNS WALKABLE', t_spawns_walkable),
            ('ENTITIES IN BOUNDS', t_entities_in_bounds),
            ('ROSTER SYNC', t_roster_matches),
            ('IDLE BOUNDED', t_idle_bounded)):
        check(name, fn)
    return out


def overlay(g, s):
    """Debug draw layers, on top of the world but under the HUD."""
    w = g.world
    cx, cy = int(w.cam[0]), int(w.cam[1])
    if getattr(g, 'dbg_show_grid', False):
        t0 = world.TILE
        for gx in range(-cx % t0, VW, t0):
            rect(s, gx, 26, 1, VH - 26, (40, 40, 48))
        for gy in range(-cy % t0, VH, t0):
            rect(s, 0, gy, VW, 1, (40, 40, 48))
    if getattr(g, 'dbg_show_hitbox', False):
        for e in w.ants + w.enemies + [w.player]:
            r = getattr(e, 'radius', 3)
            pygame.draw.rect(s, COL['blue'],
                             (int(e.x - cx - r), int(e.y - cy - r), r * 2, r * 2), 1)
        for it in (w.items if w.zone == 'surface' else []):
            pygame.draw.rect(s, COL['leaf'], (int(it.x - cx - 3), int(it.y - cy - 3), 6, 6), 1)
    if getattr(g, 'dbg_show_targets', False):
        for a in w.ants:
            tgt = getattr(a, 'target', None)
            if tgt is not None:
                pygame.draw.line(s, COL['amber'], (int(a.x - cx), int(a.y - cy)),
                                 (int(tgt.x - cx), int(tgt.y - cy)))
        for e in w.enemies:
            pygame.draw.line(s, COL['red'], (int(e.x - cx), int(e.y - cy)),
                             (int(e.home[0] - cx), int(e.home[1] - cy)))
    if getattr(g, 'dbg_show_fps', False):
        txt = '%.0f FPS  %d ENT  %s' % (
            g.fps, len(w.ants) + len(w.enemies), w.zone.upper())
        rect(s, 0, VH - 9, text_w(txt, small=True) + 4, 9, COL['black'])
        text(s, txt, 2, VH - 8, COL['leaf'], small=True)
