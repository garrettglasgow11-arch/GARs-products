"""The fan art gallery.

Each piece is a small routine that paints a scene at a given offset, using
drawing primitives plus the game's own sprites — the same pixel vocabulary the
game itself is drawn in.

PLACEHOLDER marks these as sample entries that shipped with the build so the
gallery has something in it.  Set it to False once real submissions replace
them, and the gallery stops labelling the entries as samples.
"""
import math

import pygame

from . import art
from .pixel import COL, frame, rect

PLACEHOLDER = True

ART_W, ART_H = 96, 68


def _sky(s, x, y, w, h, top, bot):
    for i in range(h):
        k = i / max(1, h - 1)
        rect(s, x, y + i, w, 1,
             tuple(int(top[c] + (bot[c] - top[c]) * k) for c in range(3)))


def _leaf_day(s, x, y, t):
    """A worker hauling a leaf home at sunset."""
    _sky(s, x, y, ART_W, 34, (252, 186, 112), (250, 232, 176))
    pygame.draw.circle(s, (255, 246, 214), (x + 70, y + 15), 9)
    pygame.draw.circle(s, (255, 226, 150), (x + 70, y + 15), 9, 1)
    for i in range(5):                                  # distant hills
        rect(s, x, y + 28 + i, ART_W, 1, (108, 132, 70))
    rect(s, x, y + 33, ART_W, ART_H - 33, (74, 108, 46))
    for i in range(90):                                 # grass speckle
        gx = (i * 37 + 11) % ART_W
        gy = 34 + (i * 19 + 7) % (ART_H - 34)
        rect(s, x + gx, y + gy, 1, 1,
             (96, 138, 58) if i % 2 else (58, 88, 36))
    for i in range(9):
        art.blit(s, 'env_grass', x + 3 + i * 11, y + 36 + (i % 3) * 8)
    art.blit(s, 'env_pebble', x + 12, y + 58)
    art.blit(s, 'env_pebble', x + 76, y + 52)

    # the leaf, drawn by hand so it dwarfs the ant carrying it
    lx, ly = x + 44, y + 44
    for i, (rw, rh, col) in enumerate(((17, 9, (52, 88, 30)), (15, 7, (104, 162, 60)),
                                       (12, 5, (142, 200, 84)))):
        pygame.draw.ellipse(s, col, (lx - rw, ly - rh, rw * 2, rh * 2))
    rect(s, lx - 14, ly, 28, 1, (52, 88, 30))
    for i in range(-3, 4):                              # veins
        rect(s, lx + i * 4, ly - 3, 1, 6, (78, 126, 44))
    art.blit_rot(s, 'ant_worker', lx - 1, ly + 7, -math.pi / 2)
    art.blit_rot(s, 'ant_worker', x + 20, y + 56, -math.pi / 2 - 0.4)


def _royal_sleep(s, x, y, t):
    """The queen at rest, deep in the nest."""
    rect(s, x, y, ART_W, ART_H, (30, 22, 14))
    for i in range(150):                                # soil grit
        gx, gy = (i * 53 + 9) % ART_W, (i * 29 + 5) % ART_H
        rect(s, x + gx, y + gy, 1, 1, (44, 32, 20) if i % 3 else (20, 14, 9))
    for i, (rw, rh, col) in enumerate(((44, 27, (52, 38, 24)), (40, 24, (72, 53, 33)),
                                       (35, 20, (92, 68, 42)))):
        pygame.draw.ellipse(s, col, (x + 48 - rw, y + 38 - rh, rw * 2, rh * 2))
    for i in range(26):                                 # warm glow off the queen
        a = i * math.tau / 26
        rect(s, int(x + 48 + math.cos(a) * 26), int(y + 38 + math.sin(a) * 15), 1, 1,
             (128, 96, 54))
    for i in range(5):                                  # roots through the ceiling
        art.blit(s, 'env_root', x + 4 + i * 19, y + 6 + (i % 2) * 4)
    art.blit_rot(s, 'ant_queen', x + 48, y + 36, -math.pi / 2)
    for i in range(6):
        art.blit_c(s, 'it_egg', x + 26 + i * 9, y + 56 + (i % 2) * 4)
    art.blit_rot(s, 'ant_worker', x + 18, y + 40, 0.5)
    art.blit_rot(s, 'ant_worker', x + 78, y + 42, math.pi - 0.5)
    art.blit_rot(s, 'ant_soldier', x + 84, y + 20, math.pi * 0.75)


PIECES = [
    dict(title='LEAF DAY',
         artist='MIRA OKONKWO',
         handle='@miradrawsbugs',
         date='MAR 2026',
         note='SENT IN AFTER A 40 HOUR SAVE. THE LEAF '
              'IS BIGGER THAN THE ANT ON PURPOSE.',
         draw=_leaf_day),
    dict(title='THE QUEEN SLEEPS',
         artist='DANIEL VASQUEZ',
         handle='@dv_pixels',
         date='APR 2026',
         note='DREW THIS AFTER MY FIRST NEST CLEAR. '
              'THE ROOTS ARE MY FAVOURITE PART.',
         draw=_royal_sleep),
]


def render(i, surf, x, y, t=0.0):
    """Paint piece `i` with a frame around it."""
    p = PIECES[i % len(PIECES)]
    rect(surf, x - 2, y - 2, ART_W + 4, ART_H + 4, COL['dirt0'])
    p['draw'](surf, x, y, t)
    frame(surf, x - 2, y - 2, ART_W + 4, ART_H + 4, COL['dirt4'])
    frame(surf, x - 1, y - 1, ART_W + 2, ART_H + 2, COL['dirt1'])
