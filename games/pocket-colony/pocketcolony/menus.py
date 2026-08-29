"""Settings and information screens: guide, bestiary, fan art, legal, credits."""
import math

import pygame

from . import art, content, fanart, save, sfx, ui, world
from .pixel import COL, VH, VW, frame, rect, text, text_c, text_w

COLS = 38          # characters that fit across a page in the small font
HEAD_H = 26
FOOT_H = 22


class Menus:
    def __init__(self):
        self.stack = ['root']
        self.scrolls = {}
        self.fan_i = 0
        self.guide_i = 0

    # ── navigation ─────────────────────────────────────────────────────
    @property
    def top(self):
        return self.stack[-1]

    def open(self, g, name):
        self.stack.append(name)
        self.scrolls.setdefault(name, {'off': 0.0, 'max': 0})
        sfx.play('click', g.cfg)

    def back(self, g):
        sfx.play('back', g.cfg)
        if len(self.stack) > 1:
            self.stack.pop()
        else:
            g.mode = 'play'

    def reset(self):
        self.stack = ['root']

    def scroll_state(self, name):
        return self.scrolls.setdefault(name, {'off': 0.0, 'max': 0})

    def update(self, g, dt, inp):
        if inp.back:
            self.back(g)

    # ── shared chrome ──────────────────────────────────────────────────
    def frame_page(self, g, s, title, sub=None):
        s.fill(COL['dirt0'])
        for i in range(320):                      # soil backdrop
            h = (i * 7919) & 0xFFFF
            rect(s, h % VW, (h >> 5) % VH, 1, 1,
                 COL['dirt1'] if i % 3 else COL['dirt2'])
        rect(s, 0, 0, VW, HEAD_H, COL['dirt2'])
        rect(s, 0, HEAD_H - 1, VW, 1, COL['dirt4'])
        text(s, title, 32, 6, COL['amber'])
        if sub:
            text(s, sub, 32, 16, COL['dim'], small=True)
        if g.ui.icon_button(s, 4, 4, 24, 18, 'ic_arrow'):
            self.back(g)
        rect(s, 0, VH - FOOT_H, VW, FOOT_H, COL['dirt2'])
        rect(s, 0, VH - FOOT_H, VW, 1, COL['dirt4'])
        return HEAD_H + 2

    def body_rect(self):
        return 4, HEAD_H + 2, VW - 8, VH - HEAD_H - FOOT_H - 4

    def text_page(self, g, s, title, body):
        self.frame_page(g, s, title)
        bx, by, bw, bh = self.body_rect()
        lines = content.wrap_tagged(body, COLS)
        st = self.scroll_state(self.top)
        off = g.ui.scroll(st, bx, by, bw, bh, len(lines) * 8 + 12)
        g.ui.clip = (bx, by, bw, bh)
        prev = s.get_clip()
        s.set_clip((bx, by, bw, bh))
        for i, (ln, kind) in enumerate(lines):
            y = by + 4 + i * 8 - off
            if y < by - 8 or y > by + bh:
                continue
            if kind == 'h':
                text(s, ln.upper(), bx + 4, y, COL['amber'], small=True)
                rect(s, bx + 4, y + 7, min(bw - 12, text_w(ln, small=True)), 1,
                     COL['dirt3'])
            else:
                text(s, ln, bx + 4, y, COL['paper'], small=True)
        s.set_clip(prev)
        g.ui.clip = None
        g.ui.scrollbar(s, st, bx, by, bw, bh)
        text_c(s, 'DRAG OR SCROLL TO READ', VW // 2, VH - 15, COL['dim'], small=True)

    # ── draw dispatch ──────────────────────────────────────────────────
    def draw(self, g, s):
        fn = getattr(self, 'draw_' + self.top, None)
        if fn is None:
            self.stack = ['root']
            fn = self.draw_root
        fn(g, s)

    # ── root ───────────────────────────────────────────────────────────
    ITEMS = [
        ('RESUME', 'resume', 'ic_arrow', 'go'),
        ('HOW TO PLAY', 'guide', 'ic_book', 'plain'),
        ('BESTIARY', 'bestiary', 'ic_shield', 'plain'),
        ('FAN ART', 'fanart', 'ic_brush', 'plain'),
        ('DISPLAY', 'display', 'ic_gear', 'plain'),
        ('CONTROLS', 'controls', 'ic_gear', 'plain'),
        ('AUDIO', 'audio', 'ic_speaker', 'plain'),
        ('GAMEPLAY', 'gameplay', 'ic_gear', 'plain'),
        ('TERMS OF USE', 'terms', 'ic_book', 'plain'),
        ('PRIVACY POLICY', 'privacy', 'ic_book', 'plain'),
        ('CREDITS', 'credits', 'ic_book', 'plain'),
        ('BETA TESTER MENU', 'beta', 'ic_gear', 'plain'),
        ('SAVE AND DATA', 'data', 'ic_gear', 'plain'),
    ]

    def draw_root(self, g, s):
        self.frame_page(g, s, 'SETTINGS', 'POCKET COLONY V' + content.VERSION)
        bx, by, bw, bh = self.body_rect()
        st = self.scroll_state('root')
        off = g.ui.scroll(st, bx, by, bw, bh, len(self.ITEMS) * 20 + 8)
        g.ui.clip = (bx, by, bw, bh)
        prev = s.get_clip()
        s.set_clip((bx, by, bw, bh))
        for i, (label, dest, icon, tone) in enumerate(self.ITEMS):
            y = by + 2 + i * 20 - off
            if y < by - 20 or y > by + bh:
                continue
            if g.ui.button(s, bx + 2, y, bw - 8, 18, label, tone=tone, icon=icon):
                if dest == 'resume':
                    g.mode = 'play'
                    sfx.play('back', g.cfg)
                elif dest == 'beta':
                    g.mode = 'debug'
                    sfx.play('click', g.cfg)
                else:
                    self.open(g, dest)
        s.set_clip(prev)
        g.ui.clip = None
        g.ui.scrollbar(s, st, bx, by, bw, bh)
        text_c(s, 'ESC GOES BACK', VW // 2, VH - 15, COL['dim'], small=True)

    # ── settings pages ─────────────────────────────────────────────────
    def draw_display(self, g, s):
        self.frame_page(g, s, 'DISPLAY')
        bx, by, bw, _ = self.body_rect()
        cfg = g.cfg
        y = by + 4
        scales = ['FIT WINDOW'] + ['%dX' % i for i in range(1, 7)]
        d = g.ui.option_row(s, bx, y, bw, 'PIXEL SCALE', scales[cfg['scale']])
        if d:
            cfg['scale'] = (cfg['scale'] + d) % len(scales)
            g.request_video = True
            sfx.play('click', cfg)
        y += ui.ROW_H
        if g.ui.toggle_row(s, bx, y, bw, 'FULLSCREEN', cfg['fullscreen'], alt=True,
                           note='F11 ALSO TOGGLES THIS'):
            cfg.toggle('fullscreen')
            g.request_video = True
            sfx.play('click', cfg)
        y += ui.ROW_H + 7
        if g.ui.toggle_row(s, bx, y, bw, 'SHOW FPS', cfg['show_fps']):
            cfg.toggle('show_fps')
            sfx.play('click', cfg)
        y += ui.ROW_H
        if g.ui.toggle_row(s, bx, y, bw, 'SCANLINE OVERLAY', cfg['pixel_grid'],
                           alt=True, note='FAINT CRT LOOK'):
            cfg.toggle('pixel_grid')
            sfx.play('click', cfg)
        y += ui.ROW_H + 12
        text(s, 'INTERNAL RESOLUTION  %dX%d' % (VW, VH), bx + 6, y, COL['dim'],
             small=True)
        text(s, 'WINDOW  %s' % g.window_label, bx + 6, y + 9, COL['dim'], small=True)

    def draw_controls(self, g, s):
        self.frame_page(g, s, 'CONTROLS')
        bx, by, bw, _ = self.body_rect()
        cfg = g.cfg
        y = by + 4
        d = g.ui.option_row(s, bx, y, bw, 'STICK SIDE', cfg['stick_side'].upper())
        if d:
            cfg.cycle('stick_side', ['left', 'right'])
            sfx.play('click', cfg)
        y += ui.ROW_H
        sizes = ['SMALL', 'NORMAL', 'LARGE']
        d = g.ui.option_row(s, bx, y, bw, 'STICK SIZE', sizes[cfg['stick_size']], alt=True)
        if d:
            cfg['stick_size'] = (cfg['stick_size'] + d) % 3
            sfx.play('click', cfg)
        y += ui.ROW_H
        r = g.ui.slider_row(s, bx, y, bw, 'STICK DEADZONE', cfg['deadzone'], 5, 50)
        if r:
            cfg['deadzone'] = (max(5, min(50, r[1])) if r[0] == 'set'
                               else max(5, min(50, cfg['deadzone'] + r[1] * 5)))
        y += ui.ROW_H + 8
        d = g.ui.option_row(s, bx, y, bw, 'TOUCH BUTTONS', cfg['touch_ui'].upper(),
                            alt=True)
        if d:
            cfg.cycle('touch_ui', ['auto', 'always', 'never'])
            sfx.play('click', cfg)
        y += ui.ROW_H + 10
        for k, v in (('MOVE', 'WASD / ARROWS / STICK'), ('BITE', 'SPACE / J / BUTTON'),
                     ('USE', 'E / RETURN / PROMPT'), ('MENU', 'ESC'),
                     ('BETA MENU', 'F3'), ('FULLSCREEN', 'F11')):
            text(s, k, bx + 6, y, COL['gray'], small=True)
            text(s, v, bx + 74, y, COL['paper'], small=True)
            y += 9

    def draw_audio(self, g, s):
        self.frame_page(g, s, 'AUDIO')
        bx, by, bw, _ = self.body_rect()
        cfg = g.cfg
        y = by + 4
        if g.ui.toggle_row(s, bx, y, bw, 'SOUND EFFECTS', cfg['sfx']):
            cfg.toggle('sfx')
            sfx.play('click', cfg)
        y += ui.ROW_H
        r = g.ui.slider_row(s, bx, y, bw, 'VOLUME', cfg['sfx_vol'], 0, 100, alt=True)
        if r:
            cfg['sfx_vol'] = (max(0, min(100, r[1])) if r[0] == 'set'
                              else max(0, min(100, cfg['sfx_vol'] + r[1] * 5)))
            sfx.play('click', cfg)
        y += ui.ROW_H + 12
        if g.ui.button(s, bx + 4, y, bw - 12, 16, 'TEST SOUND', tone='go'):
            sfx.play('upgrade', cfg)
        y += 24
        ok = sfx.available()
        text(s, 'AUDIO DEVICE', bx + 6, y, COL['gray'], small=True)
        text(s, 'READY' if ok else 'NOT AVAILABLE', bx + 90, y,
             COL['leaf'] if ok else COL['red'], small=True)
        y += 12
        for ln in content.wrap('All effects are synthesised at load from square, '
                               'saw, triangle and noise waves. The game ships no '
                               'audio files.', COLS):
            text(s, ln, bx + 6, y, COL['dim'], small=True)
            y += 8

    def draw_gameplay(self, g, s):
        self.frame_page(g, s, 'GAMEPLAY')
        bx, by, bw, _ = self.body_rect()
        cfg = g.cfg
        y = by + 4
        for i, (key, label, note) in enumerate((
                ('screen_shake', 'SCREEN SHAKE', 'CAMERA KICK ON HITS'),
                ('damage_numbers', 'DAMAGE NUMBERS', 'SHOW DAMAGE DEALT'),
                ('hints', 'HINTS', 'PROMPTS AND TOASTS'),
                ('autosave', 'AUTOSAVE', 'SAVE EVERY 10 SECONDS'))):
            if g.ui.toggle_row(s, bx, y, bw, label, cfg[key], alt=i % 2 == 1, note=note):
                cfg.toggle(key)
                sfx.play('click', cfg)
            y += ui.ROW_H + 7
        y += 8
        if g.ui.button(s, bx + 4, y, bw - 12, 16, 'RESET ALL SETTINGS', tone='bad'):
            cfg.reset()
            g.request_video = True
            sfx.play('error', cfg)

    def draw_data(self, g, s):
        self.frame_page(g, s, 'SAVE AND DATA')
        bx, by, bw, _ = self.body_rect()
        st = g.st
        y = by + 6
        import os
        try:
            sz = os.path.getsize(st.path())
        except OSError:
            sz = 0
        rows = (('SAVE FILE', '%d BYTES' % sz), ('FORMAT VERSION', save.SAVE_VERSION),
                ('PLAYED', '%d MIN' % int(st.playtime / 60)),
                ('KILLS', st.kills), ('NESTS CLEARED', st.nests_cleared),
                ('DEATHS', st.deaths))
        for k, v in rows:
            text(s, k, bx + 6, y, COL['gray'], small=True)
            text(s, str(v), bx + 108, y, COL['paper'], small=True)
            y += 9
        y += 6
        for ln in content.wrap('Your save and settings are plain files on this '
                               'device. Nothing is uploaded, ever.', COLS):
            text(s, ln, bx + 6, y, COL['dim'], small=True)
            y += 8
        y += 6
        text(s, 'LOCATION', bx + 6, y, COL['gray'], small=True)
        y += 9
        for ln in content.wrap(save.save_dir(), COLS):
            text(s, ln, bx + 6, y, COL['paper'], small=True)
            y += 8
        y += 8
        if g.ui.button(s, bx + 4, y, bw - 12, 16, 'SAVE NOW', tone='go'):
            st.save()
            sfx.play('deposit', g.cfg)
        y += 20
        if g.ui.button(s, bx + 4, y, bw - 12, 16, 'WIPE COLONY', tone='bad'):
            g.wipe()
            sfx.play('error', g.cfg)
            g.mode = 'play'

    # ── information pages ──────────────────────────────────────────────
    def draw_guide(self, g, s):
        title, body = content.GUIDE[self.guide_i]
        self.frame_page(g, s, 'HOW TO PLAY',
                        '%d / %d   %s' % (self.guide_i + 1, len(content.GUIDE), title))
        bx, by, bw, bh = self.body_rect()
        bh -= 20
        lines = content.wrap_tagged(body, COLS)
        st = self.scroll_state('guide%d' % self.guide_i)
        off = g.ui.scroll(st, bx, by, bw, bh, len(lines) * 8 + 8)
        g.ui.clip = (bx, by, bw, bh)
        prev = s.get_clip()
        s.set_clip((bx, by, bw, bh))
        for i, (ln, kind) in enumerate(lines):
            y = by + 2 + i * 8 - off
            text(s, ln.upper() if kind == 'h' else ln, bx + 4, y,
                 COL['amber'] if kind == 'h' else COL['paper'], small=True)
        s.set_clip(prev)
        g.ui.clip = None
        g.ui.scrollbar(s, st, bx, by, bw, bh)
        yy = VH - FOOT_H - 20
        if g.ui.button(s, bx + 2, yy, 48, 16, 'PREV',
                       enabled=self.guide_i > 0):
            self.guide_i -= 1
            sfx.play('click', g.cfg)
        if g.ui.button(s, bx + bw - 58, yy, 48, 16, 'NEXT',
                       enabled=self.guide_i < len(content.GUIDE) - 1, tone='go'):
            self.guide_i += 1
            sfx.play('click', g.cfg)
        text_c(s, content.GUIDE[self.guide_i][0], VW // 2, yy + 5, COL['amber'],
               small=True)

    def draw_bestiary(self, g, s):
        self.frame_page(g, s, 'BESTIARY', 'WHAT LIVES OUT THERE')
        bx, by, bw, bh = self.body_rect()
        entries = []
        for kind, spec in world.ENEMY.items():
            entries.append((kind, spec['name'], 'HP %d   BITE %d   SPD %d   MEAT %d'
                            % (spec['hp'], spec['atk'], spec['spd'], spec['meat']),
                            'HOSTILE'))
        entries.append(('aphid', 'APHID', 'HARMLESS. USE ONE FOR HONEYDEW.', 'FARMABLE'))
        entries.append(('ant_worker', 'WORKER ANT',
                        'FORAGES ON ITS OWN AND HAULS FOOD HOME.', 'YOURS'))
        entries.append(('ant_soldier', 'SOLDIER ANT',
                        'FOLLOWS YOU AND ATTACKS INTRUDERS.', 'YOURS'))
        entries.append(('ant_queen', 'THE QUEEN',
                        'LAYS EVERY EGG. NEEDS LEAF AND MEAT.', 'YOURS'))
        st = self.scroll_state('bestiary')
        off = g.ui.scroll(st, bx, by, bw, bh, len(entries) * 30 + 8)
        prev = s.get_clip()
        s.set_clip((bx, by, bw, bh))
        for i, (sprite, name, line, tag) in enumerate(entries):
            y = by + 2 + i * 30 - off
            if y < by - 30 or y > by + bh:
                continue
            rect(s, bx, y, bw, 28, COL['dirt1'] if i % 2 else COL['dirt2'])
            rect(s, bx, y + 27, bw, 1, COL['dirt0'])
            rect(s, bx + 2, y + 2, 24, 24, COL['dirt0'])
            frame(s, bx + 2, y + 2, 24, 24, COL['dirt3'])
            art.blit_rot(s, sprite, bx + 14, y + 14, -math.pi / 2)
            text(s, name, bx + 30, y + 4, COL['amber'], small=True)
            text(s, tag, bx + bw - 6 - text_w(tag, small=True), y + 4,
                 COL['red'] if tag == 'HOSTILE' else COL['leaf'], small=True)
            text(s, line, bx + 30, y + 15, COL['paper'], small=True)
        s.set_clip(prev)
        g.ui.scrollbar(s, st, bx, by, bw, bh)

    def draw_fanart(self, g, s):
        self.frame_page(g, s, 'FAN ART', 'SENT IN BY PLAYERS')
        bx, by, bw, bh = self.body_rect()
        p = fanart.PIECES[self.fan_i]
        # draw at 1x on a scratch surface, then blow it up 2x so the piece
        # actually fills the page while staying perfectly pixelated
        tmp = pygame.Surface((fanart.ART_W + 4, fanart.ART_H + 4))
        fanart.render(self.fan_i, tmp, 2, 2, g.world.time if g.world else 0.0)
        big = pygame.transform.scale(tmp, (tmp.get_width() * 2, tmp.get_height() * 2))
        ax = (VW - big.get_width()) // 2
        s.blit(big, (ax, by + 10))
        y = by + 10 + big.get_height() + 10
        text_c(s, p['title'], VW // 2, y, COL['amber'])
        y += 11
        text_c(s, 'BY %s   %s' % (p['artist'], p['handle']), VW // 2, y,
               COL['paper'], small=True)
        y += 9
        text_c(s, p['date'], VW // 2, y, COL['dim'], small=True)
        y += 12
        for ln in content.wrap(p['note'], COLS):
            text_c(s, ln, VW // 2, y, COL['gray'], small=True)
            y += 8
        yy = VH - FOOT_H - 20
        if g.ui.button(s, bx + 2, yy, 44, 16, 'PREV'):
            self.fan_i = (self.fan_i - 1) % len(fanart.PIECES)
            sfx.play('click', g.cfg)
        if g.ui.button(s, bx + bw - 54, yy, 44, 16, 'NEXT', tone='go'):
            self.fan_i = (self.fan_i + 1) % len(fanart.PIECES)
            sfx.play('click', g.cfg)
        text_c(s, '%d / %d' % (self.fan_i + 1, len(fanart.PIECES)), VW // 2, yy + 5,
               COL['paper'], small=True)
        if fanart.PLACEHOLDER:
            text_c(s, 'SAMPLE ENTRIES SHIPPED WITH THE BUILD', VW // 2, VH - 15,
                   COL['dim'], small=True)
        else:
            text_c(s, 'SEND YOURS IN', VW // 2, VH - 15, COL['dim'], small=True)

    def draw_terms(self, g, s):
        self.text_page(g, s, 'TERMS OF USE', content.TERMS)

    def draw_privacy(self, g, s):
        self.text_page(g, s, 'PRIVACY POLICY', content.PRIVACY)

    def draw_credits(self, g, s):
        self.text_page(g, s, 'CREDITS', content.CREDITS)
