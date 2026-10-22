import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Part, Person, Slide } from "./data";

/** The kinds of things the Seerah tells of, to read by (a section's tags). */
export const TAGS: Record<string, string> = {
  battles: "Battles and expeditions",
  treaties: "Treaties and pledges",
  journeys: "Journeys and migrations",
  revelation: "Revelation and the Qur'an",
  family: "His family",
  companions: "His companions",
  signs: "Signs and miracles",
  faith: "Faith and worship",
  society: "Society and law",
  character: "His character",
  makkah: "Makkah and the Ka'bah",
  madinah: "Madinah",
  letters: "Letters and delegations",
  kingdoms: "Kings and empires",
  people: "Peoples and tribes",
  places: "Lands and places",
  prophets: "The prophets before",
};
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

/**
 * The Seerah's index, laid over it like the back of a book: its parts and their sections; its people,
 * each by their name in Arabic letters; the same sections by what they tell of; and the sections the
 * reader has marked. A word typed finds sections by their names, years, places and words.
 */
export function Index({ open, startTab = "contents", onClose, parts, people, slides, at, onGo, onPerson }: { open: boolean; startTab?: "contents" | "people" | "themes" | "yours"; onClose: () => void; parts: Part[]; people: Person[]; slides: Slide[]; at: number; onGo: (i: number) => void; onPerson: (id: string) => void }) {
  const [tab, setTab] = useState<"contents" | "people" | "themes" | "yours">("contents");
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (open) setTab(startTab);
  }, [open, startTab]);
  const [q, setQ] = useState("");
  const index = useMemo(() => new Map(slides.map((s, i) => [s.id, i])), [slides]);
  const cur = slides[at];
  const highlights = useStore((s) => s.highlights);
  const notes = useStore((s) => s.notes);
  const windows = useStore((s) => s.windows);
  const yours = useMemo(() => {
    const n = new Map<string, number>();
    const add = (key: string) => key.startsWith("seerah:") && n.set(key.slice(7), (n.get(key.slice(7)) ?? 0) + 1);
    Object.values(highlights).forEach((x) => add(x.key));
    Object.values(notes).forEach((x) => add(x.key));
    Object.values(windows).forEach((x) => add(x.key));
    return n;
  }, [highlights, notes, windows]);
  const tags = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of parts) for (const s of p.sections) for (const t of s.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1);
    return Object.keys(TAGS).filter((t) => c.has(t)).map((t) => ({ t, n: c.get(t)! }));
  }, [parts]);
  const w = q.trim().toLowerCase();
  const found = w ? parts.flatMap((p) => p.sections.filter((s) => [s.title, s.when, s.place, ...s.body].join(" ").toLowerCase().includes(w))) : null;
  const foundPeople = w ? people.filter((p) => [p.name, p.ar, p.role, ...p.also].join(" ").toLowerCase().includes(w)) : null;
  const go = (id: string) => {
    const i = index.get(id);
    if (i !== undefined) onGo(i);
    onClose();
  };
  const row = (s: Part["sections"][number], extra?: string) => (
    <button key={s.id} type="button" onClick={() => go(s.id)} className={cn("s-row", cur?.id === s.id && "is-on")}>
      <span className="t">{s.title}</span>
      <span className="w">{extra ?? s.when}</span>
    </button>
  );
  const faces = (list: Person[]) => (
    <div className="s-faces">
      {list.map((p) => (
        <button key={p.id} type="button" className="s-face" onClick={() => onPerson(p.id)}>
          {p.ar && (
            <span className="ar" dir="rtl" lang="ar">
              {p.ar}
            </span>
          )}
          <span className="nm">{p.name}</span>
          {p.role && <span className="rl">{p.role}</span>}
        </button>
      ))}
    </div>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="s-index" initial={{ opacity: 0, y: "4%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "3%" }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-label="The Seerah's index">
          <div className="s-index-head">
            <div className="flex items-baseline gap-4">
              <span style={{ fontFamily: "Aref Ruqaa, serif", fontSize: 32, color: "#8a2a1d", lineHeight: 1 }}>الفهرس</span>
              <div className="s-tabs">
                {(["contents", "people", "themes", "yours"] as const).map((t) => (
                  <button key={t} type="button" className={cn(tab === t && "is-on")} onClick={() => setTab(t)}>
                    {{ contents: "Contents", people: "People", themes: "Themes", yours: "Yours" }[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="s-find">
                <Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="A name, a year, a place" aria-label="Find in the Seerah" />
              </label>
              <button type="button" onClick={onClose} aria-label="Close the index" className="flex h-10 w-10 items-center justify-center text-black/50 hover:text-black">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="s-index-body" data-scroll>
            {found ? (
              <>
                {foundPeople && foundPeople.length > 0 && faces(foundPeople)}
                <div className="mt-6">{found.length ? found.map((s) => row(s)) : <p className="py-6 italic text-black/50">No section speaks of that.</p>}</div>
              </>
            ) : tab === "contents" ? (
              <div className="s-parts">
                {parts.map((p, pi) => (
                  <div key={p.id}>
                    <button type="button" className="s-part-h w-full text-left" onClick={() => go(`part:${p.id}`)}>
                      <span className="n">{ROMAN[pi]}</span>
                      <span className="t">{p.title}</span>
                      {p.ar && (
                        <span className="ar" dir="rtl" lang="ar">
                          {p.ar}
                        </span>
                      )}
                    </button>
                    {p.sections.map((s) => row(s))}
                  </div>
                ))}
              </div>
            ) : tab === "people" ? (
              faces(people)
            ) : tab === "themes" ? (
              <>
                <div className="s-chips">
                  {tags.map(({ t, n }) => (
                    <button key={t} type="button" className={cn("s-chip", tag === t && "is-on")} onClick={() => setTag(tag === t ? null : t)}>
                      {TAGS[t]}
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
                {tag && parts.flatMap((p) => p.sections.filter((s) => s.tags?.includes(tag))).map((s) => row(s))}
              </>
            ) : yours.size ? (
              parts.flatMap((p) => p.sections.filter((s) => yours.has(s.id))).map((s) => row(s, `${yours.get(s.id)} marked`))
            ) : (
              <p className="py-8 text-[18px] italic text-black/55">Your highlights, notes and the ayahs you bring up beside the Seerah will be gathered here.</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
