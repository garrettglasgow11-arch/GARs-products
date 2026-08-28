"""Hand-authored pixel sprites.

Every sprite is a list of equal-length strings; each character indexes that
sprite's palette ('.' is transparent).  Sprites that move are baked into a
ring of pre-rotated surfaces at load time so drawing one is a plain blit.

Creatures are authored facing UP.
"""
import math
import pygame

from .pixel import COL

ROT_STEPS = 24


def _p(**kw):
    return kw


SPRITES = {
    # ── ants ───────────────────────────────────────────────────────────
    'ant_worker': _p(rot=True, pal={'1': (86, 60, 34), '2': (110, 74, 40),
                                    '3': (150, 104, 56), '4': (186, 138, 80)}, rows=[
        '..1.....1..',
        '...1...1...',
        '....1.1....',
        '....222....',
        '...23332...',
        '....232....',
        '.....2.....',
        '..1122211..',
        '11..232..11',
        '..1122211..',
        '...22222...',
        '..2333332..',
        '..2344432..',
        '..2333332..',
        '...22222...',
    ]),
    'ant_soldier': _p(rot=True, pal={'1': (74, 50, 28), '2': (92, 60, 30),
                                     '3': (128, 88, 44), '4': (168, 120, 62)}, rows=[
        '.1.........1.',
        '..1.......1..',
        '...1.....1...',
        '....1...1....',
        '.....222.....',
        '....23332....',
        '....22322....',
        '.....232.....',
        '......2......',
        '...1122211...',
        '11...232...11',
        '...1122211...',
        '....22222....',
        '..233333332..',
        '.23444444432.',
        '..233333332..',
        '...2222222...',
    ]),
    'ant_player': _p(rot=True, pal={'1': (132, 62, 36), '2': (162, 68, 38),
                                    '3': (206, 100, 54), '4': (240, 176, 72)}, rows=[
        '.1.........1.',
        '..1.......1..',
        '...1.....1...',
        '....1...1....',
        '.....222.....',
        '....23332....',
        '....24342....',
        '.....232.....',
        '......2......',
        '...1122211...',
        '11...232...11',
        '...1122211...',
        '....22222....',
        '..233333332..',
        '.23444444432.',
        '..233333332..',
        '...2222222...',
    ]),
    'ant_queen': _p(rot=True, pal={'1': (132, 76, 44), '2': (92, 44, 24), '3': (150, 80, 40),
                                   '4': 'amber'}, rows=[
        '...1.....1...',
        '....1...1....',
        '.....222.....',
        '....23332....',
        '....22222....',
        '.....222.....',
        '......2......',
        '...1122211...',
        '..1..232..1..',
        '.1...222...1.',
        '...2222222...',
        '..233333332..',
        '.23333333332.',
        '.23444444432.',
        '.23333333332.',
        '.23333333332.',
        '..233333332..',
        '...2222222...',
        '....22222....',
    ]),
    # ── other bugs ─────────────────────────────────────────────────────
    'aphid': _p(rot=True, pal={'1': (96, 140, 66), '2': (74, 122, 52), '3': (126, 178, 88)}, rows=[
        '..1...1..',
        '.2222222.',
        '233333332',
        '233333332',
        '.2222222.',
        '.1.1.1.1.',
        '..1...1..',
    ]),
    'beetle': _p(rot=True, pal={'1': (60, 46, 34), '2': (104, 84, 62), '3': (78, 62, 46),
                                '4': (146, 120, 88)}, rows=[
        '..1.....1..',
        '...22222...',
        '..2222222..',
        '.133333331.',
        '1.3343433.1',
        '1.3343433.1',
        '1.3343433.1',
        '.133333331.',
        '..3333333..',
        '...33333...',
        '....111....',
    ]),
    'spider': _p(rot=True, pal={'1': (92, 70, 80), '2': (96, 72, 82), '3': (138, 106, 120)}, rows=[
        '.1.1.....1.1.',
        '..1.1...1.1..',
        '...1.1.1.1...',
        '....22222....',
        '...2233222...',
        '..223333322..',
        '..233333332..',
        '..233333332..',
        '..223333322..',
        '...2222222...',
        '....22222....',
        '...1.1.1.1...',
        '..1.1...1.1..',
    ]),
    'grub': _p(rot=True, pal={'1': (86, 108, 48), '2': (108, 140, 62), '3': (150, 184, 90)}, rows=[
        '...222...',
        '..23332..',
        '..22222..',
        '.2333332.',
        '.2333332.',
        '.2222222.',
        '.2333332.',
        '.2333332.',
        '.2222222.',
        '.2333332.',
        '..22222..',
        '..2...2..',
        '...1.1...',
    ]),
    'wasp': _p(rot=True, pal={'1': (72, 62, 46), '2': (58, 50, 38), '3': (226, 182, 62),
                              '4': (216, 216, 224)}, rows=[
        '..1.....1..',
        '...22222...',
        '..2222222..',
        '...44444...',
        '.442222244.',
        '.442222244.',
        '..4333334..',
        '...33333...',
        '...22222...',
        '...33333...',
        '....333....',
        '.....1.....',
        '.....1.....',
    ]),
    'termite': _p(rot=True, pal={'1': (150, 132, 100), '2': (186, 168, 132), '3': (222, 208, 176)}, rows=[
        '..1...1..',
        '...1.1...',
        '...222...',
        '..22322..',
        '...222...',
        '....2....',
        '1..222..1',
        '.1.222.1.',
        '..12221..',
        '..22222..',
        '.2333332.',
        '.2222222.',
        '..22222..',
    ]),
    # ── items ──────────────────────────────────────────────────────────
    'it_leaf': _p(pal={'3': 'leaf', '4': (58, 96, 34)}, rows=[
        '..333..',
        '.33333.',
        '3333333',
        '3334333',
        '.34433.',
        '..343..',
        '...4...',
    ]),
    'it_seed': _p(pal={'3': (196, 156, 96), '4': (140, 104, 58)}, rows=[
        '.333.',
        '34433',
        '33333',
        '34333',
        '.333.',
    ]),
    'it_dew': _p(pal={'3': 'dew', '4': (255, 240, 190)}, rows=[
        '..3..',
        '.343.',
        '.333.',
        '33333',
        '33433',
        '33333',
        '.333.',
    ]),
    'it_sand': _p(pal={'3': 'sand', '4': (232, 204, 166)}, rows=[
        '.....',
        '..3..',
        '.333.',
        '33433',
        '33333',
    ]),
    'it_meat': _p(pal={'3': 'meat', '4': (232, 138, 118)}, rows=[
        '.33..',
        '33433',
        '33333',
        '33433',
        '.333.',
    ]),
    'it_egg': _p(pal={'3': (238, 230, 208), '4': (255, 255, 245)}, rows=[
        '.333.',
        '33333',
        '34333',
        '33333',
        '33333',
        '.333.',
        '.....',
    ]),
    # ── scenery ────────────────────────────────────────────────────────
    'env_rock': _p(pal={'3': (92, 84, 74), '4': (126, 118, 106)}, rows=[
        '..333....',
        '.33443...',
        '3344433..',
        '33444333.',
        '333333333',
        '.3333333.',
        '..33333..',
    ]),
    'env_grass': _p(pal={'3': (108, 152, 62), '4': (74, 105, 45)}, rows=[
        '3..3..3',
        '.3.3.3.',
        '.3.3.3.',
        '.43334.',
        '..444..',
        '.......',
        '.......',
    ]),
    'env_pebble': _p(pal={'3': (96, 88, 76), '4': (130, 122, 108)}, rows=[
        '.44..',
        '43334',
        '.333.',
    ]),
    'env_root': _p(pal={'3': (74, 54, 32), '4': (94, 70, 42)}, rows=[
        '..4....',
        '.3.4...',
        '.3..44.',
        '3....4.',
    ]),
    'env_flower': _p(pal={'3': (108, 152, 62), '4': (226, 196, 92), '5': (198, 104, 96)}, rows=[
        '.5.5.',
        '55455',
        '.5.5.',
        '..3..',
        '.3.3.',
        '..3..',
    ]),
    'env_mush': _p(pal={'3': (146, 74, 62), '4': (206, 188, 160)}, rows=[
        '.33333.',
        '3344433',
        '3333333',
        '.33333.',
        '...4...',
        '...4...',
        '..444..',
    ]),
    'env_plant': _p(pal={'3': (126, 176, 74), '4': (150, 110, 56)}, rows=[
        '....3......',
        '...333.....',
        '..33.33....',
        '.33...3....',
        '......3....',
        '....33333..',
        '...3333333.',
        '....33333..',
        '......3....',
        '...3333....',
        '..333333...',
        '...3333....',
        '......3....',
        '......3....',
        '.....444...',
    ]),
    # ── ui glyphs ──────────────────────────────────────────────────────
    'ic_ant': _p(pal={'1': 'amber'}, rows=[
        '.1...1.',
        '..111..',
        '...1...',
        '..111..',
        '...1...',
        '..111..',
        '..1.1..',
    ]),
    'ic_heart': _p(pal={'3': 'red'}, rows=[
        '.33.33.',
        '3333333',
        '3333333',
        '.33333.',
        '..333..',
        '...3...',
        '.......',
    ]),
    'ic_gear': _p(pal={'3': 'paper'}, rows=[
        '..333..',
        '.33333.',
        '33.3.33',
        '333.333',
        '33.3.33',
        '.33333.',
        '..333..',
    ]),
    'ic_bite': _p(pal={'3': (255, 214, 196)}, rows=[
        '.3.....3.',
        '.33...33.',
        '..33.33..',
        '...333...',
        '...3.3...',
        '..33.33..',
        '.33...33.',
        '.3.....3.',
        '.........',
    ]),
    'ic_arrow': _p(pal={'3': 'paper'}, rows=[
        '..3..',
        '.333.',
        '33333',
        '..3..',
        '..3..',
    ]),
    'ic_skull': _p(pal={'3': 'paper', '1': 'ink'}, rows=[
        '.33333.',
        '3333333',
        '3113113',
        '3113113',
        '3333333',
        '.31113.',
        '.......',
    ]),
}

