# Tafsir as-Sa'di (English) — how public/data/tafsir/ was made

Needs Python with pymupdf, numpy, scipy, Pillow and pyspellchecker, and Windows 10+ for its OCR.

From the reader's own copy of the IIPH translation (10 volumes, scanned PDFs). Run from a working
folder; each stage reads what the one before wrote.

1. `py dump.py` — each PDF's own (old) OCR: its lines, boxes, sizes → `lines/v<N>.json`
2. `py stage1.py` — each page at 300 dpi; the book's ornate brackets and honorific marks found by
   their shapes (`marks.py`, templates in `tpl/`), recorded, then erased → `pages/v<N>/p###.png`
3. `sh ocr_all.sh` — Windows' own OCR over the cleaned pages (`ocr.ps1`) → `pages/v<N>/p###.json`
4. `py footrule.py` — the footnotes' rule on each page → `footrules.json`
5. `py assemble.py out <surahs.json>` — the two readings put together word by word, the marks put
   back, lines into paragraphs, paragraphs into passages by the ayah translations heading them
   → `out/raw_passages.json`, with logs (`out/log_*.txt`)
6. `py clean.py out <surahs.json> <public/data/tafsir>` — quotations' brackets, honorific leftovers,
   references, letters, spacing → `<surah>.json`, with logs (`out/clean_*.txt`)

`sheet.py` makes contact sheets of the marks found, to check them by eye.

Known gap: volume 6 of the source copy lacks printed pages 158–159, so Taha 20:98–101 have no
commentary; the window says so.
