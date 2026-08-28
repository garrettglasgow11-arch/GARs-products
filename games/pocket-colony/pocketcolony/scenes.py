"""Game shell: boot sequence, title, play loop, chamber panels, pause menu."""
import math
import random
import time

import pygame

from . import art, save, ui, world
from .pixel import (COL, VH, VW, bar, frame, panel, rect, text, text_c,
                    text_sh_c, text_w)

VERSION = '0.2.0'


def big(s, txt, cx, y, scale, col, shadow=True, tracking=1):
    """Scale the bitmap font up for headline text — stays perfectly blocky."""
    w = text_w(txt, tracking=tracking)
    tmp = pygame.Surface((max(1, w), 7), pygame.SRCALPHA)
    text(tmp, txt, 0, 0, col, tracking=tracking)
    up = pygame.transform.scale(tmp, (w * scale, 7 * scale))
    x = int(cx - w * scale / 2)
    if shadow:
        sh = up.copy()
        sh.fill(COL['ink'], special_flags=pygame.BLEND_RGB_MULT)
        s.blit(sh, (x + scale, y + scale))
    s.blit(up, (x, y))
    return 7 * scale


class Inp:
    """One frame of input, however it arrived (keys, mouse or touch)."""

    def __init__(self):
        self.mx = self.my = 0.0
        self.attack = False
        self.action = False
        self.tap = None
        self.held = None
        self.back = False
        self.toggle_debug = False


