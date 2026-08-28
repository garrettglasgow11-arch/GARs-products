#!/usr/bin/env python3
"""Pocket Colony — entry point.

Opens the window, scales the low-res framebuffer up by a whole number, turns
keys/mouse/touch into one Inp per frame, and runs the loop.
"""
import os
import sys
import time

import pygame

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pocketcolony import art, debug, scenes            # noqa: E402
from pocketcolony.pixel import COL, VH, VW             # noqa: E402

TITLE = 'Pocket Colony'


def pick_scale():
    try:
        info = pygame.display.Info()
        s = min((info.current_w * 0.85) // VW, (info.current_h * 0.85) // VH)
        return max(2, min(6, int(s)))
    except pygame.error:
        return 2


class App:
    def __init__(self):
        pygame.display.init()
        try:                                    # a machine with no sound card is fine
            pygame.mixer.init()
        except pygame.error:
            pass
        pygame.font.init() if False else None   # we never use system fonts
        self.scale = pick_scale()
        self.fullscreen = False
        self.win = pygame.display.set_mode((VW * self.scale, VH * self.scale),
                                           pygame.RESIZABLE)
        pygame.display.set_caption(TITLE)
        art.bake_one('ant_worker')              # needed by the boot screen
        art.bake_one('ant_queen')
        self.buf = pygame.Surface((VW, VH))
        self.g = scenes.Game()
        self.g.debug = debug.Debug()
        self.g.sim_speed = 1.0
        self.clock = pygame.time.Clock()
        self.prev = {}
        self.stick_drag = False
        self.pointer = None
        self.tap = None
        self.dest = self._dest()

    # ── screen fitting ─────────────────────────────────────────────────
    def _dest(self):
        w, h = self.win.get_size()
        s = max(1, min(w // VW, h // VH))
        self.scale = s
        return pygame.Rect((w - VW * s) // 2, (h - VH * s) // 2, VW * s, VH * s)

    def to_virtual(self, pos):
        x = (pos[0] - self.dest.x) / self.scale
        y = (pos[1] - self.dest.y) / self.scale
        return (x, y)

    def toggle_fullscreen(self):
        self.fullscreen = not self.fullscreen
        flags = pygame.FULLSCREEN if self.fullscreen else pygame.RESIZABLE
        size = (0, 0) if self.fullscreen else (VW * 2, VH * 2)
        self.win = pygame.display.set_mode(size, flags)
        self.dest = self._dest()

    # ── control zones (must match ui.pad) ──────────────────────────────
    JOY = (36, VH - 42, 34)
    ATK = (VW - 34, VH - 42, 24)
    ACT = (VW // 2 - 44, VH - 82, 88, 19)

    def in_circle(self, p, c):
        return (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 <= c[2] ** 2

    def in_rect(self, p, r):
        return r[0] <= p[0] < r[0] + r[2] and r[1] <= p[1] < r[1] + r[3]

    # ── one frame of input ─────────────────────────────────────────────
    def gather(self):
        inp = scenes.Inp()
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                return None
            elif ev.type == pygame.VIDEORESIZE:
                self.win = pygame.display.set_mode((ev.w, ev.h), pygame.RESIZABLE)
                self.dest = self._dest()
            elif ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_ESCAPE:
                    inp.back = True
                elif ev.key == pygame.K_F3:
                    inp.toggle_debug = True
                elif ev.key == pygame.K_F11:
                    self.toggle_fullscreen()
                elif ev.key in (pygame.K_e, pygame.K_RETURN):
                    inp.action = True
                elif ev.key in (pygame.K_SPACE, pygame.K_j):
                    inp.attack = True
            elif ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                p = self.to_virtual(ev.pos)
                self.pointer = p
                if self.in_circle(p, self.JOY):
                    self.stick_drag = True
                    self.set_stick(p)
                elif self.in_circle(p, self.ATK):
                    inp.attack = True
                elif self.in_rect(p, self.ACT) and self.g.world and \
                        self.g.world.prompt():
                    inp.action = True
            elif ev.type == pygame.MOUSEMOTION and ev.buttons[0]:
                p = self.to_virtual(ev.pos)
                self.pointer = p
                if self.stick_drag:
                    self.set_stick(p)
            elif ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
                p = self.to_virtual(ev.pos)
                if self.stick_drag:
                    self.stick_drag = False
                    self.g.stick = None
                else:
                    self.tap = p
                self.pointer = None

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
        inp.held = self.pointer
        self.tap = None
        return inp

    def set_stick(self, p):
        dx = (p[0] - self.JOY[0]) / 22.0
        dy = (p[1] - self.JOY[1]) / 22.0
        n = (dx * dx + dy * dy) ** 0.5
        if n > 1.0:
            dx, dy = dx / n, dy / n
        self.g.stick = (dx, dy) if n > 0.22 else None

    # ── loop ───────────────────────────────────────────────────────────
    def run(self):
        running = True
        while running:
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

            self.win.fill(COL['black'])
            pygame.transform.scale(self.buf, self.dest.size, self.win.subsurface(self.dest))
            pygame.display.flip()
        if self.g.world is not None:
            self.g.st.save()
        pygame.quit()


def main():
    App().run()


if __name__ == '__main__':
    main()
