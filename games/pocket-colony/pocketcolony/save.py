"""Colony state, the tuning numbers, and persistence.

No pygame in here — this module is pure data and rules, which is what makes
the self-tests in debug.py able to exercise it directly.
"""
import json
import os
import sys
import time

SAVE_VERSION = 2
RES = ('leaf', 'dew', 'sand', 'meat')
RES_NAME = {'leaf': 'LEAF', 'dew': 'DEW', 'sand': 'SAND', 'meat': 'MEAT'}
RES_ICON = {'leaf': 'it_leaf', 'dew': 'it_dew', 'sand': 'it_sand', 'meat': 'it_meat'}

MAX_IDLE = 8 * 3600          # seconds of away-progress ever granted


# ── curves ─────────────────────────────────────────────────────────────
def egg_interval(l):  return 20.0 / (1 + (l - 1) * 0.5)
def egg_cap(l):       return 3 + l * 3
def res_cap(l):       return 120 + l * 140
def worker_cap(l):    return 2 + l * 2
def soldier_cap(l):   return l * 2
def carry_cap(l):     return 2 + l
def move_speed(l):    return 42.0 + l * 3.0
def soldier_atk(l):   return 4 + l * 2
def soldier_hp(l):    return 16 + l * 6
def player_atk(l):    return 6 + l * 2
def player_hp(l):     return 24 + l * 8
def dew_rate(l):      return l * 0.22

EGG_COST = {'leaf': 6, 'meat': 2}
HATCH_COST = {
    'worker':  {'leaf': 10, 'dew': 4},
    'soldier': {'leaf': 14, 'meat': 6},
}

CHAMBERS = [
    dict(id='queen', name='ROYAL CHAMBER', node='Q', lo=1, hi=10, growth=1.62,
         base={'leaf': 45, 'sand': 30},
         eff=lambda l: 'EGG EVERY %.1fS' % egg_interval(l)),
    dict(id='nursery', name='NURSERY', node='N', lo=1, hi=12, growth=1.55,
         base={'leaf': 30, 'sand': 35},
         eff=lambda l: 'HOLDS %d EGGS' % egg_cap(l)),
    dict(id='store', name='STOREROOM', node='S', lo=1, hi=12, growth=1.55,
         base={'leaf': 35, 'sand': 45},
         eff=lambda l: 'STORES %d EACH' % res_cap(l)),
    dict(id='tunnels', name='TUNNEL NETWORK', node='T', lo=1, hi=12, growth=1.58,
         base={'leaf': 25, 'sand': 55},
         eff=lambda l: 'CARRY %d - SPEED %d - %d WORKERS'
                       % (carry_cap(l), move_speed(l), worker_cap(l))),
    dict(id='barracks', name='BARRACKS', node='B', lo=0, hi=10, growth=1.68,
         base={'leaf': 60, 'meat': 20, 'sand': 55},
         eff=lambda l: ('%d SOLDIERS - ATK %d' % (soldier_cap(l), soldier_atk(l)))
                       if l else 'UNLOCK SOLDIER ANTS'),
    dict(id='farm', name='APHID FARM', node='F', lo=0, hi=10, growth=1.68,
         base={'leaf': 80, 'dew': 20, 'sand': 40},
         eff=lambda l: ('+%.2f DEW/S' % dew_rate(l)) if l else 'PEN APHIDS FOR DEW'),
]
CH_BY_ID = {c['id']: c for c in CHAMBERS}
CH_BY_NODE = {c['node']: c for c in CHAMBERS}


def save_dir():
    if sys.platform == 'win32':
        root = os.environ.get('APPDATA') or os.path.expanduser('~')
    elif sys.platform == 'darwin':
        root = os.path.expanduser('~/Library/Application Support')
    else:
        root = os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
    return os.path.join(root, 'pocket-colony')


