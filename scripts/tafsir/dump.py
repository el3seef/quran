"""Each page of each volume: its lines (box, size, text) and images, to lines/v<N>.json."""
import json, os, sys, glob, pymupdf
os.makedirs("lines", exist_ok=True)
for f in glob.glob(r"C:\Users\ARSHAQ\Downloads\Tafseer-As-Sadi-Volume-*.pdf"):
    v = int(f.split("Volume-")[1].split("-")[0])
    out = os.path.join("lines", f"v{v}.json")
    if os.path.exists(out):
        continue
    d = pymupdf.open(f)
    pages = []
    for i in range(d.page_count):
        pg = d[i]
        lines = []
        for b in pg.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = "".join(s["text"] for s in l["spans"])
                if not t.strip():
                    continue
                sz = max(s["size"] for s in l["spans"])
                lines.append([round(l["bbox"][0], 1), round(l["bbox"][1], 1), round(l["bbox"][2], 1), round(l["bbox"][3], 1), round(sz, 1), t, l["spans"][0]["font"]])
        pages.append({"w": pg.rect.width, "h": pg.rect.height, "lines": lines})
    json.dump(pages, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print("volume", v, len(pages), "pages", flush=True)
