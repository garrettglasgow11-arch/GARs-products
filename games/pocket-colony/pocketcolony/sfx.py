"""Tiny procedural sound effects.

Waveforms are synthesised into raw 16-bit buffers at load, so the game ships
no audio files and needs no numpy.  Every entry point is a no-op when there is
no working audio device, which is the normal case on a bare server.
"""
import random
import struct

import pygame

_sounds = {}
_ok = False
_rate = 22050
_channels = 2


def init():
    """Prepare the mixer and bake the effects.  Safe to call when muted."""
    global _ok, _rate, _channels
    try:
        if not pygame.mixer.get_init():
            pygame.mixer.pre_init(22050, -16, 2, 256)
            pygame.mixer.init()
        got = pygame.mixer.get_init()
        if not got:
            return False
        _rate, _, _channels = got[0], got[1], got[2]
        _ok = True
    except (pygame.error, AttributeError):
        _ok = False
        return False
    for name, spec in RECIPES.items():
        try:
            _sounds[name] = pygame.mixer.Sound(buffer=_render(spec))
        except (pygame.error, ValueError):
            _ok = False
            return False
    return True


def _render(spec):
    """Build a signed 16-bit buffer from a list of (shape, f0, f1, ms, gain)."""
    frames = []
    for shape, f0, f1, ms, gain in spec:
        n = max(1, int(_rate * ms / 1000.0))
        for i in range(n):
            t = i / n
            f = f0 + (f1 - f0) * t
            phase = (i * f / _rate) % 1.0
            if shape == 'sq':
                v = 1.0 if phase < 0.5 else -1.0
            elif shape == 'saw':
                v = phase * 2.0 - 1.0
            elif shape == 'tri':
                v = 4.0 * abs(phase - 0.5) - 1.0
            else:                                   # noise
                v = random.uniform(-1.0, 1.0)
            env = (1.0 - t) ** 1.6
            frames.append(int(max(-1.0, min(1.0, v * env * gain)) * 20000))
    if _channels == 2:
        return struct.pack('<%dh' % (len(frames) * 2),
                           *[s for f in frames for s in (f, f)])
    return struct.pack('<%dh' % len(frames), *frames)


RECIPES = {
    'click':   [('sq', 900, 700, 26, 0.5)],
    'back':    [('sq', 620, 420, 34, 0.5)],
    'bite':    [('noise', 0, 0, 26, 0.55), ('sq', 320, 150, 40, 0.4)],
    'hit':     [('noise', 0, 0, 40, 0.7), ('sq', 200, 90, 60, 0.5)],
    'pickup':  [('tri', 700, 1150, 42, 0.5)],
    'deposit': [('tri', 500, 780, 46, 0.5), ('tri', 780, 1040, 46, 0.45)],
    'hatch':   [('tri', 520, 880, 60, 0.5), ('tri', 880, 1240, 70, 0.5)],
    'upgrade': [('sq', 440, 660, 60, 0.45), ('sq', 660, 990, 70, 0.45),
                ('sq', 990, 1320, 90, 0.4)],
    'error':   [('sq', 240, 160, 90, 0.5)],
    'zone':    [('saw', 300, 120, 120, 0.4)],
    'kill':    [('noise', 0, 0, 90, 0.6), ('saw', 260, 70, 120, 0.5)],
    'hurt':    [('saw', 420, 120, 130, 0.6)],
}


def play(name, settings=None):
    if not _ok or name not in _sounds:
        return
    if settings is not None and not settings['sfx']:
        return
    vol = (settings['sfx_vol'] / 100.0) if settings is not None else 0.6
    try:
        s = _sounds[name]
        s.set_volume(max(0.0, min(1.0, vol)))
        s.play()
    except pygame.error:
        pass


def available():
    return _ok
