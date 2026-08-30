@echo off
REM Build a standalone Pocket Colony executable for Windows.
REM Produces dist\PocketColony.exe - a single file that needs no Python.
setlocal
cd /d "%~dp0\.."

python -m pip install --upgrade pyinstaller pygame-ce
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

python -m PyInstaller --noconfirm --clean PocketColony.spec

echo.
echo Built:
dir dist
endlocal
