#!/usr/bin/env python3
"""Render the twelve Cat Boom UI stickers. Coordinates are in final image pixels."""

import subprocess
import sys

# Generate only the PNGs, including on the first import of the shared SVG helpers.
sys.dont_write_bytecode = True
from gen_roguelike_assets import CONVERTER, INK, ROOT, WHITE, inked, line, oval, path, sticker

GOLD = "#ffd54f"
CREAM = "#fff6df"
CORAL = "#ff817d"
PINK = "#ffacba"


def icon(contours, artwork):
    return sticker(64, [(d, 8) for d in contours], artwork)


def speaker(enabled):
    cone = ("M 16 24 Q 20 24 24 20 L 31 14 Q 35 11 35 16 L 35 48 "
            "Q 35 52 31 49 L 21 41 Q 19 39 16 39 Z")
    box = "M 12 24 Q 9 24 9 28 L 9 37 Q 9 40 13 40 L 20 40 L 20 24 Z"
    art = [
        inked(cone, "#ffcb80" if enabled else "#e7dccd", 3.2),
        path("M 22 35 Q 27 39 33 40 L 33 48 L 22 39 Z",
             "#f2a468" if enabled else "#cbbdb2"),
        line("M 25 24 L 31 19", CREAM, 2.6),
        inked(box, "#ffab72" if enabled else "#cfc3ba", 3.2),
        line("M 13 29 v 4", CREAM, 2.2),
    ]
    if enabled:
        marks = ["M 42 26 Q 47 32 42 38", "M 50 19 Q 60 32 50 45"]
    else:
        marks = ["M 42 26 L 53 38 M 53 26 L 42 38"]
    # Open marks need a stroke-only white border to keep the sound waves hollow.
    for mark in marks:
        art.append(line(mark, WHITE, 10))
    for mark in marks:
        art.extend([line(mark, INK, 6.2), line(mark, CORAL, 3.1)])
    return icon([cone, box], art)


def shield():
    shell = ("M 12 18 Q 22 16 30 10 Q 32 8 35 10 Q 43 15 51 16 "
             "Q 54 16 53 21 C 53 37 47 47 34 54 Q 32 56 29 54 "
             "C 17 48 11 38 11 22 Q 10 19 12 18 Z")
    face = ("M 17 22 Q 26 20 32 15 Q 39 20 47 21 "
            "Q 47 39 32 49 Q 18 41 17 22 Z")
    return icon([shell], [
        inked(shell, "#95cadd", 3.4), inked(face, "#cfedf3", 2.4),
        path("M 32 18 Q 38 21 45 23 Q 44 38 32 46 Z", "#93cfdf"),
        line("M 21 26 Q 25 25 28 23", "#fffaf1", 3.2),
    ])


def blast():
    flash = ("M 10 21 L 24 25 L 22 10 Q 22 8 24 10 L 33 22 L 45 10 "
             "L 41 26 L 55 25 L 45 35 L 53 45 L 39 42 L 36 55 "
             "L 28 44 L 14 51 L 19 38 L 9 35 L 20 30 Z")
    core = ("M 22 29 L 29 31 L 28 22 L 34 29 L 40 23 L 37 32 "
            "L 46 30 L 38 36 L 42 40 L 34 38 L 32 46 L 28 39 "
            "L 22 43 L 25 36 L 20 35 L 26 33 Z")
    return icon([flash], [
        inked(flash, "#ff916c", 3.2), path(core, "#ffe283"),
        path("M 28 33 Q 32 33 33 29 Q 33 33 37 34 Q 33 35 32 39 Q 32 35 28 33 Z", CREAM),
    ])


def sparkle():
    main = ("M 25 12 Q 26 9 27 13 C 29 24 32 29 40 31 Q 44 32 40 34 "
            "C 32 37 29 41 26 52 Q 25 56 24 52 C 22 41 18 36 10 34 "
            "Q 7 33 11 31 C 19 28 22 23 25 12 Z")
    upper = "M 47 10 Q 48 17 54 19 Q 48 21 47 27 Q 45 21 40 19 Q 45 17 47 10 Z"
    lower = "M 48 41 Q 49 47 54 48 Q 49 50 48 55 Q 47 50 42 49 Q 47 47 48 41 Z"
    return icon([main, upper, lower], [
        inked(main, GOLD, 3.2), inked(upper, "#ffe497", 2.8), inked(lower, CREAM, 2.8),
        path("M 25 23 Q 25 31 30 33 Q 26 35 25 42 Q 24 36 19 33 Q 24 30 25 23 Z", CREAM),
    ])


