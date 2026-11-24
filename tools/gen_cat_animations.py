"""Draw Cat Boom's idle, swap-hint and held animations in 192-unit SVG cells."""

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CONVERTER = "/opt/homebrew/bin/rsvg-convert"
CELL = 192
INK = "#4e342e"
CREAM = "#fff3e4"
BLUSH = "#ff9aa2"
GOLD = "#ffd036"
STRIPE = "#d97c36"


@dataclass(frozen=True)
class Coat:
    fur: str
    ear: str


ORANGE = Coat("#ffbe7b", "#ffd4a3")
LILAC = Coat("#b6b2e3", "#ffc2c9")
MINT = Coat("#bfe6c8", "#a7d7b4")
PINK = Coat("#ffb8c9", "#ffd4de")
COATS = (ORANGE, LILAC, MINT, PINK)


def path(d, fill="none", stroke="none", width=0):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def line(d, width=4, color=INK):
    return path(d, stroke=color, width=width)


def oval(x, y, rx, ry, fill):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}"/>'


def group(transform, *shapes):
    return f'<g transform="{transform}">{"".join(shapes)}</g>'


def painted(name, contour, coat, markings, width=6):
    """Ink last so clipped coat markings meet the inside of the outline."""
    return (f'<defs><clipPath id="{name}">{path(contour)}</clipPath></defs>'
            + path(contour, coat.fur)
            + f'<g clip-path="url(#{name})">{markings}</g>'
            + line(contour, width))


def back_marks(coat, x, y, scale=1):
    if coat == PINK:
        art = (oval(0, 0, 5.1, 5, CREAM) + oval(-9, 13, 4.5, 4.8, CREAM)
               + oval(10, 17, 4.7, 4.5, CREAM))
    elif coat == ORANGE:
        art = path("M-14 -13 Q-15 8 -10 13 Q-4 17 1 -10 Z "
                   "M2 -9 Q-1 16 4 18 Q10 21 17 -3 Z "
                   "M17 10 Q5 25 9 29 Q13 34 27 20 Z", STRIPE)
    else:
        return ""
    return group(f"translate({x} {y}) scale({scale})", art)


def forehead(coat, x, y, scale=1):
    if coat == MINT:
        art = path("M0 -12 Q2 -12 12 -1 Q9 4 1 15 Q-1 15 -12 3 Q-8 -4 0 -12Z", CREAM)
    elif coat == ORANGE:
        art = path("M-16 -12 Q-17 8 -12 9 Q-7 10 -8 -12 Z "
                   "M-5 -14 Q-6 12 0 12 Q5 12 4 -13 Z "
                   "M8 -14 Q9 7 13 7 Q18 7 17 -14 Z", STRIPE)
    else:
        return ""
    return group(f"translate({x} {y}) scale({scale})", art)


def crown(x, y, angle=0, scale=1):
    shape = "M-18 9 L-23 -5 Q-25 -13 -19 -11 L-10 -6 L-3 -17 Q0 -22 4 -17 L11 -7 L19 -13 Q25 -16 23 -8 L18 9 Q0 5 -18 9Z"
    return group(f"translate({x} {y}) rotate({angle}) scale({scale})",
                 path(shape, GOLD, INK, 4.7))


def glint(x, y, radius, color):
    shape = "M0 -1 Q.16 -.19 1 0 Q.2 .16 0 1 Q-.16 .2 -1 0 Q-.2 -.15 0 -1Z"
    return group(f"translate({x} {y}) scale({radius})", path(shape, color))


