"""Stage 4: the assembled passages (out/raw_passages.json) made ready to read: paragraphs the page's lines
broke apart put together, the quotations' brackets the scan's marks missed put back, the leftovers of
the honorific marks taken out, references to the Qur'an written alike, the transliteration's letters
plain, the spacing mended. Every repair is logged (out/clean_*.txt). Writes
<tafsir dir>/<surah>.json: { p: [{ a, b, t: [paragraphs] }] }.

    py clean.py <out dir> <surahs.json> <tafsir dir>
"""
import collections
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pylib"))
from spellchecker import SpellChecker  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
OUT, SURAHS, DEST = sys.argv[1], sys.argv[2], sys.argv[3]
IDX = json.load(open(SURAHS, encoding="utf-8"))["surahs"]
COUNTS = [s["count"] for s in IDX]
NAMES = [s["tr"] for s in IDX]
EN = SpellChecker().word_frequency
OPEN, CLOSE = "", ""
HON = ""
MARKS = "-"
SWT, SAW = "", ""
LOG = collections.defaultdict(list)


def log(kind, where, *a):
    LOG[kind].append(" | ".join([where] + [str(x) for x in a]))


# ── paragraphs: what the page's lines broke apart ──
def english(t):
    """Is this the book's English (an Arabic quotation, as read, is not)?"""
    if re.search("[" + MARKS + "]", t) or re.fullmatch(r"\(?[A-Za-z][^()]{1,30}\s?\d{1,3}\s?:\s?\d{1,3}(\s?[-–]\s?\d{1,3})?\)?\.?", t):
        return True
    words = re.findall(r"[A-Za-z']{2,}", t)
    known = [w for w in words if len(w) >= 3 and EN[w.lower().strip("'")] > 0]
    odd = len(re.findall(r"[^\w\s'’,.\-—–:;()\[\]«»!?\"“”‘]", t)) + len(re.findall(r"\b[A-Za-z]\b", t))
    return len(known) >= 1 and odd <= max(2, len(words) // 2)


def whole(t):
    """Does it stand as a paragraph: a sentence, begun and ended?"""
    return len(t) > 40 or bool(re.match(r"^[A-Z" + OPEN + r"«\"‘“]", t) and re.search(r"[.!?»\"’”" + CLOSE + r"]$", t))


def mend_paras(paras, where):
    """A quotation going on into the next paragraph, and a fragment ("— and:", "He wills.", a
    reference alone), joined to the paragraph they belong to."""
    out = []
    for t in paras:
        # (a last word alone, a name the dictionary does not know: "Jumu'ah.")
        word = re.fullmatch(r"[A-Za-z'’\-]{3,}[.,;:!?]?", t.strip())
        if not english(t) and not (word and out and not re.search(r"[.!?:;]$", out[-1])):
            log("para-dropped", where, t[:80])
            continue
        if out:
            prev = out[-1]
            first = re.search("[" + OPEN + CLOSE + "]", t)
            if prev.count(OPEN) > prev.count(CLOSE) and first and first.group(0) == CLOSE:
                log("joined-quote", where, prev[-40:], "+", t[:40])
                out[-1] = prev + " " + t
                continue
            if not whole(t) and (not re.search(r"[.!?:;»\"’”" + CLOSE + r")\]]$", prev) or re.match(r"^[a-z—–\-(]", t)):
                log("joined-frag", where, prev[-40:], "+", t[:60])
                out[-1] = prev + " " + t
                continue
            if not whole(prev) and prev.endswith(":") and len(prev) < 30:
                log("joined-lead", where, prev, "+", t[:40])
                out[-1] = prev + " " + t
                continue
        out.append(t)
    return out


# ── the honorific marks: what was left of their parentheses and strokes about them ──
def junky(j):
    """Is this, by a mark ("),i§)", ",Ilk)"), the mark's own leftovers, not a word?"""
    for punct, core in re.findall(r"\s?([,.;:]?)([^\s()]*)\)", j):
        if not (core == "" or re.search(r"[^A-Za-z]", core) or len(core) <= 2 or (punct and len(core) <= 3)):
            return False
    return True


def honours(t, where):
    def after(m):
        junk = m.group(2)
        if not junky(junk):
            return m.group(0)
        before = t[: m.start()]
        # (a parenthesis the mark stood in, its own: "(O Prophet ﷺ)")
        keep = ")" if before.count("(") > before.count(")") else ""
        log("honour-after", where, repr(junk), "->", repr(keep))
        return m.group(1) + keep
    t = re.sub(r"([" + HON + r"])((?:\s?[,.;:]?[^\s()" + MARKS + r"]{0,7}\))+)", after, t)

    # (the same before a mark: "Muhammad (iH§), ﷺ his family")
    def before(m):
        log("honour-before", where, repr(m.group(0)))
        return " " + m.group(2) + m.group(1)
    t = re.sub(r"\s?\((?=[^()\s]{1,5}\))[^()\s]*[^\sA-Za-z()'][^()\s]*\)([,.;:]?)\s?([" + HON + r"])", before, t)

    # (one the scan missed, its parentheses read as letters: put back after Allah, or the Prophet)
    def lost(m):
        word = m.group(1)
        if word == "Allah":
            mark = SWT
        elif word in ("Muhammad", "Prophet", "Messenger"):
            mark = SAW
        else:
            log("honour-lost", where, repr(m.group(0)), "-> dropped")
            return word
        log("honour-lost", where, repr(m.group(0)), "->", "swt" if mark == SWT else "saw")
        return word + " " + mark
    t = re.sub(r"\b([A-Z][a-z]+)\s\((?=[^()]{1,5}\))(?![^()]*\d)[^()\s]*[§$£®|^«\\-][^()]*\)", lost, t)
    return t


# ── the quotations' brackets: where the scan's mark was missed, the reading's stand-in for it ──
CLOSE_ART = re.compile(r"(?<=[^\s(])(\)\)|\)\?|\)\*|\$\)|\}\*|\]\*|\}|»•?|>|\^|\*|©|(?<=!)\?|\))(?=[\s,.;:!?—\-\['’•]|$)")
OPEN_ART = re.compile(r"(?:^|(?<=[\s(—]))(<|\^|«\s?[^\s\w]?|\{|4(?=[a-z])|\()(?=\S)")


def quotes(t, where):
    # each open mark: closed before the next, or by its stand-in
    i = 0
    while True:
        j = t.find(OPEN, i)
        if j < 0:
            break
        nxt = t.find(OPEN, j + 1)
        end = nxt if nxt >= 0 else len(t)
        if t.find(CLOSE, j, end) < 0:
            span = t[j + 1:end]
            fixed = None
            for m in CLOSE_ART.finditer(span):
                # (a parenthesis closed is a parenthesis, where one was opened)
                if m.group(1) == ")" and "(" in span[: m.start()]:
                    continue
                fixed = j + 1 + m.start(), j + 1 + m.end(), m.group(1)
                break
            if not fixed:
                # (or run onto the quotation's last word: "wonderp", "heard9")
                for m in re.finditer(r"([A-Za-z]{3,})([p9b])(?=[\s,.;:])", span):
                    if EN[m.group(1).lower()] > 0 and EN[(m.group(1) + m.group(2)).lower()] == 0:
                        fixed = j + 1 + m.start(2), j + 1 + m.end(2), m.group(2)
                        break
            if fixed:
                a, b, art = fixed
                log("close-put", where, repr(art), t[max(0, a - 40):a], "|", t[b:b + 20])
                t = t[:a] + CLOSE + t[b:]
            else:
                log("open-dropped", where, t[j:j + 60])
                t = t[:j] + t[j + 1:]
                continue
        i = j + 1
    # each close mark: opened after the last close, or by its stand-in
    i = 0
    while True:
        j = t.find(CLOSE, i)
        if j < 0:
            break
        prev = t.rfind(CLOSE, 0, j)
        start = prev + 1 if prev >= 0 else 0
        if t.rfind(OPEN, start, j) < 0:
            span = t[start:j]
            found = None
            for m in OPEN_ART.finditer(span):
                if m.group(1) == "(" and ")" in span[m.end():]:
                    continue
                found = (start + m.start(1), start + m.end(1), m.group(1))
            if not found:
                # (or run onto the quotation's first word: "qAllah", "oso")
                for m in re.finditer(r"(?:^|(?<=\s))([qo])([A-Za-z]{2,})", span):
                    if EN[m.group(2).lower()] > 0 and EN[(m.group(1) + m.group(2)).lower()] == 0:
                        found = (start + m.start(1), start + m.end(1), m.group(1))
            if found:
                a, b, art = found
                log("open-put", where, repr(art), t[a:a + 50], "|", t[j:j + 10])
                t = t[:a] + OPEN + t[b:]
                j = t.find(CLOSE, a)
            else:
                log("close-dropped", where, t[max(0, j - 60):j])
                t = t[:j] + t[j + 1:]
                continue
        i = j + 1
    return t


# ── references to the Qur'an: "(al-A 'råf7: 54)", "(IO: 66)", written as the site writes them ──
def num(x):
    return int(re.sub(r"\s", "", x.replace("I", "1").replace("l", "1").replace("O", "0").replace("o", "0")))


def refs(t, where):
    def one(m):
        name, s_, a_ = m.group(1), m.group(2), m.group(3)
        try:
            s = num(s_)
            ayahs = [num(x) for x in re.split(r"\s*[-–]\s*", a_)]
        except ValueError:
            return m.group(0)
        if not (1 <= s <= 114 and all(1 <= a <= COUNTS[s - 1] for a in ayahs)):
            log("ref-odd", where, m.group(0))
            return m.group(0)
        r = f"{s}:{ayahs[0]}" + (f"–{ayahs[1]}" if len(ayahs) > 1 else "")
        new = f"({NAMES[s - 1]} {r})" if name and re.search(r"[A-Za-z]{2}", name) else f"({r})"
        if new != m.group(0):
            log("ref", where, m.group(0), "->", new)
        return new
    # (its opening parenthesis sometimes read as a quote mark, a name's first letter as "4" or "$")
    return re.sub(r"(?:\(|(?<=\s)['‘])\s*((?:4-)?[A-Za-z$][^()\d]{1,30}?)?\s*([\dIlO]{1,3})\s*[:;.•']{1,2}\s*([\dIlOo]{1,3}(?:\s*[-–]\s*[\dIlOo]{1,3})?)\s*\)", one, t)


# ── letters: the transliteration's long vowels, as read (ä, å, â), plain; the reading's strays out ──
def letters(t, where):
    # (a raised dot read for the ayn's apostrophe: "ash-Shu •arä", "•Eesa")
    t = re.sub(r"\s?•(?=[a-z])", "'", t)
    t = re.sub(r"•(?=[A-Z])", "'", t)
    t = t.replace("•", "")
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    odd = re.findall(r"[^\x00-\x7f" + MARKS + r"’‘“”—–…«»]", t)
    if odd:
        log("odd-letters", where, "".join(odd), t[:80])
        t = re.sub(r"[^\x00-\x7f" + MARKS + r"’‘“”—–…«»]", "", t)
    return t


def tidy(t, where):
    """What is left of the reading's stand-ins, beside the marks put back, or alone: a bracket read as
    "^", ")?", "}", "<"; a footnote's number run onto its word ("Ansar2")."""
    new = re.sub(r"\)[?*](?=[.,;:]?" + CLOSE + ")", "", t)
    new = re.sub(r"[{}^<>]", "", new)
    new = re.sub(r"(?<=[a-z\])”\"])(\d{1,2})(?=[\s,;]|\.(?!\s?\d)|$)", "", new)
    new = re.sub(r"(?<=[a-z][.,;])(\d{1,2})(?=\s|$)", "", new)
    if new != t:
        log("tidy", where, t[:0] + " ".join(sorted(set(re.findall(r"\)[?*]|[{}^<>]|(?<=[a-z\])”\".,;])\d{1,2}(?=[\s,.;:]|$)", t)))))
    return new


def spacing(t):
    t = re.sub(r"\s+([,.;:!?])(?!\.\.)", r"\1", t)
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s+\)", ")", t)
    t = re.sub(r"(?<=\S)\s+" + CLOSE, CLOSE, t)
    t = re.sub(OPEN + r"\s+", OPEN, t)
    t = re.sub(r"([,;:])(?=[A-Za-z" + OPEN + r"])", r"\1 ", t)
    t = re.sub(CLOSE + r"(?=[A-Za-z(])", CLOSE + " ", t)
    # (a compound broken at the line's end: "Self- Sufficient")
    t = re.sub(r"(?<=[A-Za-z])- (?=[A-Z])", "-", t)
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


