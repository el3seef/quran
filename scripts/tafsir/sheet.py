"""A contact sheet of marks, cut from the original pages (300 dpi), each labelled with what it was taken for."""
import glob, json, sys
import pymupdf
from PIL import Image, ImageDraw
VOLS = {int(f.split("Volume-")[1].split("-")[0]): f for f in glob.glob(r"C:\Users\ARSHAQ\Downloads\Tafseer-As-Sadi-Volume-*.pdf")}
docs = {}
def crop(v, p, x0, y0, x1, y1, pad=14):
    d = docs.setdefault(v, pymupdf.open(VOLS[v]))
    k = 72 / 300
    r = pymupdf.Rect((x0 - pad * 3) * k, (y0 - pad) * k, (x1 + pad * 3) * k, (y1 + pad) * k)
    pix = d[p].get_pixmap(dpi=300, clip=r, colorspace=pymupdf.csGRAY)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)
def sheet(items, out, cols=8):
    """items: (label, v, p, x0, y0, x1, y1)"""
    W, H = 240, 110
    rows = (len(items) + cols - 1) // cols
    S = Image.new("RGB", (cols * W, rows * H), (255, 255, 255))
    d = ImageDraw.Draw(S)
    for i, (label, v, p, x0, y0, x1, y1) in enumerate(items):
        im = crop(v, p, x0, y0, x1, y1).convert("RGB")
        im.thumbnail((W - 6, H - 22))
        x, y = (i % cols) * W, (i // cols) * H
        S.paste(im, (x + 3, y + 3))
        d.text((x + 4, y + H - 17), f"{i} {label}", fill=(200, 0, 0))
    S.save(out)