def face(x, y, spacing, expression, angle=0):
    """Eyes share a baseline. Cheeks, whiskers and mouth move with the muzzle."""
    art = ""
    for side in (-1, 1):
        eye_x = side * spacing
        art += oval(eye_x + side * 4, 7.5, 6.2, 3.8, BLUSH)
        art += line(f"M{eye_x + side*15} 3 l{side*8} -1.8 "
                    f"M{eye_x + side*16} 9 l{side*6} 1", 3.5)
        if expression in ("smile", "blink") or (expression == "wink" and side == -1):
            art += line(f"M{eye_x-6} 1 q5.5 -8 12 -1", 4.6)
        elif expression == "wink":
            art += line(f"M{eye_x+5} -3 l-9 3.8 9 2.3", 3.8)
        elif expression in ("sparkle", "wave", "hop"):
            art += oval(eye_x, -1, 6.7, 8.3, INK)
            if expression == "sparkle":
                art += glint(eye_x-1, -3, 4.1, "#ffffff")
            else:
                art += oval(eye_x-2, -3.8, 2.4, 2.5, "#ffffff")
            art += oval(eye_x+2.5, 2.3, 1.2, 1.2, CREAM)
        elif expression.startswith("held"):
            art += group(f"translate({eye_x} 0) rotate({side*7})",
                         '<ellipse rx="9" ry="11" fill="#fff" '
                         f'stroke="{INK}" stroke-width="3.3"/>')
            look = {"held": 0, "held-left": -2.5, "held-right": 2.5}[expression]
            art += oval(eye_x+look, 0, 3.2, 4.7, INK)
            art += line(f"M{eye_x-3} -15 q3 -2.5 6 -2", 2.6)
        else:
            art += oval(eye_x, 0, 4.1, 4.4, INK)
    if expression == "held":
        art += line("M-7 10 Q-5 6 -2 9 Q0 12 2 9 Q4 6 7 10", 2.8)
    elif expression in ("hop", "held-left", "held-right"):
        shape = ("M-9 6 Q0 10 9 5 Q9 19 1 19 Q-7 19 -9 6Z" if expression == "hop"
                 else "M-6 11 Q-4 3 1 4 Q7 4 7 12 Q8 18 1 17 Q-6 18 -6 11Z")
        art += path(shape, INK, INK, 2.5)
        art += path("M-4 14 Q0 10 5 13 Q5 17 1 17 Q-2 17 -4 14Z", BLUSH)
    else:
        art += line("M-8 5 Q-5 10 -1 6 L0 3 Q3 9 7 5 L8 3", 3.8)
    return group(f"translate({x} {y}) rotate({angle})", art)


def raised_paw(x, y, angle, scale, coat):
    """Draw from the armpit to the toes, leaving the shoulder edge open."""
    shape = ("M-10 21 C-9 13 -14 6 -14 -4 Q-15 -11 -10 -12 "
             "Q-9 -19 -3 -17 Q2 -22 6 -15 Q13 -17 15 -9 "
             "C19 2 11 8 10 17")
    pads = (oval(0, 1, 6.6, 4.8, BLUSH) + oval(-8, -7, 2.6, 3.4, BLUSH)
            + oval(-1, -10, 2.7, 3.5, BLUSH) + oval(6.5, -8, 2.6, 3.3, BLUSH))
    return group(f"translate({x} {y}) rotate({angle}) scale({scale})",
                 path(shape, coat.fur, INK, 5), pads)


def tail(name, coat, shape, transform, tip_x, tip_y, angle=0):
    marks = ""
    if coat == LILAC:
        marks = group(f"translate({tip_x} {tip_y}) rotate({angle})",
                      path("M-36 -36 H24 V0 Q7 8 -12 2 L-36 6Z", CREAM))
    elif coat == ORANGE:
        marks = group(f"translate({tip_x} {tip_y}) rotate({angle})",
                      path("M-35 -1 Q-4 -7 23 1 L23 7 Q-3 1 -35 8Z "
                           "M-34 15 Q-7 9 24 16 L24 23 Q-9 16 -34 24Z", STRIPE))
    return group(transform, painted(name, shape, coat, marks, 5.2))


# Each lounging silhouette runs from the near ear, over the far ear and rump,
# and back under the two tucked forepaws. The head has no dividing outline.
KITTEN_BACK = ("C144 58 165 77 170 101 C177 127 157 149 133 149 "
               "Q121 150 115 144 Q96 151 86 146 Q82 144 81 141 "
               "Q77 150 61 147 Q50 146 51 136 C33 132 18 118 21 100 Q22 89 30 81Z")
