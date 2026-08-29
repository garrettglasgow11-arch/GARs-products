#!/usr/bin/env bash
# Build a standalone Pocket Colony binary for the machine you run this on.
#   Linux  -> dist/PocketColony            (single executable)
#   macOS  -> dist/PocketColony.app        (double-clickable bundle)
# A binary only runs on the OS and CPU it was built on, so run this on each
# platform you want to ship, or let .github/workflows/build.yml do all three.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m pip install --upgrade pyinstaller pygame-ce

# macOS wants an .icns; build one from the committed iconset.
if [[ "$(uname)" == "Darwin" && ! -f packaging/icon.icns ]]; then
  iconutil -c icns packaging/icon.iconset -o packaging/icon.icns
fi

rm -rf build dist
python3 -m PyInstaller --noconfirm --clean PocketColony.spec

echo
echo "Built:"
ls -lh dist/
