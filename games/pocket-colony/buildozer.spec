# Android packaging for Pocket Colony.
#   pip install buildozer
#   buildozer -v android debug
# The APK lands in bin/.  Nothing here reaches the network at runtime; the
# only permission requested is the one Android needs to keep the screen awake.
[app]
title = Pocket Colony
package.name = pocketcolony
package.domain = com.garproductions
source.dir = .
source.include_exts = py
version = 0.3.0
# pygame is pinned: python-for-android builds against a recent CPython, and
# pygame before 2.5.2 includes longintrepr.h unguarded - a header CPython moved
# in 3.11 and removed later, so older pygame cannot compile against it.
requirements = python3,pygame==2.6.1
orientation = portrait
fullscreen = 1
icon.filename = %(source.dir)s/packaging/icon.png
android.presplash_color = #0b0906
android.permissions = WAKE_LOCK
# arm64 only: every Android phone since roughly 2017 is arm64, and dropping
# the 32-bit slice halves the build.
android.archs = arm64-v8a
android.allow_backup = True
# Pinned so a CI build is reproducible, and so the SDK licence prompt cannot
# stall a headless runner.
android.accept_sdk_license = True
android.api = 33
android.minapi = 21
# Touch input is handled through SDL finger events, so no extra bridge is needed.

[buildozer]
log_level = 2
warn_on_root = 1
