import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImmersivePanel, Reveal } from "@/components/ImmersivePanel";
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, useStore, type HighlightColor, type Settings } from "@/lib/store";
import { FolderPicker } from "./Folders";
import { BookOpen, Bookmark, Compass, FolderPlus, Languages, Palette, Target, Volume2, X, type LucideIcon } from "lucide-react";
import { useUI } from "@/lib/ui";
import { ProgressTab } from "./Progress";
import { APPEARANCES } from "@/lib/themes";
import { GuideTab } from "./Guide";
import type { Surah, Translation, Verse } from "@/lib/data";
import { TRANSLATIONS, loadSurah, translationText } from "@/lib/data";
import { EASE_OUT, cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { nameMarks } from "@/lib/names";
import { RECITERS } from "@/lib/recite";

type Tab = "reading" | "translation" | "display" | "sound" | "saved" | "progress" | "guide";
const TABS: { id: Tab; name: string; icon: LucideIcon }[] = [
  { id: "reading", name: "Reading", icon: BookOpen },
  { id: "translation", name: "Translation", icon: Languages },
  { id: "display", name: "Display", icon: Palette },
  { id: "sound", name: "Sound", icon: Volume2 },
  { id: "saved", name: "Saved", icon: Bookmark },
  { id: "progress", name: "Progress", icon: Target },
  { id: "guide", name: "Guide", icon: Compass },
];

export function SettingsPanel({
  open,
  startTab,
  onClose,
  surahs,
  onGo,
  mobile,
}: {
  open: boolean;
  startTab?: Tab; // opened for one section (Saved, from the header)
  onClose: () => void;
  surahs: Surah[];
  onGo: (s: number, a: number) => void;
  mobile: boolean;
}) {
  const [tab, setTab] = useState<Tab>("reading");
  useEffect(() => {
    if (open && startTab) setTab(startTab);
  }, [open, startTab]);
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);

  return (
    <ImmersivePanel open={open} from="left" onClose={onClose} label="Settings">
      <div className="flex h-full flex-col">
        <div className="flex h-[64px] shrink-0 items-center justify-between gap-3 px-4 md:h-[76px] md:px-6">
          <Reveal>
            <div className="text-[20px] font-semibold leading-tight tracking-[-0.02em] md:text-[22px]">Settings</div>
            <button type="button" onClick={() => useUI.getState().setAbout(true)} className="text-[12.5px] text-[var(--box-muted)] underline decoration-[var(--box-line)] underline-offset-4 transition-colors hover:text-[var(--box-fg)] hover:decoration-current">
              About this reader
            </button>
          </Reveal>
          <button type="button" onClick={onClose} aria-label="Close settings" className={cn("circle-btn", mobile && "is-md")}>
            <X size={18} strokeWidth={1.9} />
          </button>
        </div>

        <div className={cn("flex min-h-0 flex-1 gap-3 px-3 pb-3 md:gap-5 md:px-5 md:pb-5", mobile && "flex-col")}>
          <nav className={cn("shrink-0", mobile ? "no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1" : "card flex w-[230px] flex-col gap-1 self-start p-2")} aria-label="Settings sections">
            {TABS.map((t) => {
              const on = tab === t.id;
              const Icon = t.icon;
              return mobile ? (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={on} className={cn("chip", on && "is-on")}>
                  <Icon size={15} strokeWidth={1.9} />
                  {t.name}
                </button>
              ) : (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={on}
                  className={cn("press-soft relative flex h-12 items-center gap-3 rounded-2xl px-4 text-left text-[15px] transition-colors duration-150", on ? "text-[var(--box-bg-solid)]" : "text-[var(--box-muted)] hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]")}
                >
                  {on && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-2xl bg-[var(--box-fg)]" transition={{ duration: 0.22, ease: EASE_OUT }} />}
                  <Icon size={18} strokeWidth={1.8} className="relative" />
                  <span className="relative">{t.name}</span>
                </button>
              );
            })}
          </nav>

          <Reveal className="thin-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--r-card)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="settings-cards flex max-w-[880px] flex-col gap-2.5"
              >
                {tab === "reading" && <ReadingTab s={settings} set={set} />}
                {tab === "translation" && <TranslationTab s={settings} set={set} />}
                {tab === "display" && <DisplayTab s={settings} set={set} />}
                {tab === "sound" && <SoundTab s={settings} set={set} />}
                {tab === "saved" && <SavedTab surahs={surahs} onGo={onGo} />}
                {tab === "progress" && <ProgressTab surahs={surahs} onGo={onGo} />}
                {tab === "guide" && <GuideTab />}
              </motion.div>
            </AnimatePresence>
          </Reveal>
        </div>
      </div>
    </ImmersivePanel>
  );
}

type TabProps = { s: Settings; set: (p: Partial<Settings>) => void };

function ReadingTab({ s, set }: TabProps) {
  return (
    <>
      <Row label="Show">
        <Segmented
          value={s.readingMode}
          onChange={(v) => set({ readingMode: v })}
          options={[
            ["both", "Arabic + translation", "Both"],
            ["arabic", "Arabic only", "Arabic"],
            ["translation", "Translation only", "Translation"],
          ]}
        />
      </Row>
      {s.readingMode !== "both" && (
        <Row label="Layout" hint="With multiple ayahs">
          <Segmented value={s.book ? "book" : "ayahs"} onChange={(v) => set({ book: v === "book" })} options={[["ayahs", "Ayah by ayah"], ["book", "As a book"]]} />
        </Row>
      )}
      {s.readingMode === "translation" && s.book && (
        <Toggle
          label="Theme headings in the book"
          on={s.bookThemes}
          set={(v) => set({ bookThemes: v })}
        />
      )}
      {s.readingMode === "arabic" && s.book && (
        <Toggle
          label="Lines as the printed mushaf"
          hint="Each line as the Madani mushaf prints it, the size fitted to them. Choosing an Arabic size of your own lets the lines run free."
          on={s.bookLines}
          set={(v) => set({ bookLines: v })}
        />
      )}
      <Row label="View">
        <Segmented value={String(s.view) as "1" | "3"} onChange={(v) => set({ view: Number(v) as 1 | 3 })} options={[["1", "One ayah"], ["3", "Multiple ayahs"]]} />
      </Row>
      <Row label="Arabic script">
        <Segmented
          value={s.script}
          onChange={(v) => set({ script: v })}
          options={[
            ["uthmani", "Madani"],
            ["indopak", "Indo-Pak"],
          ]}
        />
      </Row>
      <Row label="Reciter" hint="Heard from the play button beside each ayah">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reciter">
          {RECITERS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={s.reciter === x.id}
              onClick={() => set({ reciter: x.id })}
              className={cn("chip h-9 px-3.5 text-[13px]", s.reciter === x.id && "is-on")}
            >
              {x.name}
            </button>
          ))}
        </div>
      </Row>
      <Toggle label="Transliteration" hint="Each ayah in Latin letters, under its Arabic" on={s.translitLine} set={(v) => set({ translitLine: v })} />
      <Toggle label="Word meanings on hover" on={s.wordHover} set={(v) => set({ wordHover: v })} />
      <Toggle label="Transliteration in word meanings" on={s.translit} set={(v) => set({ translit: v })} />
      <Toggle label="Context in Quraan Made Easy" hint="The explanations in brackets" on={s.showContext} set={(v) => set({ showContext: v })} />
    </>
  );
}