def gift():
    bow = ("M 32 24 C 25 25 16 24 15 19 L 15 11 Q 15 8 19 10 "
           "Q 27 13 32 20 Q 37 12 44 9 Q 48 7 48 12 L 47 20 "
           "Q 45 25 32 24 Z")
    box = "M 13 29 L 51 28 L 50 49 Q 50 53 46 53 L 18 54 Q 14 54 14 50 Z"
    lid = "M 12 23 L 51 22 Q 54 22 54 25 L 54 32 L 10 34 L 10 26 Q 10 23 12 23 Z"
    return icon([bow, box, lid], [
        inked(box, PINK, 3.2),
        path("M 16 45 Q 29 50 49 44 L 48 51 L 17 52 Z", "#ee92a5"),
        inked(lid, "#ffc5ca", 3.2),
        inked("M 27 23 L 36 23 L 37 52 L 28 53 Z", "#ffdb81", 2.2),
        inked(bow, "#ffce75", 3.2),
        line("M 20 16 l 5 3 M 42 15 l -4 4", "#dc944c", 2.2),
        inked("M 28 19 Q 32 16 36 19 L 36 24 Q 32 27 28 24 Z", GOLD, 2.6),
        line("M 15 27 l 7 -.4", CREAM, 2.4),
    ])


def trophy():
    handles = ("M 21 19 C 4 12 6 35 23 35 M 43 19 C 60 12 58 35 41 35")
    cup = ("M 17 14 Q 17 9 20 11 L 26 17 Q 32 15 38 17 L 44 11 "
           "Q 47 9 47 14 L 46 25 Q 45 37 33 40 Q 20 39 18 27 Z")
    base = ("M 29 38 L 35 38 L 36 44 L 42 46 Q 45 47 45 51 L 45 53 "
            "Q 32 56 19 53 L 19 50 Q 19 47 22 46 L 28 44 Z")
    return icon([base, cup], [
        line(handles, WHITE, 11), line(handles, INK, 7), line(handles, "#ffcc76", 3),
        inked(base, "#f4bb66", 3.2), inked(cup, GOLD, 3.2),
        path("M 22 29 Q 32 37 44 23 Q 43 34 33 38 Q 25 37 22 29 Z", "#f2ae51"),
        line("M 22 20 q 0 4 1 6", CREAM, 2.7),
        inked("M 32 44 L 34 47 L 38 47 L 35 50 L 36 53 L 32 51 "
              "L 28 53 L 29 50 L 26 47 L 30 47 Z", CREAM, 1.7),
    ])


def paw():
    pad = ("M 16 44 C 16 38 21 36 24 31 C 28 24 35 24 40 31 "
           "C 43 36 50 39 49 45 C 48 53 42 55 36 52 Q 32 50 28 52 "
           "C 21 56 15 52 16 44 Z")
    toes = [
        "M 9 31 C 5 22 13 18 18 25 C 23 33 15 40 9 31 Z",
        "M 20 19 C 18 8 28 6 30 16 C 33 26 22 30 20 19 Z",
        "M 35 16 C 38 6 48 9 45 19 C 42 29 32 26 35 16 Z",
        "M 47 26 C 53 18 60 24 55 32 C 49 40 42 34 47 26 Z",
    ]
    return icon([pad, *toes], [
        inked(pad, PINK, 3.2), *(inked(toe, "#ffc4ce", 2.8) for toe in toes),
        path("M 20 46 Q 24 50 30 47 Q 33 45 38 48 Q 43 50 46 44 "
             "Q 46 53 38 51 Q 32 48 27 51 Q 21 54 20 46 Z", "#e98e9f"),
        line("M 23 40 l 4 -5", "#fff1e9", 3.2),
        oval(25, 15, 1.7, 2.2, "#fff5ed"), oval(40, 14, 1.7, 2, "#fff5ed"),
    ])