ADULT_BACK = ("C159 69 171 96 172 117 C175 151 151 171 128 171 "
              "Q115 173 107 169 Q89 176 86 165 Q78 176 61 171 "
              "C33 167 18 150 19 121 C19 98 30 74 46 60Z")

# Outer ear silhouette and inner ear patches: resting, splayed, head tipped.
KITTEN_EARS = (
    ("M30 81 Q31 64 39 55 Q43 50 56 64 Q66 59 80 59 Q86 48 95 43 Q101 38 106 52 L111 65",
     "M35 75 Q36 65 41 59 Q45 58 51 66Z M87 59 Q91 51 98 47 Q102 50 104 62Z"),
    ("M30 81 Q26 66 32 58 Q37 52 56 64 Q66 59 80 59 Q86 48 101 44 Q108 39 106 52 L111 65",
     "M32 77 Q30 67 34 62 Q40 60 49 67Z M89 60 Q97 51 103 49 L106 62Z"),
    ("M30 81 Q35 68 38 62 Q42 58 56 68 Q69 61 80 58 Q86 48 94 39 Q101 35 106 52 L111 65",
     "M34 79 Q35 70 39 65 L50 69Z M86 58 Q90 48 96 44 L103 59Z"),
)
ADULT_EARS = (
    ("M46 60 Q46 46 53 38 Q58 34 72 47 Q93 39 116 47 Q129 33 135 37 Q141 40 141 56",
     "M51 56 Q52 45 56 42 Q60 42 66 49Z M121 48 Q130 39 133 41 Q136 44 136 53Z"),
    ("M46 60 Q40 47 47 40 Q52 34 72 47 Q93 39 116 47 Q136 33 141 39 Q145 43 141 56",
     "M47 55 Q45 47 49 44 Q55 43 65 50Z M124 49 Q134 41 139 42 L137 54Z"),
    ("M46 60 Q46 49 52 44 Q57 40 72 51 Q93 43 116 43 Q129 29 133 32 Q141 36 141 56",
     "M51 58 Q51 50 54 47 L66 50Z M120 47 Q128 37 133 36 L136 50Z"),
)

# A play bow moves the muzzle down into the left paw while the rump arches up.
BOW = ("M32 103 Q27 86 33 76 Q39 71 54 85 Q65 80 76 81 "
       "Q80 63 87 61 Q95 58 102 77 C119 54 143 49 156 67 "
       "C173 87 163 112 152 126 Q158 138 149 143 Q138 149 127 137 "
       "Q111 149 84 148 Q71 159 52 153 Q42 151 45 144 "
       "C25 141 18 127 23 114 Q25 107 32 103Z")


