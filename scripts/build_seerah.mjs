// The Seerah: its parts written in seerah/NN-*.md (in order of their names), and its people in
// seerah/people/*.md, checked and written to public/data/seerah.json for the site.
//   node scripts/build_seerah.mjs
//
// A part:      # id, then  title: / ar: / span: / era: / blurb: / img: / mood:
// A section:   ## id, then  title: / when: / y: / place: / look: / tags: / refs: /
//              word: (its word, written large) / mood: (its colours) / img: (its picture) / go: (which way it turns in)
//              then its paragraphs (a blank line between), with ayahs to bring up as [2:255] or [4:22-23];
//              and any of  facts: / list: / people:  (lines "- name: note"; a list's may be a name alone),
//              quote: text — who,  lineage: a > b > c
// A person:    ## id, then  name: / ar: / also: (other names, by commas) / role:  then a few paragraphs;
//              the sections each is named in are found here (there a name becomes a way to the person).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const counts = JSON.parse(readFileSync(new URL("public/data/surahs.json", root), "utf8")).surahs.map((s) => s.count);
const { maps: MAPS } = JSON.parse(readFileSync(new URL("src/seerah/maps.json", root), "utf8"));
const IMAGES = JSON.parse(readFileSync(new URL("src/seerah/images.json", root), "utf8"));
const LOOKS = ["text", "map", "image", "quote", "list", "people", "lineage", "kabah", "opener"];
const ERAS = ["before", "early", "makkah", "madinah", "after"];
const MOODS = ["sand", "parchment", "white", "dawn", "dusk", "night", "ember", "oasis", "iron", "grief"];
const GOES = ["down", "up", "right", "left", "in"];
const PART_KEYS = ["title", "ar", "span", "era", "blurb", "img", "mood"];
const SEC_KEYS = ["title", "when", "y", "place", "look", "tags", "refs", "word", "mood", "img", "go"];
const BLOCKS = ["facts", "list", "people"];

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const checkRef = (where, s, a, b) => {
  if (!counts[s - 1]) return fail(where, `no surah ${s}`);
  if (a < 1 || a > counts[s - 1] || (b && (b < a || b > counts[s - 1]))) fail(where, `no ayah ${s}:${a}${b ? "-" + b : ""}`);
};

const parts = [];
const ids = new Set();
const files = readdirSync(new URL("seerah/", root)).filter((f) => /^\d.*\.md$/.test(f)).sort();
for (const file of files) {
  const lines = readFileSync(new URL(`seerah/${file}`, root), "utf8").replace(/\r\n/g, "\n").split("\n");
  let part = null, sec = null, block = null, para = [];
  const endPara = () => {
    if (sec && para.length) sec.body.push(para.join(" ").trim());
    para = [];
  };
  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    const where = `${file}:${n + 1}`;
    if (line.startsWith("## ")) {
      endPara();
      if (!part) return fail(where, "a section before any part");
      sec = { id: line.slice(3).trim(), body: [], head: true };
      if (ids.has(sec.id)) fail(where, `the id ${sec.id} is used twice`);
      ids.add(sec.id);
      part.sections.push(sec);
      block = null;
      return;
    }
    if (line.startsWith("# ")) {
      endPara();
      part = { id: line.slice(2).trim(), sections: [] };
      parts.push(part);
      sec = null;
      block = null;
      return;
    }
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (!sec && part && kv && PART_KEYS.includes(kv[1])) return void (part[kv[1]] = kv[2].trim());
    if (sec && sec.head && kv && SEC_KEYS.includes(kv[1])) {
      const [, k, v] = kv;
      if (k === "y") sec.y = Number(v);
      else if (k === "tags") sec.tags = v.split(",").map((t) => t.trim()).filter(Boolean);
      else if (k === "refs") sec.refs = v.split(/[ ,]+/).filter(Boolean);
      else if (k === "look") {
        const [kind, id] = v.trim().split(/\s+/);
        sec.look = id ? { kind, id } : { kind };
      } else sec[k] = v.trim();
      return;
    }
    if (!sec) return void (line.trim() && fail(where, `stray line: ${line}`));
    if (kv && BLOCKS.includes(kv[1]) && !kv[2]) {
      endPara();
      sec.head = false;
      block = kv[1];
      sec[block] = [];
      return;
    }
    if (block && line.startsWith("- ")) {
      const m = line.slice(2).match(/^([^:]+):\s*(.+)$/);
      if (!m && block !== "list") return fail(where, `a ${block} line needs "name: note"`);
      sec[block].push(m ? [m[1].trim(), m[2].trim()] : [line.slice(2).trim(), ""]);
      return;
    }
    if (kv && kv[1] === "quote") {
      endPara();
      sec.head = false;
      const m = kv[2].match(/^(.+?)\s+—\s+(.+)$/);
      sec.quote = m ? { text: m[1].trim(), who: m[2].trim() } : { text: kv[2].trim() };
      block = null;
      return;
    }
    if (kv && kv[1] === "lineage") {
      endPara();
      sec.head = false;
      sec.lineage = kv[2].split(">").map((x) => x.trim()).filter(Boolean);
      block = null;
      return;
    }
    if (!line.trim()) return endPara();
    block = null;
    sec.head = false;
    para.push(line.trim());
  });
  endPara();
}

