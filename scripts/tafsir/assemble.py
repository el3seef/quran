"""Stage 3: Tafsir as-Sa'di assembled, passage by passage, from the two readings of each page.

Each page has two readings of its English: the PDF's own (its old OCR: lines/v*.json, in points) and
Windows' OCR of the page with its marks erased (pages/v*/p*.json, in pixels at 300 dpi), and the marks
found on it (pages/v*/p*.marks.json). The old reading gives the page's lines (where the English is, its
running head, its footnotes, its sizes); the new reading gives the words; where they disagree on a
word, the one that is a word (English, or one the book uses) is taken. The marks are put back where
they stood. Passages are found by the ayahs translated at their head, each surah's ayahs in order.

    py assemble.py <out dir> <surahs.json>
"""
import collections
import difflib
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pylib"))
from spellchecker import SpellChecker  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
K = 300 / 72  # pixels to a point
OUT, SURAHS = sys.argv[1], sys.argv[2]
COUNTS = [s["count"] for s in json.load(open(SURAHS, encoding="utf-8"))["surahs"]]
NAMES = [s["tr"] for s in json.load(open(SURAHS, encoding="utf-8"))["surahs"]]

MARK = {"open": "", "close": "", "swt": "", "saw": "", "as": "", "ra": "", "raha": "", "ruma": "", "rum": "", "runna": ""}
HONS = set("")
LOG = collections.defaultdict(list)
RULES = json.load(open("footrules.json"))  # (the footnotes' rule on each page: footrule.py)


def log(kind, *a):
    LOG[kind].append(" | ".join(str(x) for x in a))


# ── words: their letters plain (the book's long vowels and dotted letters, as read, are uneven) ──
def plain(t):
    t = t.replace("•", "'").replace("·", "'").replace("‘", "'").replace("`", "'").replace("ʿ", "'").replace("ʾ", "'")
    t = unicodedata.normalize("NFKD", t)
    return "".join(c for c in t if not unicodedata.combining(c)).replace("ı", "i")


def core(t):
    """A word as compared: its letters, lower case, without what clings to it."""
    return re.sub(r"[^a-z0-9']", "", plain(t).lower()).strip("'")


EN = SpellChecker()
EN_FREQ = EN.word_frequency


# ── the pages, in the book's order: by the numbers printed on them (a few of the scanned pages are
# bound out of their places), a number trusted only where a neighbour's runs on from it ──
def printed(lines):
    for l in sorted(lines, key=lambda l: l[1]):
        if l[1] >= 95:
            break
        t = l[5].strip().replace("I", "|")
        m = re.search(r"\|\s*(\d{1,3})\s*$", t) or re.match(r"^(\d{1,3})\s*\|", t)
        if m:
            return int(m.group(1))
    return None


def book_order(old, idx):
    raw = {i: printed(old[i]["lines"]) for i in idx}
    sure = {}
    for k, i in enumerate(idx):
        n = raw[i]
        if n is None:
            continue
        near = [raw.get(idx[k - 1]) if k else None, raw.get(idx[k + 1]) if k + 1 < len(idx) else None]
        if near[0] == n - 1 or near[1] == n + 1:
            sure[i] = n
    key, last = {}, 0
    for i in idx:
        last = sure[i] if i in sure else last + 1
        key[i] = last if i in sure else last - 0.5
    order = sorted(idx, key=lambda i: (key[i], i))
    moved = [(i, key[i]) for a, i in enumerate(order) if a and order[a - 1] > i]
    if moved:
        log("page-order", "moved", moved)
    return order


def pages():
    for v in range(1, 11):
        old = json.load(open(f"lines/v{v}.json", encoding="utf-8"))
        files = sorted(f for f in os.listdir(f"pages/v{v}") if re.fullmatch(r"p\d{3}\.json", f))
        files = [f"p{i:03d}.json" for i in book_order(old, [int(f[1:4]) for f in files])]
        sizes = collections.Counter()
        for p in old[30:-30]:
            for l in p["lines"]:
                sizes[l[4]] += len(l[5])
        body = sizes.most_common(1)[0][0]
        for f in files:
            i = int(f[1:4])
            # (not the book's own pages: its title and copyright page, its contents)
            text = " ".join(l[5] for l in old[i]["lines"])
            toc = sum(1 for l in old[i]["lines"] if re.search(r"Soo?rat .*\d+\s*\.*\s*\d{2,3}\s*$", l[5]))
            if re.search(r"Title:\s*Tafs|ISBN|Layout Design|Translator:", text) or toc >= 5:
                log("page-skipped", f"v{v}p{i}", text[:60])
                continue
            win = json.load(open(f"pages/v{v}/{f}", encoding="utf-8-sig"))
            marks = json.load(open(f"pages/v{v}/p{i:03d}.marks.json"))
            yield v, i, body, old[i]["lines"], win, marks