def rice():
    mound = ("M 12 32 Q 9 25 16 23 Q 15 17 23 17 Q 24 10 30 13 "
             "Q 35 6 40 14 Q 47 12 48 19 Q 55 20 52 26 Q 57 28 51 33 Z")
    bowl = ("M 10 29 Q 31 34 53 28 Q 56 27 54 32 Q 51 47 38 50 "
            "L 38 52 Q 32 55 25 52 L 24 49 Q 13 45 9 32 Q 8 29 10 29 Z")
    return icon([mound, bowl], [
        inked(mound, "#fffaf1", 3.2),
        line("M 20 24 l 3 -2 M 29 17 l 2 1 M 36 25 l 3 -2 M 43 19 l 2 1", "#e6cda9", 2.3),
        inked(bowl, "#95cadd", 3.4),
        path("M 12 32 Q 31 37 52 31 L 50 35 Q 32 41 14 36 Z", "#fff8e9"),
        line("M 24 41 q 3 4 8 4 q 5 0 9 -5", "#528fa9", 2.7),
    ])


def target():
    disc = ("M 49 35 C 49 47 40 55 28 55 C 16 55 8 46 8 35 "
            "C 8 23 17 14 29 14 C 40 14 49 23 49 35 Z")
    shaft = "M 29 35 L 48 17"
    feather = ("M 41 23 L 42 15 L 49 9 Q 51 8 51 11 L 50 15 L 54 15 "
               "Q 57 15 54 18 L 48 24 Z")
    return icon([disc, feather], [
        inked(disc, CORAL, 3.2), oval(28.5, 35, 14.8, 15, CREAM),
        oval(28.5, 35, 10, 10.4, CORAL), oval(28.5, 35, 4.6, 4.8, CREAM),
        line(shaft, INK, 5.5), line(shaft, "#ffcf79", 2.3),
        inked(feather, "#8dd9be", 2.8), line("M 43 22 l 6 -6", "#4f9789", 1.8),
    ])


def bolt():
    flash = ("M 28 10 Q 29 8 32 8 L 45 9 Q 48 9 46 12 L 35 28 "
             "L 48 27 Q 52 27 49 31 L 24 55 Q 21 58 22 53 L 27 36 "
             "L 15 37 Q 12 37 14 33 Z")
    return icon([flash], [
        inked(flash, "#ffd43b", 3.4),
        path("M 18 33 L 30 31 Q 33 30 32 34 L 27 47 L 46 30 L 29 51 "
             "L 24 55 L 29 35 Q 29 33 27 34 L 16 35 Z", "#f3a34f"),
        line("M 22 26 l 8 -13 l 7 .2", "#fff3ba", 3),
    ])


def crown():
    rim = ("M 10 22 Q 9 17 13 19 L 24 27 L 30 13 Q 32 8 35 13 "
           "L 41 26 L 51 18 Q 55 16 54 22 L 50 46 Q 50 49 47 50 "
           "Q 32 55 17 50 Q 14 49 14 46 Z")
    gem = "M 26 36 L 31 30 Q 32 29 34 30 L 39 36 L 34 43 Q 32 45 31 43 Z"
    return icon([rim], [
        inked(rim, GOLD, 3.4),
        path("M 16 43 Q 31 49 49 43 L 48 48 Q 32 54 17 48 Z", "#efaf55"),
        line("M 18 44 Q 32 49 47 44", "#d59549", 2),
        inked(gem, "#ff7777", 2.7), line("M 30 35 l 2 -2", "#ffe0cd", 2),
        oval(20, 35, 2.1, 2.2, CREAM), oval(45, 34, 2.1, 2.2, CREAM),
    ])


def main():
    assets = {
        "sound_on": lambda: speaker(True),
        "sound_off": lambda: speaker(False),
        "shield": shield,
        "blast": blast,
        "sparkle": sparkle,
        "gift": gift,
        "trophy": trophy,
        "paw": paw,
        "rice": rice,
        "target": target,
        "bolt": bolt,
        "crown": crown,
    }
    directory = ROOT / "assets" / "ui"
    directory.mkdir(parents=True, exist_ok=True)
    for name, draw in assets.items():
        png = subprocess.run([CONVERTER, "--format=png"], input=draw().encode(),
                             stdout=subprocess.PIPE, check=True).stdout
        (directory / f"icon_{name}.png").write_bytes(png)


if __name__ == "__main__":
    main()