# ── the words closing each surah's commentary, set small, and read poorly: as the book has them ──
DOXA = "All praise and thanks are for Allah, and may the blessings and peace of Allah be upon Prophet Muhammad " + SAW + ", his family, and his Companions abundantly until the Day of Judgement."


def closing(paras, s, where):
    out = []
    for t in paras:
        if re.match(r"^All praise and thanks are\b", t) and "blessings" in t:
            if t != DOXA:
                log("closing", where, t[:120])
            out.append(DOXA)
        elif out and out[-1] == DOXA and len(t) < 200 and re.search(r"abundantly|Judgement|his family|Companions", t):
            log("closing", where, "(its rest)", t[:120])
        elif re.match(r"^This is the end of the commentary\W", t) and not re.fullmatch(r"This is the end of the commentary on Soorat [A-Z]?[a-z]{0,3}[ -]?[A-Z][A-Za-z']+\.", t):
            new = f"This is the end of the commentary on Soorat {NAMES[s - 1]}."
            if t != new:
                log("closing", where, t, "->", new)
            out.append(new)
        else:
            out.append(t)
    return out


# ── words both readings got wrong, set right by the page itself (passage: [(as read, as printed)]) ──
FIXES = {
    "23:50": [("hat We blessed", "That is, We blessed")],
}