def lounge(coat, adult, frame):
    bow = frame == 4
    ear_pose = (0, 1, 0, 2, 0)[frame]
    if bow:
        shape = BOW
        gx, gy, ga = 65, 115, -8
        ears = "M34 96 Q32 87 35 81 Q41 80 48 87Z M81 79 Q83 70 88 66 Q92 69 96 77Z"
        bib = "M66 82 C66 104 46 127 19 130 L20 165 H142 Q139 133 106 120 Q82 111 66 82Z"
        fx, fy, bx, by = 66, 86, 141, 63
        if adult:
            shape = ("M30 100 Q25 79 32 71 Q38 66 53 81 Q65 75 77 78 "
                     "Q81 59 89 57 Q96 57 102 72 C114 50 127 37 145 42 "
                     "C168 48 173 84 165 112 Q158 143 145 148 Q134 153 125 141 "
                     "Q111 155 84 151 Q69 162 49 154 Q41 152 43 143 "
                     "C23 140 16 125 22 111 Q25 104 30 100Z")
            ears = "M32 92 Q29 80 34 75 L48 84Z M81 76 Q85 63 89 62 L97 74Z"
            bx, by = 140, 56
    elif adult:
        gx, gy, ga = 92, 77, 0
        head, ears = ADULT_EARS[ear_pose]
        shape = head + ADULT_BACK
        bib = "M92 47 C88 65 76 74 57 87 C33 102 32 141 50 161 L46 180 H130 C151 144 148 110 127 91 C111 77 95 64 92 47Z"
        fx, fy, bx, by = 92, 48, 139, 67
    else:
        gx, gy, ga = 73, 100, -9
        head, ears = KITTEN_EARS[ear_pose]
        shape = head + KITTEN_BACK
        bib = "M69 60 C70 81 56 105 20 122 L23 156 H117 Q134 129 112 114 C97 105 80 93 69 60Z"
        fx, fy, bx, by = 69, 69, 140, 68

    marks = path(bib, CREAM) if coat != MINT else ""
    marks += path(ears, coat.ear)
    marks += forehead(coat, fx, fy + (20 if coat == MINT and adult and not bow else 10 if coat == MINT else 0))
    marks += back_marks(coat, bx, by)

    # The base tail nestles into the haunch. Moving tails emerge from behind it.
    back = ""
    front_tail = ""
    if frame in (1, 4):
        flick = ("M122 139 C151 130 160 100 148 76 C142 64 130 62 130 49 "
                 "C130 36 143 33 152 43 C175 65 179 115 154 143 Q135 157 122 139Z")
        lift = "translate(-3 -15) rotate(5 150 138)" if adult else ""
        back = tail("tail", coat, flick, lift, 140, 50, -24)
    elif frame == 2:
        swept = ("M163 126 C158 145 150 152 134 157 C117 163 94 162 87 156 "
                 "C78 149 84 139 93 139 C111 139 125 151 136 137 Q144 128 143 123")
        front_tail = tail("tail", coat, swept, "translate(0 0)" if not adult else "translate(0 13)", 95, 148, -77)
    else:
        if adult:
            curl = "M117 171 Q125 168 123 155 C121 141 134 128 148 131 Q165 133 162 148 C156 163 138 173 117 171Z"
            tx, ty = 143, 139
        else:
            curl = "M141 148 C125 153 111 147 114 135 C116 123 129 119 139 124 Q147 129 151 125 C164 116 169 132 154 142 Q148 146 141 148Z"
            tx, ty = 128, 135
        # Open curl like the reference: keep the outer haunch as the tail's edge.
        tip = ("M117 171 Q126 167 123 155 C121 138 143 123 155 135 Q161 141 162 145" if adult else
               "M139 149 C122 152 111 146 114 135 C116 123 129 119 139 124 Q146 130 151 125")
        tail_marks = ""
        if coat == LILAC:
            tail_marks = group(f"translate({tx} {ty})",
                               path("M-23 -25 Q15 -10 4 10 Q0 19 -8 24 H-32Z", CREAM))
        if coat == ORANGE:
            tail_marks = path(f"M{tx} {ty-18} q10 16 4 35 l9 -2 q5 -19 -5 -35Z", STRIPE)
        marks += f'<defs><clipPath id="curl">{path(curl)}</clipPath></defs>'
        marks += path(curl, coat.fur) + f'<g clip-path="url(#curl)">{tail_marks}</g>'
        marks += line(tip, 4.8)

    paws = ("M78 154 Q81 158 85 164 Q88 156 95 153" if adult else
            "M74 132 Q81 133 81 141 Q82 135 89 131")
    if bow:
        paws = "M48 143 Q55 147 62 144 M74 149 Q81 144 88 145"
    expr = "smile" if adult else "beans"
    if bow:
        expr = "sparkle"
    elif frame == 2:
        expr = "wink" if adult else "blink"
    cat = back + painted("body", shape, coat, marks) + line(paws, 4.5)
    cat += face(gx, gy, 23 if adult and not bow else 20, expr, ga + (-10 if frame == 3 else 0))
    cat += front_tail
    if frame == 3:
        cat += raised_paw(57 if adult else 56, 145 if adult else 129, -25, .72, coat)
    if adult:
        if bow:
            cat += crown(65, 77, -10, .82)
        else:
            cat += crown(91, 28 if frame == 3 else 35, -11 if frame == 3 else -3, .96)
    if frame == 1:
        return group("translate(0 6) scale(1 .96)", cat)
    if bow and adult:
        return group("translate(-2 -10) scale(1.025 1.075)", cat)
    return cat


