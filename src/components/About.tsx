import type { ReactNode } from "react";
import { ImmersivePanel, MenuGlyph, Reveal } from "./ImmersivePanel";

/**
 * About this reader: the books it reads from, and that mistakes are possible. Keep it true to
 * how the site is built (scripts/) when that changes.
 */
export function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImmersivePanel open={open} from="right" onClose={onClose} label="About this reader" className="z-50">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between px-5 pt-4 md:px-8 md:pt-6">
          <Reveal>
            <div className="label text-[var(--box-faint)]">About</div>
          </Reveal>
          <button type="button" onClick={onClose} aria-label="Close" className="pill flex h-9 w-9 items-center justify-center text-[var(--box-fg)] hover:bg-[var(--box-hover)]">
            <MenuGlyph open />
          </button>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6 md:px-8 md:pt-10">
          <div className="mx-auto flex max-w-[600px] flex-col gap-10 md:gap-12">
            <Reveal>
              <h1 className="display font-serif text-[34px] leading-[1.05] italic md:text-[48px]">About this reader</h1>
              <p className="mt-4 font-serif text-[17px] leading-[1.7] text-[var(--box-muted)] md:text-[18px]">
                A quiet place to read the Qur'an: the Arabic with an English meaning beside it, and any word explained at a touch.
              </p>
            </Reveal>

            <Part title="The books it reads from">
              <ul className="flex flex-col gap-4">
                <Book name="Quraan Made Easy" by="Zamzam Publishers, prepared under the supervision of Mufti Afzal Hoosen Elias">
                  The main translation, with its glossary and its introductions to each surah.
                </Book>
                <Book name="Saheeh International" by="the quranproject.org edition" />
                <Book name="The Clear Quran" by="Dr. Mustafa Khattab, the 2017 edition" />
                <Book name="The Arabic" by="the Madani mushaf of the King Fahd Complex, and the Indo-Pak script">
                  Word meanings from quran.com. As a book, the Arabic keeps the lines of the Madani mushaf's 15-line print, as quran.com sets them.
                </Book>
                <Book name="Transliteration" by="alquran.cloud (en.transliteration)" />
              </ul>
              <p className="text-[var(--box-muted)]">The translations were read from PDF copies of these books and checked against them word by word.</p>
            </Part>

            <Part title="Recitation">
              <p>
                Mishary Alafasy and Yasser Al-Dosari as quran.com publishes them, with the moment each word is said. Idrees Abkar, Mansour Al-Salimi
                and Abdullah Al-Khalaf from mp3quran.net, with the moment each ayah begins; within an ayah, the word lit as it is recited is placed by
                the timing of the same words in the first two. Each reciter has all 114 surahs.
              </p>
            </Part>

            <Part title="The pictures">
              <p>Shared ayahs can be laid on old paintings in the public domain, from museums' open collections:</p>
              <ul className="flex flex-col gap-2 text-[16px] text-[var(--box-muted)]">
                <li>Frederic Edwin Church, Twilight in the Wilderness, 1860 · Cleveland Museum of Art</li>
                <li>Arkhip Kuindzhi, Red Sunset on the Dnieper, 1905–08 · The Metropolitan Museum of Art</li>
                <li>Arkhip Kuindzhi, Moonlit Night on the Dnieper, 1880 · State Russian Museum</li>
                <li>Winslow Homer, Early Morning After a Storm at Sea, 1900–02 · Cleveland Museum of Art</li>
                <li>John Constable, Cloud Study, c. 1822 · Yale Center for British Art</li>
                <li>John Constable, Cloud Study, 1822 · Tate</li>
              </ul>
              <p className="text-[var(--box-muted)]">A bird in two of them was painted over. The other backgrounds are painted by the site itself.</p>
            </Part>

            <Part title="Mistakes">
              <p>
                Mistakes are still possible. The print is the authority: if this site and a printed mushaf, or one of these books, disagree, trust
                the print.
              </p>
            </Part>

            <Part title="Feedback">
              <p>
                A mistake you noticed, something that doesn't work, a feature you would like, or any other suggestion: write to{" "}
                <a
                  href="mailto:user.am7378@gmail.com?subject=The%20Qur'an%20reader"
                  className="underline decoration-[var(--box-line)] underline-offset-4 transition-colors hover:text-[var(--color-gold)] hover:decoration-current"
                >
                  user.am7378@gmail.com
                </a>
                .
              </p>
            </Part>
          </div>
        </div>
      </div>
    </ImmersivePanel>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal as="section">
      <h2 className="label mb-3 text-[var(--box-accent)]">{title}</h2>
      <div className="flex flex-col gap-4 font-serif text-[17px] leading-[1.7] text-[var(--box-fg)] md:text-[18px]">{children}</div>
    </Reveal>
  );
}

function Book({ name, by, children }: { name: string; by: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[0.72em] h-[5px] w-[5px] shrink-0 rotate-45 bg-[var(--box-accent)]" />
      <span>
        <em>{name}</em> <span className="text-[var(--box-muted)]">· {by}</span>
        {children && <span className="mt-1 block text-[15px] leading-snug text-[var(--box-muted)] md:text-[16px]">{children}</span>}
      </span>
    </li>
  );
}