class Game:
    def __init__(self):
        self.st = save.State()
        self.had_save = self.st.load()
        self.away = self.st.grant_idle(time.time() - self.st.stamp) if self.had_save else None
        self.ui = ui.UI()
        self.world = None
        self.mode = 'boot'
        self.boot_phase = 0
        self.boot_t = 0.0
        self.bake_iter = None
        self.bake_done = 0
        self.bake_total = len(art.SPRITES)
        self.stick = None
        self.stick_id = None
        self.panel_id = None
        self.pause_sel = 0
        self.save_t = 0.0
        self.fps = 60.0
        self.frame_ms = []
        self.debug = None          # filled in by debug.py
        self.rng = random.Random()
        self.shake = 0.0
        self.flash_t = 0.0

    # ── boot ───────────────────────────────────────────────────────────
    def _bake_step(self):
        if self.bake_iter is None:
            self.bake_iter = iter(list(art.SPRITES))
        for _ in range(2):                      # a couple of sprites per frame
            try:
                art.bake_one(next(self.bake_iter))
                self.bake_done += 1
            except StopIteration:
                return True
        return False

    def update_boot(self, dt, inp):
        self.boot_t += dt
        if self.boot_phase == 0:                       # studio card
            if self.boot_t > 2.4 or inp.tap or inp.action or inp.attack:
                self.boot_phase, self.boot_t = 1, 0.0
        elif self.boot_phase == 1:                     # loading
            if self._bake_step() and self.boot_t > 1.3:
                self.world = world.World(self.st)
                self.boot_phase, self.boot_t = 2, 0.0
        else:                                          # title
            if self.boot_t > 0.6 and (inp.tap or inp.action or inp.attack):
                self.mode = 'play'
                if self.away:
                    self.world.toast('WHILE AWAY  +%d LEAF  +%d DEW  %d EGGS'
                                     % (self.away['leaf'], self.away['dew'],
                                        self.away['eggs']), 'amber')

    def draw_boot(self, s):
        if self.boot_phase == 0:
            self.draw_studio(s)
        elif self.boot_phase == 1:
            self.draw_loading(s)
        else:
            self.draw_title(s)

    def draw_studio(self, s):
        t = self.boot_t
        s.fill(COL['black'])
        for i in range(70):                            # drifting grit
            r = random.Random(i * 977)
            x = r.randrange(VW)
            spd = 10 + r.random() * 26
            y = (r.random() * VH + t * spd) % VH
            a = min(1.0, t / 0.8)
            if a > 0.1:
                rect(s, x, int(y), 1, 1, COL['dirt2'] if i % 3 else COL['dirt3'])
        name = 'GAR PRODUCTIONS'
        shown = max(0, min(len(name), int((t - 0.35) / 0.055)))
        if shown:
            big(s, name[:shown], VW // 2, VH // 2 - 22, 2, COL['paper'])
        if t > 1.5:
            a = min(1.0, (t - 1.5) / 0.5)
            text_c(s, 'PRESENTS', VW // 2, VH // 2 + 2,
                   COL['dim'] if a < 0.6 else COL['gray'], small=True, tracking=2)
        if t > 1.1:                                    # an ant walks the underline
            x = int(-14 + (t - 1.1) * 90)
            rect(s, 30, VH // 2 - 6, min(140, max(0, x)), 1, COL['dirt3'])
            if x < 160:
                art.blit_rot(s, 'ant_worker', 30 + x, VH // 2 - 10, 0.0)
        if t > 2.0:
            veil = pygame.Surface((VW, VH))
            veil.fill(COL['black'])
            veil.set_alpha(int(min(1.0, (t - 2.0) / 0.4) * 255))
            s.blit(veil, (0, 0))

    def draw_loading(self, s):
        t = self.boot_t
        s.fill(COL['dirt0'])
        for i in range(260):                           # soil texture
            r = random.Random(i * 7919)
            rect(s, r.randrange(VW), r.randrange(VH), 1, 1,
                 COL['dirt1'] if i % 2 else COL['dirt2'])
        frac = self.bake_done / max(1, self.bake_total)
        bx, by, bw = 24, VH // 2, VW - 48
        rect(s, bx, by, int(bw * frac), 12, COL['dirt2'])   # dug tunnel
        for i in range(0, int(bw * frac), 3):
            rect(s, bx + i, by + 10, 2, 2, COL['dirt3'])
        frame(s, bx, by - 1, bw, 14, COL['dirt3'])
        head = bx + int(bw * frac)
        if frac < 1.0:
            art.blit_rot(s, 'ant_worker', head, by + 6, 0.0)
            for i in range(4):                          # spoil thrown behind
                a = t * 6 + i
                rect(s, int(head - 8 - (a % 3) * 4), int(by + 6 + math.sin(a) * 4),
                     1, 1, COL['dirt3'])
        text_c(s, 'DIGGING OUT THE COLONY', VW // 2, by - 20, COL['gray'], small=True,
               tracking=1)
        text_c(s, '%d%%' % int(frac * 100), VW // 2, by + 22, COL['amber'], tracking=1)

    def draw_title(self, s):
        t = self.boot_t
        sky = 46
        s.fill(COL['dirt1'])
        for y in range(sky):                            # sky
            k = y / sky
            rect(s, 0, y, VW, 1, (int(52 + 44 * k), int(72 + 44 * k), int(122 - 34 * k)))
        rect(s, 0, sky - 7, VW, 7, COL['grass0'])
        rect(s, 0, sky - 9, VW, 3, COL['grass1'])
        for i in range(52):
            r = random.Random(i * 331)
            rect(s, r.randrange(VW), sky - 11 - r.randrange(3), 1, 4, COL['grass2'])

        off = t * 5
        for i in range(420):                            # soil grit, drifting
            r = random.Random(i * 5171)
            x = r.randrange(VW)
            y = sky + int((r.random() * (VH - sky) + off) % (VH - sky))
            rect(s, x, y, 1, 1, (26, 19, 12) if i % 3 else (58, 43, 27))

        shaft = 100
        rect(s, shaft - 7, sky, 14, VH - sky, (74, 55, 34))      # the main shaft
        rect(s, shaft - 8, sky, 1, VH - sky, (36, 26, 16))
        rect(s, shaft + 7, sky, 1, VH - sky, (100, 75, 46))

        # side galleries, drifting past at their own pace
        for lane, ly in enumerate((sky + 34, sky + 104, sky + 176)):
            y = int(ly - (off % 70))
            if y < sky + 4:
                continue
            rect(s, 0, y, VW, 14, (72, 53, 33))
            rect(s, 0, y, VW, 1, (38, 27, 17))
            rect(s, 0, y + 13, VW, 1, (98, 73, 45))
            for k in range(3):
                dirn = 1 if (lane + k) % 2 else -1
                x = ((t * (15 + k * 7) * dirn) + k * 74 + lane * 37) % (VW + 34) - 17
                art.blit_rot(s, 'ant_worker', x, y + 7, 0.0 if dirn > 0 else math.pi)

        # chambers anchoring the lower half
        for i, (cx, cy, rw, rh) in enumerate(((44, 248, 30, 21), (156, 260, 27, 19),
                                              (100, 292, 34, 22))):
            pygame.draw.ellipse(s, (40, 29, 18), (cx - rw, cy - rh, rw * 2, rh * 2))
            pygame.draw.ellipse(s, (78, 58, 36), (cx - rw + 2, cy - rh + 2,
                                                  rw * 2 - 4, rh * 2 - 4))
            rect(s, min(cx, shaft), cy - 4, abs(cx - shaft), 9, (74, 55, 34))
            if i == 0:
                for k in range(5):
                    art.blit_c(s, 'it_egg', cx - 16 + k * 8, cy + 4 + (k % 2) * 6)
            elif i == 1:
                for k in range(3):
                    art.blit_rot(s, 'aphid', cx - 14 + k * 14, cy + 3,
                                 math.sin(t + k) * 0.5)
            else:
                art.blit_rot(s, 'ant_queen', cx, cy + 2, -math.pi / 2)
                for k in range(4):
                    art.blit_rot(s, 'ant_worker', cx - 26 + k * 17, cy + 15,
                                 math.sin(t * 1.4 + k) * 0.7)
        for k in range(4):                              # ants using the shaft
            y = sky + ((t * 22 + k * 62) % (VH - sky))
            art.blit_rot(s, 'ant_worker', shaft + (-4 if k % 2 else 4), y,
                         math.pi / 2 if k % 2 else -math.pi / 2)

        veil = pygame.Surface((VW, VH))
        veil.fill(COL['black'])
        veil.set_alpha(92)
        s.blit(veil, (0, 0))

        # ── logo
        drop = max(0.0, 1.0 - t / 0.45)
        ly = 74 + int(-90 * drop * drop)
        rect(s, 20, ly - 8, VW - 40, 76, (18, 13, 9))
        frame(s, 20, ly - 8, VW - 40, 76, COL['amber_d'])
        big(s, 'POCKET', VW // 2, ly, 4, COL['amber_l'], tracking=1)
        big(s, 'COLONY', VW // 2, ly + 34, 4, COL['amber'], tracking=1)
        if t > 0.45:
            text_c(s, 'AN ANT COLONY SIM', VW // 2, ly + 74, COL['paper'],
                   small=True, tracking=2)
        art.blit_rot(s, 'ant_queen', VW // 2, ly - 24, -math.pi / 2)

        if t > 0.9 and int(t * 1.6) % 2:
            w = 132
            rect(s, VW // 2 - w // 2, VH - 78, w, 14, (18, 13, 9))
            frame(s, VW // 2 - w // 2, VH - 78, w, 14, COL['amber'])
            text_c(s, 'PRESS SPACE OR CLICK', VW // 2, VH - 74, COL['white'],
                   small=True)
        rect(s, 0, VH - 42, VW, 42, (14, 10, 7))
        text_c(s, 'MOVE WASD   BITE SPACE   USE E', VW // 2, VH - 37,
               COL['gray'], small=True)
        text_c(s, 'MENU ESC    BETA MENU F3', VW // 2, VH - 28, COL['gray'], small=True)
        text_c(s, 'V%s   FAN GAME - NOT AFFILIATED' % VERSION, VW // 2, VH - 14,
               COL['dim'], small=True)
        if self.had_save:
            text_c(s, 'SAVE LOADED', VW // 2, VH - 92, COL['leaf'], small=True)

    # ── play ───────────────────────────────────────────────────────────
    def update(self, dt, inp):
        self.ui.begin(inp.tap, inp.held)
        if inp.toggle_debug and self.debug and self.mode in ('play', 'debug', 'pause'):
            self.mode = 'debug' if self.mode != 'debug' else 'play'
        if self.mode == 'boot':
            self.update_boot(dt, inp)
            return
        if self.mode == 'debug':
            self.debug.update(self, dt, inp)
            return
        if self.mode == 'pause':
            if inp.back:
                self.mode = 'play'
            return
        if self.mode == 'panel':
            if inp.back:
                self.panel_id = None
                self.mode = 'play'
            return
        # ── playing
        if inp.back:
            self.mode = 'pause'
            return
        speed = getattr(self, 'sim_speed', 1.0)
        self.world.update(dt * speed, inp)
        if inp.action:
            got = self.world.do_action()
            if got:
                self.panel_id = got
                self.mode = 'panel'
        self.save_t += dt
        if self.save_t > 10:
            self.save_t = 0.0
            self.st.save()
        self.shake = max(0.0, self.shake - dt * 4)

    def draw(self, s):
        if self.mode == 'boot':
            self.draw_boot(s)
            return
        self.world.draw(s)
        if self.debug is not None:
            self.debug_overlay(s)
        ui.hud(s, self)
        ui.toasts(s, self)
        if self.mode == 'play':
            ui.pad(s, self, VH)
            if self.ui.icon_button(s, VW - 15, 27, 13, 13, 'ic_gear'):
                self.mode = 'pause'
        elif self.mode == 'panel':
            ui.dim(s, VH)
            self.draw_panel(s)
        elif self.mode == 'pause':
            ui.dim(s, VH)
            self.draw_pause(s)
        elif self.mode == 'debug':
            self.debug.draw(self, s)

    def debug_overlay(self, s):
        from . import debug as _dbg
        _dbg.overlay(self, s)

    # ── chamber panels ─────────────────────────────────────────────────
    def draw_panel(self, s):
        st = self.st
        cid = self.panel_id
        c = save.CH_BY_ID[cid]
        lv = st.lv(cid)
        w, h = 184, 200
        x, y = (VW - w) // 2, (VH - h) // 2 - 6
        panel(s, x, y, w, h)
        rect(s, x + 1, y + 1, w - 2, 13, COL['dirt3'])
        text_c(s, c['name'], x + w // 2, y + 4, COL['ink'])
        text_c(s, ('LEVEL %d' % lv) if lv else 'NOT BUILT', x + w // 2, y + 18,
               COL['amber'], small=True)

        cy = y + 30
        text(s, 'NOW', x + 8, cy, COL['gray'], small=True)
        text(s, c['eff'](lv), x + 30, cy, COL['paper'], small=True)
        cy += 10
        if lv < c['hi']:
            text(s, 'NEXT', x + 8, cy, COL['gray'], small=True)
            text(s, c['eff'](lv + 1), x + 30, cy, COL['leaf'], small=True)
        cy += 14
        rect(s, x + 6, cy, w - 12, 1, COL['dirt3'])
        cy += 6
        cy = self.panel_body(s, cid, x, cy, w)

        by = y + h - 54
        if lv >= c['hi']:
            self.ui.button(s, x + 8, by, w - 16, 16, 'FULLY DUG', enabled=False)
        else:
            cost = st.chamber_cost(cid)
            ok = st.can_upgrade(cid)
            label = 'UPGRADE' if lv else 'BUILD'
            if self.ui.button(s, x + 8, by, w - 16, 16, label, enabled=ok, tone='go'):
                st.upgrade(cid)
                self.world.sync_ants()
                self.world.toast('%s -> LV%d' % (c['name'], st.lv(cid)), 'amber')
                self.st.save()
            ui.cost_row(s, st, cost, x + 10, by + 19)
        if self.ui.button(s, x + 8, y + h - 18, w - 16, 14, 'CLOSE', small=True):
            self.panel_id = None
            self.mode = 'play'

    def panel_body(self, s, cid, x, cy, w):
        st = self.st
        if cid == 'queen':
            text(s, 'EGGS  %d / %d' % (st.eggs, save.egg_cap(st.lv('nursery'))),
                 x + 8, cy, COL['paper'], small=True)
            bar(s, x + 8, cy + 9, w - 16, 7, st.egg_p, 'amber')
            blocked = st.queen_blocked()
            text(s, blocked or 'THE QUEEN IS LAYING', x + 8, cy + 20,
                 COL['red'] if blocked else COL['leaf'], small=True)
            text(s, 'EACH EGG EATS 6 LEAF 2 MEAT', x + 8, cy + 30, COL['gray'], small=True)
            return cy + 42
        if cid == 'nursery':
            text(s, 'EGGS READY  %d' % st.eggs, x + 8, cy, COL['paper'], small=True)
            for i, kind in enumerate(('worker', 'soldier')):
                bx = x + 8 + i * ((w - 16) // 2 + 2)
                bw = (w - 16) // 2 - 2
                cost = save.HATCH_COST[kind]
                cap = (save.worker_cap(st.lv('tunnels')) if kind == 'worker'
                       else save.soldier_cap(st.lv('barracks')))
                have = st.workers if kind == 'worker' else st.soldiers
                if self.ui.button(s, bx, cy + 10, bw, 17, kind.upper(),
                                  enabled=st.can_hatch(kind), tone='go',
                                  small=True, sub='%d/%d' % (have, cap)):
                    st.hatch(kind)
                    self.world.sync_ants()
                    self.world.toast('HATCHED A %s' % kind.upper(), 'leaf')
                    self.st.save()
                ui.cost_row(s, st, cost, bx, cy + 29)
            return cy + 44
        if cid == 'store':
            for i, r in enumerate(save.RES):
                yy = cy + i * 11
                art.blit(s, save.RES_ICON[r], x + 8, yy)
                text(s, save.RES_NAME[r], x + 18, yy + 1, COL['gray'], small=True)
                bar(s, x + 46, yy, w - 100, 7, getattr(st, r) / max(1, st.cap()), r)
                text(s, '%d' % getattr(st, r), x + w - 48, yy + 1, COL['paper'], small=True)
            return cy + 48
        if cid == 'barracks':
            text(s, 'SOLDIERS  %d / %d' % (st.soldiers, save.soldier_cap(st.lv(cid))),
                 x + 8, cy, COL['paper'], small=True)
            text(s, 'YOUR BITE  %d' % save.player_atk(st.lv(cid)), x + 8, cy + 10,
                 COL['paper'], small=True)
            text(s, 'YOUR HEALTH  %d' % save.player_hp(st.lv(cid)), x + 8, cy + 20,
                 COL['paper'], small=True)
            text(s, 'SOLDIERS FOLLOW YOU TOPSIDE', x + 8, cy + 32, COL['gray'], small=True)
            return cy + 44
        if cid == 'farm':
            text(s, 'HONEYDEW  +%.2f / SEC' % save.dew_rate(st.lv(cid)), x + 8, cy,
                 COL['paper'], small=True)
            text(s, 'MILK WILD APHIDS TOPSIDE TOO', x + 8, cy + 12, COL['gray'], small=True)
            for i in range(3):
                art.blit_rot(s, 'aphid', x + 30 + i * 26, cy + 34, 0.0)
            return cy + 46
        if cid == 'tunnels':
            rows = (('CARRY', save.carry_cap(st.lv(cid))),
                    ('SPEED', int(save.move_speed(st.lv(cid)))),
                    ('WORKERS', save.worker_cap(st.lv(cid))))
            for i, (k, v) in enumerate(rows):
                text(s, k, x + 8, cy + i * 10, COL['gray'], small=True)
                text(s, str(v), x + 60, cy + i * 10, COL['paper'], small=True)
            text(s, 'WIDER TUNNELS = FASTER ANTS', x + 8, cy + 34, COL['gray'], small=True)
            return cy + 46
        return cy

    # ── pause ──────────────────────────────────────────────────────────
    def draw_pause(self, s):
        w, h = 150, 168
        x, y = (VW - w) // 2, (VH - h) // 2
        panel(s, x, y, w, h)
        rect(s, x + 1, y + 1, w - 2, 13, COL['dirt3'])
        text_c(s, 'PAUSED', x + w // 2, y + 4, COL['ink'])
        st = self.st
        rows = [('KILLS', st.kills), ('NESTS CLEARED', st.nests_cleared),
                ('DEATHS', st.deaths),
                ('PLAYED', '%dM' % int(st.playtime / 60))]
        for i, (k, v) in enumerate(rows):
            text(s, k, x + 8, y + 20 + i * 9, COL['gray'], small=True)
            text(s, str(v), x + w - 34, y + 20 + i * 9, COL['paper'], small=True)
        by = y + 62
        if self.ui.button(s, x + 8, by, w - 16, 16, 'RESUME', tone='go'):
            self.mode = 'play'
        if self.ui.button(s, x + 8, by + 20, w - 16, 16, 'BETA TESTER MENU'):
            self.mode = 'debug'
        if self.ui.button(s, x + 8, by + 40, w - 16, 16, 'SAVE NOW'):
            self.st.save()
            self.world.toast('SAVED', 'leaf')
            self.mode = 'play'
        if self.ui.button(s, x + 8, by + 60, w - 16, 16, 'WIPE COLONY', tone='bad'):
            self.st.wipe()
            self.world = world.World(self.st)
            self.mode = 'play'
        text_c(s, 'ESC CLOSES', x + w // 2, y + h - 12, COL['dim'], small=True)