baked = {}
rots = {}


def _col(v):
    return COL[v] if isinstance(v, str) else v


OUTLINE = (14, 10, 6)


def _outlined(surf, col=OUTLINE):
    """Return the sprite with a 1px dark rim, so it reads on any background."""
    w, h = surf.get_size()
    sil = surf.copy()
    # RGB_MIN drives every colour channel down to the rim colour but leaves
    # the alpha channel alone, giving a flat silhouette of the exact shape.
    sil.fill(col, special_flags=pygame.BLEND_RGB_MIN)
    out = pygame.Surface((w + 2, h + 2), pygame.SRCALPHA)
    for dx, dy in ((0, 1), (2, 1), (1, 0), (1, 2), (0, 0), (2, 0), (0, 2), (2, 2)):
        out.blit(sil, (dx, dy))
    out.blit(surf, (1, 1))
    return out


def bake_one(name):
    """Build the surface (and rotation ring) for one sprite."""
    spec = SPRITES[name]
    rows = spec['rows']
    w = len(rows[0])
    for i, r in enumerate(rows):
        if len(r) != w:
            raise ValueError(
                'sprite %r row %d is %d wide, expected %d' % (name, i, len(r), w))
    surf = pygame.Surface((w, len(rows)), pygame.SRCALPHA)
    pal = spec['pal']
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                if ch not in pal:
                    raise ValueError('sprite %r uses %r, not in its palette' % (name, ch))
                surf.set_at((x, y), _col(pal[ch]))
    if spec.get('outline', True) and not name.startswith(('env_', 'ic_')):
        surf = _outlined(surf)
    baked[name] = surf
    if spec.get('rot'):
        ring = []
        for i in range(ROT_STEPS):
            deg = -(i / ROT_STEPS * 360.0 + 90.0)
            ring.append(pygame.transform.rotate(surf, deg))
        rots[name] = ring
    return surf


