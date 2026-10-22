"""Stage 1: each page of the tafsir (after its front matter, before its glossary and index), at 300 dpi:
its marks found and recorded, then erased, the page kept black and white for the OCR."""
import glob, json, os, re, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from marks import find

VOLS = {int(f.split("Volume-")[1].split("-")[0]): f for f in glob.glob(r"C:\Users\ARSHAQ\Downloads\Tafseer-As-Sadi-Volume-*.pdf")}

def bounds(v):
    P = json.load(open(f"lines/v{v}.json", encoding="utf-8"))
    end = len(P)
    for i, p in enumerate(P[40:], 40):
        if any(re.match(r"^(Glossary|Index)\s*[|I]\s*\d", l[5].strip()) or (l[5].strip().startswith("Glossary of Islamic") and "...." not in l[5]) for l in p["lines"]):
            end = i
            break
    return 10, end

def page(args):
    v, i = args
    out = f"pages/v{v}/p{i:03d}"
    old = json.load(open(out + ".marks.json")) if os.path.exists(out + ".marks.json") else None
    if old is not None and os.path.exists(out + ".v2"):
        return
    d = pymupdf.open(VOLS[v])
    g = np.asarray(Image.frombytes("L", *(lambda p: ((p.width, p.height), p.samples))(d[i].get_pixmap(dpi=300, colorspace=pymupdf.csGRAY))))
    m = find(g)
    clean = g < 150
    for k, s, x0, y0, x1, y1, erase, top in m:
        for ex, ey, mask in erase:
            # (the mark's own pixels, grown by one, cleared)
            grown = ndimage.binary_dilation(mask, iterations=1)
            hh, ww = grown.shape
            clean[ey:ey + hh, ex:ex + ww] &= ~grown
    new = [[k, s, x0, y0, x1, y1, [[a[0] for a in top][:3], [round(a[1], 3) for a in top][:3]] if top else None] for k, s, x0, y0, x1, y1, erase, top in m]
    Image.fromarray(~clean).convert("1").save(out + ".png", optimize=True)
    json.dump(new, open(out + ".marks.json", "w"))
    # (marks found that were not before, or lost: the page is read again)
    if old is not None and [x[:2] + x[2:4] for x in old] != [x[:2] + x[2:4] for x in new] and os.path.exists(out + ".json"):
        os.remove(out + ".json")
    open(out + ".v2", "w").close()

if __name__ == "__main__":
    jobs = []
    for v in sorted(VOLS):
        os.makedirs(f"pages/v{v}", exist_ok=True)
        a, b = bounds(v)
        print("volume", v, "pages", a, "to", b, flush=True)
        jobs += [(v, i) for i in range(a, b)]
    with ProcessPoolExecutor(max_workers=6) as ex:
        for n, _ in enumerate(ex.map(page, jobs, chunksize=4)):
            if n % 200 == 0:
                print(n, "/", len(jobs), flush=True)
    print("done", len(jobs))
