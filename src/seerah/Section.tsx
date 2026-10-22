import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useTransform, type MotionValue, type Variants } from "framer-motion";
import type { Highlight } from "@/lib/store";
import { inkOf, splitPiece } from "@/read/text";
import { cn } from "@/lib/utils";
import { runsOf, type Part, type Person, type Section, type Slide } from "./data";
import { MOODS, moodOf, moodVars, type Mood } from "./moods";
import { Picture, hasPicture } from "./SeerahImage";

const EASE = [0.22, 1, 0.36, 1] as const;
// (the map, with the three-dimensional drawing it needs, comes when a map is first shown)
const SeerahMap = lazy(() => import("./SeerahMap").then((m) => ({ default: m.SeerahMap })));
// the words of a page come in after the page has arrived, one after another
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.55 } } };
const rise: Variants = { hidden: { opacity: 0, y: 26, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" }, transition: { duration: 0.95, ease: EASE } } };

export type Enter = { x: number; y: number; z: number };
type Common = { mobile: boolean; mx: MotionValue<number>; my: MotionValue<number>; enter: Enter };
type Links = { hls: Highlight[]; fresh: string | null; onRef: (ref: string, el: HTMLElement) => void; people: Map<string, Person>; onPerson: (id: string) => void };

/** One page of the Seerah: a part's opening, or a section. */
export function SlideView({ slide, ...p }: Common & Links & { slide: Slide }) {
  const mood = moodOf(slide);
  return (
    <div className="s-plate" style={moodVars(mood)} data-mood={mood}>
      <Ambience mood={mood} />
      {slide.kind === "part" ? <Opener part={slide.part} pi={slide.pi} {...p} /> : <Page s={slide.s} part={slide.part} n={slide.n} mood={mood} {...p} />}
    </div>
  );
}

/* ── a part's opening ───────────────────────────────────────── */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function Opener({ part, pi, mobile, mx, my, enter }: Common & { part: Part; pi: number }) {
  const back = useTransform(mx, (v) => v * -30), backY = useTransform(my, (v) => v * -18);
  const fore = useTransform(mx, (v) => v * 10);
  const big = part.title.split(" ").sort((a, b) => b.length - a.length)[0];
  return (
    <div className="s-opener absolute inset-0">
      {part.img && hasPicture(part.img) && (
        <motion.div className="absolute inset-0" style={{ x: back, y: backY }} initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1.04, opacity: 0.55 }} transition={{ duration: 2.4, ease: EASE }}>
          <Picture id={part.img} full />
        </motion.div>
      )}
      {/* the part's number, enormous and faint, moving deepest */}
      <motion.div
        className="s-word is-outline"
        style={{ x: back, y: backY, right: "-2vw", bottom: mobile ? "16vh" : "-4vh", fontSize: mobile ? "58vw" : "62vh", opacity: 0.5 }}
        initial={{ x: enter.x * 300, opacity: 0 }}
        animate={{ x: 0, opacity: 0.5 }}
        transition={{ duration: 1.6, ease: EASE }}
      >
        {ROMAN[pi] ?? pi + 1}
      </motion.div>
      <motion.div className="relative flex h-full flex-col justify-center px-[6vw]" style={{ x: fore }} variants={stagger} initial="hidden" animate="show">
        <motion.div variants={rise} className="s-label" style={{ color: "var(--s-faint)" }}>
          Part {ROMAN[pi] ?? pi + 1} — {part.span}
        </motion.div>
        {part.ar && (
          <motion.div variants={rise} className="s-ar mt-3" dir="rtl" lang="ar" style={{ fontSize: mobile ? "15vw" : "15vh", alignSelf: mobile ? "flex-end" : "flex-start" }}>
            {part.ar}
          </motion.div>
        )}
        <motion.h2 variants={rise} className="s-great mt-2" style={{ fontSize: mobile ? `${Math.min(19, 120 / Math.max(6, big.length))}vw` : `${Math.min(17, 96 / Math.max(6, big.length))}vh`, maxWidth: "92vw" }}>
          {part.title}
        </motion.h2>
        {part.blurb && (
          <motion.p variants={rise} className="s-blurb mt-6">
            {part.blurb}
          </motion.p>
        )}
        <motion.div variants={rise} className="s-label mt-8" style={{ color: "var(--s-accent)" }}>
          {part.sections.length} sections
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ── a section ──────────────────────────────────────────────── */

function Page({ s, part, n, mood, mobile, mx, my, enter, ...links }: Common & Links & { s: Section; part: Part; n: number; mood: Mood }) {
  const kind = s.look.kind;
  const pic = s.img && hasPicture(s.img) ? s.img : null;
  // which side the words are on: by turns, so no two pages in a row are the same
  const left = n % 2 === 1;
  const wx = useTransform(mx, (v) => v * -26), wy = useTransform(my, (v) => v * -14);
  const px = useTransform(mx, (v) => v * -14), py = useTransform(my, (v) => v * -9);
  const word = (s.word ?? s.title.split(" ").pop() ?? "").toUpperCase();
  // (the great word as large as the width allows: the narrower the letters, the more there are)
  const fit = Math.min(mobile ? 30 : 34, (mobile ? 92 : 98) / Math.max(3, word.length * 0.47));
  // the page fitted to its words, never a scroll where there is room: at first the great word at its
  // largest and the words below it; if they do not fit, the word smaller and the words higher, then
  // their column wider, then in two columns (the picture narrower to make room); only past that do
  // they scroll (with the page's own marks for it, not the browser's bar)
  const [lvl, setLvl] = useState(0);
  const textBox = useRef<HTMLDivElement>(null);
  const visualBox = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const on = () => setRoom((x) => x + 1);
    window.addEventListener("resize", on);
    document.fonts?.ready.then(on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useLayoutEffect(() => setLvl(0), [s.id, room]);
  useLayoutEffect(() => {
    const el = textBox.current;
    if (!el || mobile) return;
    if (el.scrollHeight - el.clientHeight > 2 && lvl < 5) setLvl(lvl + 1);
  }, [lvl, room, mobile, s.id]);
  const map = kind === "map";
  const L = map
    ? [
        { top: "22vh", width: "min(520px, 38vw)" },
        { top: "15vh", width: "min(600px, 42vw)" },
        { top: "13vh", width: "min(680px, 46vw)" },
        { top: "13vh", width: "min(980px, 62vw)", cols: true },
        { top: "12vh", width: "min(1040px, 64vw)", cols: true, tight: true },
        { top: "12vh", width: "min(1040px, 64vw)", cols: true, tight: true },
      ][lvl]
    : [
        { top: "33vh", width: "min(600px, 42vw)", cap: 23, side: 48 },
        { top: "27vh", width: "min(640px, 44vw)", cap: 17, side: 46 },
        { top: "21vh", width: "min(720px, 48vw)", cap: 11.5, side: 40 },
        { top: "21vh", width: "min(1040px, 60vw)", cap: 11.5, side: 31, cols: true },
        { top: "19vh", width: "min(1100px, 62vw)", cap: 10, side: 29, cols: true, tight: true },
        { top: "19vh", width: "min(1100px, 62vw)", cap: 10, side: 29, cols: true, tight: true },
      ][lvl];
  const { side = 48, cap = 20, cols = false, tight = false } = L as { side?: number; cap?: number; cols?: boolean; tight?: boolean };
  const visual =
    kind === "map" ? null
    : kind === "list" ? <Ledger items={s.list!} />
    : kind === "people" ? <People items={s.people!} people={links.people} onPerson={links.onPerson} />
    : kind === "lineage" ? <Lineage names={s.lineage!} />
    : kind === "kabah" ? <KabahPlan />
    : kind === "quote" && s.quote ? <BigQuote q={s.quote} />
    : null;

  const greatWord = (
    <motion.div
      className={cn("s-word", (MOODS[mood].light ? false : mood === "night" || mood === "grief") && "is-outline")}
      style={
        mobile
          ? { position: "relative", fontSize: `${fit}vw`, marginLeft: "-1vw" }
          : { x: wx, y: wy, left: left ? "auto" : "-0.6vw", right: left ? "-0.6vw" : "auto", top: "9vh", fontSize: `min(${fit}vw, ${cap}vh)`, zIndex: 1, transition: "font-size 0.5s cubic-bezier(.22,1,.36,1)" }
      }
      initial={{ opacity: 0, x: enter.x * 360, y: enter.y * 220, scale: enter.z ? 1.25 : 1 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ duration: 1.5, ease: EASE }}
    >
      {word}
    </motion.div>
  );

  const words = <Words s={s} part={part} n={n} {...links} />;

  if (mobile)
    return (
      <>
      <div ref={textBox} data-scroll data-hl-box className="s-text-box absolute inset-0 overflow-y-auto overscroll-contain">
        {kind === "map" && (
          <div className="relative h-[46vh]">
            <Suspense fallback={null}>
              <SeerahMap id={s.look.id!} mobile mood={mood} />
            </Suspense>
          </div>
        )}
        <div className="px-5 pb-36" style={{ paddingTop: kind === "map" ? 18 : 74 }}>
          {kind !== "map" && greatWord}
          {pic && (
            <motion.div className="relative -mx-5 mt-2 h-[40vh]" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, ease: EASE }}>
              <Picture id={pic} />
            </motion.div>
          )}
          {words}
          {visual && <div className="mt-8">{visual}</div>}
        </div>
      </div>
      <ScrollCue box={textBox} page />
      </>
    );

  return (
    <>
      {kind === "map" ? (
        <motion.div className="absolute inset-0" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: EASE }}>
          <Suspense fallback={null}>
            <SeerahMap id={s.look.id!} mobile={false} mood={mood} side={left ? "right" : "left"} />
          </Suspense>
        </motion.div>
      ) : (
        greatWord
      )}
      {/* the picture, or what the section is drawn as, on the far side from the words, in front of the great word */}
      {kind !== "map" && (pic || visual) && (
        <motion.div
          className="absolute z-[3]"
          style={{ x: px, y: py, top: "16vh", bottom: 96, width: `${visual && !pic ? side - 4 : side}vw`, [left ? "left" : "right"]: visual && !pic ? "5vw" : "2vw" }}
          initial={{ opacity: 0, x: enter.x * 160, y: enter.y * 120, scale: enter.z ? 0.9 : 1.04 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          transition={{ duration: 1.35, ease: EASE, delay: 0.1 }}
        >
          {pic ? (
            <Picture id={pic} edge={left ? "right" : "left"} />
          ) : (
            <>
              {/* (centred while it fits; from its top, with the page's own marks, when it must scroll) */}
              <div ref={visualBox} className="no-scrollbar flex h-full items-center-safe justify-center overflow-y-auto" data-scroll>
                {visual}
              </div>
              <ScrollCue box={visualBox} />
            </>
          )}
        </motion.div>
      )}
      {/* the words */}
      <div
        className={cn("s-text", lvl >= 5 && "is-scrolling")}
        style={{
          top: L.top,
          bottom: 84,
          width: L.width,
          [left ? "right" : "left"]: "4.5vw",
        }}
      >
        <div
          ref={textBox}
          data-scroll
          data-hl-box
          className={cn("s-text-box h-full overflow-y-auto overscroll-contain pr-3", cols && "is-cols", tight && "is-tight")}
          style={map ? { padding: "0 22px", background: MOODS[mood].light ? "rgba(255,250,240,0.82)" : "rgba(8,8,10,0.62)", backdropFilter: "blur(10px)" } : undefined}
        >
          {words}
          {/* (a saying drawn as the page's picture, when there is a picture besides: under the words) */}
          {pic && visual && <div className="mt-10">{visual}</div>}
        </div>
        {lvl >= 5 && <ScrollCue box={textBox} />}
      </div>
    </>
  );
}

/** A section's words: where and when, its title, its paragraphs, and what goes with them. */
function Words({ s, part, n, hls, fresh, onRef, people, onPerson }: Links & { s: Section; part: Part; n: number }) {
  return (
    <motion.div className="s-text-in" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="s-meta s-label">
        <span>
          <b>No.</b>
          {String(n).padStart(3, "0")}
        </span>
        {s.when && (
          <span>
            <b>When</b>
            {s.when}
          </span>
        )}
        {s.place && (
          <span>
            <b>Where</b>
            {s.place}
          </span>
        )}
        <span className="max-md:hidden">
          <b>Part</b>
          {part.title}
        </span>
      </motion.div>
      <motion.h2 variants={rise} className="s-title mt-5">
        {s.title}
      </motion.h2>
      <motion.div variants={rise} className="s-prose" data-field="seerah" data-key={`seerah:${s.id}`}>
        <Prose body={s.body} hls={hls} fresh={fresh} onRef={onRef} who={s.who} people={people} onPerson={onPerson} />
      </motion.div>
      {s.quote && s.look.kind !== "quote" && (
        <motion.blockquote variants={rise} className="s-pull">
          <p>{honour(s.quote.text)}</p>
          {s.quote.who && <cite>{honour(s.quote.who)}</cite>}
        </motion.blockquote>
      )}
      {s.list && s.look.kind !== "list" && (
        <motion.div variants={rise} className="mt-7">
          <Ledger items={s.list} />
        </motion.div>
      )}
      {s.people && s.look.kind !== "people" && (
        <motion.div variants={rise} className="mt-7">
          <People items={s.people} people={people} onPerson={onPerson} />
        </motion.div>
      )}
      {s.facts && (
        <motion.dl variants={rise} className="s-facts">
          {s.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{honour(v)}</dd>
            </div>
          ))}
        </motion.dl>
      )}
    </motion.div>
  );
}

