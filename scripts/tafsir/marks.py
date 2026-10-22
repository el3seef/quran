"""Finding the book's marks on a page image (300 dpi): its ornate brackets around the Qur'an quoted, and
its eight honorific marks (each between parentheses), by their shapes."""
import numpy as np
from PIL import Image
from scipy import ndimage

def load(n):
    return np.asarray(Image.open(f"tpl/{n}.png")) < 128

BRK = {"open": load("open"), "close": load("close")}
# each honorific, as the key prints it, and as some volumes print it (lighter, or another hand)
HON = {
    "swt": [load("swt"), load("swt_b")],
    "saw": [load("saw"), load("saw_b"), load("saw_c")],
    "as": [load("as"), load("as_b"), load("as_c")],
    "ra": [load("ra")],
    "raha": [load("raha")],
    "ruma": [load("ruma")],
    "rum": [load("rum")],
    "runna": [load("runna")],
}

def ncc(a, b):
    a = a.astype(np.float32) - a.mean(); b = b.astype(np.float32) - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d else 0.0

def fit(g, shape):
    return np.asarray(Image.fromarray(g.astype(np.uint8) * 255).resize((shape[1], shape[0]), Image.BILINEAR)) > 127

def runs(cols):
    out, i = [], 0
    while i < len(cols):
        if cols[i]:
            j = i
            while j < len(cols) and cols[j]:
                j += 1
            out.append((i, j))
            i = j
        else:
            i += 1
    return out

def find(gray):
    """The marks on a page: [(kind, score, x0, y0, x1, y1, erase, top3)]; `erase` is a list of
    (x0, y0, mask) to clear from the page: the mark's own pixels."""
    ink = gray < 150
    out = []
    # ── the brackets: a blob about a line and a half tall; narrow, or wider where it touches a letter
    lab, n = ndimage.label(ndimage.binary_dilation(ink, iterations=1), structure=np.ones((3, 3)))
    for i, o in enumerate(ndimage.find_objects(lab)):
        h, w = o[0].stop - o[0].start, o[1].stop - o[1].start
        if not 33 <= h <= 54:
            continue
        blob = ink[o] & (lab[o] == i + 1)
        if 13 <= w <= 31:
            s = {k: ncc(fit(blob, BRK[k].shape), BRK[k]) for k in BRK}
            k = max(s, key=s.get)
            if s[k] > 0.55:
                out.append((k, round(s[k], 3), o[1].start, o[0].start, o[1].stop, o[0].stop, [(o[1].start, o[0].start, blob)], None))
        elif 31 < w <= 140:
            # (a bracket touching a word: at the blob's left end an opening one, at its right end a closing)
            tw = BRK["open"].shape[1]
            for k, side in (("open", 0), ("close", 1)):
                best = (0.0, 0)
                for sh in range(0, 5):
                    x = sh if side == 0 else w - tw - sh
                    if x < 0 or x + tw > w:
                        continue
                    sl = blob[:, x:x + tw]
                    best = max(best, (ncc(fit(sl, BRK[k].shape), BRK[k]), x))
                if best[0] > 0.66:
                    x = best[1]
                    # its own pixels: the slice, and no further in than the gap before the letter
                    m = blob[:, x:x + tw].copy()
                    out.append((k, round(best[0], 3), o[1].start + x, o[0].start, o[1].start + x + tw, o[0].stop, [(o[1].start + x, o[0].start, m)], None))
    # ── the honorifics: a calligraphic knot between two parentheses. Read at a lighter threshold (some
    # are printed faint); the parentheses (tall, thin) set aside, so the knot's strokes, joined by a wider
    # growth, are joined to nothing else
    soft = gray < 200
    lab1, n1 = ndimage.label(soft, structure=np.ones((3, 3)))
    objs1 = ndimage.find_objects(lab1)
    parens = []
    rest = soft.copy()
    for i, o in enumerate(objs1):
        if 30 <= o[0].stop - o[0].start <= 58 and o[1].stop - o[1].start <= 17:
            parens.append((o[1].start, o[0].start, o[1].stop, o[0].stop, i + 1))
            rest[o] &= lab1[o] != i + 1
    lab2, n2 = ndimage.label(ndimage.binary_dilation(rest, iterations=3), structure=np.ones((3, 3)))
    for i, o in enumerate(ndimage.find_objects(lab2)):
        h, w = o[0].stop - o[0].start, o[1].stop - o[1].start
        if not (30 <= h <= 68 and 34 <= w <= 100):
            continue
        x0, y0, x1, y1 = o[1].start + 3, o[0].start + 3, o[1].stop - 3, o[0].stop - 3
        cy = (y0 + y1) / 2
        L = [p for p in parens if 0 <= x0 - p[2] <= 18 and p[1] <= cy <= p[3]]
        R = [p for p in parens if 0 <= p[0] - x1 <= 18 and p[1] <= cy <= p[3]]
        if not L and not R:
            continue
        g = rest[y0:y1, x0:x1] & (lab2[y0:y1, x0:x1] == i + 1)
        s = {k: max(ncc(fit(g, t.shape), t) for t in ts) for k, ts in HON.items()}
        k = max(s, key=s.get)
        # (both parentheses found: a fair likeness is enough; one alone: a close one)
        if s[k] > (0.35 if L and R else 0.55):
            erase = [(x0, y0, g)]
            for p in ([max(L, key=lambda p: p[2])] if L else []) + ([min(R, key=lambda p: p[0])] if R else []):
                erase.append((p[0], p[1], lab1[p[1]:p[3], p[0]:p[2]] == p[4]))
            out.append((k, round(s[k], 3), x0, y0, x1, y1, erase, sorted(s.items(), key=lambda kv: -kv[1])[:3]))
    return out
