#!/usr/bin/env python3
"""Render the six Cat Boom stickers. All coordinates are in final image pixels."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONVERTER = "/opt/homebrew/bin/rsvg-convert"
INK = "#4e342e"
WHITE = "#ffffff"
BLUSH = "#ff9aa2"


def path(d, fill, stroke="none", width=0):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def line(d, color=INK, width=3):
    return path(d, "none", color, width)


def oval(x, y, rx, ry, color):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{color}"/>'


def sticker(size, cutlines, artwork, transform=""):
    # Paint all white contours first so the bleed follows only the outer silhouette.
    border = "".join(path(d, WHITE, WHITE, w) for d, w in cutlines)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 {size} {size}" stroke-linejoin="round" stroke-linecap="round">'
            + f'<g transform="{transform}">' + border + "".join(artwork) + "</g></svg>")


def inked(d, fill, width=6):
    return path(d, fill, INK, width)


# A wide pear-shaped head, high outer ears and low paws match the HUD portraits.
HEAD = ("M 19 94 C 19 82 23 71 29 62 C 30 52 33 34 40 30 "
        "C 46 26 57 37 66 46 Q 80 42 94 46 C 103 38 115 27 121 30 "
        "C 128 34 131 51 132 62 C 139 73 142 85 141 97 "
        "C 139 119 119 132 81 133 C 46 134 21 123 19 101 Q 18 98 19 94 Z")
LEFT_EAR = "M 36 57 Q 38 42 42 37 Q 46 35 57 49 Q 46 50 36 57 Z"
RIGHT_EAR = "M 104 49 Q 116 35 120 37 Q 124 42 125 56 Q 115 51 104 49 Z"
BIB = ("M 30 111 C 31 101 40 95 49 90 C 60 83 70 71 77 59 "
       "Q 80 54 83 60 C 90 75 100 84 112 91 Q 130 101 131 112 "
       "C 120 124 104 131 81 132 Q 46 132 30 111 Z")
PAW_L = ("M 35 127 C 34 119 42 112 52 112 C 63 111 69 119 68 128 "
         "C 67 136 61 140 51 140 C 41 140 36 136 35 127 Z")
PAW_R = ("M 92 128 C 90 120 96 113 106 112 C 118 111 126 119 125 129 "
         "C 124 137 117 140 107 140 C 99 140 93 137 92 128 Z")
WHISKERS = ("M 16 91 Q 22 91 29 93 M 17 103 Q 23 101 29 100 "
            "M 131 93 Q 138 90 144 90 M 132 100 Q 139 101 143 104")


def cheeks():
    return oval(45, 94, 8, 4.6, BLUSH) + oval(115, 94, 8, 4.6, BLUSH)


def portrait(features, accessories, paw_colors):
    # Clip coat markings inside the head and restore the ink on top of the fur.
    coat, face = features
    cutlines = [(HEAD, 13), (WHISKERS, 11), (PAW_L, 12), (PAW_R, 12)]
    body = [
        f'<defs><clipPath id="fur"><path d="{HEAD}"/></clipPath></defs>',
        f'<g clip-path="url(#fur)">', *coat, '</g>',
        line(HEAD, INK, 6), *face, line(WHISKERS, INK, 4.5),
    ]
    for contour, bleed, drawing in accessories:
        cutlines.append((contour, bleed))
        body.extend(drawing)
    body.extend([inked(PAW_L, paw_colors[0], 4.5), inked(PAW_R, paw_colors[1], 4.5)])
    return sticker(160, cutlines, body, "translate(3.2 4.8) scale(.96)")


def orange():
    fur, cream, stripe = "#ffb86c", "#fff4e4", "#d97c36"
    coat = [
        path(HEAD, fur), path(BIB, cream),
        path("M 54 40 Q 58 66 64 62 Q 68 60 65 40 Z "
             "M 72 39 Q 73 62 79 64 Q 85 65 85 39 Z "
             "M 93 40 Q 88 61 93 62 Q 100 62 105 40 Z", stripe),
        path("M 19 70 Q 37 72 37 77 Q 36 81 19 80 Z "
             "M 16 83 Q 31 82 32 86 Q 32 90 16 92 Z "
             "M 142 70 Q 125 73 123 77 Q 124 82 142 79 Z "
             "M 143 83 Q 130 82 128 86 Q 128 90 144 91 Z", stripe),
        path(LEFT_EAR, "#f39e70"), path(RIGHT_EAR, "#f39e70"),
    ]
    face = [
        cheeks(),
        line("M 44 85 C 49 77 57 76 63 83 M 97 83 C 103 76 111 77 116 84", INK, 5.6),
        inked("M 65 94 Q 74 98 80 92 Q 87 97 96 93 C 95 103 91 111 81 112 "
              "C 72 112 67 105 65 94 Z", "#80464a", 3.8),
        path("M 75 106 Q 83 98 90 103 Q 88 109 82 110 Q 78 110 75 106 Z", "#ff9ba5"),
        path("M 75 89 Q 80 86 85 89 Q 86 91 81 94 Q 79 95 75 91 Q 74 90 75 89 Z", INK),
        # A pair of stuck rice grains on one cheek.
        oval(108, 102, 3.1, 1.9, WHITE), oval(112, 105, 2, 1.5, WHITE),
    ]
    rice = ("M 61 30 Q 58 24 65 23 Q 65 17 72 19 Q 76 12 82 17 "
            "Q 88 13 92 19 Q 99 17 100 25 Q 105 26 102 31 Z")
    bowl = "M 58 28 Q 81 31 104 26 C 102 37 95 44 84 45 Q 66 46 58 28 Z"
    decoration = [
        (rice, 10, [inked(rice, "#fffaf1", 3.5),
                    line("M 70 24 l 2 -1 M 81 21 l 2 1 M 91 23 l 2 -1", "#e6cda9", 2.3)]),
        (bowl, 10, [inked(bowl, "#95cadd", 4),
                    path("M 64 31 Q 83 33 99 29 L 98 32 Q 80 37 66 34 Z", "#fff8e9"),
                    line("M 76 38 q 2 3 5 3 M 85 40 q 3 0 5 -3", "#528fa9", 2.5)]),
    ]
    return portrait((coat, face), decoration, (fur, cream))


def cow():
    fur, patch = "#fffaf2", "#3d383b"
    coat = [
        path(HEAD, fur),
        path("M 16 24 L 77 24 Q 88 50 72 59 C 62 64 68 76 57 85 "
             "C 47 94 34 88 30 83 Q 22 79 15 81 Z", patch),
        path("M 144 80 Q 130 75 123 84 C 119 90 111 89 108 98 "
             "C 105 109 115 117 129 114 L 145 107 Z", patch),
        path(LEFT_EAR, "#af8994"), path(RIGHT_EAR, "#f2c5c4"),
    ]
    face = [
        inked("M 38 77 C 37 65 46 59 56 62 C 64 64 67 73 64 82 "
              "C 61 90 49 92 42 87 Q 38 84 38 77 Z", "#fffdfa", 4),
        oval(55.3, 73.8, 3.1, 3.6, INK),
        line("M 93 81 Q 99 72 110 76 Q 105 79 100 83", INK, 4.6),
        line("M 96 66 Q 100 63 105 65", INK, 3),
        cheeks(), oval(45, 93, 2.5, 1.15, "#ffc5c6"),
        inked("M 67 97 Q 77 100 82 92 Q 89 92 94 86 Q 97 95 90 100 "
              "Q 79 106 69 100 Z", "#81484e", 3),
        inked("M 83 98 Q 88 97 93 92 Q 99 98 95 103 Q 88 110 83 98 Z", "#ff97a5", 2.6),
        line("M 92 97 l 1 3", "#db7785", 1.7),
        oval(79, 89, 4.6, 2.9, INK),
    ]
    tuft = ("M 70 47 Q 78 40 70 32 Q 77 32 81 38 Q 85 32 83 25 "
            "Q 96 35 87 47")
    bolt = "M 96 15 Q 97 13 99 14 L 105 16 L 101 23 L 107 23 L 95 36 L 97 27 L 91 27 Z"
    return portrait((coat, face), [
        (tuft, 10, [inked(tuft, fur, 3.8)]),
        (bolt, 9, [inked(bolt, "#ffd43b", 3)]),
    ], (patch, fur))


def hakimi():
    cream, caramel, rose = "#fff8ee", "#e6a57e", "#d88c9a"
    coat = [
        path(HEAD, cream),
        path("M 17 24 L 67 25 Q 71 47 59 55 C 52 62 42 58 38 65 "
             "Q 32 75 19 73 Z", caramel),
        path("M 98 25 L 139 23 L 140 65 Q 130 68 120 61 "
             "C 114 55 105 59 102 50 Z", rose),
        path("M 143 81 Q 135 78 129 83 C 123 91 115 85 111 93 "
             "Q 105 109 126 113 L 145 108 Z", caramel),
        path(LEFT_EAR, "#eeaf9b"), path(RIGHT_EAR, "#f1b6c0"),
    ]
    face = [
        cheeks(),
        path("M 44 78 Q 52 81 65 80 Q 63 88 56 88 Q 48 88 44 78 Z "
             "M 96 80 Q 108 81 116 77 Q 112 88 104 88 Q 98 88 96 80 Z", INK),
        line("M 44 77 Q 52 81 64 80 M 97 80 Q 108 81 116 77", INK, 3.8),
        oval(58, 83, 1.7, 1.7, WHITE), oval(106, 83, 1.7, 1.7, WHITE),
        line("M 51 71 Q 55 69 59 71 M 101 71 Q 105 69 109 70", "#ad806c", 2.8),
        oval(80, 88, 4.5, 2.8, INK),
        line("M 69 95 C 71 102 79 100 80 92 C 82 99 89 101 92 94", INK, 3.7),
    ]
    cape = ("M 41 109 Q 61 114 79 114 Q 99 114 118 108 "
            "Q 120 121 108 129 Q 96 136 80 136 Q 45 135 41 109 Z")
    crown = ("M 58 25 Q 57 20 61 22 L 72 29 L 78 16 Q 80 12 83 16 L 90 28 "
             "L 101 21 Q 105 19 104 24 L 100 42 Q 80 48 62 42 Z")
    gem = "M 76 34 L 80 30 Q 81 29 82 30 L 86 34 L 82 39 Q 81 40 80 39 Z"
    return portrait((coat, face), [
        (cape, 10, [inked(cape, "#d75e6b", 4),
                    line("M 48 112 Q 61 116 74 116 M 87 116 Q 105 115 114 111", "#fff0dc", 4.5),
                    line("M 64 122 l 8 -2 M 88 120 l 9 4", "#ab4d58", 2.6),
                    inked("M 75 119 Q 80 113 85 118 Q 87 123 81 127 Q 75 126 75 119 Z", "#ffd54f", 2.5)]),
        (crown, 10, [inked(crown, "#ffd54f", 4),
                     line("M 66 39 Q 80 43 97 39", "#db9845", 2.5),
                     inked(gem, "#ff6b6b", 2.1), oval(80.5, 32.7, 1.1, 1, "#fff0d2"),
                     oval(68, 34, 1.8, 1.8, "#fff4b2"), oval(95, 33, 1.8, 1.8, "#fff4b2")]),
    ], (cream, cream))


def blast():
    shell = ("M 54 26 C 66 26 78 38 79 52 C 82 70 70 83 52 84 "
             "C 31 87 15 75 14 59 C 12 41 26 28 43 27 Z")
    cap = "M 51 29 L 54 21 Q 57 18 60 20 L 67 24 Q 69 26 66 29 L 62 34 Z"
    wick = "M 60 25 C 68 20 61 14 71 15"
    spark = ("M 75 7 Q 77 5 78 9 Q 79 15 84 16 Q 89 18 84 20 "
             "Q 79 22 77 28 Q 75 31 74 26 Q 73 21 68 19 Q 64 17 69 15 Q 74 13 75 7 Z")
    return sticker(96, [(shell, 10), (cap, 9), (wick, 11), (spark, 9)], [
        line(wick, INK, 5), line(wick, "#e0ad73", 2),
        inked(shell, "#ff6b6b", 4.6),
        path("M 27 72 C 46 83 70 74 75 55 Q 78 71 62 79 Q 41 88 27 72 Z", "#e55e64"),
        line("M 23 50 Q 25 43 31 39", "#ffb5a8", 3.4), oval(35, 37, 1.9, 1.6, "#ffb5a8"),
        '<g transform="rotate(-12 48 57)" fill="#fff4e4">',
        path("M 36 64 C 36 60 40 59 42 55 C 45 50 50 51 53 56 "
             "C 55 59 61 61 60 66 C 59 72 53 70 49 69 C 44 68 37 73 36 66 Z", "#fff4e4"),
        oval(33.5, 54, 4, 5, "#fff4e4"), oval(42.5, 47.5, 4.1, 5.6, "#fff4e4"),
        oval(53.5, 47.5, 4.2, 5.5, "#fff4e4"), oval(62, 54, 3.8, 4.9, "#fff4e4"), '</g>',
        inked(cap, "#bf8b70", 3.5), line("M 55 24 l 8 4", "#f4c79e", 2.1),
        inked(spark, "#ffd54f", 3.2),
    ])


def merge():
    shield = ("M 13 39 Q 14 23 18 14 Q 20 9 25 12 L 39 22 Q 49 19 58 22 "
              "L 71 12 Q 76 8 78 15 Q 83 28 83 42 C 84 60 73 75 52 85 "
              "Q 48 88 43 85 C 23 77 11 61 13 39 Z")
    core = ("M 22 41 Q 26 36 38 32 Q 48 28 58 32 Q 70 35 75 41 "
            "C 75 56 65 69 50 77 Q 48 78 46 77 C 32 70 22 58 22 41 Z")
    heart = ("M 48 47 C 41 38 32 42 33 50 C 33 56 40 62 47 66 Q 49 67 51 65 "
             "C 57 61 65 54 64 48 C 63 40 54 40 48 47 Z")
    return sticker(96, [(shield, 11)], [
        inked(shield, "#ffd54f", 4.8),
        path("M 19 32 Q 20 22 22 18 L 32 25 Z M 64 25 L 74 18 Q 77 25 77 32 Z", "#e8a754"),
        inked(core, "#fff6df", 3.3),
        line("M 27 42 Q 36 36 44 35", WHITE, 2.7),
        inked(heart, "#ff929e", 3.4), line("M 38 49 q 0 -3 3 -3", "#ffe1d9", 2.5),
        path("M 28 38 Q 29 44 33 45 Q 29 47 28 52 Q 27 47 23 46 Q 27 43 28 38 Z "
             "M 68 51 Q 69 56 73 57 Q 69 59 68 64 Q 67 59 63 58 Q 67 56 68 51 Z", "#dfa64f"),
        oval(48, 81, 2, 1.5, "#c88b42"),
    ])


def collapse():
    swirl = ("M 17 46 C 12 36 18 22 32 15 C 47 7 62 10 72 18 "
             "Q 73 14 75 13 Q 78 12 79 16 L 83 33 Q 84 37 80 38 L 65 37 "
             "C 72 42 77 45 80 40 Q 82 35 85 40 C 91 54 82 73 69 80 "
             "C 54 89 36 88 25 77 Q 24 83 20 82 Q 17 82 16 77 L 12 61 "
             "Q 11 57 16 57 L 29 58 Q 19 55 17 46 Z")
    leaf = ("M 34 60 Q 26 52 30 44 Q 31 42 34 44 Q 32 35 38 33 Q 39 32 42 35 "
            "Q 44 29 52 29 Q 59 28 64 24 Q 67 22 68 27 Q 70 35 66 43 "
            "Q 70 43 67 49 Q 64 55 57 57 Q 60 60 54 62 Q 43 65 34 60 Z")
    return sticker(96, [(swirl, 10)], [
        inked(swirl, "#74d6b3", 4.6),
        path("M 19 45 C 18 27 35 16 52 16 Q 64 16 70 23 "
             "C 51 17 32 27 28 42 Q 25 51 33 56 Q 23 54 19 45 Z", "#c7f5e2"),
        path("M 24 65 Q 37 75 54 73 C 68 71 79 59 82 47 "
             "Q 83 68 63 78 Q 40 88 24 65 Z", "#c7f5e2"),
        line("M 37 69 Q 57 74 69 59", "#448e80", 3.1),
        line("M 63 60 Q 66 59 70 57 L 70 64", "#448e80", 3.1),
        inked(leaf, "#c7f5e2", 3.4),
        line("M 30 64 Q 42 54 58 36", INK, 3),
        line("M 41 54 l -2 -8 M 47 48 l 9 -2", "#649f83", 2.5),
        path("M 23 30 Q 24 35 28 36 Q 24 37 23 42 Q 22 38 19 36 Q 22 34 23 30 Z", "#fff8da"),
    ])


def main():
    assets = {
        "bosses/boss_orange": orange,
        "bosses/boss_cow": cow,
        "bosses/boss_hakimi": hakimi,
        "relics/relic_blast": blast,
        "relics/relic_merge": merge,
        "relics/relic_collapse": collapse,
    }
    for name, draw in assets.items():
        output = ROOT / "assets" / f"{name}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        png = subprocess.run([CONVERTER, "--format=png"], input=draw().encode(),
                             stdout=subprocess.PIPE, check=True).stdout
        output.write_bytes(png)


if __name__ == "__main__":
    main()