def page_lines(v, i, body, old, win, marks):
    """The page's lines of English, top to bottom: each its kind, its box (points), its tokens."""
    ls = sorted(old, key=lambda l: (l[1], l[0]))
    # the running head: the page's top row, where it is one (the page's number, the book's name, the
    # surah's) — not a fixed height: some pages are scanned higher than others
    head_y = 0
    if ls and ls[0][1] < 100:
        row = [l for l in ls if l[1] < min(ls[0][1] + 14, 92)]
        if re.search(r"\d{1,3}\s*$|^\s*\d{1,3}\s*[|I■]|Tafs|Juz|Soo?ra", " ".join(l[5] for l in row)):
            head_y = max(l[3] for l in row)
    kinds = []
    for l in ls:
        x0, y0, x1, y1, size, text, font = l
        t = text.strip()
        if y0 < head_y - 2 or y0 > 598 or t == "sunniconnect.com":
            kinds.append("head")
        elif size >= body * 1.42:
            kinds.append("big")
        else:
            kinds.append("body")
    # the footnotes: at the foot, below the last line of the text's own size, a number first
    last = max([n for n, (l, k) in enumerate(zip(ls, kinds)) if k == "body" and l[4] >= body - 0.3] or [-1])
    if last >= 0:
        tail = [n for n in range(last + 1, len(ls)) if kinds[n] == "body"]
        if tail and re.match(r"^\s*[\d*†]{1,3}\s", ls[tail[0]][5]):
            for n in tail:
                kinds[n] = "foot"
    # the new reading's words, in rows by where they stand (its own lines are sometimes split, or out
    # of order, where a mark was erased); each row a line of the page
    words = sorted(([w[0], w[1] / K, w[2] / K, (w[1] + w[3]) / K, (w[2] + w[4]) / K] for l in win["lines"] for w in l["w"] if w[0].strip()), key=lambda w: (w[2] + w[4]) / 2)
    # the footnotes: below their rule. Their numbers in the text are raised and small: not read
    rule = RULES.get(f"{v}/{i}")
    foot_y = rule[0] / K if rule else None
    hs = sorted(w[4] - w[2] for w in words)
    mh = hs[len(hs) // 2] if hs else 0
    words = [w for w in words if not (re.fullmatch(r"[\d*]{1,3}", w[0]) and w[4] - w[2] < 0.75 * mh and (foot_y is None or w[2] < foot_y - 2))]
    rows = []
    for w in words:
        cy, h = (w[2] + w[4]) / 2, w[4] - w[2]
        if rows and abs(cy - rows[-1]["cy"]) < max(3.0, 0.45 * min(h, rows[-1]["h"])):
            r = rows[-1]
            r["w"].append(w)
            r["cy"] = sum((x[2] + x[4]) / 2 for x in r["w"]) / len(r["w"])
        else:
            rows.append({"w": [w], "cy": cy, "h": h})
    # (a stop or a comma read alone, a little below its line: put back on it)
    bare = lambda r: all(re.fullmatch(r"\W+", w[0]) for w in r["w"])
    for r in [r for r in rows if bare(r)]:
        near = [q for q in rows if q is not r and not bare(q)]
        q = min(near, key=lambda q: abs(q["cy"] - r["cy"])) if near else None
        if q and abs(q["cy"] - r["cy"]) < mh:
            q["w"].extend(r["w"])
            rows.remove(r)
    # the marks, each to its row (a row of nothing but marks, as a line of brackets alone, its own)
    for k, s, x0, y0, x1, y1, top in marks:
        cy = (y0 + y1) / 2 / K
        best = min(rows, key=lambda r: abs(r["cy"] - cy)) if rows else None
        if best is None or abs(best["cy"] - cy) > 9:
            log("mark-off-lines", f"v{v}p{i}", k, x0, y0)
            continue
        best["w"].append([MARK[k], x0 / K, y0 / K, x1 / K, y1 / K, "mark"])
    out = []
    for r in rows:
        toks = sorted(r["w"], key=lambda w: (w[1] + w[3]) / 2)
        box = [min(w[1] for w in toks), min(w[2] for w in toks), max(w[3] for w in toks), max(w[4] for w in toks)]
        # the old reading's line here: what kind of line it is, its size, its words
        cands = [n for n, l in enumerate(ls) if min(l[3], box[3]) - max(l[1], box[1]) > 0.4 * (box[3] - box[1]) and min(l[2], box[2]) - max(l[0], box[0]) > 0]
        if cands:
            n = max(cands, key=lambda n: min(ls[n][3], box[3]) - max(ls[n][1], box[1]))
            kind, size, oldt, font = kinds[n], ls[n][4], " ".join(ls[m][5] for m in sorted(cands, key=lambda m: ls[m][0])), ls[n][6]
            ox0 = min(ls[m][0] for m in cands)
        else:
            # (none: a line the old reading missed, or not English at all: an ayah's Arabic, an ornament)
            text = " ".join(w[0] for w in toks if len(w) == 5)
            if box[1] < head_y - 2 or box[1] > 598:
                kind = "head"
            else:
                ws = [core(x) for x in text.split() if core(x)]
                known = sum(1 for x in ws if EN_FREQ[x] > 0 or len(x) == 1) / max(1, len(ws))
                kind = "body" if ws and known >= 0.6 else "noise"
                if kind == "noise" and text.strip():
                    log("dropped-line", f"v{v}p{i}", text[:80])
            size, oldt, font, ox0 = body, "", "", box[0]
        if kind in ("head", "noise"):
            continue
        if foot_y is not None and box[1] > foot_y - 2:
            kind = "foot"
        out.append({"kind": kind, "box": box, "size": size, "old": oldt, "toks": split_marks(toks), "font": font, "x0": min(box[0], ox0)})
    # (a footnote's number run onto the word it notes: "inspiration.49")
    nums = set()
    for l in out:
        if l["kind"] == "foot":
            m = re.match(r"^\s*(\d{1,3})\b", " ".join(t[0] for t in l["toks"]))
            if m:
                nums.add(m.group(1))
    if foot_y is not None and out and not any(l["kind"] == "foot" for l in out):
        log("foot-rule-empty", f"v{v}p{i}")
    for l in out:
        if l["kind"] == "foot":
            continue
        for t in l["toks"]:
            m = re.match(r"^(.*[A-Za-z'’”\".,;:!?)\]])(\d{1,3})$", t[0])
            if m and len(t) == 5 and m.group(2) in nums:
                log("foot-number", f"v{v}p{i}", t[0])
                t[0] = m.group(1)
    if foot_y is None and out:
        last = out[-1]
        if last["kind"] == "body" and re.match(r"^\s*\d{1,3}\s+[A-Z]", " ".join(t[0] for t in last["toks"])):
            log("foot-maybe", f"v{v}p{i}", " ".join(t[0] for t in last["toks"])[:80])
    return out


def split_marks(toks):
    """A mark standing inside a word's box (the reading ran the word across the erased mark): the word
    split there, at the nearest edge of its letters."""
    out = []
    marks = [t for t in toks if len(t) > 5]
    words = [t for t in toks if len(t) <= 5]
    for w in words:
        inside = [m for m in marks if w[1] + 1 < (m[1] + m[3]) / 2 < w[3] - 1]
        if not inside:
            out.append(w)
            continue
        text, x0, x1 = w[0], w[1], w[3]
        cuts = []
        for m in inside:
            f = ((m[1] + m[3]) / 2 - x0) / max(1e-6, x1 - x0)
            j = round(f * len(text))
            # (to the nearest change between letter and not)
            best = min(range(len(text) + 1), key=lambda q: (0 if q in (0, len(text)) or text[q - 1].isalnum() != text[q].isalnum() else 1, abs(q - j)))
            cuts.append(best)
        prev = 0
        for q in sorted(set(cuts)):
            if q > prev:
                out.append([text[prev:q], x0 + (x1 - x0) * prev / len(text), w[2], x0 + (x1 - x0) * q / len(text), w[4]])
            prev = q
        if prev < len(text):
            out.append([text[prev:], x0 + (x1 - x0) * prev / len(text), w[2], x1, w[4]])
    return sorted(out + marks, key=lambda w: (w[1] + w[3]) / 2)


# ── first pass: every line of every page ──
ALL = []
for v, i, body, old, win, marks in pages():
    for l in page_lines(v, i, body, old, win, marks):
        l["v"], l["p"], l["body"] = v, i, body
        ALL.append(l)
print("lines", len(ALL))

# ── the book's own words: where the two readings agree ──
agree = collections.Counter()
for l in ALL:
    if l["kind"] != "body":
        continue
    a = [core(t[0]) for t in l["toks"] if len(t) == 5]
    b = [core(x) for x in l["old"].split()]
    for x in set(a) & set(b):
        if x:
            agree[x] += 1


def good(w):
    """How much a reading of a word is to be trusted: English, or a word the book uses."""
    c = core(w)
    if not c:
        return 1
    return EN_FREQ[c] + agree[c] * 50


def mend(l):
    """A line's words, each where the two readings disagree taken from the one that reads as a word."""
    new = [t for t in l["toks"]]
    wtoks = [t for t in new if len(t) == 5]
    # the old reading: its split words (o f) joined where joined they are a word
    ot = l["old"].split()
    o2, j = [], 0
    while j < len(ot):
        if j + 1 < len(ot) and good(ot[j] + ot[j + 1]) > max(good(ot[j]), good(ot[j + 1])) * 3 and good(ot[j] + ot[j + 1]) > 50:
            o2.append(ot[j] + ot[j + 1])
            j += 2
        else:
            o2.append(ot[j])
            j += 1
    a = [core(t[0]) for t in wtoks]
    b = [core(x) for x in o2]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != "replace":
            continue
        ws = wtoks[i1:i2]
        os_ = o2[j1:j2]
        # (words alone are put to the vote: a number, a reference, is the new reading's as it is)
        if any(re.search(r"\d", x) for x in [w[0] for w in ws] + os_):
            continue
        if i2 - i1 == j2 - j1:
            for w, o in zip(ws, os_):
                if good(o) > good(w[0]) * 4 and good(o) > 40 and core(o) != core(w[0]):
                    log("mended", f"v{l['v']}p{l['p']}", w[0], "->", o)
                    w[0] = keep_edges(w[0], o)
                elif good(w[0]) < 5 and good(o) < 5:
                    log("unsure", f"v{l['v']}p{l['p']}", w[0], o, l["old"][:60])
        else:
            gw = sum(good(w[0]) > 40 for w in ws) / max(1, len(ws))
            go = sum(good(o) > 40 for o in os_) / max(1, len(os_))
            if go == 1 and gw < 1 and len(os_) <= 4:
                log("mended", f"v{l['v']}p{l['p']}", " ".join(w[0] for w in ws), "->", " ".join(os_))
                # (the old reading's words, laid over the new ones' span)
                x0, x1 = ws[0][1], ws[-1][3]
                ws[0][0] = " ".join(os_)
                for w in ws[1:]:
                    w[0] = ""
    l["toks"] = [t for t in new if t[0] != ""]


def keep_edges(new, old):
    """The old reading's letters, with the new reading's punctuation about them."""
    m = re.match(r"^(\W*)(.*?)(\W*)$", new)
    mo = re.match(r"^(\W*)(.*?)(\W*)$", old)
    return (m.group(1) or mo.group(1)) + mo.group(2) + (m.group(3) or mo.group(3))


for l in ALL:
    if l["kind"] == "body":
        mend(l)

# ── second pass: lines into paragraphs, paragraphs into passages ──
TR = re.compile(r"^\s*(\d{1,3})\s*[:;.,]\s*([0-9Il|]{1,3})\s*[.,]\s*(\.\.\.|…)?")
TRS = re.compile(r"^\s*(\d{1,3})\s+([0-9Il|]{1,3})\s*[.,]\s*(\.\.\.|…)?")  # ("88 11." the colon lost)
FAT = re.compile(r"^\s*()([1-7])\.\s+()(?=[A-Z])")  # (al-Fatihah's ayahs, numbered alone)


def text_of(l):
    toks = [t[0] for t in l["toks"] if t[0]]
    s = ""
    for t in toks:
        if not s:
            s = t
        elif t == MARK["close"] or s.endswith(MARK["open"]):
            s += t
        else:
            s += " " + t
    return s


margin = {}
right = {}
for l in ALL:
    k = (l["v"], l["p"])
    if l["kind"] == "body" and l["size"] >= l["body"] - 0.3:
        margin.setdefault(k, []).append(l["box"][0])
        right.setdefault(k, []).append(l["box"][2])
margin = {k: sorted(v)[len(v) // 8] for k, v in margin.items()}
right = {k: sorted(v)[int(len(v) * 0.85)] for k, v in right.items()}

units = []  # ["cand", text, line, (s, a) or None, split] | ["para", text, line] | ["head", text, line]
prev_short = True
cur = None
LOOSE = re.compile(r"^\s*([\dIlO|][\dIlO|\s]{0,4}?)\s*(?:[:;.,]\s*[•·]?|\s[•·]?)\s*([\dIlO|][\dIlO|\s]{0,4}?)\s*[.,]\s*(\.\.\.|…)?(?=\s*(?:[A-Za-z\[(‘'\"…—–-]|1\s[a-z])|\s*$)")
FAT = re.compile(r"^\s*([1-7])\.\s+(?=[A-Z])")


def number(src):
    """An ayah's number as read ("I I : 79" is 11:79), or None."""
    m = LOOSE.match(src)
    if not m:
        return None
    d = lambda x: re.sub(r"\s", "", x.replace("I", "1").replace("l", "1").replace("|", "1").replace("O", "0"))
    try:
        s_, a_ = int(d(m.group(1))), int(d(m.group(2)))
    except ValueError:
        return None
    return (s_, a_, bool(m.group(3)))


def junk(l):
    """A line not of English: an Arabic quotation, or an ornament, as read (its marks aside)."""
    if any(len(t) > 5 for t in l["toks"]):
        return False
    words = [core(x) for t in l["toks"] for x in t[0].split() if core(x)]
    alpha = [w for w in words if re.search("[a-z]{2,}", w)]
    if any("allah" in w for w in alpha):
        return False
    fine = sum(1 for w in alpha if good(w) > 40)
    if re.search(r"[A-Za-z_'-]{3,}\s*\d{1,3}\s*[:;.']\s*\d", plain(text_of(l))):
        return False
    return fine == 0 or (len(alpha) >= 3 and fine / len(alpha) < 0.3)


for l in ALL:
    k = (l["v"], l["p"])
    if l["kind"] == "foot":
        continue
    t = text_of(l).strip()
    if not t:
        continue
    # (nothing runs on from one volume into the next)
    if cur is not None and cur[2]["v"] != l["v"]:
        cur = None
        prev_short = True
    # (a line the old reading gives a heading's size, but as long as the text's own lines are, and as
    # tall: the text's own, its size misread)
    if l["kind"] == "big" and len(t) > 40 and l["box"][3] - l["box"][1] < 14:
        log("big-as-body", f"v{l['v']}p{l['p']}", t[:70])
        l["kind"] = "body"
    if l["kind"] == "big":
        log("big", f"v{l['v']}p{l['p']}", round(l["box"][3] - l["box"][1], 1), len(t), t[:50])
        if re.search(r"So+ra[ht]", plain(l["old"]), re.I) or re.search(r"So+ra[ht]", plain(t), re.I):
            units.append(["head", t, l])
        cur = None
        continue
    ind = l["x0"] - margin.get(k, l["x0"])
    if os.environ.get("DBG") == f"v{l['v']}p{l['p']}":
        log("dbg", l["kind"], round(l["x0"], 1), "margin", round(margin.get(k, 0), 1), "ind", round(ind, 1), "cur", cur[0] if cur else None, cur[4] if cur and cur[0] == "cand" else "", t[:60])
    got = None
    if ind < 26 and not t.startswith(MARK["open"]):
        for src in (plain(t), plain(l["old"])):
            # (the old reading's line, run over two of the page's rows, numbers the second row as well)
            if src is not None and cur and cur[0] == "cand" and src == plain(l["old"]) and l["old"] == cur[2]["old"] and (cur[2]["v"], cur[2]["p"]) == k:
                break
            n = number(src)
            if n and 1 <= n[0] <= 114 and 1 <= n[1] <= 286:
                got = n
                break
            # (an ayah numbered alone, as al-Fatihah's and al-Masad's are: its surah from those before it)
            m = re.match(r"^\s*(\d{1,2})\.\s+(?=[A-Z\[])", src)
            if m:
                got = ("bare", int(m.group(1)), False)
                break
        if not got and re.match(r"^\s*\S{1,6}\s*[:;]\s*\S{1,4}[.,]\s+[A-Z\[(]", plain(t)):
            got = ("?",)  # (an ayah's translation, its number not to be read)
    if not got and l["kind"] == "body" and junk(l):
        log("junk", f"v{l['v']}p{l['p']}", t[:90])
        continue
    if got:
        # (where its words begin, after the number: its lines run on from there)
        words = [w for w in l["toks"] if len(w) == 5]
        m = LOOSE.match(plain(t))
        if m:
            # (the number as read, "5: I IO.", its tokens passed over)
            need, got_ = len(re.sub(r"\s", "", m.group(0))), 0
            while words and got_ < need:
                got_ += len(re.sub(r"\s", "", plain(words.pop(0)[0])))
        while words and re.fullmatch(r"[\dIlO|:;.,•·]*[\d:;.,•·][\dIlO|:;.,•·]*", words[0][0]):
            words.pop(0)
        units.append(["cand", t, l, got, words[0][1] if words and words[0] is not l["toks"][0] else None])
        cur = units[-1]
        prev_short = True
        continue
    # an ayah's translation going on: under its words (a page of translations alone has its margin
    # misjudged), or indented past a paragraph's first line, or the same line as read before
    here = (cur[2]["v"], cur[2]["p"]) == k if cur else False
    if cur and cur[0] == "cand" and (ind > 26 or (here and cur[4] is not None and abs(l["x0"] - cur[4]) < 4) or (here and cur[2]["old"] and l["old"] == cur[2]["old"])):
        cur[1] += " " + t
        continue
    # (a line going on in lower case goes on with its sentence: after a page's turn, a list's hanging
    # indent, a line the reading ended short)
    new_para = cur is None or cur[0] != "para" or ((ind > 6 or prev_short) and not re.match(r"^[a-z]", t))
    if new_para:
        units.append(["para", t, l])
        cur = units[-1]
    else:
        prev = cur[1]
        if prev.endswith("-") and t[:1].islower():
            joined = prev[:-1].split()[-1] + t.split()[0]
            cur[1] = prev[:-1] + t if good(joined) > 40 else prev + t
        else:
            cur[1] = prev + " " + t
    prev_short = l["box"][2] < right.get(k, 999) - 18

print("units", len(units), collections.Counter(u[0] for u in units))

# ── which candidates are the ayahs' translations: the most of them in the Qur'an's own order ──
OFF = [0]
for c in COUNTS:
    OFF.append(OFF[-1] + c)
G = lambda s_, a_: OFF[s_ - 1] + a_ - 1  # an ayah's place in the whole Qur'an
cands = [n for n, u in enumerate(units) if u[0] == "cand"]
read = []
here = (1, 0)  # (the last ayah read with its surah)
for n in cands:
    g = units[n][3]
    if g[0] == "bare":
        # a bare number: the next ayah of the surah being read, or the first of the next
        s_, a_ = here
        if a_ < g[1] <= COUNTS[s_ - 1] and g[1] <= a_ + 6:
            g = units[n][3] = (s_, g[1], False)
        elif a_ >= COUNTS[s_ - 1] - 1 and g[1] <= 2 and s_ < 114:
            g = units[n][3] = (s_ + 1, g[1], False)
        else:
            continue
    if g[0] != "?" and g[1] <= COUNTS[g[0] - 1]:
        read.append((n, G(g[0], g[1]), g[2]))
        here = (g[0], g[1])
# the longest run in order (a split ayah may repeat the one before it): patience, with its back-links
import bisect
tails, tail_at, back = [], [], {}
for idx, (n, g, split) in enumerate(read):
    key = g * 2 + (0 if split else 1)  # (a split repeat sorts just before its ayah: it may follow it)
    # places never going back; an ayah may come twice (the book splits a long one, its commentary
    # between the two halves)
    j = bisect.bisect_right(tails, key) if not split else bisect.bisect_right(tails, g * 2 + 1)
    if j == len(tails):
        tails.append(key); tail_at.append(idx)
    else:
        tails[j] = key; tail_at[j] = idx
    back[idx] = tail_at[j - 1] if j > 0 else None
chain = []
k = tail_at[-1] if tail_at else None
while k is not None:
    chain.append(k)
    k = back[k]
chain.reverse()
keep = {read[k][0]: read[k][1] for k in chain}
print("candidates", len(cands), "read", len(read), "in order", len(keep))
# the gaps: between two kept, as many unread (or misread) candidates as ayahs missing: those, in order
accepted = dict(keep)
kept_list = sorted(keep.items())
for (n1, g1), (n2, g2) in zip(kept_list, kept_list[1:]):
    missing = g2 - g1 - 1
    if missing <= 0:
        continue
    between = [n for n in cands if n1 < n < n2 and n not in keep]
    if len(between) == missing:
        for q, n in enumerate(between):
            accepted[n] = g1 + 1 + q
        log("gap-filled", f"v{units[n1][2]['v']}p{units[n1][2]['p']}", missing, [units[n][1][:24] for n in between])
    else:
        log("gap", f"v{units[n1][2]['v']}p{units[n1][2]['p']}", "missing", missing, "between", g1, g2, "candidates", [units[n][1][:30] for n in between])
for n in cands:
    u = units[n]
    log("cands", f"v{u[2]['v']}p{u[2]['p']}", u[3], "kept" if n in keep else ("filled" if n in accepted else "-"), u[1][:50])
inv = []
for s_ in range(1, 115):
    for a_ in range(1, COUNTS[s_ - 1] + 1):
        inv.append((s_, a_))

# ── the passages ──
passages = collections.defaultdict(list)
intro = []
after_head = False
pas = None
pending = False
last_g = -1
vol = None
for n, u in enumerate(units):
    # (a surah's heading, or a new volume's first pages, end the passage before: what comes between,
    # the basmala, the volume's front matter, belongs to none)
    if u[0] == "head" or u[2]["v"] != vol:
        vol = u[2]["v"]
        pas = None
        intro = []
        after_head = u[0] == "head"
        if u[0] == "head":
            continue
    if u[0] == "cand" and n in accepted:
        s_, a_ = inv[accepted[n]]
        split = u[3][0] != "?" and u[3][2]
        if pas is not None and pending and pas["s"] == s_ and a_ > pas["b"]:
            pas["b"] = a_
        elif pas is not None and pas["s"] == s_ and pas["a"] <= a_ <= pas["b"]:
            # (an ayah's second half, or its translation again: its commentary runs on in the same passage)
            log("repeat", f"v{u[2]['v']}p{u[2]['p']}", s_, a_, u[1][:60])
        else:
            lead = []
            if pas and pas["t"] and pas["t"][-1].rstrip().endswith(":") and len(pas["t"][-1]) < 260:
                lead.append(pas["t"].pop())
            pas = {"s": s_, "a": a_, "b": a_, "t": lead + intro}
            intro = []
            passages[s_].append(pas)
        pending = True
        continue
    if u[0] == "cand":
        log("cand-as-text", f"v{u[2]['v']}p{u[2]['p']}", u[1][:70])
    pending = False
    if pas is None:
        # (a word on the surah, before its first ayah, as Al 'Imran has: to its first passage)
        if after_head and len(re.findall(r"[A-Za-z]{2,}", u[1])) >= 6 and not re.search(r"In the name of Allah|Most Gracious|^\(?(Makki|Madani)", u[1]):
            intro.append(u[1])
            log("intro", f"v{u[2]['v']}p{u[2]['p']}", u[1][:100])
        else:
            log("outside", f"v{u[2]['v']}p{u[2]['p']}", u[1][:100])
        continue
    pas["t"].append(u[1])

# ── checks: every ayah of every surah in a passage, once, in order ──
problems = 0
for n in range(1, 115):
    ps = passages.get(n, [])
    seen = sorted(set(x for p in ps for x in range(p["a"], p["b"] + 1)))
    order = all(ps[k]["a"] <= ps[k + 1]["a"] for k in range(len(ps) - 1))
    if seen != list(range(1, COUNTS[n - 1] + 1)) or not order:
        problems += 1
        log("coverage", n, NAMES[n - 1], "passages", len(ps), "ayahs seen", len(seen), "of", COUNTS[n - 1], "first gaps", [x for x in range(1, COUNTS[n - 1] + 1) if x not in seen][:8])
print("surahs with coverage problems:", problems)

os.makedirs(OUT, exist_ok=True)
json.dump({str(n): ps for n, ps in passages.items()}, open(os.path.join(OUT, "raw_passages.json"), "w", encoding="utf-8"), ensure_ascii=False)
for k, v in LOG.items():
    with open(os.path.join(OUT, f"log_{k}.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(v))
    print(k, len(v))