/**
 * A section's paragraphs: each run of words marked with where it begins in the section's text (its
 * highlights are counted so: data.ts canonOf), highlighted where the reader has; an ayah it speaks
 * of as a mark of its own, to open; and the first time a person of the Seerah is named, their name a
 * way to them.
 */
function Prose({ body, hls, fresh, onRef, who, people, onPerson }: { body: string[]; hls: Highlight[]; fresh: string | null; onRef: (ref: string, el: HTMLElement) => void; who?: string[]; people: Map<string, Person>; onPerson: (id: string) => void }) {
  const paras = useMemo(() => body.map(runsOf), [body]);
  // the names to look for in this section, longest first (so "Abu Bakr As-Siddiq" before "Abu Bakr")
  const names = useMemo(() => {
    const out: { name: string; id: string }[] = [];
    for (const id of who ?? []) {
      const p = people.get(id);
      if (p) for (const nm of [p.name, ...p.also]) out.push({ name: nm, id });
    }
    return out.sort((a, b) => b.name.length - a.name.length);
  }, [who, people]);
  const linked = new Set<string>();
  // a run of words, cut where a name not yet linked begins and ends
  const withNames = (text: string, start: number, key: string): ReactNode[] => {
    for (const { name, id } of names) {
      if (linked.has(id)) continue;
      let i = -1;
      for (let from = 0; (i = text.indexOf(name, from)) >= 0; from = i + 1) {
        const before = text.slice(Math.max(0, i - 12), i), after = text[i + name.length] ?? "";
        const wordStart = i === 0 || !/[\p{L}']/u.test(text[i - 1]);
        if (wordStart && !/[\p{L}']/u.test(after) && !/(?:\bBanu|\bBani|\bbin|\bbint|\bibn|\bAbi|\bAbu|\bUmm|\bfamily of|\bclan of)\s$/i.test(before)) break;
      }
      if (i < 0) continue;
      linked.add(id);
      const p = people.get(id)!;
      return [
        ...withNames(text.slice(0, i), start, key + "a"),
        <span key={key + "p"} data-o={start + i} className="s-person" role="button" tabIndex={0} title={p.role ? `${p.name}: ${p.role}` : p.name} onClick={() => onPerson(id)} onKeyDown={(e) => e.key === "Enter" && onPerson(id)}>
          {text.slice(i, i + name.length)}
        </span>,
        ...withNames(text.slice(i + name.length), start + i + name.length, key + "b"),
      ];
    }
    return text ? [<span key={key} data-o={start}>{honour(text)}</span>] : [];
  };
  let at = 0;
  return (
    <>
      {paras.map((runs, pi) => {
        const out: ReactNode[] = [];
        runs.forEach((r, ri) => {
          if ("ref" in r) {
            out.push(
              <button key={`r${ri}`} type="button" className="s-ref" data-ref={r.ref} onClick={(e) => onRef(r.ref, e.currentTarget)} title={`Qur'an ${r.ref}: read it, hear it`}>
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                  <path d="M2 1.2v7.6L8.6 5z" fill="currentColor" />
                </svg>
                {r.ref}
              </button>,
            );
            return;
          }
          const start = at;
          at += r.text.length;
          for (const part of splitPiece({ text: r.text, start, kind: 0 }, hls)) {
            const inner = withNames(part.text, part.start, `t${part.start}`);
            if (!part.hl) {
              out.push(...inner);
              continue;
            }
            const ink = inkOf(part.hls);
            out.push(
              <mark key={`m${part.start}`} className={cn("hl", fresh === part.hl.id && "fresh")} data-hid={part.hl.id} data-c={part.hl.color} style={ink ? ({ "--hl": ink } as CSSProperties) : undefined}>
                {inner}
              </mark>,
            );
          }
        });
        at += 1; // (the line between paragraphs)
        return <p key={pi}>{out}</p>;
      })}
    </>
  );
}

/** "ﷺ" in the Arabic letters it is written in (the reading face has no such sign). */
export function honour(text: string): ReactNode {
  if (!text.includes("ﷺ")) return text;
  return text.split("ﷺ").flatMap((t, i) => (i ? [<span key={i} className="s-saw">ﷺ</span>, t] : [t]));
}

/* ── the ambience of a mood ─────────────────────────────────── */

/** What the air of a page is like: stars at night, dunes in the desert, sparks over the embers. */
function Ambience({ mood }: { mood: Mood }) {
  const seeds = useMemo(() => {
    let x = 11;
    const r = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: 90 }, () => [r(), r(), r(), r()]);
  }, []);
  if (mood === "night")
    return (
      <div className="s-amb" aria-hidden>
        {seeds.map(([a, b, c, d], i) => (
          <span key={i} className="s-star" style={{ left: `${a * 100}%`, top: `${b * b * 75}%`, opacity: 0.3, transform: `scale(${0.5 + c * 1.2})`, animationDuration: `${2 + d * 4}s`, animationDelay: `${-d * 5}s` }} />
        ))}
      </div>
    );
  if (mood === "ember")
    return (
      <div className="s-amb" aria-hidden>
        {seeds.slice(0, 26).map(([a, b, c, d], i) => (
          <span key={i} className="s-spark" style={{ left: `${a * 100}%`, animationDuration: `${7 + b * 9}s`, animationDelay: `${-c * 14}s`, ["--drift" as string]: `${(d - 0.5) * 120}px`, opacity: 0.6 }} />
        ))}
      </div>
    );
  if (mood === "sand" || mood === "dusk")
    return (
      <svg className="s-amb s-dunes" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <path d="M0 720 C 240 650 420 690 640 676 S 1060 600 1300 650 S 1520 690 1600 670 V900 H0Z" fill="var(--s-accent)" opacity={mood === "sand" ? 0.07 : 0.14} />
        <path className="ridge" d="M0 720 C 240 650 420 690 640 676 S 1060 600 1300 650 S 1520 690 1600 670" />
        <path d="M0 810 C 300 760 560 800 860 780 S 1340 740 1600 790 V900 H0Z" fill="var(--s-ink)" opacity={mood === "sand" ? 0.05 : 0.25} />
      </svg>
    );
  if (mood === "oasis")
    return (
      <svg className="s-amb" viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMax slice" aria-hidden style={{ opacity: 0.16 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d="M1600 900 Q 1400 640 1180 600 Q 1400 690 1600 870" fill="var(--s-accent)" transform={`rotate(${-62 + i * 13} 1600 900)`} />
        ))}
      </svg>
    );
  if (mood === "parchment" || mood === "white" || mood === "dawn")
    return (
      <svg className="s-amb" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ opacity: 0.08, color: "var(--s-ink)" }}>
        <g fill="none" stroke="currentColor" strokeWidth="0.25" transform="translate(52 10) scale(0.9)">
          <rect x="-62" y="-62" width="124" height="124" />
          <rect x="-62" y="-62" width="124" height="124" transform="rotate(45)" />
          <circle r="38" />
          <circle r="86" strokeDasharray="0.6 1.6" />
        </g>
      </svg>
    );
  return null;
}

