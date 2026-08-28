# GAR Toolbox

Thirteen small tools that do genuinely useful things to the files on your
computer. One file to run, **nothing to install**, no internet needed.

If you can open a terminal and type one word, you can use all of it.

```sh
cd tools/toolbox
python3 toolbox.py
```

That's it. You get a numbered menu — pick a number, answer a couple of
questions in plain English, done.

```
  ___   _   ___   _____         _ _
 / __| /_\ | _ \ |_   _|__  ___| | |__  _____ __
| (_ |/ _ \|   /   | |/ _ \/ _ \ | '_ \/ _ \ \ /
 \___/_/ \_\_|_\   |_|\___/\___/_|_.__/\___/_\_\

What would you like to do?
   1. Tidy up a messy folder
   2. Find duplicate files
   3. Rename lots of files at once
   4. See what's eating my disk space
   5. Share a folder over wi-fi
   6. Convert CSV to JSON (or back)
   7. Report on a piece of writing
   8. Count the code in a project
   9. Make a strong password
  10. Write something in giant letters
  11. Pick randomly / roll dice / make teams
  12. Start a countdown timer
  13. Undo my last file change
   0. Quit
```

## The tools

| # | Tool | What it actually does |
|---|------|----------------------|
| 1 | **Tidy up** | Takes a Downloads folder with 400 random files and sorts them into `Images/`, `Videos/`, `Documents/`, `Music/`, `Code/`, `Archives/`… |
| 2 | **Duplicates** | Finds files that are byte-for-byte identical, even with different names, and tells you how much space the copies waste. |
| 3 | **Bulk rename** | Renames a whole folder at once: numbering, find-and-replace, prefixes, suffixes, or cleaning up ugly names. |
| 4 | **Disk space** | Shows the biggest folders and the biggest files, so you know what to delete. |
| 5 | **Wi-fi share** | Gives you a link like `http://192.168.1.14:8000`. Anyone on your wi-fi can open it and grab the files. Stops when you press Ctrl+C. |
| 6 | **Convert** | `.csv` → `.json` and `.json` → `.csv`, which is most of what data work is. |
| 7 | **Writing report** | Word count, reading time, sentence length, and a chart of the words you lean on too much. |
| 8 | **Code count** | How many lines of code are in a project, broken down by language. |
| 9 | **Passwords** | Real random passwords, or word passwords like `otter-galaxy-marble-cactus-river-neon-42`, with an honest strength score. |
| 10 | **Giant letters** | Turns text into big ASCII art. |
| 11 | **Random picker** | Picks one, shuffles a list, rolls `3d20`, or splits people into fair teams. |
| 12 | **Timer** | A countdown with a progress bar that beeps at the end. |
| 13 | **Undo** | Puts back everything the last file tool moved. |

## Typing commands instead

Once you know what you want, skip the menu:

```sh
python3 toolbox.py organize ~/Downloads      # show a preview first
python3 toolbox.py organize ~/Downloads --go # just do it
python3 toolbox.py undo ~/Downloads          # put it all back

python3 toolbox.py duplicates ~/Pictures
python3 toolbox.py space ~/Downloads
python3 toolbox.py share ~/Pictures          # Ctrl+C to stop

python3 toolbox.py rename ~/Photos --mode number --pattern "Holiday" --go
python3 toolbox.py rename ~/Photos --mode replace --find "IMG_" --replace "Beach "

python3 toolbox.py convert scores.csv
python3 toolbox.py words essay.txt
python3 toolbox.py code ~/my-project

python3 toolbox.py password
python3 toolbox.py password --phrase --words 8
python3 toolbox.py banner "GAR"
python3 toolbox.py pick pizza tacos sushi
python3 toolbox.py pick --dice 2d20
python3 toolbox.py pick alex sam kai jo --teams 2
python3 toolbox.py timer 25m --label Homework
```

`python3 toolbox.py <tool> --help` explains any single tool.

## It won't wreck your files

This is the part that matters, because these tools move real files around.

- **Preview first.** Tidy up and rename always show you what they're about to
  do and wait for a yes. `--go` skips the question, once you trust it.
- **Undo.** Every tool that moves files writes a `.toolbox-undo.json` log
  first. `python3 toolbox.py undo <folder>` puts everything back.
- **Nothing is overwritten.** If `cat.png` is already there, your file becomes
  `cat (2).png`. Both survive.
- **Nothing is deleted** unless you specifically ask. The duplicate finder
  *moves* extra copies into a `duplicates-found/` folder so you can look
  before you delete. Real deletion needs `--delete` and you typing `DELETE`.
- **It won't act on its own.** If nobody is at the keyboard to answer a
  question, it stops instead of guessing.

## About the password strength numbers

They're honest, which means they're sometimes unflattering. A word password
is scored on how many *words* were picked, not how many letters came out —
scoring the letters would claim `otter-galaxy-marble-42` is unbreakable when
it isn't. If the tool says "weak", add more words.

Random passwords are for logins your browser remembers. Word passwords are
for the handful you have to type from memory.

## Wi-fi sharing, honestly

The share tool runs a plain web server with no password on it. Anyone on the
same wi-fi who has the link can download those files while it's running. It's
great for "send this video to my phone", and a bad idea on café wi-fi. Only
share folders you'd be fine with everyone on that network seeing, and press
Ctrl+C when you're finished.

## Tests

```sh
cd tools/toolbox
python3 -m unittest discover -s tests
```

58 tests, no test framework to install.

## How it's built

```
tools/toolbox/
  toolbox.py            the menu and the commands — start here
  gartools/
    ui.py               printing, colours, asking questions
    files.py            tidy, duplicates, rename, disk space, undo
    textdata.py         CSV/JSON, writing report, code count
    fun.py              passwords, giant letters, random picks, timer
    share.py            the wi-fi file server
  tests/test_toolbox.py
```

Standard library only. Python 3.9 or newer. Works on Windows, Mac and Linux.
