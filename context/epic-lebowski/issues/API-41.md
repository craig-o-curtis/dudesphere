# API-41: Caucasian Bar recipe post type

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 4. Blocked by: none.

**Scope:** An abiding can be a recipe, with `kind: 'recipe'` and a structured recipe sub-document in Mongo, and only members who have attested they are 21 or older, recorded on their Postgres profile, may post one.

## Gap

The White Russian is the film's sacramental beverage, and Duderonomy has a law about fresh creamer. Members will share their versions. Today a recipe is free text in a 280-character abiding, with no structure to filter on and no age gate for alcohol content.

## Scope

**Mongo**, `apps/api/src/abidings/abiding.schema.ts`:

- `kind`: `"post" | "recipe"`, default `"post"`. Index `{ kind: 1, createdAt: -1 }`.
- `recipe`: sub-document, required when `kind` is `recipe`, absent otherwise.

  ```ts
  {
    name: string; // 1..60, such as "Caucasian, the classic"
    ingredients: { item: RecipeItem; amount: string; note?: string }[]; // 1..8 items
    method: string; // 1..500
    servings: number; // 1..4
    alcoholFree: boolean;
  }
  type RecipeItem =
    | "vodka" | "coffee-liqueur" | "cream" | "half-and-half" | "fresh-creamer"
    | "milk" | "powdered-creamer" | "oat-milk" | "cold-brew" | "ice" | "other";
  ```

  `amount` is free text up to 30 characters ("50 ml", "a splash"). `note` up to 60.

- The abiding's `message` stays required (1 to 280): it is the recipe's caption.
- `CreateAbidingDto` accepts `kind` and `recipe` with nested validation. `UpdateAbidingDto` may edit `recipe` but not change `kind`.
- `GetAbidingsDto` accepts `kind=recipe`. `GET /abidings?kind=recipe` is Public.
- `AbidingResponseDto` gains `kind` and `recipe`.

**Postgres**, one migration:

- `profile.adultAttestedAt` timestamptz, nullable.
- `PUT /profiles/me/age-attestation`, Token: `{ attest: true }`. Sets `adultAttestedAt` to now (gmt). 200. Clearing is `DELETE /profiles/me/age-attestation`, 204.
- `ProfileResponseDto` returns `adultAttested: boolean` (not the instant).

**Rule:**

- `POST /abidings` with `kind: "recipe"` and `alcoholFree: false` by a member without `adultAttestedAt`: 403 `AGE_ATTESTATION_REQUIRED`.
- An alcohol-free recipe needs no attestation.

## Design notes

- **A sub-document, not a collection.** A recipe is an abiding with more fields; it shares the feed, replies, hashtags and moderation. Mongo holds it as part of the same document.
- **Attestation lives in Postgres.** It is about the member, keyed by `user.id`, and soft-deletes with them. Nest reads it at post time; nothing crosses the stores but the user id, as today.
- **Self-attestation, recorded.** The app cannot verify age. It records when the member said so. The web gate for readers is FEED-42's job.
- **Viewing stays public in the API.** `GET /abidings` is `@Public()`, and the package reads no token there, so Nest cannot gate by viewer. The web app gates the recipe body.
- **Ingredient words.** "Half-and-half" and "fresh creamer" are glossary terms; the list is generic cocktail vocabulary.

## Verification

E2E with e2e users:

- Without attestation, post a vodka recipe: 403 `AGE_ATTESTATION_REQUIRED`.
- Attest, post again: 201, `kind: "recipe"`, recipe echoed.
- Without attestation, post an alcohol-free recipe: 201.
- `kind: "recipe"` with no `recipe`: 400. `kind: "post"` with a `recipe`: 400. 9 ingredients: 400. `item: "absinthe"`: 400.
- `GET /abidings?kind=recipe` lists recipes only.
- `PATCH` a recipe's `kind` to `post`: 400.
- `DELETE /profiles/me/age-attestation`, then post an alcoholic recipe: 403.
- Old abidings without `kind` read as `kind: "post"`.

## Done when

- [ ] `kind` and `recipe` in the schema, DTOs and response, with the index
- [ ] `adultAttestedAt` migration and the two attestation routes
- [ ] `AGE_ATTESTATION_REQUIRED` rule
- [ ] Unit and e2e specs as listed
- [ ] `packages/api-types` and `context/overview.md` updated
