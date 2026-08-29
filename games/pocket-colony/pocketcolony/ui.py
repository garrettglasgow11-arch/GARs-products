"""Immediate-mode pixel UI kit.

Nothing here uses a system font or an OS widget: every glyph comes from
pixel.py's bitmap fonts and every icon is a sprite from art.py.
"""
import math

import pygame

from . import art, save
from .pixel import (COL, VH, VW, bar, frame, rect, text, text_c, text_w)

ROW_H = 15
PAD = 6


class UI:
    """Widget helper.

    `tap` is where the pointer was released this frame, and is only set when
    the pointer barely moved — so dragging a list never fires a button under
    your thumb.  `held` is the live pointer, used for pressed states.
    """

    def __init__(self):
        self.tap = None
        self.held = None
        self.wheel = 0
        self.drag_dy = 0.0
        self.consumed = False
        self._last = None
        self.clip = None

    def begin(self, tap, held, wheel=0):
        self.drag_dy = (held[1] - self._last[1]) if (held and self._last) else 0.0
        self._last = held
        self.tap = tap
        self.held = held
        self.wheel = wheel
        self.consumed = False

    def hit(self, x, y, w, h):
        if self.consumed or self.tap is None:
            return False
        tx, ty = self.tap
        if self.clip and not (self.clip[1] <= ty < self.clip[1] + self.clip[3]):
            return False
        if x <= tx < x + w and y <= ty < y + h:
            self.consumed = True
            return True
        return False

    def down(self, x, y, w, h):
        if self.held is None:
            return False
        hx, hy = self.held
        if self.clip and not (self.clip[1] <= hy < self.clip[1] + self.clip[3]):
            return False
        return x <= hx < x + w and y <= hy < y + h

    # ── chrome ─────────────────────────────────────────────────────────
    def panel(self, s, x, y, w, h, title=None, tone='dirt1'):
        x, y, w, h = int(x), int(y), int(w), int(h)
        rect(s, x + 2, y + 2, w - 4, h - 4, COL[tone])
        frame(s, x + 1, y + 1, w - 2, h - 2, COL['dirt3'])
        frame(s, x, y, w, h, COL['dirt0'])
        rect(s, x + 2, y + 2, w - 4, 1, COL['dirt2'])
        rect(s, x + 2, y + h - 3, w - 4, 1, COL['dirt0'])
        for cx, cy in ((x + 1, y + 1), (x + w - 3, y + 1),
                       (x + 1, y + h - 3), (x + w - 3, y + h - 3)):
            rect(s, cx, cy, 2, 2, COL['dirt4'])       # corner rivets
        if title:
            rect(s, x + 2, y + 2, w - 4, 14, COL['dirt3'])
            rect(s, x + 2, y + 15, w - 4, 1, COL['dirt4'])
            text_c(s, title, x + w // 2, y + 6, COL['ink'])
        return y + (18 if title else 4)

    def button(self, s, x, y, w, h, label, enabled=True, tone='plain',
               small=True, sub=None, icon=None):
        x, y, w, h = int(x), int(y), int(w), int(h)
        pressed = enabled and self.down(x, y, w, h)
        if not enabled:
            fill, edge, ink = COL['dirt1'], COL['dirt2'], COL['dim']
        elif tone == 'go':
            fill, edge, ink = COL['amber_d'], COL['amber_l'], COL['ink']
        elif tone == 'bad':
            fill, edge, ink = COL['red_d'], COL['red'], COL['white']
        elif tone == 'flat':
            fill, edge, ink = COL['dirt1'], COL['dirt3'], COL['paper']
        else:
            fill, edge, ink = COL['dirt2'], COL['dirt4'], COL['paper']
        oy = 1 if pressed else 0
        rect(s, x, y + 1, w, h, COL['dirt0'])          # drop shadow
        rect(s, x, y + oy, w, h - 1, fill)
        frame(s, x, y + oy, w, h - 1, edge)
        if not pressed and enabled:
            rect(s, x + 1, y + 1, w - 2, 1, COL['dirt3'] if tone != 'go' else COL['amber'])
        tx = x + w // 2
        if icon:
            art.blit_c(s, icon, x + 10, y + oy + h // 2)
            tx += 6
        ty = y + oy + (h - 1 - (6 if small else 7)) // 2
        if sub:
            ty = y + oy + 2
        text_c(s, label, tx, ty, ink, small=small)
        if sub:
            text_c(s, sub, tx, ty + 8, ink, small=True)
        return enabled and self.hit(x, y, w, h)

    def icon_button(self, s, x, y, w, h, sprite, tone='plain'):
        x, y, w, h = int(x), int(y), int(w), int(h)
        pressed = self.down(x, y, w, h)
        rect(s, x, y + 1, w, h, COL['dirt0'])
        rect(s, x, y, w, h, COL['dirt3'] if pressed else COL['dirt2'])
        frame(s, x, y, w, h, COL['amber_d'] if tone == 'go' else COL['dirt4'])
        art.blit_c(s, sprite, x + w / 2, y + h / 2)
        return self.hit(x, y, w, h)

    # ── settings rows ──────────────────────────────────────────────────
    def row_bg(self, s, x, y, w, h=ROW_H, alt=False):
        rect(s, x, y, w, h, COL['dirt2'] if alt else COL['dirt1'])
        rect(s, x, y + h - 1, w, 1, COL['dirt0'])

    def toggle_row(self, s, x, y, w, label, value, alt=False, note=None):
        h = ROW_H + (7 if note else 0)
        self.row_bg(s, x, y, w, h, alt)
        text(s, label, x + 6, y + 4, COL['paper'], small=True)
        if note:
            text(s, note, x + 6, y + 13, COL['dim'], small=True)
        bw = 32
        bx = x + w - bw - 6
        rect(s, bx, y + 2, bw, 11, COL['leaf'] if value else COL['dirt0'])
        frame(s, bx, y + 2, bw, 11, COL['amber_d'] if value else COL['dirt4'])
        knob = (bx + bw - 12) if value else (bx + 1)
        rect(s, knob, y + 3, 11, 9, COL['paper'] if value else COL['dirt3'])
        rect(s, knob, y + 3, 11, 1, COL['white'] if value else COL['dirt4'])
        text_c(s, 'ON' if value else 'OFF',
               bx + (bw - 12) // 2 + 1 if value else bx + 12 + (bw - 12) // 2,
               y + 4, COL['ink'] if value else COL['paper'], small=True)
        return self.hit(x, y, w, h)

    def option_row(self, s, x, y, w, label, value, alt=False):
        self.row_bg(s, x, y, w, ROW_H, alt)
        text(s, label, x + 6, y + 4, COL['paper'], small=True)
        vw = text_w(value, small=True)
        bx = x + w - 6
        left = self.button(s, bx - vw - 34, y + 2, 12, 11, '<')
        right = self.button(s, bx - 12, y + 2, 12, 11, '>')
        text_c(s, value, bx - vw // 2 - 17, y + 5, COL['amber'], small=True)
        return (-1 if left else 0) + (1 if right else 0)

    def slider_row(self, s, x, y, w, label, value, lo, hi, alt=False, unit='%'):
        self.row_bg(s, x, y, w, ROW_H + 8, alt)
        text(s, label, x + 6, y + 4, COL['paper'], small=True)
        text(s, '%d%s' % (value, unit), x + w - 34, y + 4, COL['amber'], small=True)
        minus = self.button(s, x + 6, y + 12, 12, 9, '-')
        plus = self.button(s, x + w - 18, y + 12, 12, 9, '+')
        bx, bw = x + 22, w - 46
        frac = (value - lo) / float(max(1, hi - lo))
        bar(s, bx, y + 13, bw, 7, frac, 'amber')
        if self.down(bx, y + 10, bw, 12) and self.held:
            return ('set', int(lo + (hi - lo) * max(0.0, min(1.0,
                    (self.held[0] - bx) / float(bw)))))
        if minus:
            return ('step', -1)
        if plus:
            return ('step', 1)
        return None

    # ── scrolling ──────────────────────────────────────────────────────
    def scroll(self, state, x, y, w, h, content_h):
        """Drag/wheel scrolling for a region.  Returns the y offset to apply."""
        state['max'] = max(0, content_h - h)
        if self.down(x, y, w, h):
            state['off'] -= self.drag_dy
        if self.wheel and x <= (self.held or (x + 1, y + 1))[0] < x + w:
            state['off'] -= self.wheel * 18
        state['off'] = max(0, min(state['max'], state['off']))
        return int(state['off'])

    def scrollbar(self, s, state, x, y, w, h):
        if state.get('max', 0) <= 0:
            return
        rect(s, x + w - 3, y, 2, h, COL['dirt0'])
        span = max(10, int(h * h / float(h + state['max'])))
        pos = int((h - span) * state['off'] / float(state['max']))
        rect(s, x + w - 3, y + pos, 2, span, COL['dirt4'])


# ── HUD ────────────────────────────────────────────────────────────────
def fmt(n):
    n = int(n)
    return '%.1fK' % (n / 1000.0) if n >= 1000 else str(n)


def chip(s, x, y, w, sprite, label, ink='paper'):
    rect(s, x, y, w, 13, COL['dirt1'])
    rect(s, x + 1, y + 1, w - 2, 1, COL['dirt2'])
    frame(s, x, y, w, 13, COL['dirt3'])
    art.blit_c(s, sprite, x + 8, y + 6)
    text(s, label, x + 15, y + 4, COL[ink] if isinstance(ink, str) else ink, small=True)


def hud(s, g):
    st = g.st
    rect(s, 0, 0, VW, 28, COL['dirt0'])
    rect(s, 0, 28, VW, 1, COL['dirt3'])
    cw = (VW - 10) // 4
    for i, r in enumerate(save.RES):
        full = getattr(st, r) >= st.cap() - 0.5
        chip(s, 2 + i * (cw + 2), 1, cw, save.RES_ICON[r],
             fmt(getattr(st, r)), 'red' if full else 'paper')
    hpf = st.hp / max(1, st.max_hp())
    art.blit(s, 'ic_heart', 3, 18)
    bar(s, 12, 17, 48, 8, hpf, 'red' if hpf < 0.35 else 'leaf')
    text(s, '%d' % int(st.hp), 63, 19, COL['gray'], small=True)
    art.blit_c(s, 'it_egg', 88, 21)
    text(s, '%d/%d' % (st.eggs, save.egg_cap(st.lv('nursery'))), 95, 19,
         COL['paper'], small=True)
    art.blit(s, 'ic_ant', 128, 18)
    text(s, '%d+%d' % (st.workers, st.soldiers), 137, 19, COL['paper'], small=True)
    p = g.world.player
    full = len(p.carry) >= p.cap()
    text(s, 'BAG', 170, 19, COL['gray'], small=True)
    text(s, '%d/%d' % (len(p.carry), p.cap()), 190, 19,
         COL['amber'] if full else COL['paper'], small=True)


def toasts(s, g, y0=32):
    for i, t in enumerate(g.world.toasts[-3:]):
        if t.life < 0.5 and int(t.life * 20) % 2 == 0:
            continue
        w = text_w(t.msg, small=True) + 12
        x, y = VW // 2 - w // 2, y0 + i * 12
        rect(s, x, y, w, 11, COL['dirt0'])
        frame(s, x, y, w, 11, COL['dirt3'])
        text_c(s, t.msg, VW // 2, y + 3, COL[t.col], small=True)


# ── touch controls ─────────────────────────────────────────────────────
def stick_geom(cfg):
    r = (22, 28, 34)[cfg['stick_size']]
    cx = (r + 12) if cfg['stick_side'] == 'left' else VW - (r + 12)
    return cx, VH - r - 20, r


def bite_geom(cfg):
    r = 24
    cx = VW - (r + 14) if cfg['stick_side'] == 'left' else (r + 14)
    return cx, VH - r - 24, r


def _octa(s, cx, cy, r, fill, edge):
    b = r // 3
    rect(s, cx - r, cy - r + b, r * 2, r * 2 - b * 2, fill)
    rect(s, cx - r + b, cy - r, r * 2 - b * 2, r * 2, fill)
    for i in range(b):
        rect(s, cx - r + i, cy - r + b - i, 1, 1, edge)
        rect(s, cx + r - i - 1, cy - r + b - i, 1, 1, edge)
        rect(s, cx - r + i, cy + r - b + i - 1, 1, 1, edge)
        rect(s, cx + r - i - 1, cy + r - b + i - 1, 1, 1, edge)
    rect(s, cx - r + b, cy - r, r * 2 - b * 2, 1, edge)
    rect(s, cx - r + b, cy + r - 1, r * 2 - b * 2, 1, edge)
    rect(s, cx - r, cy - r + b, 1, r * 2 - b * 2, edge)
    rect(s, cx + r - 1, cy - r + b, 1, r * 2 - b * 2, edge)


def pad(s, g, cfg):
    jx, jy, jr = stick_geom(cfg)
    base = pygame.Surface((jr * 2 + 2, jr * 2 + 2), pygame.SRCALPHA)
    pygame.draw.circle(base, COL['dirt0'] + (140,), (jr + 1, jr + 1), jr)
    pygame.draw.circle(base, COL['dirt2'] + (80,), (jr + 1, jr + 1), jr - 4)
    pygame.draw.circle(base, COL['dirt4'] + (185,), (jr + 1, jr + 1), jr, 1)
    s.blit(base, (jx - jr - 1, jy - jr - 1))
    for i in range(4):
        a = i * math.pi / 2
        nx, ny = jx + int(math.cos(a) * (jr - 4)), jy + int(math.sin(a) * (jr - 4))
        rect(s, nx - 1, ny - 1, 2, 2, COL['dirt4'])
    kx, ky = jx, jy
    if g.stick is not None:
        kx = jx + int(g.stick[0] * (jr - 11))
        ky = jy + int(g.stick[1] * (jr - 11))
    live = g.stick is not None
    rect(s, kx - 9, ky - 9, 18, 18, COL['dirt3'] if live else COL['dirt2'])
    frame(s, kx - 9, ky - 9, 18, 18, COL['amber_d'] if live else COL['dirt4'])
    rect(s, kx - 8, ky - 8, 16, 1, COL['dirt4'])
    art.blit_c(s, 'ic_ant', kx, ky)

    ax, ay, ar = bite_geom(cfg)
    cd = g.world.player.atk_cd
    ready = cd <= 0
    _octa(s, ax, ay, ar, COL['red_d'] if ready else COL['dirt1'],
          COL['red'] if ready else COL['dirt2'])
    if ready:
        rect(s, ax - ar + 8, ay - ar + 1, ar * 2 - 16, 1, (232, 128, 106))
    art.blit_c(s, 'ic_bite', ax, ay - 5)
    text_c(s, 'BITE', ax, ay + 7, COL['white'] if ready else COL['dim'], small=True)
    if not ready:
        w = int((ar * 2 - 12) * (1 - cd / 0.42))
        rect(s, ax - ar + 6, ay + ar - 6, ar * 2 - 12, 2, COL['dirt0'])
        rect(s, ax - ar + 6, ay + ar - 6, w, 2, COL['amber'])

    pr = g.world.prompt()
    if pr:
        label = pr[0]
        w = max(84, text_w(label, small=True) + 24)
        x, y = VW // 2 - w // 2, VH - 96
        glow = (math.sin(g.world.time * 5) + 1) * 0.5
        rect(s, x, y + 1, w, 21, COL['dirt0'])
        rect(s, x, y, w, 20, COL['dirt2'])
        frame(s, x, y, w, 20, COL['amber'] if glow > 0.5 else COL['amber_d'])
        rect(s, x + 1, y + 1, w - 2, 1, COL['dirt3'])
        text_c(s, label, VW // 2, y + 4, COL['amber_l'], small=True)
        text_c(s, 'TAP  OR  E', VW // 2, y + 13, COL['dim'], small=True)


def act_geom():
    return VW // 2 - 54, VH - 96, 108, 20


def dim(s, amount=160):
    veil = pygame.Surface((VW, VH))
    veil.fill(COL['black'])
    veil.set_alpha(amount)
    s.blit(veil, (0, 0))


def cost_row(s, st, cost, x, y):
    cx = x
    for r, v in cost.items():
        art.blit_c(s, save.RES_ICON[r], cx + 4, y + 4)
        ok = getattr(st, r) >= v
        text(s, str(v), cx + 10, y + 2, COL['paper'] if ok else COL['red'], small=True)
        cx += 16 + text_w(str(v), small=True)
    return cx
