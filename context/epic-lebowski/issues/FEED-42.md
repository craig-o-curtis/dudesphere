# FEED-42: Caucasian Bar UI

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 4. Blocked by: WEB-5, API-41, FEED-14.

**Scope:** `/bar` lists recipe abidings, a recipe form posts them, recipe cards show the structured recipe in the feed, and readers confirm they are 21 or older before an alcoholic recipe's body shows.

## Gap

API-41 stores recipes; members cannot write or read them as recipes. The alcohol content also needs a reader-side gate that the public API cannot provide.

## Scope

- `apps/web/src/app/(app)/bar/page.tsx`, "The Caucasian Bar":
  - Intro: "The sacramental beverage, and every way to make it."
  - `FeedList` with `kind=recipe`.
  - "Share a recipe" button.
- `apps/web/src/components/RecipeForm/`: name, caption (the 280-character `message`), up to 8 ingredient rows (item select, amount, note), method, servings, an "Alcohol-free" checkbox. Server Action `postRecipe` calls `POST /abidings` with `kind: "recipe"`.
  - A member without attestation who leaves "Alcohol-free" unticked sees the attestation step first: "Dudesphere asks recipe posters to be 21 or older. Are you?" with "I'm 21 or older" (Server Action `attestAdult` calls `PUT /profiles/me/age-attestation`) and "Make it alcohol-free instead".
- `apps/web/src/components/RecipeCard/`: the caption, then the recipe as a list (ingredient tags such as "half-and-half", "fresh creamer") and the method. Used by `AbidingCard` when `kind` is `recipe`.
- Reader gate: an alcoholic recipe's ingredients and method are hidden behind "This recipe has alcohol. Are you 21 or older?" with "Yes, show me" and "No".
  - A signed-in member with `adultAttested` sees it at once.
  - Anyone else who presses "Yes, show me" gets an `age_ok=1` cookie (Server Action, `httpOnly`, 1 year) and sees recipes from then on.
  - The caption always shows.
- The "Cheers" reaction from `experiences.md` is out of scope: the API has no reactions yet.

## Design notes

- **The gate is in the web app** because `GET /abidings` is public and reads no token (API-41). The gate is a courtesy, as on any drinks site; posting is the enforced rule, in Nest.
- **Alcohol-free is a first-class choice.** A coffee-and-cream version is a recipe too, and needs no attestation.
- **Copy.** Page title "The Caucasian Bar". Card label "Caucasian" for the classic. Ingredient tags from the glossary. No promotion of heavy drinking; no counts of drinks.
- **No film stills or bottle brands.** Ingredients are generic words.

## Rendering strategy

`/bar` is a dynamic list like the feed. The reader gate reads the `age_ok` cookie inside Suspense around each recipe body, so the static shell never contains a gated body. Posting is a Server Action with `useActionState`.

## Verification

- Signed out, open `/bar`: captions show, bodies are gated; "Yes, show me" reveals them and survives a reload.
- Signed in with attestation: no gate.
- Post an alcoholic recipe without attestation: the attestation step shows first; after "I'm 21 or older" the post goes through.
- Post an alcohol-free recipe: no attestation step, no reader gate on its card.
- A recipe in `/feed` renders as a recipe card.
- 9th ingredient row cannot be added; Nest's 400 shows if forced.
- Keyboard and screen reader: the gate's buttons are reachable; the revealed body is announced.

## Done when

- [ ] `/bar` page, `RecipeForm` and `RecipeCard`
- [ ] Attestation step and reader gate with the `age_ok` cookie
- [ ] Recipe cards in every feed
- [ ] Vitest specs for the gate states
- [ ] Row added to `rendering-strategies.md`
