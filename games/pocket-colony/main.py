#!/usr/bin/env python3
"""Pocket Colony — entry point.

Opens the window, scales the low-res framebuffer up by a whole number, folds
keyboard, mouse and multi-touch into one Inp per frame, and runs the loop.
"""
import os
import sys
import time

import pygame

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pocketcolony import art, debug, scenes, sfx, ui        # noqa: E402
from pocketcolony.pixel import COL, VH, VW                  # noqa: E402

TITLE = 'Pocket Colony'
TAP_SLOP = 7            # pixels of drift still counted as a tap, not a drag


class App:
    def __init__(self):
        pygame.display.init()
        self.scale = 2
        self.win = None
        self.dest = pygame.Rect(0, 0, VW, VH)
        self.buf = pygame.Surface((VW, VH))
        self.g = scenes.Game()
        self.g.debug = debug.Debug()
        self.apply_video()
        pygame.display.set_caption(TITLE)
        art.bake_one('ant_worker')          # the boot screen needs these two
        art.bake_one('ant_queen')
        sfx.init()
        self.clock = pygame.time.Clock()
        self.fingers = {}
        self.tap = None
        self.wheel = 0

    # ── window ─────────────────────────────────────────────────────────
    def auto_scale(self):
        try:
            info = pygame.display.Info()
            s = min((info.current_w * 0.9) // VW, (info.current_h * 0.9) // VH)
            return max(1, min(8, int(s)))
        except pygame.error:
            return 2

    def apply_video(self):
        cfg = self.g.cfg
        if cfg['fullscreen']:
            self.win = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        else:
            s = cfg['scale'] or self.auto_scale()
            self.win = pygame.display.set_mode((VW * s, VH * s), pygame.RESIZABLE)
        self.fit()
        self.g.request_video = False

    def fit(self):
        w, h = self.win.get_size()
        s = max(1, min(w // VW, h // VH))
        self.scale = s
        self.dest = pygame.Rect((w - VW * s) // 2, (h - VH * s) // 2, VW * s, VH * s)
        self.g.window_label = '%dX%d  SCALE %dX' % (w, h, s)

    def to_virtual(self, pos):
        return ((pos[0] - self.dest.x) / self.scale,
                (pos[1] - self.dest.y) / self.scale)

    # ── control zones ──────────────────────────────────────────────────
    def zones(self):
        cfg = self.g.cfg
        return ui.stick_geom(cfg), ui.bite_geom(cfg), ui.act_geom()

    @staticmethod
    def in_circle(p, c, pad=8):
        return (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 <= (c[2] + pad) ** 2

    @staticmethod
    def in_rect(p, r):
        return r[0] <= p[0] < r[0] + r[2] and r[1] <= p[1] < r[1] + r[3]

    def press(self, fid, p, inp):
        """Route a new touch/click to the stick, a button, or the UI."""
        joy, atk, act = self.zones()
        touch_on = self.g.mode == 'play' and self.g.show_touch()
        if touch_on and self.in_circle(p, joy) and not any(
                f['role'] == 'stick' for f in self.fingers.values()):
            self.fingers[fid] = {'role': 'stick', 'start': p, 'pos': p, 'moved': 0.0}
            self.set_stick(p)
            return
        if touch_on and self.in_circle(p, atk):
            inp.attack = True
            self.fingers[fid] = {'role': 'btn', 'start': p, 'pos': p, 'moved': 0.0}
            return
        if (touch_on and self.in_rect(p, act) and self.g.world
                and self.g.world.prompt()):
            inp.action = True
            self.fingers[fid] = {'role': 'btn', 'start': p, 'pos': p, 'moved': 0.0}
            return
        self.fingers[fid] = {'role': 'ui', 'start': p, 'pos': p, 'moved': 0.0}

    def move(self, fid, p):
        f = self.fingers.get(fid)
        if not f:
            return
        f['moved'] += abs(p[0] - f['pos'][0]) + abs(p[1] - f['pos'][1])
        f['pos'] = p
        if f['role'] == 'stick':
            self.set_stick(p)

    def release(self, fid, p):
        f = self.fingers.pop(fid, None)
        if not f:
            return
        if f['role'] == 'stick':
            self.g.stick = None
        elif f['role'] == 'ui' and f['moved'] <= TAP_SLOP:
            self.tap = p           # a real tap, not the end of a drag

    def set_stick(self, p):
        joy, _, _ = self.zones()
        dx = (p[0] - joy[0]) / float(joy[2] - 6)
        dy = (p[1] - joy[1]) / float(joy[2] - 6)
        n = (dx * dx + dy * dy) ** 0.5
        if n > 1.0:
            dx, dy = dx / n, dy / n
        dead = self.g.cfg['deadzone'] / 100.0
        self.g.stick = (dx, dy) if n > dead else None

    def ui_pointer(self):
        """The pointer the widgets should track (any non-stick contact)."""
        for f in self.fingers.values():
            if f['role'] == 'ui':
                return f['pos']
        return None

    # ── one frame of input ─────────────────────────────────────────────
    def gather(self):
        inp = scenes.Inp()
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                return None
            elif ev.type == pygame.VIDEORESIZE:
                self.win = pygame.display.set_mode((ev.w, ev.h), pygame.RESIZABLE)
                self.fit()
            elif ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_ESCAPE:
                    inp.back = True
                elif ev.key == pygame.K_F3:
                    inp.toggle_debug = True
                elif ev.key == pygame.K_F11:
                    self.g.cfg.toggle('fullscreen')
                    self.apply_video()
                elif ev.key in (pygame.K_e, pygame.K_RETURN):
                    inp.action = True
                elif ev.key in (pygame.K_SPACE, pygame.K_j):
                    inp.attack = True
            elif ev.type == pygame.MOUSEWHEEL:
                self.wheel += ev.y
            elif ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                self.press('mouse', self.to_virtual(ev.pos), inp)
            elif ev.type == pygame.MOUSEMOTION and ev.buttons[0]:
                self.move('mouse', self.to_virtual(ev.pos))
            elif ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
                self.release('mouse', self.to_virtual(ev.pos))
            # ── multi-touch: stick and buttons can be held at the same time
            elif ev.type == pygame.FINGERDOWN:
                self.g.touch_seen = True
                self.press(('t', ev.finger_id), self.finger_pos(ev), inp)
            elif ev.type == pygame.FINGERMOTION:
                self.move(('t', ev.finger_id), self.finger_pos(ev))
            elif ev.type == pygame.FINGERUP:
                self.release(('t', ev.finger_id), self.finger_pos(ev))
            elif ev.type == pygame.APP_WILLENTERBACKGROUND:
                self.g.st.save()
                self.g.cfg.save()

        keys = pygame.key.get_pressed()
        mx = (keys[pygame.K_d] or keys[pygame.K_RIGHT]) - \
             (keys[pygame.K_a] or keys[pygame.K_LEFT])
        my = (keys[pygame.K_s] or keys[pygame.K_DOWN]) - \
             (keys[pygame.K_w] or keys[pygame.K_UP])
        if mx or my:
            inp.mx, inp.my = float(mx), float(my)
        elif self.g.stick is not None:
            inp.mx, inp.my = self.g.stick
        if keys[pygame.K_SPACE] or keys[pygame.K_j]:
            inp.attack = True
        inp.tap = self.tap
        inp.held = self.ui_pointer()
        inp.wheel = self.wheel
        self.tap = None
        self.wheel = 0
        return inp

    def finger_pos(self, ev):
        w, h = self.win.get_size()
        return self.to_virtual((ev.x * w, ev.y * h))

    # ── loop ───────────────────────────────────────────────────────────
    def run(self):
        while True:
            dt = min(0.1, self.clock.tick(60) / 1000.0)
            inp = self.gather()
            if inp is None:
                break
            t0 = time.perf_counter()
            self.g.update(dt, inp)
            self.g.draw(self.buf)
            self.g.frame_ms.append((time.perf_counter() - t0) * 1000.0)
            del self.g.frame_ms[:-240]
            self.g.fps = self.clock.get_fps() or 60.0
            if self.g.request_video:
                self.apply_video()

            self.win.fill(COL['black'])
            ox, oy = self.g.shake_offset()
            dest = self.dest.move(ox * self.scale, oy * self.scale)
            pygame.transform.scale(self.buf, dest.size,
                                   self.win.subsurface(dest.clip(self.win.get_rect())))
            pygame.display.flip()
        if self.g.world is not None:
            self.g.st.save()
        self.g.cfg.save()
        pygame.quit()


def main():
    App().run()


if __name__ == '__main__':
    main()