raw = json.load(open(os.path.join(OUT, "raw_passages.json"), encoding="utf-8"))
os.makedirs(DEST, exist_ok=True)
stats = collections.Counter()
for s in range(1, 115):
    out = []
    for p in raw.get(str(s), []):
        where = f"{s}:{p['a']}"
        paras = []
        for t in mend_paras(p["t"], where):
            for a, b in FIXES.get(where, []):
                if a in t:
                    log("fixed", where, a, "->", b)
                    t = t.replace(a, b)
            t = honours(t, where)
            t = quotes(t, where)
            t = refs(t, where)
            t = letters(t, where)
            t = tidy(t, where)
            paras.append(spacing(t))
        paras = closing(paras, s, where)
        stats["paras"] += len(paras)
        if not paras:
            log("empty-passage", where)
        # (an ayah the book splits, or repeats: one passage)
        if out and out[-1]["a"] == p["a"] and out[-1]["b"] == p["b"]:
            out[-1]["t"] += paras
            continue
        out.append({"a": p["a"], "b": p["b"], "t": paras})
    stats["passages"] += len(out)
    with open(os.path.join(DEST, f"{s}.json"), "w", encoding="utf-8") as f:
        json.dump({"p": out}, f, ensure_ascii=False, separators=(",", ":"))
print(dict(stats))
for k, v in sorted(LOG.items()):
    print(k, len(v))
    with open(os.path.join(OUT, f"clean_{k}.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(v))