def wave(coat, adult, hop):
    # Narrower shoulders on the kitten; the plump adult has broader haunches.
    if adult:
        head = ("M48 79 Q47 59 53 42 Q56 34 65 43 L77 53 Q96 46 112 50 "
                "L128 37 Q135 32 138 42 Q142 56 141 72 ")
        belly = ("C155 86 161 97 164 110 C174 140 157 161 143 163 "
                 "Q136 171 123 165 Q96 176 76 166 Q57 173 50 161 "
                 "C29 151 26 125 38 101 Q46 90 48 79Z")
        if hop:
            belly = ("C154 88 160 100 162 113 C170 144 143 155 116 154 "
                     "Q89 160 65 151 Q30 147 37 117 Q40 100 48 79Z")
    else:
        head = ("M47 80 Q44 64 47 49 Q48 40 56 45 L72 55 Q86 49 103 51 "
                "L117 37 Q123 32 126 40 Q132 56 131 69 ")
        belly = ("Q137 77 136 88 C142 102 157 108 159 128 "
                 "Q165 152 146 159 Q136 171 122 163 Q95 171 72 164 "
                 "Q54 172 48 159 C36 145 38 128 44 112 Q50 100 47 80Z")
        if hop:
            belly = ("Q142 85 137 97 C145 109 162 115 152 137 "
                     "Q143 154 118 151 Q92 158 68 148 Q42 146 43 126 Q49 103 47 80Z")
    body = head + belly
    bib = ("M88 51 C85 72 65 91 48 97 Q42 104 52 119 "
           "Q37 145 62 166 Q95 184 133 159 Q146 138 128 117 "
           "Q134 106 121 99 Q97 84 88 51Z")
    ears = ("M53 67 Q52 55 56 45 Q60 44 71 55Z M116 53 L131 41 Q136 47 135 63Z"
            if adult else "M50 70 Q48 57 51 48 Q56 48 66 57Z M108 53 L121 40 Q126 49 125 60Z")
    marks = path(ears, coat.ear)
    if coat != MINT:
        marks += path(bib, CREAM)
    marks += forehead(coat, 89, 61 if coat == MINT else 55, .84)
    marks += back_marks(coat, 144, 120, .75)
    shape = ("M122 153 C149 154 159 140 157 125 C151 111 153 102 160 101 "
             "C169 98 175 110 173 125 Q173 157 148 163 Q133 166 122 153Z")
    art = tail("tail", coat, shape, "rotate(-6 146 135)", 161, 110, -18)
    if hop:
        heel = "M-12 -9 Q-12 3 -8 12 Q-4 19 4 17 Q11 17 12 10 L12 -8Z"
        for x, y, tilt in ((69, 144, 22), (124, 143, -29)):
            art += group(f"translate({x} {y}) rotate({tilt})",
                         path(heel, coat.fur, INK, 5), line("M0 11 l1 4", 2.4))
    art += painted("body", body, coat, marks)
    if not hop:
        art += line("M52 158 Q52 151 56 149 M126 161 Q131 158 133 152", 4)
    art += face(89 if adult else 84, 86, 20 if adult else 18,
                "hop" if hop else "wave", 2 if hop else -7)
    if hop:
        art += raised_paw(38, 90, -30, 1.07, coat)
        art += raised_paw(143 if adult else 139, 83, 28, 1.07, coat)
        art += glint(26, 60, 8.7, "#ffe066") + glint(157, 46, 10, "#ffe066")
        art += line("M50 173 q-5 0 -8 -4 M141 170 q5 -1 8 -6", 3)
    else:
        # Extended forearm: draw the pad over its wrist, with an open shoulder.
        art += group("translate(143 57) rotate(27)",
                     path("M-10 42 Q-13 26 -13 8 L-14 -3 Q-15 -12 -9 -12 "
                          "Q-9 -19 -3 -17 Q2 -22 7 -15 Q14 -16 15 -8 "
                          "Q18 0 11 11 Q9 27 10 35", coat.fur, INK, 5),
                     oval(0, 1, 6.6, 5, BLUSH), oval(-8, -7, 2.6, 3.4, BLUSH),
                     oval(-1, -10, 2.7, 3.4, BLUSH), oval(6.5, -8, 2.6, 3.3, BLUSH))
        art += line("M70 124 Q62 136 65 142 Q69 149 77 145 Q81 143 83 138", 4.3)
        art += glint(164, 29, 10.5, "#ffe066")
    if adult:
        art += crown(94, 42, 5 if hop else -6, .88)
    return group("translate(0 -9)" if hop else "translate(0 2)", art)


