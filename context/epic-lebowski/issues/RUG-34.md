# RUG-34: Laws of the Lane quiz

Part of the Lebowski epic. See [index.md](../index.md). Realm: Rug. Phase 3. Blocked by: WEB-5, WEB-6, API-29.

**Scope:** A fully static set of original tenets, "The Laws of the Lane", and a short personality quiz on them that gives each member a Dudeist alignment (Dude, Walter, Donny or Maude), saved to the profile through a Server Action.

## Gap

The app has a voice but no canon of its own. Duderonomy shows a list of laws makes a strong identity piece, but its text is Dudeism's, not ours. A quiz turns the laws into something shareable, and its result is half of the Lane Certificate (RUG-35).

## Scope

- `apps/web/src/content/laws.ts`: 12 original laws, each `{ number, title, text }`, written for this app. Tone: calm, funny, kind. Examples of the voice, not final text: "Law 3. Thou shalt not hurry a frame.", "Law 7. Fresh creamer, always."
- `apps/web/src/content/quiz.ts`: 8 questions, each with 4 answers. Each answer carries points toward one alignment.
  - Dude: easygoing, goes with the flow.
  - Walter: rules, loyalty, a lot of conviction.
  - Donny: along for the ride, just happy to bowl.
  - Maude: art, intellect, does things her way.
- `apps/web/src/lib/quiz/score.ts`: `alignmentFor(answers: number[]): Alignment`, pure. Ties break in the order Dude, Maude, Walter, Donny.
- `apps/web/src/app/laws/page.tsx`: the 12 laws. Fully static.
- `apps/web/src/app/laws/quiz/[step]/page.tsx`: one question per page, `step` 1 to 8, with `generateStaticParams` returning the 8 steps and `export const ensureStatic = "shell"`. Answers are kept in the URL (`?a=2,0,3`) so each step is a plain link and the pages stay static.
- `apps/web/src/app/laws/quiz/result/page.tsx`: reads `?a=` inside Suspense, shows the alignment with a short original description and a share line.
  - Signed in: "Save my alignment" calls Server Action `saveAlignment(alignment)`, which sends `PATCH /profiles/me` with `{ alignment }`.
  - Signed out: "Roll in to save it" links to `/login?next=` the result URL.
- The alignment shows on `/dudes/[id]` as "Alignment: The Dude".

## Design notes

- **Original text only.** The laws are not Duderonomy, not The Abide Guide, not film lines. Duderonomy is inspiration for the form only (research.md).
- **Scoring lives in Next.** C.4: quiz content and scoring have no database behind them. Nest stores only the result.
- **Donny is fine; the coffee can is not.** The Donny alignment is about joy in bowling. Nothing about his death or ashes (avoid list).
- **Static by construction.** Each step is a link, not client state, so `next build` can prerender every page.

## Rendering strategy

Full static: `/laws` has no dynamic data, and the quiz steps use `generateStaticParams` with `ensureStatic: 'shell'`, so a step that accidentally reads request data fails the build. The result page reads `searchParams` inside Suspense; saving is a Server Action. This is the lesson's "fully static" row.

## Verification

- `next build` reports `/laws` and all 8 quiz steps as static.
- Add a `cookies()` call to a step page: the build fails because of `ensureStatic`. Revert.
- `alignmentFor` unit specs: all-Dude answers give Dude; a 2-2-2-2 tie gives Dude; a Walter-heavy set gives Walter.
- The quiz works with JavaScript off (links only).
- Signed in, save: the profile's `alignment` is set; `/dudes/<id>` shows it.
- Signed out: "Roll in to save it" returns to the same result after sign-in.
- Keyboard: every answer is a link or button in reading order.

## Done when

- [ ] 12 original laws and 8 questions, reviewed for originality
- [ ] `alignmentFor` with tie rules and specs
- [ ] `/laws`, the 8 static steps and the result page
- [ ] `saveAlignment` Server Action
- [ ] Alignment on dude pages
- [ ] Row added to `rendering-strategies.md`
