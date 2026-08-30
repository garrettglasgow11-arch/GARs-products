# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Pocket Colony.

Builds a single self-contained executable that needs no Python install:

    pyinstaller PocketColony.spec          (or: packaging/build.sh)

The same spec covers Windows, macOS and Linux — it picks the right icon and,
on macOS, also wraps the binary in a .app bundle.  Everything the game needs
is Python code, so there are no data files to collect: the fonts are bitmap
data, the sprites are pixel strings and the sound is synthesised at load.
"""
import sys

NAME = 'PocketColony'
VERSION = '0.3.0'

icon = None
if sys.platform == 'win32':
    icon = 'packaging/icon.ico'
elif sys.platform == 'darwin':
    icon = 'packaging/icon.icns'

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    # Nothing here is used by the game; dropping them keeps the build small.
    excludes=[
        'tkinter', 'unittest', 'pydoc', 'doctest', 'test', 'lib2to3',
        'numpy', 'PIL', 'setuptools', 'pip', 'distutils', 'email',
        'http', 'xml', 'xmlrpc', 'sqlite3', 'ssl', 'urllib.request',
        'multiprocessing', 'asyncio', 'concurrent',
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=sys.platform != 'win32',
    upx=False,
    runtime_tmpdir=None,
    console=False,            # it is a game, not a terminal tool
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon,
)

if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name=NAME + '.app',
        icon=icon,
        bundle_identifier='com.garproductions.pocketcolony',
        info_plist={
            'CFBundleShortVersionString': VERSION,
            'CFBundleVersion': VERSION,
            'NSHighResolutionCapable': True,
            'LSApplicationCategoryType': 'public.app-category.games',
        },
    )