def dangling_leg(coat, x, y, side, kick, fore):
    # Leg artwork points out to the viewer's right before mirroring. A high
    # back foot folds at the hock; a high front paw swings up from the shoulder.
    if kick and fore:
        d = ("M-4 -5 Q5 -6 11 -18 Q14 -26 21 -25 Q28 -25 28 -17 "
             "Q31 -11 23 -6 Q12 9 1 11")
    elif kick:
        d = ("M-6 -5 Q5 -4 14 -10 Q23 -19 33 -15 "
             "Q42 -13 39 -5 Q38 1 30 2 L15 11 Q6 16 -4 12")
    elif fore:
        d = ("M-6 0 Q-3 11 0 20 Q3 28 10 26 Q18 26 17 17 "
             "Q14 10 13 -2")
    else:
        d = ("M-10 -4 Q-10 9 -5 24 Q-4 32 5 32 Q14 32 13 22 "
             "Q10 10 11 -5")
    detail = ""
    if kick:
        detail = oval(21 if fore else 32, -13 if fore else -8, 4.2, 3.6, BLUSH)
        detail += oval(18 if fore else 30, -19 if fore else -13, 1.7, 1.8, BLUSH)
    else:
        detail = line("M7 22 l.6 3" if fore else "M2 27 l1 4", 2.2)
    return group(f"translate({x} {y}) scale({side} 1)",
                 path(d, coat.fur, INK, 5.1), detail)


def sweat(x, y, angle, scale=1):
    return group(f"translate({x} {y}) rotate({angle}) scale({scale})",
                 path("M0 -9 Q1 -10 2 -7 Q9 1 6 6 Q3 11 -2 8 Q-10 5 0 -9Z",
                      "#8ce0ff", INK, 2.8),
                 line("M-2 2 q-1 2 0 3", 1.7, "#ffffff"))


def motion(d):
    return line(d, 4.8, INK) + line(d, 1.5, "#ffffff")


