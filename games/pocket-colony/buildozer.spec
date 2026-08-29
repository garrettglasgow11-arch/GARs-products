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
requirements = python3,pygame
orientation = portrait
fullscreen = 1
android.presplash_color = #0b0906
android.permissions = WAKE_LOCK
android.archs = arm64-v8a,armeabi-v7a
android.allow_backup = True
# Touch input is handled through SDL finger events, so no extra bridge is needed.

[buildozer]
log_level = 2
warn_on_root = 1