def bake_all(progress=None):
    """Bake every sprite.  Yields (done, total) so a loading bar can step it."""
    names = list(SPRITES)
    for i, n in enumerate(names):
        bake_one(n)
        if progress:
            progress(i + 1, len(names))
    return len(names)


def size(name):
    s = baked[name]
    return s.get_width(), s.get_height()


def blit(surf, name, x, y):
    surf.blit(baked[name], (int(x), int(y)))


def blit_c(surf, name, cx, cy):
    s = baked[name]
    surf.blit(s, (int(cx - s.get_width() / 2), int(cy - s.get_height() / 2)))


def blit_rot(surf, name, cx, cy, ang):
    """Draw a rotation-baked sprite centred at (cx, cy) heading `ang` radians."""
    ring = rots[name]
    i = int(round(ang / (2 * math.pi) * ROT_STEPS)) % ROT_STEPS
    s = ring[i]
    surf.blit(s, (int(cx - s.get_width() / 2), int(cy - s.get_height() / 2)))


def tint(name, col):
    """A flat-coloured silhouette of a sprite, for hit flashes."""
    key = ('tint', name, col)
    s = baked.get(key)
    if s is None:
        s = baked[name].copy()
        # RGB_MAX leaves the alpha channel alone, so the silhouette is kept
        s.fill(col, special_flags=pygame.BLEND_RGB_MAX)
        baked[key] = s
    return s


def blit_rot_tint(surf, name, cx, cy, ang, col):
    """Rotation-baked draw, flashed to a flat colour."""
    ring = rots[name]
    i = int(round(ang / (2 * math.pi) * ROT_STEPS)) % ROT_STEPS
    key = ('tintrot', name, col, i)
    s = baked.get(key)
    if s is None:
        s = ring[i].copy()
        s.fill(col, special_flags=pygame.BLEND_RGB_MAX)
        baked[key] = s
    surf.blit(s, (int(cx - s.get_width() / 2), int(cy - s.get_height() / 2)))
