# RUG-36: Ask the Stranger

Part of the Lebowski epic. See [index.md](../index.md). Realm: Rug. Phase 3. Blocked by: WEB-5, WEB-6.

**Scope:** `/stranger` shows a daily aphorism from a curated set of original cowboy-narrator lines, and lets a visitor ask a question and get a line picked for it, with no LLM and no database.

## Gap

The Stranger is the film's wisdom voice and the app has no wisdom voice at all. A curated corpus is small, safe and cheap, and it is the lesson's clearest example of long-lived caching.

## Scope

- `apps/web/src/content/stranger.ts`: at least 60 original aphorisms, each `{ id, text }`, under 200 characters. Written in a slow, warm, plain-spoken cowboy voice. Examples of the voice, not final text: "Some days the pins fall your way. Most days you just keep rolling.", "A man who's in a hurry at the lanes has already lost the game."
- `apps/web/src/lib/stranger/pick.ts`:
  - `dailyLine(dayNumber: number): StrangerLine`: `lines[dayNumber % lines.length]`, shuffled once by a fixed seed so neighbors differ.
  - `lineFor(question: string, dayNumber: number): StrangerLine`: a stable hash of the trimmed, lower-cased question plus the day picks the line. The same question on the same day gets the same answer.
- `apps/web/src/app/stranger/page.tsx`:
  - The daily line, read through:

    ```ts
    async function getDailyLine() {
      "use cache";
      cacheLife("days");
      return dailyLine(dayNumberToday());
    }
    ```

    `dayNumberToday()` counts UTC days since 2026-01-01 through gmt.

  - Each line starts with the prefix "A wiser fella than myself once said..." on the daily card only.
  - A form "Ask the Stranger" with one text input. It submits with GET to `/stranger?q=...`; the answer area reads `searchParams` inside Suspense and shows `lineFor(q, day)`.
- The Stranger also appears in onboarding: the first visit to `/feed` shows a dismissible card with the daily line.
- "Sometimes you eat the bar" belongs to LANE-25's result card, not to this corpus.

## Design notes

- **Curated, original lines.** No film quotes beyond the short prefix. No Sam Elliott likeness, voice or image; the Stranger here is a voice in text.
- **No LLM in the MVP.** `experiences.md` lists an LLM option at size M. Curated is size S and has no cost, latency or safety risk.
- **No database.** C.4 places the corpus and the daily pick in Next.
- **Reading time inside `'use cache'` is deliberate here.** The daily pick is meant to freeze for the cache's life. `cacheLife('days')` lets it refresh once a day or so; the exact switchover time is not important.

## Rendering strategy

`'use cache'` with `cacheLife('days')` inside a PPR shell for the daily line; the question's answer streams from `searchParams` inside Suspense. The lesson's row for long cache lifetimes.

## Verification

- `next build` prerenders the daily line into the static shell.
- `dailyLine` gives a different line on consecutive days for the first 60 days.
- `lineFor("Will I bowl a 300?", 10)` is the same on two calls; a different day gives a different line in most cases (spec over 100 questions).
- An empty question shows the daily line instead.
- Every corpus line is under 200 characters and passes a reviewed-list check for originality (no line matches a film quote list kept in the spec).
- The form works with JavaScript off.
- Keyboard and screen reader: the answer region is `aria-live="polite"`.

## Done when

- [ ] 60 or more original lines in `stranger.ts`
- [ ] `dailyLine` and `lineFor` with specs
- [ ] `/stranger` page with the cached daily line and the question form
- [ ] Onboarding card on first `/feed` visit
- [ ] Row added to `rendering-strategies.md`
