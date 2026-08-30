#!/usr/bin/env python3
"""Generate the application icon from the game's own sprites.

Writes packaging/icon.png (256x256), packaging/icon.ico (multi-size, for
Windows) and packaging/icon.iconset/ (for `iconutil` on macOS).  Run it after
changing the art; the result is committed so a build never needs it.
"""
import os
import struct
import sys

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pygame  # noqa: E402

from pocketcolony import art  # noqa: E402
from pocketcolony.pixel import rect  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'packaging')
BASE = 32          # the icon is designed at 32x32 and scaled by whole numbers


def design():
    """A 32x32 pixel icon: the player ant on a soil tile."""
    s = pygame.Surface((BASE, BASE), pygame.SRCALPHA)
    # rounded soil plate
    for y in range(BASE):
        for x in range(BASE):
            edge = (x in (0, BASE - 1) and y in (0, BASE - 1)) or \
                   (x in (1, BASE - 2) and y in (0, BASE - 1)) or \
                   (x in (0, BASE - 1) and y in (1, BASE - 2))
            if edge:
                continue
            h = (x * 73856093 ^ y * 19349663) & 7
            s.set_at((x, y), (52, 38, 24) if h < 3 else
                     ((66, 48, 30) if h < 6 else (80, 59, 36)))
    for x in range(2, BASE - 2):          # top highlight and bottom shade
        s.set_at((x, 1), (96, 72, 44))
        s.set_at((x, BASE - 2), (34, 24, 15))
    # the entrance hole behind the ant
    pygame.draw.ellipse(s, (26, 18, 11), (7, 12, 18, 13))
    pygame.draw.ellipse(s, (14, 10, 6), (9, 14, 14, 9))
    art.blit_c(s, 'ant_player', BASE // 2, BASE // 2 + 1)
    return s


def scaled(src, size):
    return pygame.transform.scale(src, (size, size))


def png_bytes(surf):
    import io
    buf = io.BytesIO()
    pygame.image.save(surf, buf, 'icon.png')
    return buf.getvalue()


def write_ico(path, surfaces):
    """Minimal ICO container with PNG-encoded entries (valid on Vista+)."""
    blobs = [png_bytes(s) for s in surfaces]
    n = len(blobs)
    out = [struct.pack('<HHH', 0, 1, n)]
    offset = 6 + 16 * n
    for surf, blob in zip(surfaces, blobs):
        w = surf.get_width()
        out.append(struct.pack('<BBBBHHII', 0 if w >= 256 else w,
                               0 if w >= 256 else w, 0, 0, 1, 32,
                               len(blob), offset))
        offset += len(blob)
    out.extend(blobs)
    with open(path, 'wb') as f:
        f.write(b''.join(out))


def main():
    pygame.init()
    pygame.display.set_mode((8, 8))
    art.bake_all()
    os.makedirs(OUT, exist_ok=True)
    base = design()

    pygame.image.save(scaled(base, 256), os.path.join(OUT, 'icon.png'))
    write_ico(os.path.join(OUT, 'icon.ico'),
              [scaled(base, n) for n in (16, 32, 48, 64, 128, 256)])

    iconset = os.path.join(OUT, 'icon.iconset')
    os.makedirs(iconset, exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        pygame.image.save(scaled(base, size),
                          os.path.join(iconset, 'icon_%dx%d.png' % (size, size)))
        pygame.image.save(scaled(base, size * 2),
                          os.path.join(iconset, 'icon_%dx%d@2x.png' % (size, size)))
    print('wrote icon.png, icon.ico and icon.iconset/ into packaging/')


if __name__ == '__main__':
    main()