// checks
for (const p of parts) {
  for (const k of ["title", "span", "era"]) if (!p[k]) fail(p.id, `the part has no ${k}`);
  if (p.era && !ERAS.includes(p.era)) fail(p.id, `unknown era ${p.era}`);
  if (p.mood && !MOODS.includes(p.mood)) fail(p.id, `unknown mood ${p.mood}`);
  if (p.img && !IMAGES[p.img]) fail(p.id, `(image ${p.img} not there yet)`);
  for (const s of p.sections) {
    delete s.head;
    const w = `${p.id}/${s.id}`;
    if (!s.title) fail(w, "no title");
    if (!s.body.length) fail(w, "no text");
    s.look ??= { kind: "text" };
    if (!LOOKS.includes(s.look.kind)) fail(w, `unknown look ${s.look.kind}`);
    if (s.look.kind === "map" && !MAPS[s.look.id]) fail(w, `no map ${s.look.id}`);
    if (s.look.kind === "image" && !s.look.id) fail(w, "an image look needs its image's id");
    if (s.look.kind === "image") s.img ??= s.look.id;
    if (s.img && !IMAGES[s.img]) fail(w, `(image ${s.img} not there yet)`);
    if (s.mood && !MOODS.includes(s.mood)) fail(w, `unknown mood ${s.mood}`);
    if (s.go && !GOES.includes(s.go)) fail(w, `unknown way ${s.go}`);
    if (s.look.kind === "lineage" && !s.lineage) fail(w, "a lineage look needs lineage:");
    if (s.look.kind === "people" && !s.people) fail(w, "a people look needs people:");
    if (s.look.kind === "list" && !s.list) fail(w, "a list look needs list:");
    if (s.look.kind === "quote" && !s.quote && s.body.length < 2) fail(w, "a quote look needs a quote: or more text");
    if (s.y !== undefined && !Number.isFinite(s.y)) fail(w, "y is not a number");
    for (const t of s.body) for (const m of t.matchAll(/\[(\d+):(\d+)(?:-(\d+))?\]/g)) checkRef(w, +m[1], +m[2], m[3] && +m[3]);
    for (const r of s.refs ?? []) {
      const m = r.match(/^(\d+):(\d+)(?:-(\d+))?$/);
      if (!m) fail(w, `a ref is not s:a: ${r}`);
      else checkRef(w, +m[1], +m[2], m[3] && +m[3]);
    }
  }
}
// a section with no year of its own takes the one before it (its place on the timeline)
let lastY = -Infinity;
for (const p of parts)
  for (const s of p.sections) {
    if (s.y === undefined) s.y = lastY === -Infinity ? 0 : lastY;
    lastY = s.y;
  }

// its people, and the sections each is named in
const people = [];
for (const file of readdirSync(new URL("seerah/people/", root)).filter((f) => f.endsWith(".md")).sort()) {
  let cur = null;
  let para = [];
  const end = () => {
    if (cur && para.length) cur.body.push(para.join(" ").trim());
    para = [];
  };
  readFileSync(new URL(`seerah/people/${file}`, root), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((raw, n) => {
      const line = raw.trimEnd();
      if (line.startsWith("## ")) {
        end();
        cur = { id: line.slice(3).trim(), body: [], also: [] };
        if (people.some((x) => x.id === cur.id)) fail(`people/${file}:${n + 1}`, `the id ${cur.id} is used twice`);
        people.push(cur);
        return;
      }
      if (!cur) return void (line.trim() && fail(`people/${file}:${n + 1}`, "a line before any person"));
      const kv = line.match(/^(name|ar|also|role|except):\s*(.*)$/);
      if (kv && !cur.body.length && !para.length) {
        if (kv[1] === "also" || kv[1] === "except") cur[kv[1]] = kv[2].split(",").map((x) => x.trim()).filter(Boolean);
        else cur[kv[1]] = kv[2].trim();
        return;
      }
      if (!line.trim()) return end();
      para.push(line.trim());
    });
  end();
}
const plain = (t) => t.replace(/\s*\[(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?\]/g, "");
// (a name is not the person where it names his clan, or someone's father: "Banu Hashim", "Sa'id bin Zaid")
const NOT_AFTER = /(?:\bBanu|\bBani|\bbin|\bbint|\bibn|\bAbi|\bAbu|\bUmm|\bfamily of|\bclan of)\s$/i;
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// (nor is a short name the person, when his father is known and another follows it: "'Uthman bin Talhah")
const SON = /\s(?:bin|bint|ibn)\s/;
const namedIn = (text, names) => {
  const fathered = names.some((nm) => SON.test(nm));
  return names.some((nm) => {
    const re = new RegExp(`(^|[^\\p{L}'])${esc(nm)}(?![\\p{L}'])`, "gu");
    for (const m of text.matchAll(re)) {
      if (NOT_AFTER.test(text.slice(Math.max(0, m.index - 12), m.index + m[1].length))) continue;
      const end = m.index + m[0].length;
      if (fathered && !SON.test(nm) && /^\s(?:bin|bint|ibn)\s/.test(text.slice(end, end + 6))) continue;
      return true;
    }
    return false;
  });
};
for (const p of people) {
  if (!p.name) fail(`people/${p.id}`, "no name");
  if (!p.body.length) fail(`people/${p.id}`, "no text");
  p.in = [];
  for (const part of parts)
    for (const s of part.sections) {
      if (p.except?.includes(s.id)) continue; // (a section where the name is someone else's)
      const text = [s.title, ...s.body.map(plain), ...(s.people ?? []).map((x) => x.join(" ")), ...(s.list ?? []).map((x) => x.join(" "))].join("\n");
      if (namedIn(text, [p.name, ...p.also])) {
        p.in.push(s.id);
        (s.who ??= []).push(p.id);
      }
    }
}

const hard = problems.filter((x) => !x.includes("(image"));
problems.forEach((x) => console.log((x.includes("(image") ? "  note  " : "  ERROR ") + x));
if (hard.length) process.exit(1);
const out = { parts, people };
writeFileSync(new URL("public/data/seerah.json", root), JSON.stringify(out));
const n = parts.reduce((a, p) => a + p.sections.length, 0);
console.log(`${parts.length} parts, ${n} sections, ${people.length} people, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
