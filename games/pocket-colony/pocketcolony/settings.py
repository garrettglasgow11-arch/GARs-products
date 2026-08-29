"""Player preferences, stored separately from the colony save."""
import json
import os

from .save import save_dir

SETTINGS_VERSION = 1

DEFAULTS = {
    'scale': 0,             # 0 = fit the window automatically, else 1..6
    'fullscreen': False,
    'show_fps': False,
    'pixel_grid': False,    # faint scanline/grid overlay, purely cosmetic
    'stick_side': 'left',   # left | right
    'stick_size': 1,        # 0 small, 1 normal, 2 large
    'deadzone': 22,         # percent
    'touch_ui': 'auto',     # auto | always | never
    'sfx': True,
    'sfx_vol': 60,          # percent
    'screen_shake': True,
    'damage_numbers': True,
    'hints': True,
    'autosave': True,
}


class Settings:
    def __init__(self):
        self.d = dict(DEFAULTS)
        self.load()

    def __getitem__(self, k):
        return self.d.get(k, DEFAULTS.get(k))

    def __setitem__(self, k, v):
        self.d[k] = v
        self.save()

    def toggle(self, k):
        self.d[k] = not self.d.get(k, False)
        self.save()
        return self.d[k]

    def cycle(self, k, options):
        cur = self.d.get(k, options[0])
        i = (options.index(cur) + 1) % len(options) if cur in options else 0
        self.d[k] = options[i]
        self.save()
        return self.d[k]

    def bump(self, k, step, lo, hi):
        self.d[k] = max(lo, min(hi, int(self.d.get(k, lo)) + step))
        self.save()
        return self.d[k]

    def reset(self):
        self.d = dict(DEFAULTS)
        self.save()

    def path(self):
        return os.path.join(save_dir(), 'settings.json')

    def save(self):
        try:
            os.makedirs(save_dir(), exist_ok=True)
            tmp = self.path() + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(dict(self.d, v=SETTINGS_VERSION), f)
            os.replace(tmp, self.path())
            return True
        except OSError:
            return False

    def load(self):
        try:
            with open(self.path()) as f:
                d = json.load(f)
        except (OSError, ValueError):
            return False
        if d.get('v') != SETTINGS_VERSION:
            return False
        for k, default in DEFAULTS.items():
            if k in d and type(d[k]) is type(default):
                self.d[k] = d[k]
        return True