// one short ayah to compare the translations by (Al-Fātiĥah 1:5), the same wherever the panel opens,
// so the three fit in view without scrolling
const SAMPLE = { surah: 1, ayah: 5 };
let sampleVerse: Promise<Verse | undefined> | null = null;

function TranslationTab({ s, set }: TabProps) {
  const [verse, setVerse] = useState<Verse | null>(null);
  useEffect(() => {
    let alive = true;
    sampleVerse ??= loadSurah(SAMPLE.surah).then((d) => d.v[SAMPLE.ayah - 1]);
    sampleVerse.then((v) => alive && v && setVerse(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // the main translation, then up to two more shown under it, in the order they were added
  const shown: Translation[] = [s.translation, ...s.also.filter((t) => t !== s.translation)].slice(0, 3);
  const show = (t: Translation) => set({ also: [...s.also.filter((x) => x !== t && x !== s.translation), t].slice(0, 2) });
  const hide = (t: Translation) => set({ also: s.also.filter((x) => x !== t) });
  const makeMain = (t: Translation) => set({ translation: t, also: [s.translation, ...s.also.filter((x) => x !== t && x !== s.translation)].slice(0, 2) });
  return (
    <div className="flex flex-col gap-3 md:gap-5">
      {/* (on a phone the cards' own labels say it, and all three fit in view) */}
      <div className="hidden px-1 text-[13px] text-[var(--box-muted)] md:block">Up to three, one under another.</div>
      {(Object.keys(TRANSLATIONS) as Translation[]).map((t) => {
        const at = shown.indexOf(t);
        const main = at === 0, on = at >= 0;
        const sample = verse ? translationText(verse, t, false) : "";
        return (
          <div
            key={t}
            className={cn("card relative px-4 py-3.5 transition-shadow duration-150 md:px-6 md:py-5", on ? "shadow-[0_0_0_2px_var(--box-fg)]" : "")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[17px] font-semibold tracking-[-0.015em] md:text-[19px]">{TRANSLATIONS[t].name}</span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", main ? "bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : on ? "bg-[color-mix(in_srgb,var(--box-accent)_14%,transparent)] text-[var(--box-accent)]" : "bg-[var(--box-hover)] text-[var(--box-faint)]")}>
                {main ? "Main" : on ? `Also shown · ${at + 1} of ${shown.length}` : "Not shown"}
              </span>
            </div>
            {/* by whom (not when it is the name again: Saheeh International) */}
            {TRANSLATIONS[t].by.toLowerCase() !== TRANSLATIONS[t].name.toLowerCase() && <div className="label-sm mt-0.5 text-[var(--box-faint)] md:mt-1">{TRANSLATIONS[t].by}</div>}
            {sample && (
              <p className="mt-1.5 font-serif text-[14.5px] leading-snug text-[var(--box-muted)] md:mt-3 md:text-[15px] md:leading-relaxed">
                <span className="label-sm mr-2 text-[var(--box-faint)]">{SAMPLE.surah}:{SAMPLE.ayah}</span>
                {sample}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 md:mt-3">
              {!main && (
                <button type="button" onClick={() => makeMain(t)} className="chip h-9 px-3.5 text-[13px]">
                  Make main
                </button>
              )}
              {!main && !on && (
                <button type="button" onClick={() => show(t)} className="chip h-9 px-3.5 text-[13px]">
                  Also show
                </button>
              )}
              {!main && on && (
                <button type="button" onClick={() => hide(t)} className="chip h-9 px-3.5 text-[13px]">
                  Hide
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DisplayTab({ s, set }: TabProps) {
  return (
    <>
      <Row label="Arabic size" inline>
        <Stepper value={s.arabicScale} onChange={(v) => set({ arabicScale: v })} />
      </Row>
      <Row label="Translation size" inline>
        <Stepper value={s.transScale} onChange={(v) => set({ transScale: v })} />
      </Row>
      <Row label="Appearance">
        <Segmented value={s.appearance} onChange={(v) => set({ appearance: v as Settings["appearance"] })} options={APPEARANCES} />
      </Row>
      <Toggle label="Ayah slider" on={s.slider} set={(v) => set({ slider: v })} />
      <Toggle label="Film grain" on={s.grain} set={(v) => set({ grain: v })} />
      <Toggle label="Reduce motion" on={s.reduceMotion} set={(v) => set({ reduceMotion: v })} />
    </>
  );
}

function SoundTab({ s, set }: TabProps) {
  const off = !s.sound;
  return (
    <>
      <Toggle label="Sounds" hint="Quiet sounds as you use the reader. Each kind can be turned off below." on={s.sound} set={(v) => set({ sound: v })} />
      <div className={cn("settings-cards flex flex-col gap-2.5 pl-4 transition-opacity duration-300 md:pl-6", off && "pointer-events-none opacity-40")} aria-disabled={off || undefined}>
        <Toggle label="Taps and switches" hint="Buttons, switches and menus" on={s.soundTaps} set={(v) => set({ soundTaps: v })} />
        <Toggle label="Typing" hint="Writing a note, a reflection or a search" on={s.soundTyping} set={(v) => set({ soundTyping: v })} />
        <Toggle label="Highlighter" hint="The marker drawn across the words" on={s.sounds} set={(v) => set({ sounds: v })} />
        <Toggle label="Ayah slider" hint="A fine click for each ayah as you slide" on={s.soundSlider} set={(v) => set({ soundSlider: v })} />
        <Toggle label="Moving notes" hint="A note picked up and put down" on={s.soundNotes} set={(v) => set({ soundNotes: v })} />
        <Toggle label="Recording" hint="A voice note starting and stopping" on={s.soundRecord} set={(v) => set({ soundRecord: v })} />
        <Toggle label="Completing a surah" hint="A soft chime when you mark one as completed" on={s.soundComplete} set={(v) => set({ soundComplete: v })} />
      </div>
    </>
  );
}

type SavedKind = "bookmarks" | "highlights" | "notes" | "voice" | "reflections";
const SAVED_TABS: { id: SavedKind; name: string; empty: string }[] = [
  { id: "bookmarks", name: "Bookmarks", empty: "No bookmarks yet." },
  { id: "highlights", name: "Highlights", empty: "No highlights yet." },
  { id: "notes", name: "Notes", empty: "No notes yet." },
  { id: "voice", name: "Voice notes", empty: "No voice notes yet." },
  { id: "reflections", name: "Reflections", empty: "No reflections yet." },
];

type SavedRow = { id: string; surah: number; ayah: number; ref: string; text: string; style: "serif" | "arabic" | "hand" | "mono"; swatch?: string; sub?: string };

function SavedTab({ surahs, onGo }: { surahs: Surah[]; onGo: (s: number, a: number) => void }) {
  const bookmarks = useStore((s) => s.bookmarks);
  const highlights = useStore((s) => s.highlights);
  const notes = useStore((s) => s.notes);
  const reflections = useStore((s) => s.reflections);
  const folders = useStore((s) => s.folders);
  const inFolders = useStore((s) => s.inFolders);
  const clearAll = useStore((s) => s.clearAll);
  const [kind, setKind] = useState<SavedKind>("bookmarks");
  const [confirm, setConfirm] = useState(false);
  const [hlColor, setHlColor] = useState<HighlightColor | "all">("all"); // highlights of one colour
  const [folder, setFolder] = useState<string>("all"); // bookmarks of one folder
  const [filing, setFiling] = useState<string | null>(null); // the bookmark whose folders are open
  const folderList = Object.values(folders).sort((a, b) => a.at - b.at);
  const curFolder = folder !== "all" ? folders[folder] : undefined;
  useEffect(() => {
    if (folder !== "all" && !folders[folder]) setFolder("all");
  }, [folder, folders]);

  const split = (k: string) => k.split(":").map(Number) as [number, number];
  const rows: Record<SavedKind, SavedRow[]> = {
    bookmarks: Object.entries(bookmarks)
      .sort((a, b) => b[1] - a[1])
      .map(([k, at]) => {
        const [s, a] = split(k);
        const names = (inFolders[k] ?? []).map((id) => folders[id]?.name).filter(Boolean);
        return { id: k, surah: s, ayah: a, ref: k, text: `Ayah ${a}`, style: "serif", sub: names.length ? names.join(" · ") : new Date(at).toLocaleDateString() };
      }),
    highlights: Object.values(highlights)
      .filter((h) => !h.key.startsWith("seerah:"))
      .sort((a, b) => b.at - a.at)
      .map((h) => {
        const [s, a] = split(h.key);
        return { id: h.id, surah: s, ayah: a, ref: h.key, text: h.text, style: h.field === "ar" ? "arabic" : "serif", swatch: h.color };
      }),
    notes: Object.values(notes)
      .filter((n) => n.kind !== "voice" && !n.key.startsWith("seerah:"))
      .sort((a, b) => b.at - a.at)
      .map((n) => {
        const [s, a] = split(n.key);
        return { id: n.id, surah: s, ayah: a, ref: n.key, text: n.text || (n.quote ? `“${n.quote}”` : "Empty note"), style: "hand" };
      }),
    voice: Object.values(notes)
      .filter((n) => n.kind === "voice" && !n.key.startsWith("seerah:"))
      .sort((a, b) => b.at - a.at)
      .map((n) => {
        const [s, a] = split(n.key);
        const d = n.dur ?? 0;
        return { id: n.id, surah: s, ayah: a, ref: n.key, text: `Voice note · ${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`, style: "serif", sub: new Date(n.at).toLocaleDateString() };
      }),
    reflections: Object.entries(reflections)
      .filter(([, r]) => r.summary || r.lessons || r.recordings.length)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([s, r]) => ({
        id: s,
        surah: Number(s),
        ayah: 1,
        ref: s,
        text: r.summary || r.lessons || `${r.recordings.length} recording${r.recordings.length === 1 ? "" : "s"}`,
        style: "serif",
        sub: r.recordings.length ? `${r.recordings.length} voice` : undefined,
      })),
  };

  // the list shown: one colour of highlight, one folder of bookmarks, or all of them
  let list = rows[kind];
  if (kind === "highlights" && hlColor !== "all") list = list.filter((r) => r.swatch === hlColor);
  if (kind === "bookmarks" && curFolder) list = list.filter((r) => (inFolders[r.id] ?? []).includes(curFolder.id));
  // grouped by surah, in reading order
  const groups = new Map<number, SavedRow[]>();
  [...list].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah).forEach((r) => groups.set(r.surah, [...(groups.get(r.surah) ?? []), r]));
  const tab = SAVED_TABS.find((t) => t.id === kind)!;
  const total = Object.values(rows).reduce((n, r) => n + r.length, 0);
  const empty =
    kind === "highlights" && hlColor !== "all" && rows.highlights.length
      ? `No ${hlColor} highlights yet.`
      : kind === "bookmarks" && curFolder && rows.bookmarks.length
        ? `Nothing in ${curFolder.name} yet. Bookmark an ayah and choose this folder, or use Folders beside a bookmark below All.`
        : tab.empty;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {SAVED_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setKind(t.id)}
            aria-pressed={kind === t.id}
            className={cn("chip h-10 px-4", kind === t.id && "is-on")}
          >
            {t.name}
            <span className={cn("text-[12px] tabular-nums", kind === t.id ? "opacity-70" : "text-[var(--box-faint)]")}>{rows[t.id].length}</span>
          </button>
        ))}
      </div>

      {/* highlights: all of them, or one colour */}
      {kind === "highlights" && rows.highlights.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Highlight colour">
          <FilterChip on={hlColor === "all"} onClick={() => setHlColor("all")} count={rows.highlights.length}>
            All
          </FilterChip>
          {HIGHLIGHT_COLORS.map((c) => {
            const n = rows.highlights.filter((r) => r.swatch === c).length;
            return (
              <FilterChip key={c} on={hlColor === c} onClick={() => setHlColor(c)} count={n} dim={!n} label={`${c} highlights`}>
                <span className={cn("block h-3.5 w-3.5 rounded-full", hlColor !== c && "swatch-edge")} style={{ background: HIGHLIGHT_HEX[c] }} />
              </FilterChip>
            );
          })}
        </div>
      )}

      {/* bookmarks: All, and the reader's own folders */}
      {kind === "bookmarks" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bookmark folders">
            <FilterChip on={folder === "all"} onClick={() => setFolder("all")} count={rows.bookmarks.length}>
              All
            </FilterChip>
            {folderList.map((f) => (
              <FilterChip key={f.id} on={folder === f.id} onClick={() => setFolder(f.id)} count={rows.bookmarks.filter((r) => (inFolders[r.id] ?? []).includes(f.id)).length}>
                {f.name}
              </FilterChip>
            ))}
            <NewFolder onMade={(id) => setFolder(id)} />
          </div>
          {curFolder && <FolderTools key={curFolder.id} id={curFolder.id} name={curFolder.name} />}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card px-5 py-10 text-center text-[14px] text-[var(--box-muted)]">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {[...groups.entries()].map(([s, items]) => (
            <div key={s} className="card px-2 pb-2 pt-4 md:px-3">
              <div className="mb-1.5 flex items-baseline gap-2.5 px-3">
                <span className="text-[12px] text-[var(--box-faint)] tabular-nums">{String(s).padStart(3, "0")}</span>
                <span className="text-[16px] font-semibold tracking-[-0.015em]">{nameMarks(surahs[s - 1]?.tc)}</span>
                <span className="font-kufi text-[13px] text-[var(--box-faint)]" dir="rtl">
                  {surahs[s - 1]?.ar}
                </span>
                <span className="label-sm ml-auto text-[var(--box-faint)]">{items.length}</span>
              </div>
              <div className="flex flex-col">
                {items.map((r) => (
                  <div key={r.id}>
                    <div className="group flex items-baseline gap-3 rounded-2xl px-3 transition-colors hover:bg-[var(--box-hover)]">
                      <button type="button" onClick={() => onGo(r.surah, r.ayah)} className="flex min-w-0 flex-1 items-baseline gap-3 py-2.5 text-left">
                        <span className="w-[4.5ch] shrink-0 text-[12px] text-[var(--box-faint)] tabular-nums">{kind === "reflections" ? "—" : r.ayah}</span>
                        {r.swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HIGHLIGHT_HEX[r.swatch as HighlightColor] }} />}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            r.style === "arabic" ? "quran text-right text-[18px]" : r.style === "hand" ? "font-hand text-[19px]" : "font-serif text-[15px]",
                          )}
                        >
                          {r.text}
                        </span>
                        {r.sub && <span className="label-sm max-w-[40%] shrink-0 truncate text-[var(--box-faint)]">{r.sub}</span>}
                        <span className="label-sm shrink-0 text-[var(--box-faint)] opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
                      </button>
                      {kind === "bookmarks" && (
                        <button
                          type="button"
                          onClick={() => setFiling((f) => (f === r.id ? null : r.id))}
                          aria-expanded={filing === r.id}
                          title="Choose its folders"
                          className={cn("label-sm shrink-0 px-1.5 py-2 transition-colors", filing === r.id ? "text-[var(--box-fg)]" : "text-[var(--box-faint)] hover:text-[var(--box-fg)]")}
                        >
                          Folders
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {filing === r.id && (
                        <motion.div
                          className="overflow-hidden"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE_OUT }}
                        >
                          <div className="mb-2 ml-[4.5ch] border-l border-[var(--box-line)] pl-2">
                            <FolderPicker bkey={r.id} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 px-1 pt-2">
        <span className="text-[12.5px] text-[var(--box-faint)]">{total} saved</span>
        <button
          type="button"
          onClick={() => (confirm ? (clearAll(), setConfirm(false)) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className={cn("chip h-10 px-4 text-[13px]", confirm && "border-[#e0563b] bg-[#e0563b] text-white")}
        >
          {confirm ? "Press again to delete everything" : "Delete all saved items"}
        </button>
      </div>
    </>
  );
}

function FilterChip({ on, onClick, count, dim, label, children }: { on: boolean; onClick: () => void; count: number; dim?: boolean; label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn("chip h-9 gap-2 px-3 text-[13px]", on && "is-on", dim && !on && "opacity-50")}
    >
      {children}
      <span className={cn("text-[11.5px] tabular-nums", on ? "opacity-70" : "text-[var(--box-faint)]")}>{count}</span>
    </button>
  );
}

/** "+ Folder": a name, then the new folder is the one shown. */
function NewFolder({ onMade }: { onMade: (id: string) => void }) {
  const addFolder = useStore((s) => s.addFolder);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const done = () => {
    if (name.trim()) onMade(addFolder(name));
    setName("");
    setOpen(false);
  };
  return open ? (
    <form
      className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--box-fg)] bg-[var(--surface)] pl-3.5 pr-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setName(""), setOpen(false))}
        placeholder="Folder name"
        maxLength={40}
        className="w-[13ch] bg-transparent text-[12.5px] text-[var(--box-fg)] outline-none placeholder:text-[var(--box-faint)]"
      />
      <button type="submit" className="label-sm px-1 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
        Add
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="chip h-9 gap-1.5 border-dashed px-3 text-[13px]"
    >
      <FolderPlus size={14} strokeWidth={1.5} />
      Folder
    </button>
  );
}

/** A folder's own tools: its name changed, or the folder removed (its bookmarks stay under All). */
function FolderTools({ id, name }: { id: string; name: string }) {
  const rename = useStore((s) => s.renameFolder);
  const remove = useStore((s) => s.removeFolder);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name);
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--box-faint)]">
      {edit ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rename(id, v);
            setEdit(false);
          }}
        >
          <input
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            maxLength={40}
            className="border-b border-[var(--box-line)] bg-transparent py-0.5 text-[13px] text-[var(--box-fg)] outline-none focus:border-[var(--color-gold)]"
          />
          <button type="submit" className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
            Save
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setEdit(true)} className="label-sm hover:text-[var(--box-fg)]">
          Rename
        </button>
      )}
      <button
        type="button"
        onClick={() => (sure ? remove(id) : setSure(true))}
        onBlur={() => setSure(false)}
        className={cn("label-sm transition-colors", sure ? "text-[#e0563b]" : "hover:text-[var(--box-fg)]")}
      >
        {sure ? "Press again: the bookmarks stay under All" : "Delete folder"}
      </button>
    </div>
  );
}

