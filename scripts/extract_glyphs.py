"""Extract normalised astrology glyph outlines from Noto Sans Symbols (1, 2) as SVG path data.

Usage: python -I extract.py SYMBOLS.ttf SYMBOLS2.ttf OUT.json
Each glyph is scaled so its larger bounding-box side is EXTENT units and centred in a BOX
square, y pointing down.
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen

BOX, EXTENT = 100, 80
MOON_THICKNESS = float(sys.argv[4]) if len(sys.argv) > 4 else 11
sym, sym2, out = sys.argv[1:4]
f1, f2 = TTFont(sym), TTFont(sym2)
fonts = {1: f1, 2: f2}

SPEC = [
    ('aries', 1, 0x2648), ('taurus', 1, 0x2649), ('gemini', 1, 0x264A), ('cancer', 1, 0x264B),
    ('leo', 1, 0x264C), ('virgo', 1, 0x264D), ('libra', 1, 0x264E), ('scorpio', 1, 0x264F),
    ('sagittarius', 1, 0x2650), ('capricorn', 1, 0x2651), ('aquarius', 1, 0x2652), ('pisces', 1, 0x2653),
    ('sun', 2, 0x2609), ('mercury', 1, 0x263F), ('venus', 1, 0x2640),
    ('mars', 1, 0x2642), ('jupiter', 1, 0x2643), ('saturn', 1, 0x2644), ('fortune', 2, 0x1F774),
]

def record(font, cp, transform=(1, 0, 0, 1, 0, 0)):
    gs = font.getGlyphSet()
    rec = RecordingPen()
    gs[font.getBestCmap()[cp]].draw(TransformPen(rec, transform))
    return rec

def compose_rx():
    # R with a reduced x hooked over the foot of its leg: the conventional Rx ligature.
    rec = record(f1, ord('R'))
    xs = 0.6
    rx = record(f1, ord('x'), (xs, 0, 0, xs, 400, -170))
    rec.value.extend(rx.value)
    return rec

def arc(pen, cx, cy, r, a0, a1, steps=4):
    import math
    d = (a1 - a0) / steps
    k = 4 / 3 * math.tan(math.radians(d) / 4)
    for i in range(steps):
        t0, t1 = math.radians(a0 + i * d), math.radians(a0 + (i + 1) * d)
        p0 = (cx + r * math.cos(t0), cy + r * math.sin(t0))
        p3 = (cx + r * math.cos(t1), cy + r * math.sin(t1))
        c1 = (p0[0] - k * r * math.sin(t0), p0[1] + k * r * math.cos(t0))
        c2 = (p3[0] + k * r * math.sin(t1), p3[1] - k * r * math.cos(t1))
        pen.curveTo(c1, c2, p3)

def draw_moon(thickness, beta=125.0):
    # Symmetric crescent bulging right like U+263D: an outer arc of radius 40 spanning
    # +-beta degrees and an inner arc through the same horn tips, `thickness` thick at the
    # middle. Drawn y-up and normalised like the font glyphs.
    import math
    ro = 40.0
    b = math.radians(beta)
    tip = (ro * math.cos(b), ro * math.sin(b))
    h = ((ro - thickness) ** 2 - ro ** 2) / (2 * (ro - thickness - ro * math.cos(b)))
    rho = ro - thickness - h
    phi = math.degrees(math.atan2(tip[1], tip[0] - h))
    rec = RecordingPen()
    rec.moveTo(tip)
    arc(rec, 0, 0, ro, beta, -beta, steps=6)
    arc(rec, h, 0, rho, -phi, phi, steps=6)
    rec.closePath()
    return rec

def bounds(rec):
    bp = BoundsPen(None)
    rec.replay(bp)
    return bp.bounds

def fmt(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

result = {}
items = [(n, record(fonts[w], cp)) for n, w, cp in SPEC] + [('moon', draw_moon(MOON_THICKNESS)), ('retrograde', compose_rx())]
for name, rec in items:
    x0, y0, x1, y1 = bounds(rec)
    s = EXTENT / max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    pen = SVGPathPen(None, ntos=fmt)
    rec.replay(TransformPen(pen, (s, 0, 0, -s, BOX / 2 - cx * s, BOX / 2 + cy * s)))
    result[name] = pen.getCommands()

meta = {
    'symbols': f1['name'].getDebugName(5), 'symbols2': f2['name'].getDebugName(5),
}
json.dump({'meta': meta, 'paths': result}, open(out, 'w'), indent=0)
print(meta, {k: len(v) for k, v in result.items()})
