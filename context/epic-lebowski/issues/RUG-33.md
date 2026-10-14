# RUG-33: The Rug profile theme

Part of the Lebowski epic. See [index.md](../index.md). Realm: Rug. Phase 3. Blocked by: API-29, FEED-17.

**Scope:** A pure function in Next turns a seed, a palette and a motif into an original rug pattern as SVG, the member picks and rerolls theirs on `/dudes/me`, Nest stores the config, and a profile with a rug and every field filled shows "Tied the room together".

## Gap

The rug is the film's MacGuffin, and profiles are plain. A generated rug gives every member a unique banner with no image upload, which the backend does not have.

## Scope

- `apps/web/src/lib/rug/generate.ts`:

  ```ts
  export interface RugConfig {
    seed: string;
    palette: RugPalette;
    motif: RugMotif;
  }
  export type RugPalette = "venice" | "bowling-alley" | "desert" | "persian-red" | "sunset";
  export type RugMotif = "medallion" | "border-and-field" | "stripes" | "lattice";
  export function rugSvg(config: RugConfig, size: { width: number; height: number }): string;
  ```

  - Pure and deterministic: same config, same SVG string. No `Math.random`; a seeded PRNG (sfc32 over a cyrb128 hash of `seed`), the same approach as `lane-engine`.
  - Builds a border, a field and a central figure from simple shapes (polygons, repeated tiles) in the palette's 4 to 5 colors.
  - Output under 30 KB for a 1200 by 300 banner.

- `apps/web/src/components/Rug/Rug.tsx` (Server Component): renders `rugSvg` inline with `role="img"` and an `aria-label` such as "Rug: medallion in desert colors".
- `/dudes/me` "Your rug" section (Client Component): a preview, a palette select, a motif select, and "Reroll" (new random seed). "Save rug" calls Server Action `saveRug(config)`, which sends `PATCH /profiles/me` with `rugConfig`.
- `/dudes/[id]` shows the rug as the page banner when `rugConfig` is set; a plain banner in `--color-surface` when not.
- "Tied the room together": when `displayName`, `bio`, `profileImageUrl` and `rugConfig` are all set, the profile shows a small line "This profile really ties the room together." `/dudes/me` shows a checklist of what is missing.
- The member's rug also tints their avatar ring in the feed (two colors from the palette).

## Design notes

- **Original patterns only.** The generator never copies the film's rug. Palettes and motifs are generic rug vocabulary.
- **The generator lives in Next.** C.4: no database behind it. Nest only stores the three strings.
- **Deterministic.** A rug never changes unless the member rerolls, and the server and the browser draw the same one.
- **Reduced motion.** The reroll swaps the pattern without the 200 ms cross-fade.

## Rendering strategy

`rugSvg` runs inside Server Components, so the banner is plain SVG in the HTML with no client JavaScript. The editor on `/dudes/me` is a client component that calls the same pure function for the live preview, the lesson's row for "one pure function on both sides".

## Verification

- `rugSvg` with the same config returns identical strings (snapshot of three fixed configs).
- 1,000 random configs: every output is valid SVG under 30 KB, and no two different seeds give the same string.
- Save a rug; reload `/dudes/<id>`: the same pattern shows.
- Fill all four fields: the "ties the room together" line shows; clear the bio: it goes away.
- The SVG has `role="img"` and a label.
- Keyboard: selects, reroll and save work.

## Done when

- [ ] `rugSvg` with five palettes and four motifs
- [ ] `Rug` component, editor on `/dudes/me`, banner on `/dudes/[id]`
- [ ] "Tied the room together" line and checklist
- [ ] Vitest snapshots and the property test
- [ ] Row added to `rendering-strategies.md`
