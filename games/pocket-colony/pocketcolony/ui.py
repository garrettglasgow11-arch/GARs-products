"""Immediate-mode pixel UI: chips, buttons, panels, the touch pad and HUD.

Nothing here uses a system font or an OS widget — every glyph comes from
pixel.py's bitmap fonts and every icon is a sprite from art.py.
"""
import math

import pygame

from . import art, save
from .pixel import (COL, VW, bar, frame, panel, rect, text, text_c, text_sh_c,
                    text_w)


class UI:
    """Immediate-mode widget helper.

    `tap` is the pointer position released this frame (or None); a widget that
    contains it reports a press.  `held` is the current drag position.
    """

    def __init__(self):
        self.tap = None
        self.held = None
        self.hot = None
        self.consumed = False

    def begin(self, tap, held):
        self.tap = tap
        self.held = held
        self.consumed = False

    def hit(self, x, y, w, h):
        if self.consumed or self.tap is None:
            return False
        tx, ty = self.tap
        if x <= tx < x + w and y <= ty < y + h:
            self.consumed = True
            return True
        return False

    def down(self, x, y, w, h):
        if self.held is None:
            return False
        hx, hy = self.held
        return x <= hx < x + w and y <= hy < y + h

    # ── widgets ────────────────────────────────────────────────────────
    def button(self, s, x, y, w, h, label, enabled=True, tone='plain',
               small=False, sub=None):
        x, y, w, h = int(x), int(y), int(w), int(h)
        pressed = enabled and self.down(x, y, w, h)
        if not enabled:
            fill, edge, ink = COL['dirt1'], COL['dirt2'], COL['dim']
        elif tone == 'go':
            fill, edge, ink = (COL['amber_d'], COL['amber'], COL['ink'])
            if pressed:
                fill = COL['amber']
        elif tone == 'bad':
            fill, edge, ink = (COL['red_d'], COL['red'], COL['white'])
        else:
            fill, edge, ink = (COL['dirt2'], COL['dirt4'], COL['paper'])
            if pressed:
                fill = COL['dirt3']
        oy = 1 if pressed else 0
        rect(s, x, y + h - 1, w, 1, COL['dirt0'])
        rect(s, x, y + oy, w, h - 1, fill)
        frame(s, x, y + oy, w, h - 1, edge)
        ty = y + oy + (h - 1 - (5 if small else 7)) // 2
        if sub:
            ty = y + oy + 2
        text_c(s, label, x + w // 2, ty, ink, small=small)
        if sub:
            text_c(s, sub, x + w // 2, ty + (7 if not small else 6), ink, small=True)
        return enabled and self.hit(x, y, w, h)

    def icon_button(self, s, x, y, w, h, sprite, enabled=True):
        x, y, w, h = int(x), int(y), int(w), int(h)
        pressed = self.down(x, y, w, h)
        rect(s, x, y, w, h, COL['dirt3'] if pressed else COL['dirt2'])
        frame(s, x, y, w, h, COL['dirt4'])
        art.blit_c(s, sprite, x + w / 2, y + h / 2)
        return enabled and self.hit(x, y, w, h)


# ── HUD ────────────────────────────────────────────────────────────────
def chip(s, x, y, w, sprite, label, ink='paper'):
    rect(s, x, y, w, 12, COL['dirt1'])
    rect(s, x + 1, y + 1, w - 2, 1, COL['dirt2'])
    frame(s, x, y, w, 12, COL['dirt3'])
    art.blit_c(s, sprite, x + 7, y + 6)
    text(s, label, x + 14, y + 3, COL[ink] if isinstance(ink, str) else ink, small=True)


def fmt(n):
    n = int(n)
    return '%.1fK' % (n / 1000.0) if n >= 1000 else str(n)


def hud(s, g):
    st = g.st
    rect(s, 0, 0, VW, 25, COL['dirt0'])
    rect(s, 0, 25, VW, 1, COL['dirt3'])
    cw = 44
    for i, r in enumerate(save.RES):
        full = getattr(st, r) >= st.cap() - 0.5
        chip(s, 2 + i * (cw + 2), 1, cw, save.RES_ICON[r],
             fmt(getattr(st, r)), 'red' if full else 'paper')
    # health
    hpf = st.hp / max(1, st.max_hp())
    art.blit(s, 'ic_heart', 2, 16)
    bar(s, 11, 16, 44, 7, hpf, 'red' if hpf < 0.35 else 'leaf')
    text(s, '%d' % int(st.hp), 58, 17, COL['gray'], small=True)
    # eggs + roster + what you are carrying
    art.blit_c(s, 'it_egg', 82, 19)
    text(s, '%d/%d' % (st.eggs, save.egg_cap(st.lv('nursery'))), 88, 17,
         COL['paper'], small=True)
    art.blit(s, 'ic_ant', 116, 16)
    text(s, '%d+%d' % (st.workers, st.soldiers), 124, 17, COL['paper'], small=True)
    p = g.world.player
    full = len(p.carry) >= p.cap()
    text(s, 'BAG', 154, 17, COL['gray'], small=True)
    text(s, '%d/%d' % (len(p.carry), p.cap()), 172, 17,
         COL['amber'] if full else COL['paper'], small=True)


def toasts(s, g, y0=30):
    for i, t in enumerate(g.world.toasts[-3:]):
        a = min(1.0, t.life / 0.5)
        if a < 1.0 and int(t.life * 20) % 2 == 0:
            continue
        w = text_w(t.msg, small=True) + 8
        x = VW // 2 - w // 2
        y = y0 + i * 11
        rect(s, x, y, w, 9, COL['dirt0'])
        frame(s, x, y, w, 9, COL['dirt2'])
        text_c(s, t.msg, VW // 2, y + 2, COL[t.col], small=True)


# ── touch pad ──────────────────────────────────────────────────────────
def _octa(s, cx, cy, r, fill, edge):
    """A chunky octagonal button — reads as pixel art where a circle does not."""
    b = r // 3
    rect(s, cx - r, cy - r + b, r * 2, r * 2 - b * 2, fill)
    rect(s, cx - r + b, cy - r, r * 2 - b * 2, r * 2, fill)
    for i in range(b):                       # stepped corners
        rect(s, cx - r + i, cy - r + b - i, 1, 1, edge)
        rect(s, cx + r - i - 1, cy - r + b - i, 1, 1, edge)
        rect(s, cx - r + i, cy + r - b + i - 1, 1, 1, edge)
        rect(s, cx + r - i - 1, cy + r - b + i - 1, 1, 1, edge)
    rect(s, cx - r + b, cy - r, r * 2 - b * 2, 1, edge)
    rect(s, cx - r + b, cy + r - 1, r * 2 - b * 2, 1, edge)
    rect(s, cx - r, cy - r + b, 1, r * 2 - b * 2, edge)
    rect(s, cx + r - 1, cy - r + b, 1, r * 2 - b * 2, edge)


def pad(s, g, vh):
    """Virtual stick and buttons."""
    jx, jy, jr = 36, vh - 42, 26
    base = pygame.Surface((jr * 2 + 2, jr * 2 + 2), pygame.SRCALPHA)
    pygame.draw.circle(base, COL['dirt0'] + (150,), (jr + 1, jr + 1), jr)
    pygame.draw.circle(base, COL['dirt2'] + (90,), (jr + 1, jr + 1), jr - 3)
    pygame.draw.circle(base, COL['dirt4'] + (190,), (jr + 1, jr + 1), jr, 1)
    s.blit(base, (jx - jr - 1, jy - jr - 1))
    for i in range(4):                        # cardinal notches
        a = i * math.pi / 2
        nx, ny = jx + int(math.cos(a) * (jr - 3)), jy + int(math.sin(a) * (jr - 3))
        rect(s, nx - 1, ny - 1, 2, 2, COL['dirt4'])
    kx, ky = jx, jy
    if g.stick is not None:
        kx = jx + int(g.stick[0] * (jr - 10))
        ky = jy + int(g.stick[1] * (jr - 10))
    live = g.stick is not None
    rect(s, kx - 8, ky - 8, 16, 16, COL['dirt3'] if live else COL['dirt2'])
    frame(s, kx - 8, ky - 8, 16, 16, COL['amber_d'] if live else COL['dirt4'])
    rect(s, kx - 7, ky - 7, 14, 1, COL['dirt4'])
    art.blit_c(s, 'ic_ant', kx, ky)

    ax, ay, ar = VW - 34, vh - 42, 21
    cd = g.world.player.atk_cd
    ready = cd <= 0
    _octa(s, ax, ay, ar, COL['red_d'] if ready else COL['dirt1'],
          COL['red'] if ready else COL['dirt2'])
    if ready:
        rect(s, ax - ar + 7, ay - ar + 1, ar * 2 - 14, 1, (232, 128, 106))
    art.blit_c(s, 'ic_bite', ax, ay - 4)
    text_c(s, 'BITE', ax, ay + 6, COL['white'] if ready else COL['dim'], small=True)
    if not ready:                             # cooldown drains left to right
        w = int((ar * 2 - 10) * (1 - cd / 0.42))
        rect(s, ax - ar + 5, ay + ar - 5, ar * 2 - 10, 2, COL['dirt0'])
        rect(s, ax - ar + 5, ay + ar - 5, w, 2, COL['amber'])

    pr = g.world.prompt()
    if pr:
        label = pr[0]
        w = max(72, text_w(label, small=True) + 20)
        x, y = VW // 2 - w // 2, vh - 82
        glow = (math.sin(g.world.time * 5) + 1) * 0.5
        rect(s, x, y, w, 19, COL['dirt0'])
        rect(s, x + 1, y + 1, w - 2, 17, COL['dirt2'])
        frame(s, x, y, w, 19, COL['amber'] if glow > 0.5 else COL['amber_d'])
        rect(s, x + 2, y + 2, w - 4, 1, COL['dirt3'])
        text_c(s, label, VW // 2, y + 4, COL['amber_l'], small=True)
        text_c(s, 'E', VW // 2, y + 12, COL['dim'], small=True)
    return (jx, jy, jr), (ax, ay, ar)


# ── modal panels ───────────────────────────────────────────────────────
def modal(s, title, w=180, h=210, vh=356):
    x, y = (VW - w) // 2, (vh - h) // 2 - 10
    rect(s, 0, 0, VW, vh, (0, 0, 0))
    s.set_alpha(None)
    panel(s, x, y, w, h)
    rect(s, x + 1, y + 1, w - 2, 13, COL['dirt3'])
    text_c(s, title, x + w // 2, y + 4, COL['ink'])
    return x, y, w, h


def dim(s, vh, amount=150):
    veil = pygame.Surface((VW, vh))
    veil.fill(COL['black'])
    veil.set_alpha(amount)
    s.blit(veil, (0, 0))


def cost_row(s, st, cost, x, y):
    cx = x
    for r, v in cost.items():
        art.blit_c(s, save.RES_ICON[r], cx + 3, y + 3)
        ok = getattr(st, r) >= v
        text(s, str(v), cx + 8, y + 1, COL['paper'] if ok else COL['red'], small=True)
        cx += 12 + text_w(str(v), small=True)
    return cx