class State:
    """Everything that survives a restart."""

    def __init__(self):
        self.leaf = 30.0
        self.dew = 0.0
        self.sand = 12.0
        self.meat = 0.0
        self.eggs = 0
        self.egg_p = 0.0
        self.workers = 2
        self.soldiers = 0
        self.ch = {'queen': 1, 'nursery': 1, 'store': 1, 'tunnels': 1,
                   'barracks': 0, 'farm': 0}
        self.hp = float(player_hp(0))
        self.kills = 0
        self.nests_cleared = 0
        self.deaths = 0
        self.playtime = 0.0
        self.stamp = time.time()

    # ── helpers ────────────────────────────────────────────────────────
    def lv(self, cid):
        return int(self.ch.get(cid, 0))

    def cap(self):
        return res_cap(self.lv('store'))

    def max_hp(self):
        return player_hp(self.lv('barracks'))

    def add(self, res, n):
        """Add a resource, clamped to storage.  Returns the amount kept."""
        cur = getattr(self, res)
        room = self.cap() - cur
        got = max(0.0, min(float(n), room))
        setattr(self, res, cur + got)
        return got

    def clamp_all(self):
        """Settle any resource that ended up over cap (debug cheats, tuning changes)."""
        c = self.cap()
        for r in RES:
            if getattr(self, r) > c:
                setattr(self, r, float(c))
        self.hp = min(self.hp, float(self.max_hp()))

    def afford(self, cost):
        return all(getattr(self, r) >= v for r, v in cost.items())

    def pay(self, cost):
        if not self.afford(cost):
            return False
        for r, v in cost.items():
            setattr(self, r, getattr(self, r) - v)
        return True

    def chamber_cost(self, cid):
        c = CH_BY_ID[cid]
        l = self.lv(cid)
        return {r: int(round(v * (c['growth'] ** (l - c['lo']))))
                for r, v in c['base'].items()}

    def can_upgrade(self, cid):
        c = CH_BY_ID[cid]
        return self.lv(cid) < c['hi'] and self.afford(self.chamber_cost(cid))

    def upgrade(self, cid):
        if not self.can_upgrade(cid):
            return False
        self.pay(self.chamber_cost(cid))
        self.ch[cid] = self.lv(cid) + 1
        return True

    def can_hatch(self, kind):
        if self.eggs < 1:
            return False
        if kind == 'worker' and self.workers >= worker_cap(self.lv('tunnels')):
            return False
        if kind == 'soldier' and self.soldiers >= soldier_cap(self.lv('barracks')):
            return False
        return self.afford(HATCH_COST[kind])

    def hatch(self, kind):
        if not self.can_hatch(kind):
            return False
        self.pay(HATCH_COST[kind])
        self.eggs -= 1
        if kind == 'worker':
            self.workers += 1
        else:
            self.soldiers += 1
        return True

    # ── the queen ──────────────────────────────────────────────────────
    def queen_blocked(self):
        if self.eggs >= egg_cap(self.lv('nursery')):
            return 'NURSERY FULL'
        if not self.afford(EGG_COST):
            return 'NEEDS LEAF + MEAT'
        return None

    def tick(self, dt):
        """Wall-clock economy step."""
        self.playtime += dt
        self.clamp_all()
        self.add('dew', dew_rate(self.lv('farm')) * dt)
        if self.queen_blocked() is None:
            self.egg_p += dt / egg_interval(self.lv('queen'))
            while (self.egg_p >= 1.0 and self.eggs < egg_cap(self.lv('nursery'))
                   and self.afford(EGG_COST)):
                self.egg_p -= 1.0
                self.pay(EGG_COST)
                self.eggs += 1
            self.egg_p = min(self.egg_p, 1.0)

    def grant_idle(self, secs):
        """Pay out time the game was not running.  Returns a summary dict."""
        secs = max(0.0, min(MAX_IDLE, secs))
        if secs < 30:
            return None
        got = {'secs': secs, 'dew': 0.0, 'leaf': 0.0, 'eggs': 0}
        got['dew'] = self.add('dew', dew_rate(self.lv('farm')) * secs)
        got['leaf'] = self.add('leaf', self.workers * 0.14 * secs)
        n = int(secs / egg_interval(self.lv('queen')))
        while n > 0 and self.eggs < egg_cap(self.lv('nursery')) and self.afford(EGG_COST):
            self.pay(EGG_COST)
            self.eggs += 1
            got['eggs'] += 1
            n -= 1
        return got

    # ── persistence ────────────────────────────────────────────────────
    def to_dict(self):
        d = {k: v for k, v in self.__dict__.items()}
        d['v'] = SAVE_VERSION
        d['stamp'] = time.time()
        return d

    def load_dict(self, d):
        if d.get('v') != SAVE_VERSION:
            return False
        fresh = State()
        for k, v in fresh.__dict__.items():
            if k in d and type(d[k]) is type(v):
                setattr(self, k, d[k])
        base = State().ch
        base.update({k: int(v) for k, v in (d.get('ch') or {}).items() if k in base})
        self.ch = base
        self.stamp = float(d.get('stamp', time.time()))
        return True

    def path(self):
        return os.path.join(save_dir(), 'save.json')

    def save(self):
        try:
            os.makedirs(save_dir(), exist_ok=True)
            tmp = self.path() + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(self.to_dict(), f)
            os.replace(tmp, self.path())
            return True
        except OSError:
            return False

    def load(self):
        try:
            with open(self.path()) as f:
                return self.load_dict(json.load(f))
        except (OSError, ValueError):
            return False

    def wipe(self):
        try:
            os.remove(self.path())
        except OSError:
            pass
        self.__init__()