/* ── small controls ───────────────────────────────────────────── */

function Row({ label, hint, children, inline }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={cn("card flex gap-3 px-5 py-4", inline ? "items-center justify-between gap-6" : "flex-col items-start")}>
      <div>
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 max-w-[52ch] text-[12.5px] text-[var(--box-muted)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" onClick={() => set(!on)} aria-checked={on} className="card press-soft flex items-center justify-between gap-6 px-5 py-4 text-left">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block max-w-[46ch] text-[12.5px] text-[var(--box-muted)]">{hint}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150", on ? "bg-[var(--box-fg)]" : "bg-[var(--box-line)]")}>
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-[var(--surface)] shadow transition-[left] duration-200 ease-out", on ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.8, 0.9, 1, 1.12, 1.25, 1.4];
  const i = steps.findIndex((s) => Math.abs(s - value) < 0.01);
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--box-hover)] p-1">
      {steps.map((s, k) => (
        <button key={s} type="button" onClick={() => onChange(s)} aria-label={`Size ${k + 1}`} aria-pressed={k === i} className="press flex h-9 w-8 items-end justify-center rounded-full pb-2 hover:bg-[var(--box-hover)]">
          <span className={cn("block w-2 rounded-full transition-colors duration-150", k <= i ? "bg-[var(--box-fg)]" : "bg-[var(--box-line)]")} style={{ height: 6 + k * 3 }} />
        </button>
      ))}
    </div>
  );
}
