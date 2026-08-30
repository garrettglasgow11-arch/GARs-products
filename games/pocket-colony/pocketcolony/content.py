"""In-game reading matter: the guide, the legal pages and the credits.

Text is stored as paragraphs and wrapped at draw time to whatever column count
the current font and panel width allow.
"""

VERSION = '0.3.0'
STUDIO = 'GAR PRODUCTIONS'


def wrap(text, cols):
    """Greedy word wrap.  A blank source line becomes a paragraph gap."""
    return [ln for ln, _ in wrap_tagged(text, cols)]


def wrap_tagged(text, cols):
    """Wrap text, tagging each line 'h' for a heading or 'p' for body.

    A source line starting with '#' is a heading.  Everything else flows, so
    paragraphs must be written as single long lines and let this do the
    breaking - pre-broken source would wrap twice and come out ragged.
    """
    out = []
    for para in text.strip('\n').split('\n'):
        para = para.rstrip()
        if not para.strip():
            out.append(('', 'p'))
            continue
        kind = 'p'
        if para.startswith('#'):
            kind = 'h'
            para = para[1:].strip()
        line = ''
        for word in para.split():
            if not line:
                line = word
            elif len(line) + 1 + len(word) <= cols:
                line += ' ' + word
            else:
                out.append((line, kind))
                line = word
        if line:
            out.append((line, kind))
    return out


GUIDE = [
    ('FIRST STEPS', """
Your ant starts in the colony. Walk to the shaft marked with an arrow and use it to go up.

Topside, walk over food to pick it up. Your bag has a limit, and the Tunnel Network raises it. Walk back into the nest to bank everything you carry at once.

Nothing you bank can ever be lost. Everything in your bag can.
"""),
    ('RESOURCES', """
#LEAF
Feeds the queen and pays for almost everything.

#SAND
The digging material for every new chamber.

#DEW
Honeydew, from aphids - wild ones topside or farmed ones at home.

#MEAT
Drops from bugs you kill. The queen needs it for every single egg.

The Storeroom sets the cap on all four. When a bar is full you are throwing away everything you pick up.
"""),
    ('THE COLONY', """
Chambers are places you stand in, not menu entries. Walk to one and use it.

#ROYAL CHAMBER
How fast the queen lays.

#NURSERY
Egg capacity, and where you hatch.

#STOREROOM
The cap on every resource.

#TUNNEL NETWORK
Bag size, move speed, worker cap.

#BARRACKS
Soldiers, and your own bite and health.

#APHID FARM
Honeydew that accrues while you play.
"""),
    ('YOUR ANTS', """
Workers follow you topside and forage on their own, hauling what they find back to the mound without being told.

Soldiers follow you and attack anything that comes close.

Both die permanently. Hatch replacements in the Nursery, and remember the caps come from the Tunnel Network and the Barracks.
"""),
    ('FIGHTING', """
BITE swings your mandibles in a short arc in front of you. It has a cooldown, so circle and strike rather than holding it down.

Bug nests spawn defenders forever. Break one for a burst of loot; it rebuilds after a couple of minutes.

If you fall you drop half your bag and get dragged home. You never lose the colony.
"""),
    ('TIPS', """
Bank often. A full bag left topside is one death away from being half a bag.

Keep MEAT above zero or the queen stops laying entirely.

The Aphid Farm pays out whether or not you are topside, so it is the best chamber to leave running.

Sand is the bottleneck for every chamber. Dig it long before you need it.
"""),
]

TERMS = """
#POCKET COLONY - TERMS OF USE
Last updated: 2026.

#1. WHAT THIS IS
Pocket Colony is a free, non-commercial fan game. You may play it, copy it, and share it at no charge.

#2. FAN PROJECT
This game is an unofficial fan project. It is not affiliated with, endorsed by, or sponsored by any commercial game, studio or publisher. All code and artwork in it are original and were written from scratch. No third-party assets are included.

If you own a trademark you believe is used here in error, contact the project and it will be changed or removed.

#3. NO CHARGE, NO PURCHASES
There is nothing to buy. The game contains no advertising, no in-app purchases, no currency you can pay for, and no subscription of any kind.

#4. YOUR SAVE IS YOURS
Your progress is a plain file on your own device. You may copy, edit, back up or delete it freely. Editing it is not cheating and will not get you banned - there is nothing to be banned from.

#5. NO WARRANTY
The game is provided as is, without warranty of any kind. It may contain bugs. It may lose a save. Play it for fun and do not rely on it for anything important. To the extent the law allows, the authors are not liable for any loss arising from its use.

#6. CHANGES
These terms may change in a later version. The current text always ships inside the build you are playing.
"""

PRIVACY = """
#POCKET COLONY - PRIVACY POLICY
Last updated: 2026.

#SHORT VERSION
The game collects nothing, sends nothing, and has no idea who you are.

#1. NO DATA COLLECTION
Pocket Colony does not collect, transmit or store any personal information. There are no accounts, no sign-in, no email field, no name field and no profile.

#2. NO NETWORK
The game makes no network connections at all. It has no analytics, no telemetry, no crash reporting, no advertising SDK, and no third-party libraries that phone home. You can play it with the device offline forever and nothing changes.

#3. WHAT IS STORED, AND WHERE
Two files are written to your own device: save.json holds your colony progress, and settings.json holds your preferences.

Both live in your user data directory - under your home folder on Linux, Application Support on macOS, AppData on Windows, and the app's private storage on Android. They never leave the device.

#4. DELETING YOUR DATA
Delete those two files, or use WIPE COLONY in the menu. That is the whole of it - nothing is kept anywhere else, because nothing was sent anywhere else.

#5. CHILDREN
Because the game collects no data from anyone, it collects no data from children either.

#6. CONTACT
Questions about this policy can go to the project's repository.
"""

CREDITS = """
#POCKET COLONY
A fan-made ant colony sim.

#DESIGN, CODE AND ART
GAR Productions

#BUILT WITH
Python and pygame-ce

#EVERYTHING HERE IS ORIGINAL
The fonts are bitmap data typed out by hand. Every sprite is hand-authored pixel art. The sound effects are synthesised at load from square, saw, triangle and noise waves. There are no imported assets, no asset packs and no game engine.

#THANKS
To everyone who sends in fan art, finds bugs, or just plays it.

#UNOFFICIAL FAN PROJECT
Not affiliated with any commercial game or its publisher.
"""
