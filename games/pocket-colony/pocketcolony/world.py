"""Maps, entities and the live simulation.

Two zones: COLONY (underground rooms you walk around to manage the nest) and
SURFACE (open ground you forage and fight on).  Both are tile maps carved out
of solid rock, pre-rendered once into a single surface each.
"""
import math
import random

import pygame

from . import art, save
from .pixel import COL, rect, text_c

TILE = 8


def _hash(x, y, s=0):
    h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791)
    h &= 0xFFFFFFFF
    h ^= h >> 13
    return (h * 1274126177) & 0xFFFFFFFF


class Map:
    """A tile grid plus the surface it pre-renders to."""

    def __init__(self, w, h, fill='#'):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]
        self.nodes = {}
        self.rooms = []
        self.surf = None

    # ── carving ────────────────────────────────────────────────────────
    def room(self, x, y, w, h, ch='.', tag=None):
        if tag:
            self.rooms.append((x, y, w, h, tag))
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < self.w and 0 <= yy < self.h:
                    self.g[yy][xx] = ch

    def corr_h(self, x1, x2, y, half=1):
        if x2 < x1:
            x1, x2 = x2, x1
        self.room(x1, y - half, x2 - x1 + 1, half * 2 + 1)

    def corr_v(self, x, y1, y2, half=1):
        if y2 < y1:
            y1, y2 = y2, y1
        self.room(x - half, y1, half * 2 + 1, y2 - y1 + 1)

    def node(self, key, tx, ty):
        self.nodes[key] = (tx * TILE + TILE // 2, ty * TILE + TILE // 2)

    # ── queries ────────────────────────────────────────────────────────
    def solid_tile(self, tx, ty):
        if tx < 0 or ty < 0 or tx >= self.w or ty >= self.h:
            return True
        return self.g[ty][tx] == '#'

    def solid_px(self, px, py):
        return self.solid_tile(int(px // TILE), int(py // TILE))

    def blocked(self, px, py, r=3):
        for dx, dy in ((-r, -r), (r, -r), (-r, r), (r, r)):
            if self.solid_px(px + dx, py + dy):
                return True
        return False

    def pw(self):
        return self.w * TILE

    def ph(self):
        return self.h * TILE

    def free_spot(self, rng, cx, cy, rad, tries=80):
        for _ in range(tries):
            a = rng.random() * math.tau
            d = rad * math.sqrt(rng.random())
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if not self.blocked(x, y, 4):
                return x, y
        return cx, cy


# ── map builders ───────────────────────────────────────────────────────
def build_colony():
    m = Map(46, 46)
    m.room(20, 2, 6, 4, tag='entrance')                       # entrance shaft head
    m.room(17, 10, 12, 6, tag='hub')                     # hub
    m.room(3, 9, 11, 7, tag='nursery')                       # nursery
    m.room(32, 9, 11, 7, tag='store')                      # storeroom
    m.room(16, 20, 14, 8, tag='queen')                     # royal chamber
    m.room(3, 24, 11, 7, tag='farm')                      # aphid farm
    m.room(32, 24, 11, 7, tag='barracks')                     # barracks
    m.room(17, 34, 12, 7, tag='tunnels')                     # tunnel works

    m.corr_v(23, 5, 11)
    m.corr_h(13, 18, 12)
    m.corr_h(28, 33, 12)
    m.corr_v(23, 15, 21)
    m.corr_v(8, 15, 25)
    m.corr_v(37, 15, 25)
    m.corr_v(23, 27, 35)
    m.corr_v(8, 30, 38)
    m.corr_h(8, 18, 38)
    m.corr_v(37, 30, 38)
    m.corr_h(28, 38, 38)

    m.node('E', 23, 3)      # up to the surface
    m.node('N', 8, 12)
    m.node('S', 37, 12)
    m.node('Q', 23, 24)
    m.node('F', 8, 27)
    m.node('B', 37, 27)
    m.node('T', 23, 37)
    m.spawn = m.nodes['E']
    render_colony(m)
    return m


def build_surface():
    rng = random.Random(0xC010)
    m = Map(60, 60, '.')
    for y in range(m.h):                      # rock border
        for x in range(m.w):
            if x < 2 or y < 2 or x >= m.w - 2 or y >= m.h - 2:
                m.g[y][x] = '#'
    home = (30, 30)
    keep = [home, (9, 9), (50, 10), (30, 50), (44, 26), (14, 36), (34, 14)]
    for _ in range(46):                       # rock clusters
        cx, cy = rng.randrange(4, m.w - 4), rng.randrange(4, m.h - 4)
        if any(abs(cx - kx) < 8 and abs(cy - ky) < 8 for kx, ky in keep):
            continue
        for _ in range(rng.randrange(2, 6)):
            x, y = cx + rng.randrange(-2, 3), cy + rng.randrange(-2, 3)
            if 2 < x < m.w - 3 and 2 < y < m.h - 3:
                m.g[y][x] = '#'
    m.node('H', *home)
    m.spawn = (home[0] * TILE + TILE // 2, home[1] * TILE + TILE // 2 + 16)
    m.plants = [(44, 26), (14, 36), (34, 14)]
    m.bugnests = [(9, 9), (50, 10), (30, 50)]
    render_surface(m)
    return m


# ── map pre-rendering ──────────────────────────────────────────────────
# Terrain is built from small pre-generated noise tiles rather than per-pixel
# work, which keeps load fast while avoiding any visible tiling checkerboard.

ROOM_TINT = {
    None:       ((48, 35, 22), (61, 44, 27), (76, 55, 34)),
    'entrance': ((54, 41, 26), (68, 52, 33), (84, 64, 41)),
    'hub':      ((52, 39, 25), (66, 49, 31), (82, 61, 39)),
    'queen':    ((57, 43, 25), (72, 55, 32), (90, 69, 41)),
    'nursery':  ((54, 43, 30), (69, 55, 39), (85, 69, 50)),
    'store':    ((50, 38, 25), (63, 49, 32), (78, 61, 40)),
    'farm':     ((46, 46, 28), (58, 59, 36), (73, 74, 45)),
    'barracks': ((52, 36, 27), (66, 46, 34), (81, 58, 43)),
    'tunnels':  ((52, 43, 31), (67, 55, 39), (84, 69, 49)),
}
WALL_TONES = ((22, 16, 10), (32, 23, 14), (43, 31, 20), (55, 40, 25))
GRASS_FAMILIES = (
    ((28, 42, 20), (38, 56, 26), (48, 70, 32)),
    ((34, 50, 24), (46, 68, 31), (58, 84, 39)),
    ((40, 58, 27), (54, 78, 36), (68, 96, 45)),
)
EARTH_FAMILY = ((58, 44, 28), (74, 56, 35), (92, 70, 44))


def _noise_tile(tones, weights, seed):
    """One TILE x TILE patch of weighted noise."""
    pool = []
    for col, wt in zip(tones, weights):
        pool += [col] * wt
    surf = pygame.Surface((TILE, TILE))
    for y in range(TILE):
        for x in range(TILE):
            surf.set_at((x, y), pool[_hash(x, y, seed) % len(pool)])
    return surf


def _tileset(tones, weights, n=6, salt=0):
    return [_noise_tile(tones, weights, salt * 97 + i + 1) for i in range(n)]


def render_colony(m):
    s = pygame.Surface((m.pw(), m.ph()))
    walls = _tileset(WALL_TONES, (5, 7, 4, 2), 6, salt=1)
    floors = {}
    for tag, tones in ROOM_TINT.items():
        floors[tag] = _tileset(tones, (5, 8, 3), 6, salt=hash(str(tag)) & 63)

    tag_at = {}
    for rx, ry, rw, rh, tag in m.rooms:
        for ty in range(ry, ry + rh):
            for tx in range(rx, rx + rw):
                tag_at[(tx, ty)] = tag

    for ty in range(m.h):
        for tx in range(m.w):
            px, py = tx * TILE, ty * TILE
            h = _hash(tx, ty)
            if m.g[ty][tx] == '#':
                s.blit(walls[h % len(walls)], (px, py))
            else:
                fam = floors[tag_at.get((tx, ty))]
                s.blit(fam[h % len(fam)], (px, py))
                if h % 11 == 0:                       # loose pebbles underfoot
                    art.blit(s, 'env_pebble', px + h % 3, py + (h >> 4) % 5)

    for ty in range(m.h):                             # wall lips and shadows
        for tx in range(m.w):
            px, py = tx * TILE, ty * TILE
            if m.g[ty][tx] == '#':
                if not m.solid_tile(tx, ty + 1):
                    rect(s, px, py + TILE - 2, TILE, 2, (66, 48, 30))
                    rect(s, px, py + TILE - 3, TILE, 1, (52, 38, 24))
                if not m.solid_tile(tx, ty - 1):
                    rect(s, px, py, TILE, 1, (18, 13, 8))
                if _hash(tx, ty, 5) % 9 == 0 and not m.solid_tile(tx, ty + 1):
                    art.blit(s, 'env_root', px + 1, py + TILE - 7)
            else:
                if m.solid_tile(tx, ty - 1):          # floor in the wall's shadow
                    rect(s, px, py, TILE, 2, (26, 19, 12))
                    rect(s, px, py + 2, TILE, 1, (36, 26, 17))
    m.surf = s


def render_surface(m):
    rng = random.Random(0x5EED)
    s = pygame.Surface((m.pw(), m.ph()))
    grass = [_tileset(fam, (4, 8, 3), 5, salt=10 + i)
             for i, fam in enumerate(GRASS_FAMILIES)]
    earth = _tileset(EARTH_FAMILY, (4, 8, 3), 5, salt=40)
    rocks = _tileset(WALL_TONES, (6, 6, 4, 2), 5, salt=60)

    # Bare-earth patches grow out from scattered centres with a ragged edge,
    # rather than snapping to a block grid.
    centres = [(rng.randrange(4, m.w - 4), rng.randrange(4, m.h - 4),
                rng.uniform(1.2, 2.7)) for _ in range(15)]

    def bare_at(tx, ty):
        jitter = (_hash(tx, ty, 11) % 5 - 2) * 0.42
        for cx, cy, r in centres:
            if (tx - cx) ** 2 + (ty - cy) ** 2 < (r + jitter) ** 2:
                return True
        return False

    for ty in range(m.h):
        for tx in range(m.w):
            px, py = tx * TILE, ty * TILE
            if m.g[ty][tx] == '#':
                s.blit(rocks[_hash(tx, ty) % 5], (px, py))
                continue
            # A coarse hash clusters tones into meadows; a per-tile roll lets
            # some tiles borrow the neighbouring meadow so edges dither.
            gx, gy = tx, ty
            if _hash(tx, ty, 4) % 10 < 3:
                gx, gy = tx + 2, ty + 2
            region = _hash(gx // 3, gy // 3, 2)
            fam = earth if bare_at(tx, ty) else grass[region % 3]
            s.blit(fam[_hash(tx, ty) % 5], (px, py))

    for ty in range(m.h):                             # rock silhouettes on walls
        for tx in range(m.w):
            if m.g[ty][tx] == '#' and _hash(tx, ty, 8) % 3:
                art.blit(s, 'env_rock', tx * TILE - 1, ty * TILE - 1)

    for _ in range(360):                              # ground cover
        x, y = rng.randrange(20, m.pw() - 20), rng.randrange(20, m.ph() - 20)
        if m.blocked(x, y, 5):
            continue
        r = rng.random()
        art.blit(s, 'env_grass' if r < 0.70 else
                 ('env_pebble' if r < 0.93 else
                  ('env_flower' if r < 0.98 else 'env_mush')), x, y)
    for tx, ty in m.plants:
        art.blit(s, 'env_plant', tx * TILE - 5, ty * TILE - 12)

    hx, hy = m.nodes['H']                             # the home mound
    for i, col in enumerate(((46, 33, 20), (66, 48, 29), (88, 65, 39), (110, 82, 50))):
        r = 34 - i * 6
        pygame.draw.ellipse(s, col, (hx - r, hy - r * 3 // 4, r * 2, r * 3 // 2))
    for i in range(40):                               # spoil grains on the rim
        a = rng.random() * math.tau
        d = 20 + rng.random() * 12
        rect(s, int(hx + math.cos(a) * d), int(hy + math.sin(a) * d * 0.72), 1, 1,
             (126, 96, 58))
    pygame.draw.ellipse(s, (8, 6, 4), (hx - 10, hy - 8, 20, 15))
    pygame.draw.ellipse(s, (30, 21, 13), (hx - 10, hy - 9, 20, 6))
    m.surf = s


# ── entities ───────────────────────────────────────────────────────────
class Being:
    """Anything that walks around."""
    sprite = 'ant_worker'
    radius = 3
    shadow = True

    def __init__(self, x, y):
        self.x, self.y = float(x), float(y)
        self.ang = -math.pi / 2
        self.hp = 1.0
        self.max = 1.0
        self.flash = 0.0
        self.dead = False
        self.wob = random.random() * math.tau

    def step(self, m, dx, dy, dt, spd):
        """Axis-separated tile collision."""
        n = math.hypot(dx, dy)
        if n > 1e-6:
            dx, dy = dx / n, dy / n
            self.ang = math.atan2(dy, dx)
            self.wob += dt * 9
        else:
            return False
        nx = self.x + dx * spd * dt
        if not m.blocked(nx, self.y, self.radius):
            self.x = nx
        ny = self.y + dy * spd * dt
        if not m.blocked(self.x, ny, self.radius):
            self.y = ny
        return True

    def toward(self, m, tx, ty, dt, spd):
        return self.step(m, tx - self.x, ty - self.y, dt, spd)

    def dist(self, o):
        return math.hypot(self.x - o.x, self.y - o.y)

    def hurt(self, n):
        self.hp -= n
        self.flash = 0.16
        if self.hp <= 0:
            self.dead = True
        return self.dead

    def draw(self, s, cx, cy):
        if self.shadow:
            rect(s, cx - 3, cy + 4, 6, 2, COL['dirt0'])
        if self.flash > 0:
            art.blit_rot_tint(s, self.sprite, cx, cy, self.ang, COL['white'])
        else:
            art.blit_rot(s, self.sprite, cx, cy, self.ang)


class Player(Being):
    sprite = 'ant_player'
    radius = 3

    def __init__(self, x, y, st):
        super().__init__(x, y)
        self.st = st
        self.max = float(st.max_hp())
        self.hp = max(1.0, min(float(st.hp), self.max))
        self.carry = []
        self.atk_cd = 0.0
        self.hurt_cd = 0.0
        self.swing = 0.0

    def cap(self):
        return save.carry_cap(self.st.lv('tunnels'))

    def speed(self):
        return save.move_speed(self.st.lv('tunnels'))


class Ant(Being):
    """A colony ant that follows the player around on the surface."""

    def __init__(self, x, y, kind):
        super().__init__(x, y)
        self.kind = kind
        self.sprite = 'ant_soldier' if kind == 'soldier' else 'ant_worker'
        self.carry = None
        self.target = None
        self.atk_cd = 0.0
        self.seed = random.random() * math.tau


class Enemy(Being):
    def __init__(self, x, y, kind, lvl):
        super().__init__(x, y)
        self.kind = kind
        self.sprite = kind
        self.lvl = lvl
        self.max = ENEMY[kind]['hp'] * (1 + 0.35 * (lvl - 1))
        self.hp = self.max
        self.atk_cd = random.random()
        self.home = (x, y)
        self.radius = 4
        self.nest = None

    @property
    def spec(self):
        return ENEMY[self.kind]


ENEMY = {
    'grub':    dict(hp=22, atk=3, spd=16, name='GRUB',    meat=3, sight=52),
    'beetle':  dict(hp=46, atk=6, spd=22, name='BEETLE',  meat=6, sight=64),
    'termite': dict(hp=34, atk=5, spd=26, name='TERMITE', meat=4, sight=70),
    'wasp':    dict(hp=58, atk=9, spd=34, name='WASP',    meat=9, sight=88),
    'spider':  dict(hp=80, atk=12, spd=28, name='SPIDER', meat=13, sight=96),
}
NEST_KINDS = [('grub', 'beetle'), ('termite', 'wasp'), ('wasp', 'spider')]


class Item:
    def __init__(self, x, y, res):
        self.x, self.y = float(x), float(y)
        self.res = res
        self.sprite = save.RES_ICON[res]
        self.bob = random.random() * math.tau

    def draw(self, s, cx, cy):
        art.blit_c(s, self.sprite, cx, cy + math.sin(self.bob) * 1.2)


class Aphid(Being):
    sprite = 'aphid'
    radius = 3

    def __init__(self, x, y):
        super().__init__(x, y)
        self.home = (x, y)
        self.cd = 0.0
        self.t = random.random() * math.tau


class BugNest:
    def __init__(self, tx, ty, idx):
        self.x, self.y = tx * TILE + 4, ty * TILE + 4
        self.idx = idx
        self.max = 120 + idx * 110
        self.hp = self.max
        self.cd = 4.0
        self.kinds = NEST_KINDS[idx]
        self.flash = 0.0
        self.dead = False

    def hurt(self, n):
        self.hp -= n
        self.flash = 0.16
        if self.hp <= 0:
            self.dead = True
        return self.dead

    def draw(self, s, cx, cy):
        hit = self.flash > 0
        for i, col in enumerate(((26, 18, 14), (44, 30, 22), (58, 40, 28))):
            r = 17 - i * 4
            pygame.draw.ellipse(s, COL['white'] if hit and i == 0 else col,
                                (cx - r, cy - r * 3 // 4, r * 2, r * 3 // 2))
        for i in range(9):                       # chewed debris around the rim
            a = i * math.tau / 9 + self.idx
            rect(s, int(cx + math.cos(a) * 15), int(cy + math.sin(a) * 11), 2, 2,
                 (72, 52, 36))
        pygame.draw.ellipse(s, (6, 4, 3), (cx - 7, cy - 5, 14, 11))
        glow = 120 + int(90 * (0.5 + 0.5 * math.sin(self.hp * 0.1 + self.idx)))
        rect(s, cx - 3, cy - 1, 1, 1, (glow, 40, 34))
        rect(s, cx + 2, cy - 1, 1, 1, (glow, 40, 34))
        if self.hp < self.max:
            rect(s, cx - 11, cy - 17, 22, 4, COL['dirt0'])
            rect(s, cx - 10, cy - 16, int(20 * self.hp / self.max), 2, COL['red'])


class Particle:
    def __init__(self, x, y, vx, vy, life, col, size=1):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.life = self.max = life
        self.col = col
        self.size = size

    def update(self, dt):
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.vx *= 0.9
        self.vy *= 0.9
        self.life -= dt
        return self.life > 0


class Float:
    """A damage number drifting up off whatever was hit."""

    def __init__(self, x, y, msg, col):
        self.x, self.y, self.msg, self.col = x, y, msg, col
        self.life = self.max = 0.75

    def update(self, dt):
        self.y -= dt * 22
        self.life -= dt
        return self.life > 0


class Toast:
    def __init__(self, msg, col='paper', life=2.6):
        self.msg = msg
        self.col = col
        self.life = self.max = life


ITEM_VALUE = {'leaf': 5, 'dew': 4, 'sand': 6, 'meat': 4}
ITEM_WEIGHT = (('leaf', 46), ('sand', 26), ('seed_leaf', 16), ('dew', 12))
CHAMBER_LABEL = {c['node']: c for c in save.CHAMBERS}


class World:
    """Owns both zones, every entity, and the simulation."""

    def __init__(self, st):
        self.st = st
        self.colony = build_colony()
        self.surface = build_surface()
        self.zone = 'colony'
        self.map = self.colony
        self.player = Player(self.colony.spawn[0], self.colony.spawn[1] + 10, st)
        self.ants, self.enemies, self.items = [], [], []
        self.aphids, self.nests, self.parts, self.toasts = [], [], [], []
        self.cam = [0.0, 0.0]
        self.item_t = 1.0
        self.time = 0.0
        self.freeze_spawns = False
        self.god = False
        self.noclip = False
        self.show_numbers = True
        self.rng = random.Random()
        self.floats = []
        self.on_event = None
        self._populate()
        self.sync_ants()
        self.snap_camera()

    # ── setup ──────────────────────────────────────────────────────────
    def _populate(self):
        for i, (tx, ty) in enumerate(self.surface.bugnests):
            self.nests.append(BugNest(tx, ty, i))
        for tx, ty in self.surface.plants:
            px, py = tx * TILE, ty * TILE
            for _ in range(3):
                x, y = self.surface.free_spot(self.rng, px, py, 22)
                self.aphids.append(Aphid(x, y))
        for _ in range(9):
            self.spawn_item()

    def sync_ants(self):
        """Make the ant list match the colony roster."""
        for kind, want in (('worker', self.st.workers), ('soldier', self.st.soldiers)):
            have = [a for a in self.ants if a.kind == kind]
            while len(have) < want:
                x, y = self.player.x + self.rng.uniform(-14, 14), \
                       self.player.y + self.rng.uniform(-14, 14)
                a = Ant(x, y, kind)
                a.max = a.hp = save.soldier_hp(self.st.lv('barracks')) if kind == 'soldier' else 12
                self.ants.append(a)
                have.append(a)
            while len(have) > want:
                self.ants.remove(have.pop())

    def spawn_item(self, res=None, x=None, y=None):
        if res is None:
            roll = self.rng.randrange(sum(w for _, w in ITEM_WEIGHT))
            for k, w in ITEM_WEIGHT:
                roll -= w
                if roll < 0:
                    res = k
                    break
            if res == 'seed_leaf':
                res = 'leaf'
        if x is None:
            x, y = self.surface.free_spot(
                self.rng, self.rng.randrange(40, self.surface.pw() - 40),
                self.rng.randrange(40, self.surface.ph() - 40), 30)
        self.items.append(Item(x, y, res))
        return self.items[-1]

    # ── zone switching ─────────────────────────────────────────────────
    def enter(self, zone):
        if zone == self.zone:
            return
        self.zone = zone
        self.map = self.colony if zone == 'colony' else self.surface
        if zone == 'colony':
            self.player.x, self.player.y = self.colony.spawn[0], self.colony.spawn[1] + 10
            self.deposit_player()
        else:
            self.player.x, self.player.y = self.surface.spawn
        for a in self.ants:
            a.x = self.player.x + self.rng.uniform(-16, 16)
            a.y = self.player.y + self.rng.uniform(-16, 16)
            a.carry = None
            a.target = None
        self.fire('zone')
        self.snap_camera()

    def deposit_player(self):
        if not self.player.carry:
            return
        tally = {}
        for res in self.player.carry:
            got = self.st.add(res, ITEM_VALUE[res])
            tally[res] = tally.get(res, 0) + got
        self.player.carry = []
        bits = ' '.join('+%d %s' % (v, save.RES_NAME[k]) for k, v in tally.items() if v)
        self.toast(bits or 'STORES ARE FULL', 'leaf' if bits else 'red')
        self.fire('deposit' if bits else 'error')

    # ── feedback ───────────────────────────────────────────────────────
    def fire(self, name, x=0.0, y=0.0):
        """Tell the shell something happened, so it can play a sound or shake."""
        if self.on_event:
            self.on_event(name, x, y)

    def number(self, x, y, msg, col='white'):
        self.floats.append(Float(x, y, msg, COL[col]))
        del self.floats[:-24]

    def toast(self, msg, col='paper'):
        self.toasts.append(Toast(msg, col))
        del self.toasts[:-4]

    def puff(self, x, y, n=6, col=None, spd=40):
        for _ in range(n):
            a = self.rng.random() * math.tau
            v = self.rng.uniform(0.3, 1.0) * spd
            self.parts.append(Particle(x, y, math.cos(a) * v, math.sin(a) * v,
                                       self.rng.uniform(0.2, 0.5),
                                       col or COL['dirt3']))

    # ── update ─────────────────────────────────────────────────────────
    def update(self, dt, inp):
        self.time += dt
        self.st.tick(dt)
        self._player(dt, inp)
        if self.zone == 'surface':
            self._surface(dt)
        self._ants(dt)
        self._fx(dt)
        self.camera(dt)

    def _player(self, dt, inp):
        p = self.player
        p.atk_cd = max(0.0, p.atk_cd - dt)
        p.hurt_cd = max(0.0, p.hurt_cd - dt)
        p.swing = max(0.0, p.swing - dt)
        p.flash = max(0.0, p.flash - dt)
        if inp.mx or inp.my:
            if self.noclip:
                n = math.hypot(inp.mx, inp.my)
                p.ang = math.atan2(inp.my, inp.mx)
                p.x += inp.mx / n * p.speed() * 2.0 * dt
                p.y += inp.my / n * p.speed() * 2.0 * dt
                p.x = max(0, min(self.map.pw(), p.x))
                p.y = max(0, min(self.map.ph(), p.y))
            else:
                p.step(self.map, inp.mx, inp.my, dt, p.speed())
        if inp.attack and p.atk_cd <= 0:
            self.swing()
        if self.zone == 'surface':
            for it in list(self.items):
                if len(p.carry) < p.cap() and math.hypot(p.x - it.x, p.y - it.y) < 7:
                    p.carry.append(it.res)
                    self.items.remove(it)
                    self.puff(it.x, it.y, 3, COL['amber_l'], 22)
                    self.fire('pickup', it.x, it.y)
        if self.zone == 'colony' and p.hp < self.st.max_hp():
            p.hp = min(self.st.max_hp(), p.hp + dt * 2.2)
        self.st.hp = p.hp

    def swing(self):
        """Mandible attack: a short arc in front of the player."""
        p = self.player
        p.atk_cd = 0.42
        p.swing = 0.2
        dmg = save.player_atk(self.st.lv('barracks'))
        hx, hy = p.x + math.cos(p.ang) * 11, p.y + math.sin(p.ang) * 11
        self.puff(hx, hy, 3, COL['amber_l'], 26)
        self.fire('bite', hx, hy)
        hit = False
        for e in list(self.enemies):
            if math.hypot(e.x - hx, e.y - hy) < 13:
                hit = True
                self.number(e.x, e.y - 10, str(int(dmg)), 'white')
                if e.hurt(dmg):
                    self.kill_enemy(e)
        for n in list(self.nests):
            if not n.dead and math.hypot(n.x - hx, n.y - hy) < 18:
                hit = True
                self.number(n.x, n.y - 14, str(int(dmg)), 'white')
                if n.hurt(dmg):
                    self.kill_nest(n)
        if hit:
            self.puff(hx, hy, 5, COL['red'], 40)
            self.fire('hit', hx, hy)

    def kill_enemy(self, e):
        if e in self.enemies:
            self.enemies.remove(e)
        self.st.kills += 1
        self.puff(e.x, e.y, 9, COL['meat'], 55)
        self.fire('kill', e.x, e.y)
        for _ in range(1 + self.rng.randrange(2)):
            x, y = self.map.free_spot(self.rng, e.x, e.y, 12)
            self.spawn_item('meat', x, y)

    def kill_nest(self, n):
        self.nests.remove(n)
        self.st.nests_cleared += 1
        self.puff(n.x, n.y, 22, COL['dirt3'], 70)
        for _ in range(6 + n.idx * 3):
            x, y = self.map.free_spot(self.rng, n.x, n.y, 26)
            self.spawn_item(self.rng.choice(('leaf', 'meat', 'sand', 'dew')), x, y)
        self.toast('NEST DESTROYED', 'amber')
        self.fire('kill', n.x, n.y)
        self._nest_respawn = getattr(self, '_nest_respawn', [])
        self._nest_respawn.append([120.0, n.idx])

    def _surface(self, dt):
        if not self.freeze_spawns:
            self.item_t -= dt
            if self.item_t <= 0:
                self.item_t = 2.2 + self.rng.random() * 2.0
                if len(self.items) < 16:
                    self.spawn_item()
        for a in self.aphids:                       # aphids mill about the plants
            a.cd = max(0.0, a.cd - dt)
            a.t += dt
            if self.rng.random() < dt * 0.7:
                a.toward(self.map, a.home[0] + self.rng.uniform(-16, 16),
                         a.home[1] + self.rng.uniform(-16, 16), dt, 10)
            else:
                a.wob += dt * 3
        for n in self.nests:                        # nests spawn defenders
            n.flash = max(0.0, n.flash - dt)
            n.cd -= dt
            mine = [e for e in self.enemies if e.nest is n]
            if n.cd <= 0 and not self.freeze_spawns and len(mine) < 3 + n.idx:
                n.cd = 7.0 - n.idx
                kind = self.rng.choice(n.kinds)
                x, y = self.map.free_spot(self.rng, n.x, n.y, 26)
                e = Enemy(x, y, kind, n.idx + 1)
                e.nest = n
                self.enemies.append(e)
        for rs in getattr(self, '_nest_respawn', [])[:]:
            rs[0] -= dt
            if rs[0] <= 0:
                self._nest_respawn.remove(rs)
                tx, ty = self.surface.bugnests[rs[1]]
                self.nests.append(BugNest(tx, ty, rs[1]))
        for e in list(self.enemies):
            self._enemy(e, dt)

    def _enemy(self, e, dt):
        e.flash = max(0.0, e.flash - dt)
        e.atk_cd = max(0.0, e.atk_cd - dt)
        sp = e.spec
        best, bd = None, sp['sight']
        for t in [self.player] + self.ants:
            d = math.hypot(t.x - e.x, t.y - e.y)
            if d < bd:
                best, bd = t, d
        if best is not None:
            e.toward(self.map, best.x, best.y, dt, sp['spd'])
            if bd < 10 and e.atk_cd <= 0:
                e.atk_cd = 1.1
                self.bite(e, best, sp['atk'] * (1 + 0.3 * (e.lvl - 1)))
        else:
            hx, hy = e.home
            if math.hypot(e.x - hx, e.y - hy) > 40:
                e.toward(self.map, hx, hy, dt, sp['spd'] * 0.6)
            elif self.rng.random() < dt * 0.9:
                e.toward(self.map, e.x + self.rng.uniform(-30, 30),
                         e.y + self.rng.uniform(-30, 30), dt, sp['spd'] * 0.5)

    def bite(self, e, target, dmg):
        if target is self.player:
            if self.god or self.player.hurt_cd > 0:
                return
            self.player.hurt_cd = 0.55
            self.player.hurt(dmg)
            self.st.hp = self.player.hp
            self.puff(self.player.x, self.player.y, 5, COL['red'], 45)
            self.number(self.player.x, self.player.y - 12, '-%d' % int(dmg), 'red')
            self.fire('hurt', self.player.x, self.player.y)
            if self.player.hp <= 0:
                self.player_down()
        else:
            if target.hurt(dmg):
                self.ants.remove(target)
                if target.kind == 'worker':
                    self.st.workers = max(0, self.st.workers - 1)
                else:
                    self.st.soldiers = max(0, self.st.soldiers - 1)
                self.toast('A %s WAS KILLED' % target.kind.upper(), 'red')
                self.puff(target.x, target.y, 8, COL['meat'], 50)

    def player_down(self):
        self.st.deaths += 1
        keep = self.player.carry[:len(self.player.carry) // 2]
        self.player.carry = keep
        self.player.hp = self.st.max_hp() * 0.6
        self.player.dead = False
        self.toast('YOU WERE DRAGGED HOME', 'red')
        self.enter('colony')

    def _ants(self, dt):
        p = self.player
        for i, a in enumerate(self.ants):
            a.flash = max(0.0, a.flash - dt)
            a.atk_cd = max(0.0, a.atk_cd - dt)
            spd = save.move_speed(self.st.lv('tunnels')) * 0.86
            if a.kind == 'soldier':
                foe, fd = None, 74
                for e in self.enemies:
                    d = math.hypot(e.x - a.x, e.y - a.y)
                    if d < fd:
                        foe, fd = e, d
                if foe is not None and self.zone == 'surface':
                    a.toward(self.map, foe.x, foe.y, dt, spd)
                    if fd < 11 and a.atk_cd <= 0:
                        a.atk_cd = 0.6
                        foe.flash = 0.16
                        if foe.hurt(save.soldier_atk(self.st.lv('barracks')) * 0.6):
                            self.kill_enemy(foe)
                    continue
            elif self.zone == 'surface':
                if a.carry is not None:
                    hx, hy = self.surface.nodes['H']
                    a.toward(self.map, hx, hy, dt, spd)
                    if math.hypot(a.x - hx, a.y - hy) < 12:
                        self.st.add(a.carry, ITEM_VALUE[a.carry])
                        a.carry = None
                        self.puff(a.x, a.y, 3, COL['amber_l'], 20)
                    continue
                if a.target is not None and a.target not in self.items:
                    a.target = None
                if a.target is None:
                    best, bd = None, 88
                    for it in self.items:
                        d = math.hypot(it.x - a.x, it.y - a.y)
                        if d < bd and not any(o.target is it for o in self.ants):
                            best, bd = it, d
                    a.target = best
                if a.target is not None:
                    a.toward(self.map, a.target.x, a.target.y, dt, spd)
                    if math.hypot(a.x - a.target.x, a.y - a.target.y) < 7:
                        if a.target in self.items:
                            self.items.remove(a.target)
                            a.carry = a.target.res
                        a.target = None
                    continue
            # default: keep formation around the player
            ang = a.seed + self.time * 0.5
            r = 15 + (i % 3) * 7
            tx, ty = p.x + math.cos(ang) * r, p.y + math.sin(ang) * r
            if math.hypot(a.x - tx, a.y - ty) > 5:
                a.toward(self.map, tx, ty, dt, spd * 0.9)

    def _fx(self, dt):
        self.parts = [q for q in self.parts if q.update(dt)]
        self.floats = [f for f in self.floats if f.update(dt)]
        for t in self.toasts:
            t.life -= dt
        self.toasts = [t for t in self.toasts if t.life > 0]

    # ── camera ─────────────────────────────────────────────────────────
    def view(self):
        from .pixel import VW, VH
        return VW, VH

    def target_cam(self):
        vw, vh = self.view()
        cx = self.player.x - vw / 2
        cy = self.player.y - vh / 2 + 16
        cx = max(0, min(self.map.pw() - vw, cx)) if self.map.pw() > vw else (self.map.pw() - vw) / 2
        cy = max(0, min(self.map.ph() - vh, cy)) if self.map.ph() > vh else (self.map.ph() - vh) / 2
        return cx, cy

    def camera(self, dt):
        tx, ty = self.target_cam()
        k = min(1.0, dt * 7.0)
        self.cam[0] += (tx - self.cam[0]) * k
        self.cam[1] += (ty - self.cam[1]) * k

    def snap_camera(self):
        self.cam = list(self.target_cam())

    # ── interaction ────────────────────────────────────────────────────
    def prompt(self):
        """The single contextual action available right now, or None."""
        p = self.player
        if self.zone == 'colony':
            for key, (nx, ny) in self.map.nodes.items():
                if math.hypot(p.x - nx, p.y - ny) < 15:
                    if key == 'E':
                        return ('GO UP', 'zone', 'surface')
                    c = CHAMBER_LABEL[key]
                    return (c['name'], 'chamber', c['id'])
            return None
        hx, hy = self.surface.nodes['H']
        if math.hypot(p.x - hx, p.y - hy) < 18:
            return ('ENTER NEST', 'zone', 'colony')
        for a in self.aphids:
            if math.hypot(p.x - a.x, p.y - a.y) < 13:
                return ('MILK APHID' if a.cd <= 0 else 'APHID RESTING', 'milk', a)
        return None

    def do_action(self):
        pr = self.prompt()
        if pr is None:
            return None
        label, kind, target = pr
        if kind == 'zone':
            self.enter(target)
            return None
        if kind == 'milk':
            if target.cd <= 0:
                target.cd = 7.0
                got = self.st.add('dew', 4)
                self.puff(target.x, target.y, 5, COL['dew'], 30)
                self.toast('+%d DEW' % got if got else 'DEW STORE FULL',
                           'dew' if got else 'red')
                self.number(target.x, target.y - 10, '+%d' % got, 'dew')
                self.fire('pickup' if got else 'error', target.x, target.y)
            return None
        if kind == 'chamber':
            return target        # scenes.py opens the panel
        return None

    # ── drawing ────────────────────────────────────────────────────────
    def draw(self, s):
        vw, vh = self.view()
        cx, cy = int(self.cam[0]), int(self.cam[1])
        s.fill(COL['black'])
        # map region, tolerating a map smaller than the view
        sx, sy = max(0, cx), max(0, cy)
        dx, dy = max(0, -cx), max(0, -cy)
        w = min(vw - dx, self.map.pw() - sx)
        h = min(vh - dy, self.map.ph() - sy)
        if w > 0 and h > 0:
            s.blit(self.map.surf, (dx, dy), pygame.Rect(sx, sy, w, h))

        if self.zone == 'colony':
            self._draw_chambers(s, cx, cy)
        else:
            for it in self.items:
                if self._on(it.x, it.y, cx, cy):
                    it.draw(s, int(it.x - cx), int(it.y - cy))
            for n in self.nests:
                if self._on(n.x, n.y, cx, cy, 26):
                    n.draw(s, int(n.x - cx), int(n.y - cy))
            for a in self.aphids:
                if self._on(a.x, a.y, cx, cy):
                    a.draw(s, int(a.x - cx), int(a.y - cy))

        movers = self.ants + self.enemies + [self.player]
        movers.sort(key=lambda e: e.y)
        for e in movers:
            if not self._on(e.x, e.y, cx, cy, 16):
                continue
            ex, ey = int(e.x - cx), int(e.y - cy)
            e.draw(s, ex, ey)
            carried = getattr(e, 'carry', None)
            if isinstance(carried, str):                      # an ant hauling
                art.blit_c(s, save.RES_ICON[carried],
                           ex + math.cos(e.ang) * 7, ey + math.sin(e.ang) * 7 - 2)
            if isinstance(e, Enemy) and e.hp < e.max:
                rect(s, ex - 7, ey - 12, 14, 3, COL['dirt0'])
                rect(s, ex - 6, ey - 11, int(12 * e.hp / e.max), 1, COL['red'])

        p = self.player
        if p.swing > 0:                                       # mandible arc
            for k in (-0.5, 0.0, 0.5):
                ax = int(p.x - cx + math.cos(p.ang + k) * 10)
                ay = int(p.y - cy + math.sin(p.ang + k) * 10)
                rect(s, ax, ay, 2, 2, COL['amber_l'])
        for i, res in enumerate(p.carry):                     # what you're carrying
            art.blit_c(s, save.RES_ICON[res],
                       int(p.x - cx) - (len(p.carry) - 1) * 3 + i * 6, int(p.y - cy) - 13)

        if getattr(self, 'show_numbers', True):
            for f in self.floats:
                if f.life < 0.25 and int(f.life * 24) % 2:
                    continue
                from .pixel import text_sh_c
                text_sh_c(s, f.msg, int(f.x - cx), int(f.y - cy), f.col, small=True)
        for q in self.parts:
            a = q.life / q.max
            if a > 0.25 or int(self.time * 30) % 2:
                rect(s, int(q.x - cx), int(q.y - cy), q.size + (1 if a > 0.6 else 0),
                     q.size + (1 if a > 0.6 else 0), q.col)

    def _on(self, x, y, cx, cy, pad=12):
        vw, vh = self.view()
        return -pad < x - cx < vw + pad and -pad < y - cy < vh + pad

    def _draw_chambers(self, s, cx, cy):
        """Furnish each room so it is recognisable at a glance."""
        st = self.st
        for key, (nx, ny) in self.map.nodes.items():
            x, y = int(nx - cx), int(ny - cy)
            if not (-4 < nx - cx < 204 and 20 < ny - cy < 300):
                continue
            if key == 'E':
                for i in range(4):                            # daylight down the shaft
                    rect(s, x - 7 + i, y - 22 + i * 2, 14 - i * 2, 2,
                         (58 + i * 14, 52 + i * 12, 34 + i * 8))
                art.blit_c(s, 'ic_arrow', x, y - 4)
                continue
            if key == 'Q':
                art.blit_rot(s, 'ant_queen', x, y + 2, -math.pi / 2)
                for i in range(3):
                    art.blit_c(s, 'it_egg', x - 16 + i * 9, y + 12)
            elif key == 'N':
                n = min(6, st.eggs)
                for i in range(6):
                    ex, ey = x - 15 + (i % 3) * 10, y - 4 + (i // 3) * 9
                    if i < n:
                        art.blit_c(s, 'it_egg', ex, ey)
                    else:
                        rect(s, ex - 2, ey, 4, 2, COL['dirt1'])
            elif key == 'S':
                for i, r in enumerate(save.RES):
                    frac = getattr(st, r) / max(1, st.cap())
                    hgt = int(1 + frac * 9)
                    rect(s, x - 14 + i * 8, y + 6 - hgt, 6, hgt, COL[
                        {'leaf': 'leaf', 'dew': 'dew', 'sand': 'sand', 'meat': 'meat'}[r]])
                    art.blit_c(s, save.RES_ICON[r], x - 11 + i * 8, y + 12)
            elif key == 'T':
                art.blit(s, 'env_rock', x - 14, y - 2)
                art.blit(s, 'env_rock', x + 4, y + 2)
                for i in range(3):
                    art.blit_c(s, 'it_sand', x - 4 + i * 6, y + 10)
            elif key == 'B':
                if st.lv('barracks'):
                    for i in range(min(4, max(1, st.soldiers))):
                        art.blit_rot(s, 'ant_soldier', x - 12 + i * 9, y + 2, -math.pi / 2)
                else:
                    rect(s, x - 12, y - 2, 24, 3, COL['dirt1'])
            elif key == 'F':
                if st.lv('farm'):
                    for i in range(3):
                        art.blit_rot(s, 'aphid', x - 12 + i * 11, y + 2,
                                     math.sin(self.time + i) * 0.4)
                else:
                    rect(s, x - 12, y - 2, 24, 3, COL['dirt1'])
            c = CHAMBER_LABEL.get(key)
            if c:
                lv = st.lv(c['id'])
                tag = '%s  LV%d' % (c['name'], lv) if lv else '%s  LOCKED' % c['name']
                text_c(s, tag, x, y - 22, COL['amber'] if lv else COL['dim'], small=True)
