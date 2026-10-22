"""The footnotes' rule on each page: a thin line, a third of the text's width, at the left, below the
text. Where it stands (pixels at 300 dpi, from the top), or none: footrules.json.

    py footrule.py
"""
import json
import os
import re

import numpy as np
from PIL import Image


def longest(on):
    """The longest run of ink across the band, a break of a few pixels in it bridged."""
    d = np.diff(np.concatenate(([0], on.astype(np.int8), [0])))
    s, e = list(np.where(d == 1)[0]), list(np.where(d == -1)[0])
    if not s:
        return 0, 0
    runs = [[s[0], e[0]]]
    for a, b in zip(s[1:], e[1:]):
        if a - runs[-1][1] <= 25:
            runs[-1][1] = b
        else:
            runs.append([a, b])
    a, b = max(runs, key=lambda r: r[1] - r[0])
    return int(a), int(b)


def find(ink):
    h, w = ink.shape
    for y in range(int(h * 0.35), int(h * 0.97)):
        if ink[y].sum() < 60:
            continue
        # the scans lean a little: a line is seen across a band of rows, unbroken
        on = ink[y - 5:y + 6].any(axis=0)
        on[:60] = on[w - 60:] = False
        a, b = longest(on)
        if not (550 <= b - a <= 650 and a < 470):
            continue
        # alone in its band (the rule between an ayah's translation and its commentary runs the text's
        # whole width, broken), and nothing just above it or just below
        # (the band widened for it: that rule, leaning, climbs out of this one)
        wide = ink[y - 14:y + 9].any(axis=0)
        wide[:60] = wide[w - 60:] = False
        if wide[:max(0, a - 40)].sum() + wide[b + 40:].sum() > 12:
            continue
        near = ink[y - 34:y - 8, a:b].sum() + ink[y + 9:y + 18, a:b].sum()
        if near > (b - a) * 0.05:
            continue
        return [y, a, b]
    return None


if __name__ == "__main__":
    out = {}
    for v in range(1, 11):
        for f in sorted(os.listdir(f"pages/v{v}")):
            if re.fullmatch(r"p\d{3}\.png", f):
                out[f"{v}/{int(f[1:4])}"] = find(np.asarray(Image.open(f"pages/v{v}/{f}").convert("L")) < 128)
        print(v, sum(1 for k, x in out.items() if k.startswith(f"{v}/") and x))
    json.dump(out, open("footrules.json", "w"))
