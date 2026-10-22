"""The Seerah's pictures, from their sources (seerah/images.src.json) to the site.

Each is a photograph or a museum's object, public domain or openly licensed, its maker and licence
kept beside it. A photograph is cut as its entry says and made the site's size; an object is lifted
from its plain ground (the ground's colour found along its edges, and let go wherever it reaches in
from them), so it can stand on the page.

    py scripts/build_seerah_images.py <folder of the downloaded originals>

Writes public/seerah/img/<id>.webp and src/seerah/images.json.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "seerah", "img")


def crop(im, box):
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def fit(im, long):
    k = long / max(im.size)
    return im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS) if k < 1 else im


def lift(im):
    """An object lifted from its plain ground: what is like the ground and joined to the edges goes."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    ground = np.median(edge, axis=0)
    like = np.linalg.norm(rgb - ground, axis=-1) < max(24, np.percentile(np.linalg.norm(edge - ground, axis=-1), 95) * 1.6)
    # reached from the edges (worked out small, then laid over the whole)
    k = 600 / max(like.shape)
    small = np.asarray(Image.fromarray(like.astype(np.uint8) * 255).resize((max(1, round(like.shape[1] * k)), max(1, round(like.shape[0] * k))), Image.NEAREST)) > 127
    out = np.zeros_like(small)
    out[0], out[-1], out[:, 0], out[:, -1] = small[0], small[-1], small[:, 0], small[:, -1]
    while True:
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        grown &= small
        if (grown == out).all():
            break
        out = grown
    reached = np.asarray(Image.fromarray(out.astype(np.uint8) * 255).resize(im.size, Image.BILINEAR).filter(ImageFilter.MaxFilter(5))) > 60
    alpha = Image.fromarray(np.where(reached & like, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert("RGB")
    rgba.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 30 else 0).getbbox()
    if box:
        m = round(max(im.size) * 0.02)
        rgba = rgba.crop((max(0, box[0] - m), max(0, box[1] - m), min(im.size[0], box[2] + m), min(im.size[1], box[3] + m)))
    return rgba


def main():
    raw = sys.argv[1]
    src = json.load(open(os.path.join(ROOT, "seerah", "images.src.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for k, s in src.items():
        im = Image.open(os.path.join(raw, s["from"]))
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        if s.get("crop"):
            im = crop(im, s["crop"])
        if s.get("tone"):
            # (a dark picture lifted, its blacks kept)
            im = Image.eval(im, lambda v: min(255, round(255 * (v / 255) ** (1 / s["tone"]))))
        if s["kind"] == "cut":
            im = fit(lift(fit(im, 2400)), 1400)
            im.save(os.path.join(OUT, f"{k}.webp"), "WEBP", quality=86, method=6)
        else:
            im = fit(im.convert("RGB"), 2000)
            im.save(os.path.join(OUT, f"{k}.webp"), "WEBP", quality=76, method=6)
        out[k] = {"file": f"{k}.webp", "kind": s["kind"], "title": s["title"], "credit": s["credit"], "license": s["license"], "url": s["url"]}
        for key in ("pos", "tilt"):
            if s.get(key):
                out[k][key] = s[key]
        print(k, im.size, os.path.getsize(os.path.join(OUT, f"{k}.webp")) // 1024, "KB")
    with open(os.path.join(ROOT, "src", "seerah", "images.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


main()