/* ── what a section is drawn as ─────────────────────────────── */

function Ledger({ items }: { items: [string, string][] }) {
  return (
    <motion.ol className="s-ledger" variants={stagger} initial="hidden" animate="show">
      {items.map(([k, v], i) => (
        <motion.li key={k + i} variants={rise}>
          <span className="s-ledger-n">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <b>{honour(k)}</b>
            {v && <span>{honour(v)}</span>}
          </span>
        </motion.li>
      ))}
    </motion.ol>
  );
}

/** People named in a list, each (when the Seerah tells of them) a way to their own card. */
function People({ items, people, onPerson }: { items: [string, string][]; people: Map<string, Person>; onPerson: (id: string) => void }) {
  // (a name as listed, to a person: their name or another they are known by)
  const idOf = (name: string) => {
    const n = name.trim().toLowerCase();
    for (const [id, p] of people) if ([p.name, ...p.also].some((x) => x.toLowerCase() === n)) return id;
    return null;
  };
  return (
    <motion.ul className="s-people" variants={stagger} initial="hidden" animate="show">
      {items.map(([k, v]) => {
        const id = idOf(k);
        return (
          <motion.li key={k} variants={rise}>
            {id ? (
              <button type="button" className="s-people-name" onClick={() => onPerson(id)} title={`Read about ${k}`}>
                {honour(k)}
              </button>
            ) : (
              <b>{honour(k)}</b>
            )}
            <span>{honour(v)}</span>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

/**
 * Where a column of words too long for the page is, in place of the browser's bar: a hairline at its
 * edge, the part in view drawn on it; and while more is below, a mark to go on (a tap turns it by most
 * of its height). On a phone, the same hairline for the whole page.
 */
export function ScrollCue({ box, page }: { box: RefObject<HTMLDivElement | null>; page?: boolean }) {
  const [st, setSt] = useState({ top: 0, size: 1, more: false });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => {
      const size = el.clientHeight / Math.max(1, el.scrollHeight);
      setSt({ top: el.scrollTop / Math.max(1, el.scrollHeight), size, more: el.scrollTop + el.clientHeight < el.scrollHeight - 8 });
    };
    on();
    el.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", on);
      ro.disconnect();
    };
  }, [box]);
  if (st.size >= 0.995) return null;
  return (
    <div className={cn("s-cue", page && "is-page")} aria-hidden={page}>
      <span className="s-cue-track">
        <span className="s-cue-thumb" style={{ top: `${st.top * 100}%`, height: `${st.size * 100}%` }} />
      </span>
      {!page && (
        <button type="button" className={cn("s-cue-more", !st.more && "is-done")} onClick={() => box.current?.scrollBy({ top: box.current.clientHeight * 0.75, behavior: "smooth" })} aria-label="Read on">
          <ChevronDown size={14} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

/** A lineage as a thread drawn down through its names, the last of them lit. */
function Lineage({ names }: { names: string[] }) {
  return (
    <div className="s-lineage w-full">
      <motion.ol variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.6 } } }} initial="hidden" animate="show">
        {names.map((nm, i) => (
          <motion.li
            key={i}
            className={cn(nm === "…" && "is-gap", i === names.length - 1 && "is-last", i % 2 ? "is-r" : "is-l")}
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
          >
            <i />
            <span>{nm === "…" ? "generations" : honour(nm)}</span>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}

function BigQuote({ q }: { q: { text: string; who?: string } }) {
  return (
    <div className="s-quote w-full max-w-[640px]">
      <motion.div className="s-quote-mark" aria-hidden initial={{ opacity: 0, y: 30 }} animate={{ opacity: 0.85, y: 0 }} transition={{ duration: 1.2, delay: 0.3, ease: EASE }}>
        “
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.6, ease: EASE }}>
        {honour(q.text)}
      </motion.p>
      {q.who && (
        <motion.cite initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.2 }}>
          {honour(q.who)}
        </motion.cite>
      )}
    </div>
  );
}

/**
 * The Ka'bah as Quraish rebuilt it, seen from above, north at the top: its corners toward the four
 * quarters, walls of ten and twelve metres, the Black Stone at the eastern corner, the door raised in
 * the north-eastern wall, and the Hijr outside the north-western wall, left out of the building.
 */
function KabahPlan() {
  const k = Math.SQRT1_2, M = 13; // (a metre, in the drawing's units)
  const N: [number, number] = [0, 0];
  const E: [number, number] = [N[0] + 12 * M * k, N[1] + 12 * M * k];
  const S: [number, number] = [E[0] - 10 * M * k, E[1] + 10 * M * k];
  const W: [number, number] = [N[0] - 10 * M * k, N[1] + 10 * M * k];
  const pt = (p: [number, number]) => p.join(",");
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const door = [lerp(N, E, 0.62), lerp(N, E, 0.8)];
  const h0 = lerp(W, N, 0.06), h1 = lerp(W, N, 0.94), mid = lerp(W, N, 0.5);
  const out: [number, number] = [-M * 8.5 * k, -M * 8.5 * k];
  const hijr = `M${pt(h0)} C${pt([h0[0] + out[0] * 0.9, h0[1] + out[1] * 0.9])} ${pt([mid[0] + out[0] * 1.32 - 30, mid[1] + out[1] * 1.32 + 30])} ${pt([mid[0] + out[0] * 1.32, mid[1] + out[1] * 1.32])} S${pt([h1[0] + out[0] * 0.9, h1[1] + out[1] * 0.9])} ${pt(h1)}`;
  const label = (a: [number, number], b: [number, number], text: string, off: number) => {
    const m = lerp(a, b, 0.5), ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny);
    const x = m[0] + (nx / l) * off, y = m[1] + (ny / l) * off;
    const turn = ang > 90 || ang < -90 ? ang + 180 : ang;
    return (
      <text x={x} y={y} transform={`rotate(${turn} ${x} ${y})`} textAnchor="middle" className="kabah-dim">
        {text}
      </text>
    );
  };
  return (
    <div className="s-kabah w-full max-w-[560px]">
      <svg viewBox="-190 -150 400 420" role="img" aria-label="The Ka'bah from above, as Quraish rebuilt it">
        <motion.path d={hijr} className="kabah-hijr" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.9 }} />
        <text x={mid[0] + out[0] * 0.78} y={mid[1] + out[1] * 0.78} textAnchor="middle" className="kabah-note">
          Al-Hijr
        </text>
        <motion.polygon points={[N, E, S, W].map(pt).join(" ")} className="kabah-walls" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.5 }} style={{ transformOrigin: "40px 110px" }} />
        <line x1={door[0][0]} y1={door[0][1]} x2={door[1][0]} y2={door[1][1]} className="kabah-door" />
        <circle cx={E[0]} cy={E[1]} r="5" className="kabah-stone" />
        {label(N, E, "12 m", -12)}
        {label(E, S, "10 m", -12)}
        {label(S, W, "12 m", -12)}
        {label(W, N, "10 m", -12)}
        <text x={E[0] + 10} y={E[1] + 4} className="kabah-note">
          The Black Stone
        </text>
        <text x={lerp(door[0], door[1], 0.5)[0] + 12} y={lerp(door[0], door[1], 0.5)[1] - 8} className="kabah-note">
          The door, raised
        </text>
      </svg>
    </div>
  );
}