def grabbed(coat, adult, frame):
    swing = (0, -1, 1)[frame-7]
    hip = 96 + 12*swing
    girth = 33 if adult else 26
    left, right = hip-girth, hip+girth
    # The ears stay near the lifting point; the shoulders, hips and feet lag
    # successively farther behind. Only the last beat flattens both ears.
    ears = ("M54 63 Q41 62 36 53 Q35 49 41 48 Q54 47 66 50 "
            if swing == 1 else
            "M55 62 Q49 51 50 40 Q50 34 56 38 L68 47 ")
    far_ear = ("Q137 45 150 50 Q154 54 145 60 L136 65 "
               if swing == 1 else
               "L135 37 Q141 34 141 41 Q142 52 136 63 ")
    body = (ears + "Q83 44 90 37 Q95 28 97 23 Q99 19 102 25 "
            "Q104 37 113 42 L124 46 " + far_ear
            + f"Q146 84 129 94 C118 103 {right-1} 115 {right} 134 "
              f"Q{right+2} 153 {hip+6} 155 Q{left} 158 {left} 140 "
              f"C{left-1} 124 76 108 66 99 Q45 90 51 72 Q52 67 55 62Z")
    # A lightly scalloped tail silhouette changes bend as well as direction.
    if swing:
        tail_d = ("M1 9 Q24 12 38 -3 Q45 -12 44 -20 L42 -30 "
                  "Q42 -35 46 -32 L51 -27 L51 -36 Q52 -40 55 -36 "
                  "L60 -26 L62 -30 Q65 -32 65 -24 Q68 -4 51 12 "
                  "Q29 29 3 21Z")
        art = tail("tail", coat, tail_d, f"translate({hip} 127) scale({swing} 1)", 54, -21, -14)
    else:
        tail_d = ("M105 132 Q134 135 137 116 C138 107 134 99 139 95 "
                  "Q148 87 153 100 C164 128 144 150 109 151Z")
        art = tail("tail", coat, tail_d, "", 144, 102)
    for side in (-1, 1):
        lifted = swing != 0 and side == -swing
        art += dangling_leg(coat, hip + side*(girth-7), 142, side, lifted, False)
    inner_ears = ("M44 53 Q54 52 64 55 L52 58Z M130 54 L144 52 Q141 57 135 59Z"
                  if swing == 1 else
                  "M55 43 L65 50 L57 55Z M128 49 L136 42 L135 55Z")
    marks = path(inner_ears, coat.ear)
    if coat != MINT:
        marks += path(f"M96 43 Q89 71 53 81 Q53 93 69 101 "
                      f"Q{left+10} 119 {left+7} 141 Q{left+7} 157 {hip-2} 157 "
                      f"Q{hip+12} 150 {hip+5} 130 Q{hip-1} 117 112 103 "
                      "Q117 97 128 88 Q105 70 96 43Z", CREAM)
    marks += forehead(coat, 96, 56 if coat == MINT else 47, .78)
    if coat == ORANGE:
        marks += group(f"translate({right-2} 140) rotate(-80)", back_marks(coat, 0, 0, .6))
    else:
        marks += back_marks(coat, right-13, 134, .6)
    art += painted("body", body, coat, marks)
    for side in (-1, 1):
        lifted = swing != 0 and side == swing
        shoulder = 96 + side*(28 if adult else 24) + swing*4
        art += dangling_leg(coat, shoulder, 104, side, lifted, True)
    expr = {0: "held", -1: "held-left", 1: "held-right"}[swing]
    art += face(95, 76, 19, expr, 4*swing)
    if adult:
        art += crown(108+5*swing, 31 if swing == 0 else 28, 14+13*swing, .8)
    if swing == 0:
        art += sweat(153, 64, -20, .8)
    elif swing == -1:
        art += sweat(151, 51, 38, .8) + sweat(160, 64, 68, .48)
        art += motion("M34 79 q2 -8 8 -11 M30 85 l.8 -2 M147 145 q7 -5 9 -13")
    else:
        art += sweat(43, 72, -56, .8)
        art += motion("M154 74 q6 4 8 12 M47 146 q-8 -4 -11 -13")
        art += line("M40 40 l-6 -5 M45 35 l-2 -6", 3)
    return art


def render_frame(coat, adult, frame):
    if frame <= 4:
        drawing = lounge(coat, adult, frame)
    elif frame <= 6:
        drawing = wave(coat, adult, hop=frame == 6)
    else:
        drawing = grabbed(coat, adult, frame)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{CELL}" height="{CELL}" '
           f'viewBox="0 0 {CELL} {CELL}" stroke-linecap="round" stroke-linejoin="round">'
           + drawing + "</svg>")
    result = subprocess.run([CONVERTER, "--zoom", "4"], input=svg.encode(),
                            capture_output=True, check=True)
    with Image.open(BytesIO(result.stdout)) as image:
        # Area averaging preserves coverage of the ink edges and flat fills.
        return image.convert("RGBA").resize((CELL, CELL), Image.Resampling.BOX)


def main():
    for color, coat in enumerate(COATS):
        for level in (1, 2):
            sheet = Image.new("RGBA", (CELL*10, CELL))
            for frame in range(10):
                tile = render_frame(coat, level == 2, frame)
                bounds = tile.getchannel("A").getbbox()
                if not bounds or not (10 <= bounds[0] and bounds[2] <= CELL-10
                                      and 2 <= bounds[1] and bounds[3] <= CELL-2):
                    raise ValueError(f"color {color}, level {level}, frame {frame}: {bounds}")
                sheet.paste(tile, (frame*CELL, 0))
            output = ROOT / "assets" / "cats" / f"anim_cat_{color}_lv{level}.png"
            sheet.save(output, optimize=True)


if __name__ == "__main__":
    main()
