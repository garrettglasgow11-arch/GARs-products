"""Game shell: boot sequence, title, play loop, chamber panels, menu routing."""
import math
import random
import time

import pygame

from . import art, content, menus, save, settings, sfx, ui, world
from .pixel import (COL, VH, VW, bar, frame, rect, text, text_c, text_w)

VERSION = content.VERSION


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
        self.wheel = 0
        self.back = False
        self.toggle_debug = False


class Game:
    def __init__(self):
        self.cfg = settings.Settings()
        self.st = save.State()
        self.had_save = self.st.load()
        self.away = self.st.grant_idle(time.time() - self.st.stamp) if self.had_save else None
        self.ui = ui.UI()
        self.menus = menus.Menus()
        self.world = None
        self.mode = 'boot'
        self.boot_phase = 0
        self.boot_t = 0.0
        self.bake_iter = None
        self.bake_done = 0
        self.bake_total = len(art.SPRITES)
        self.stick = None
        self.panel_id = None
        self.save_t = 0.0
        self.fps = 60.0
        self.frame_ms = []
        self.debug = None
        self.rng = random.Random()
        self.shake = 0.0
        self.sim_speed = 1.0
        self.request_video = False
        self.window_label = '-'
        self.touch_seen = False

    # ── shared ─────────────────────────────────────────────────────────
    def on_event(self, name, x=0.0, y=0.0):
        sfx.play(name if name in sfx.RECIPES else 'click', self.cfg)
        if self.cfg['screen_shake'] and name in ('hit', 'kill', 'hurt'):
            self.shake = max(self.shake, 2.2 if name != 'kill' else 3.4)

    def new_world(self):
        self.world = world.World(self.st)
        self.world.on_event = self.on_event
        self.world.show_numbers = self.cfg['damage_numbers']
        return self.world

    def wipe(self):
        self.st.wipe()
        self.new_world()
        self.menus.reset()

    def show_touch(self):
        mode = self.cfg['touch_ui']
        if mode == 'always':
            return True
        if mode == 'never':
            return False
        return True         # 'auto': the pad is useful with a mouse too

    # ── boot ───────────────────────────────────────────────────────────
    def _bake_step(self):
        if self.bake_iter is None:
            self.bake_iter = iter(list(art.SPRITES))
        for _ in range(2):
            try:
                art.bake_one(next(self.bake_iter))
                self.bake_done += 1
            except StopIteration:
                return True
        return False

    def update_boot(self, dt, inp):
        self.boot_t += dt
        if self.boot_phase == 0:
            if self.boot_t > 2.4 or inp.tap or inp.action or inp.attack:
                self.boot_phase, self.boot_t = 1, 0.0
        elif self.boot_phase == 1:
            if self._bake_step() and self.boot_t > 1.3:
                sfx.init()
                self.new_world()
                self.boot_phase, self.boot_t = 2, 0.0
        else:
            if self.boot_t > 0.6 and (inp.tap or inp.action or inp.attack):
                self.mode = 'play'
                sfx.play('zone', self.cfg)
                if self.away and self.cfg['hints']:
                    self.world.toast('WHILE AWAY  +%d LEAF  +%d DEW  %d EGGS'
                                     % (self.away['leaf'], self.away['dew'],
                                        self.away['eggs']), 'amber')

    def draw_boot(self, s):
        (self.draw_studio, self.draw_loading, self.draw_title)[self.boot_phase](s)

    def draw_studio(self, s):
        t = self.boot_t
        s.fill(COL['black'])
        for i in range(90):
            r = random.Random(i * 977)
            x = r.randrange(VW)
            y = (r.random() * VH + t * (10 + r.random() * 26)) % VH
            if t > 0.1:
                rect(s, x, int(y), 1, 1, COL['dirt2'] if i % 3 else COL['dirt3'])
        name = content.STUDIO
        shown = max(0, min(len(name), int((t - 0.35) / 0.055)))
        if shown:
            big(s, name[:shown], VW // 2, VH // 2 - 26, 2, COL['paper'])
        if t > 1.5:
            text_c(s, 'PRESENTS', VW // 2, VH // 2 + 4, COL['gray'], small=True,
                   tracking=2)
        if t > 1.1:
            x = int(-14 + (t - 1.1) * 100)
            rect(s, 34, VH // 2 - 6, min(156, max(0, x)), 1, COL['dirt3'])
            if x < 176:
                art.blit_rot(s, 'ant_worker', 34 + x, VH // 2 - 12, 0.0)
        if t > 2.0:
            veil = pygame.Surface((VW, VH))
            veil.fill(COL['black'])
            veil.set_alpha(int(min(1.0, (t - 2.0) / 0.4) * 255))
            s.blit(veil, (0, 0))

    def draw_loading(self, s):
        t = self.boot_t
        s.fill(COL['dirt0'])
        for i in range(340):
            r = random.Random(i * 7919)
            rect(s, r.randrange(VW), r.randrange(VH), 1, 1,
                 COL['dirt1'] if i % 2 else COL['dirt2'])
        frac = self.bake_done / max(1, self.bake_total)
        bx, by, bw = 28, VH // 2, VW - 56
        rect(s, bx, by, int(bw * frac), 14, COL['dirt2'])
        for i in range(0, int(bw * frac), 3):
            rect(s, bx + i, by + 12, 2, 2, COL['dirt3'])
        frame(s, bx, by - 1, bw, 16, COL['dirt3'])
        head = bx + int(bw * frac)
        if frac < 1.0:
            art.blit_rot(s, 'ant_worker', head, by + 7, 0.0)
            for i in range(4):
                a = t * 6 + i
                rect(s, int(head - 10 - (a % 3) * 4), int(by + 7 + math.sin(a) * 4),
                     1, 1, COL['dirt3'])
        text_c(s, 'DIGGING OUT THE COLONY', VW // 2, by - 22, COL['gray'], small=True,
               tracking=1)
        text_c(s, '%d%%' % int(frac * 100), VW // 2, by + 26, COL['amber'], tracking=1)

    def draw_title(self, s):
        t = self.boot_t
        sky = 52
        s.fill(COL['dirt1'])
        for y in range(sky):
            k = y / sky
            rect(s, 0, y, VW, 1, (int(52 + 44 * k), int(72 + 44 * k), int(122 - 34 * k)))
        rect(s, 0, sky - 8, VW, 8, COL['grass0'])
        rect(s, 0, sky - 10, VW, 3, COL['grass1'])
        for i in range(58):
            r = random.Random(i * 331)
            rect(s, r.randrange(VW), sky - 12 - r.randrange(3), 1, 4, COL['grass2'])
        off = t * 5
        for i in range(460):
            r = random.Random(i * 5171)
            y = sky + int((r.random() * (VH - sky) + off) % (VH - sky))
            rect(s, r.randrange(VW), y, 1, 1, (26, 19, 12) if i % 3 else (58, 43, 27))
        shaft = 112
        rect(s, shaft - 8, sky, 16, VH - sky, (74, 55, 34))
        rect(s, shaft - 9, sky, 1, VH - sky, (36, 26, 16))
        rect(s, shaft + 8, sky, 1, VH - sky, (100, 75, 46))
        for lane, ly in enumerate((sky + 38, sky + 118, sky + 198)):
            y = int(ly - (off % 80))
            if y < sky + 4:
                continue
            rect(s, 0, y, VW, 15, (72, 53, 33))
            rect(s, 0, y, VW, 1, (38, 27, 17))
            rect(s, 0, y + 14, VW, 1, (98, 73, 45))
            for k in range(3):
                d = 1 if (lane + k) % 2 else -1
                x = ((t * (15 + k * 7) * d) + k * 82 + lane * 41) % (VW + 36) - 18
                art.blit_rot(s, 'ant_worker', x, y + 7, 0.0 if d > 0 else math.pi)
        for i, (cx, cy, rw, rh) in enumerate(((50, 286, 34, 23), (176, 300, 30, 21),
                                              (112, 348, 40, 26))):
            pygame.draw.ellipse(s, (40, 29, 18), (cx - rw, cy - rh, rw * 2, rh * 2))
            pygame.draw.ellipse(s, (78, 58, 36), (cx - rw + 2, cy - rh + 2,
                                                  rw * 2 - 4, rh * 2 - 4))
            rect(s, min(cx, shaft), cy - 5, abs(cx - shaft), 10, (74, 55, 34))
            if i == 0:
                for k in range(5):
                    art.blit_c(s, 'it_egg', cx - 18 + k * 9, cy + 4 + (k % 2) * 6)
            elif i == 1:
                for k in range(3):
                    art.blit_rot(s, 'aphid', cx - 16 + k * 16, cy + 3,
                                 math.sin(t + k) * 0.5)
            else:
                art.blit_rot(s, 'ant_queen', cx, cy + 2, -math.pi / 2)
                for k in range(4):
                    art.blit_rot(s, 'ant_worker', cx - 30 + k * 20, cy + 18,
                                 math.sin(t * 1.4 + k) * 0.7)
        veil = pygame.Surface((VW, VH))
        veil.fill(COL['black'])
        veil.set_alpha(96)
        s.blit(veil, (0, 0))

        drop = max(0.0, 1.0 - t / 0.45)
        ly = 86 + int(-110 * drop * drop)
        rect(s, 20, ly - 10, VW - 40, 84, (18, 13, 9))
        frame(s, 20, ly - 10, VW - 40, 84, COL['amber_d'])
        frame(s, 22, ly - 8, VW - 44, 80, COL['dirt2'])
        big(s, 'POCKET', VW // 2, ly, 4, COL['amber_l'], tracking=2)
        big(s, 'COLONY', VW // 2, ly + 36, 4, COL['amber'], tracking=2)
        if t > 0.45:
            text_c(s, 'AN ANT COLONY SIM', VW // 2, ly + 76, COL['paper'],
                   small=True, tracking=2)
        art.blit_rot(s, 'ant_queen', VW // 2, ly - 28, -math.pi / 2)

        if t > 0.9 and int(t * 1.6) % 2:
            w = 150
            rect(s, VW // 2 - w // 2, VH - 88, w, 16, (18, 13, 9))
            frame(s, VW // 2 - w // 2, VH - 88, w, 16, COL['amber'])
            text_c(s, 'PRESS SPACE OR TAP', VW // 2, VH - 83, COL['white'], small=True)
        rect(s, 0, VH - 46, VW, 46, (14, 10, 7))
        text_c(s, 'MOVE WASD   BITE SPACE   USE E', VW // 2, VH - 40,
               COL['gray'], small=True)
        text_c(s, 'MENU ESC    BETA MENU F3', VW // 2, VH - 31, COL['gray'], small=True)
        text_c(s, 'V%s   FAN GAME - NOT AFFILIATED' % VERSION, VW // 2, VH - 16,
               COL['dim'], small=True)
        if self.had_save:
            text_c(s, 'SAVE LOADED', VW // 2, VH - 102, COL['leaf'], small=True)

    # ── update ─────────────────────────────────────────────────────────
    def update(self, dt, inp):
        self.ui.begin(inp.tap, inp.held, inp.wheel)
        if inp.toggle_debug and self.debug and self.mode != 'boot':
            self.mode = 'debug' if self.mode != 'debug' else 'play'
        if self.mode == 'boot':
            self.update_boot(dt, inp)
            return
        self.world.show_numbers = self.cfg['damage_numbers']
        if self.mode == 'debug':
            self.debug.update(self, dt, inp)
            return
        if self.mode == 'menu':
            self.menus.update(self, dt, inp)
            return
        if self.mode == 'panel':
            if inp.back:
                self.panel_id = None
                self.mode = 'play'
                sfx.play('back', self.cfg)
            return
        if inp.back:
            self.mode = 'menu'
            self.menus.reset()
            sfx.play('click', self.cfg)
            return
        self.world.update(dt * self.sim_speed, inp)
        if inp.action:
            got = self.world.do_action()
            if got:
                self.panel_id = got
                self.mode = 'panel'
                sfx.play('click', self.cfg)
        if self.cfg['autosave']:
            self.save_t += dt
            if self.save_t > 10:
                self.save_t = 0.0
                self.st.save()
        self.shake = max(0.0, self.shake - dt * 9)

    # ── draw ───────────────────────────────────────────────────────────
    def draw(self, s):
        if self.mode == 'boot':
            self.draw_boot(s)
            self.post(s)
            return
        if self.mode == 'menu':
            self.menus.draw(self, s)
            self.post(s)
            return
        self.world.draw(s)
        if self.debug is not None:
            from . import debug as _dbg
            _dbg.overlay(self, s)
        ui.hud(s, self)
        if self.cfg['hints']:
            ui.toasts(s, self)
        if self.mode == 'play':
            if self.show_touch():
                ui.pad(s, self, self.cfg)
            if self.ui.icon_button(s, VW - 22, 31, 19, 17, 'ic_gear'):
                self.mode = 'menu'
                self.menus.reset()
                sfx.play('click', self.cfg)
        elif self.mode == 'panel':
            ui.dim(s)
            self.draw_panel(s)
        elif self.mode == 'debug':
            self.debug.draw(self, s)
        self.post(s)

    def post(self, s):
        """Full-screen effects that sit above everything."""
        if self.cfg['pixel_grid']:
            for y in range(0, VH, 3):
                rect(s, 0, y, VW, 1, COL['black'])
        if self.cfg['show_fps'] and self.mode != 'boot':
            txt = '%d FPS' % int(self.fps)
            rect(s, VW - text_w(txt, small=True) - 6, 0, text_w(txt, small=True) + 6,
                 9, COL['black'])
            text(s, txt, VW - text_w(txt, small=True) - 3, 1, COL['leaf'], small=True)

    def shake_offset(self):
        if self.shake <= 0 or not self.cfg['screen_shake']:
            return 0, 0
        return (self.rng.randint(-1, 1) * int(self.shake),
                self.rng.randint(-1, 1) * int(self.shake))

    # ── chamber panels ─────────────────────────────────────────────────
    def draw_panel(self, s):
        st = self.st
        cid = self.panel_id
        c = save.CH_BY_ID[cid]
        lv = st.lv(cid)
        w, h = 204, 236
        x, y = (VW - w) // 2, (VH - h) // 2 - 10
        self.ui.panel(s, x, y, w, h, c['name'])
        text_c(s, ('LEVEL %d' % lv) if lv else 'NOT BUILT', x + w // 2, y + 20,
               COL['amber'], small=True)

        cy = y + 32
        text(s, 'NOW', x + 8, cy, COL['gray'], small=True)
        text(s, c['eff'](lv), x + 34, cy, COL['paper'], small=True)
        cy += 10
        if lv < c['hi']:
            text(s, 'NEXT', x + 8, cy, COL['gray'], small=True)
            text(s, c['eff'](lv + 1), x + 34, cy, COL['leaf'], small=True)
        cy += 13
        rect(s, x + 6, cy, w - 12, 1, COL['dirt3'])
        cy = self.panel_body(s, cid, x, cy + 7, w)

        by = y + h - 56
        if lv >= c['hi']:
            self.ui.button(s, x + 8, by, w - 16, 18, 'FULLY DUG', enabled=False)
        else:
            cost = st.chamber_cost(cid)
            ok = st.can_upgrade(cid)
            if self.ui.button(s, x + 8, by, w - 16, 18,
                              'UPGRADE' if lv else 'BUILD', enabled=ok, tone='go'):
                st.upgrade(cid)
                self.world.sync_ants()
                self.world.toast('%s LV%d' % (c['name'], st.lv(cid)), 'amber')
                sfx.play('upgrade', self.cfg)
                self.st.save()
            ui.cost_row(s, st, cost, x + 10, by + 21)
        if self.ui.button(s, x + 8, y + h - 22, w - 16, 16, 'CLOSE'):
            self.panel_id = None
            self.mode = 'play'
            sfx.play('back', self.cfg)

    def panel_body(self, s, cid, x, cy, w):
        st = self.st
        if cid == 'queen':
            text(s, 'EGGS  %d / %d' % (st.eggs, save.egg_cap(st.lv('nursery'))),
                 x + 8, cy, COL['paper'], small=True)
            bar(s, x + 8, cy + 10, w - 16, 8, st.egg_p, 'amber')
            blocked = st.queen_blocked()
            text(s, blocked or 'THE QUEEN IS LAYING', x + 8, cy + 23,
                 COL['red'] if blocked else COL['leaf'], small=True)
            text(s, 'EACH EGG EATS 6 LEAF AND 2 MEAT', x + 8, cy + 33,
                 COL['gray'], small=True)
            art.blit_rot(s, 'ant_queen', x + w // 2, cy + 62, -math.pi / 2)
            return cy + 84
        if cid == 'nursery':
            text(s, 'EGGS READY  %d' % st.eggs, x + 8, cy, COL['paper'], small=True)
            for i, kind in enumerate(('worker', 'soldier')):
                bx = x + 8 + i * ((w - 16) // 2 + 2)
                bw = (w - 16) // 2 - 2
                cap = (save.worker_cap(st.lv('tunnels')) if kind == 'worker'
                       else save.soldier_cap(st.lv('barracks')))
                have = st.workers if kind == 'worker' else st.soldiers
                if self.ui.button(s, bx, cy + 11, bw, 20, kind.upper(),
                                  enabled=st.can_hatch(kind), tone='go',
                                  sub='%d/%d' % (have, cap)):
                    st.hatch(kind)
                    self.world.sync_ants()
                    self.world.toast('HATCHED A %s' % kind.upper(), 'leaf')
                    sfx.play('hatch', self.cfg)
                    self.st.save()
                ui.cost_row(s, st, save.HATCH_COST[kind], bx, cy + 33)
            for i in range(min(6, st.eggs)):
                art.blit_c(s, 'it_egg', x + 22 + i * 14, cy + 56)
            return cy + 70
        if cid == 'store':
            for i, r in enumerate(save.RES):
                yy = cy + i * 13
                art.blit(s, save.RES_ICON[r], x + 8, yy)
                text(s, save.RES_NAME[r], x + 20, yy + 1, COL['gray'], small=True)
                bar(s, x + 52, yy, w - 116, 8, getattr(st, r) / max(1, st.cap()), r)
                text(s, '%d' % getattr(st, r), x + w - 56, yy + 1, COL['paper'],
                     small=True)
            return cy + 58
        if cid == 'barracks':
            rows = (('SOLDIERS', '%d / %d' % (st.soldiers, save.soldier_cap(st.lv(cid)))),
                    ('YOUR BITE', save.player_atk(st.lv(cid))),
                    ('YOUR HEALTH', save.player_hp(st.lv(cid))),
                    ('SOLDIER BITE', save.soldier_atk(st.lv(cid))))
            for i, (k, v) in enumerate(rows):
                text(s, k, x + 8, cy + i * 10, COL['gray'], small=True)
                text(s, str(v), x + 96, cy + i * 10, COL['paper'], small=True)
            for i in range(min(4, max(1, st.soldiers))):
                art.blit_rot(s, 'ant_soldier', x + 40 + i * 30, cy + 60, -math.pi / 2)
            return cy + 82
        if cid == 'farm':
            text(s, 'HONEYDEW  +%.2f / SEC' % save.dew_rate(st.lv(cid)), x + 8, cy,
                 COL['paper'], small=True)
            text(s, 'MILK WILD APHIDS TOPSIDE TOO', x + 8, cy + 12, COL['gray'],
                 small=True)
            for i in range(3):
                art.blit_rot(s, 'aphid', x + 46 + i * 32, cy + 40, 0.0)
            return cy + 62
        if cid == 'tunnels':
            rows = (('BAG SIZE', save.carry_cap(st.lv(cid))),
                    ('MOVE SPEED', int(save.move_speed(st.lv(cid)))),
                    ('WORKER CAP', save.worker_cap(st.lv(cid))))
            for i, (k, v) in enumerate(rows):
                text(s, k, x + 8, cy + i * 10, COL['gray'], small=True)
                text(s, str(v), x + 96, cy + i * 10, COL['paper'], small=True)
            text(s, 'WIDER TUNNELS MEAN FASTER ANTS', x + 8, cy + 36, COL['gray'],
                 small=True)
            for i in range(3):
                art.blit_rot(s, 'ant_worker', x + 52 + i * 28, cy + 60, -math.pi / 2)
            return cy + 82
        return cy
