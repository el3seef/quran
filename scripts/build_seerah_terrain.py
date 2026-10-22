"""The Seerah's maps, in three dimensions: for each terrain, its heights and its colours.

The heights are from the public elevation tiles of the Terrain Tiles dataset (Mapzen / AWS Open Data;
from SRTM, public domain), stitched and laid on lines of latitude and longitude. The colours of the
wide terrains are NASA's Blue Marble (public domain); the close ones, where today's cities would show,
are drawn from the heights themselves: sand in the valleys, rock on the slopes, dark on the steep. The
light is not drawn into them: the map lights them as the section's hour does (its sun, or its moon),
from a map of the ground's fine detail (its normals) too small for the grid of heights to hold.

    py scripts/build_seerah_terrain.py <blue-marble C1 jpg> <cache dir> [names]

Writes public/seerah/terrain/<name>.json (its bounds, heights and how much taller they are drawn),
<name>-h.png (its heights, 16-bit in red and green; the sea in blue), <name>.webp (its colours) and
<name>-n.webp (its fine detail).
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "seerah", "terrain")

# name: bounds (W, S, E, N), tile zoom for the heights, the grid of heights, colour, colour width,
# how many times taller the heights are drawn than they are
TERRAINS = {
    "region": ((24.0, 8.0, 62.0, 38.0), 6, 600, "bm", 3072, 55),
    "hijaz": ((37.6, 19.8, 41.6, 25.6), 9, 420, "bm", 960, 10),
    "taif": ((39.55, 21.0, 40.8, 21.86), 11, 460, "relief", 1800, 3),
    "makkah": ((39.74, 21.32, 40.04, 21.50), 12, 420, "relief", 1600, 2),
    "valley": ((39.812, 21.409, 39.846, 21.437), 14, 300, "relief", 1400, 1.6),
    "madinah": ((39.55, 24.40, 39.68, 24.53), 13, 380, "relief", 1400, 2.2),
}


def tile_x(lon, z):
    return (np.asarray(lon) + 180) / 360 * 2**z


def tile_y(lat, z):
    r = np.radians(np.asarray(lat))
    return (1 - np.log(np.tan(r) + 1 / np.cos(r)) / np.pi) / 2 * 2**z


def fetch(z, x, y, cache):
    path = os.path.join(cache, f"t{z}_{x}_{y}.png")
    if not os.path.exists(path):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        for tries in range(4):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    data = r.read()
                break
            except OSError:
                if tries == 3:
                    raise
        with open(path, "wb") as f:
            f.write(data)
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def mosaic(bounds, z, cache):
    W, S, E, N = bounds
    tx0, ty0 = int(tile_x(W, z)), int(tile_y(N, z))
    tx1, ty1 = int(tile_x(E, z)), int(tile_y(S, z))
    m = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            m[(ty - ty0) * 256 : (ty - ty0 + 1) * 256, (tx - tx0) * 256 : (tx - tx0 + 1) * 256] = fetch(z, tx, ty, cache)
    return m, tx0, ty0


# the close terrains, smoothed (metres): what the heights hold of today's buildings let go
SMOOTH = {"valley": 90, "madinah": 40, "makkah": 30}


def heights(m, tx0, ty0, bounds, z, gw, gh):
    """The heights over the bounds, on a grid gw x gh laid on latitude and longitude."""
    W, S, E, N = bounds
    px = (tile_x(np.linspace(W, E, gw), z) - tx0) * 256
    py = (tile_y(np.linspace(N, S, gh), z) - ty0) * 256
    x0 = np.clip(np.floor(px).astype(int), 0, m.shape[1] - 2)
    y0 = np.clip(np.floor(py).astype(int), 0, m.shape[0] - 2)
    fx = (px - x0)[None, :]
    fy = (py - y0)[:, None]
    Y, X = y0[:, None], x0[None, :]
    a = m[Y, X] * (1 - fx) + m[Y, X + 1] * fx
    b = m[Y + 1, X] * (1 - fx) + m[Y + 1, X + 1] * fx
    return a * (1 - fy) + b * fy


def blur(a, r):
    """A soft blur (three passes of a box, either way)."""
    r = max(1, int(round(r)))

    def box(a, axis):
        pad = [(r, r) if i == axis else (0, 0) for i in range(2)]
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
        c = np.insert(c, 0, 0, axis=axis)
        n = a.shape[axis]
        return (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, np.arange(n), axis=axis)) / (2 * r + 1)

    for _ in range(3):
        a = box(box(a, 0), 1)
    return a


def spacing(bounds, shape):
    """Metres a pixel, across and down."""
    W, S, E, N = bounds
    mid = math.radians((S + N) / 2)
    return (E - W) * 111320 * math.cos(mid) / shape[1], (N - S) * 110570 / shape[0]


def detail(hh, bounds, exag, grid_w):
    """The ground's fine detail: its heights less their blur at the grid's size, as a map of normals
    (east in red, north in green, up in blue)."""
    hp = hh - blur(hh, hh.shape[1] / grid_w * 0.7)
    dx, dy = spacing(bounds, hh.shape)
    gy, gx = np.gradient(hp * exag * 1.6, dy, dx)
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.clip((n + 1) / 2 * 255, 0, 255).astype(np.uint8)), hp


def relief(hh, hp, bounds):
    """Colours from the heights: sand low, rock higher, dark on the steep; the hollows a little darker
    and the ridges lighter. No light: the map lights them."""
    dx, dy = spacing(bounds, hh.shape)
    gy, gx = np.gradient(hh, dy, dx)
    slope = np.arctan(np.hypot(gx, gy))
    t = (hh - np.percentile(hh, 2)) / max(1, np.percentile(hh, 98) - np.percentile(hh, 2))
    t = np.clip(t, 0, 1)
    sand = np.array([234, 206, 160])
    rock = np.array([186, 124, 80])
    high = np.array([118, 92, 80])
    dark = np.array([74, 56, 48])
    steep = np.clip(slope / math.radians(30), 0, 1)
    t2 = np.clip(t * 2 - 1, 0, 1)[..., None]
    t1 = np.clip(t * 2, 0, 1)[..., None]
    base = (sand[None, None] * (1 - t1) + rock[None, None] * t1) * (1 - t2) + high[None, None] * t2
    base = base * (1 - steep[..., None] * 0.55) + dark[None, None] * steep[..., None] * 0.55
    cav = np.clip(hp / (np.std(hp) * 2.5 + 1e-6), -1, 1)
    lit = base * (1 + cav[..., None] * 0.16)
    rng = np.random.default_rng(7)
    lit *= 1 + (rng.random(lit.shape[:2])[..., None] - 0.5) * 0.05
    return Image.fromarray(np.clip(lit, 0, 255).astype(np.uint8))


def blue_marble(path, bounds, w):
    """NASA's Blue Marble (tile C1: 0–90°E, 90°N–0, 240 pixels a degree), cut to the bounds."""
    W, S, E, N = bounds
    img = Image.open(path)
    full = (E - W) * 240
    scale = 1
    while full / (scale * 2) >= w and scale < 8:
        scale *= 2
    img.draft("RGB", (21600 // scale, 21600 // scale))
    k = 240 / scale * (img.size[0] / (21600 / scale))
    box = (round(W * k), round((90 - N) * k), round(E * k), round((90 - S) * k))
    crop = img.crop(box)
    hgt = round(w * crop.size[1] / crop.size[0])
    return crop.resize((w, hgt), Image.LANCZOS)


def main():
    bm, cache = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(cache, exist_ok=True)
    only = sys.argv[3:]
    for name, (bounds, z, gw, color, tw, exag) in TERRAINS.items():
        if only and name not in only:
            continue
        W, S, E, N = bounds
        mid = math.radians((S + N) / 2)
        gh = round(gw * (N - S) / ((E - W) * math.cos(mid)))
        th = round(tw * (N - S) / ((E - W) * math.cos(mid)))
        m, tx0, ty0 = mosaic(bounds, z, cache)
        if name in SMOOTH:
            m = blur(m, SMOOTH[name] / (156543 * math.cos(mid) / 2**z))
        h = heights(m, tx0, ty0, bounds, z, gw, gh)
        hh = heights(m, tx0, ty0, bounds, z, tw, th)
        lo, hi = float(h.min()), float(h.max())
        v = np.round((h - lo) / max(1e-6, hi - lo) * 65535).astype(np.uint32)
        rgba = np.zeros((gh, gw, 4), dtype=np.uint8)
        rgba[..., 0] = v >> 8
        rgba[..., 1] = v & 255
        rgba[..., 3] = 255
        nmap, hp = detail(hh, bounds, exag, gw)
        tex = blue_marble(bm, bounds, tw) if color == "bm" else relief(hh, hp, bounds)
        if color == "bm":
            # the sea, in blue: where the picture is blue and the ground low (land below the sea's
            # level, as Egypt's Qattara, stays land)
            c = np.asarray(tex.resize((gw, gh), Image.BILINEAR), dtype=np.int32)
            sea = (c[..., 2] > c[..., 0] + 6) & (c[..., 2] >= c[..., 1]) & (h < 20)
            rgba[..., 2] = np.where(sea, 255, 0)
        Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, f"{name}-h.png"), optimize=True)
        tex.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=82, method=6)
        nw = min(2048, tw)
        nmap.resize((nw, round(nw * th / tw)), Image.LANCZOS).save(os.path.join(OUT, f"{name}-n.webp"), "WEBP", quality=88, method=6)
        meta = {"bounds": [W, S, E, N], "grid": [gw, gh], "min": round(lo, 1), "max": round(hi, 1), "exag": exag, "color": color}
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(meta, f)
        print(name, meta, tex.size)


main()
