# MOD-44: Walter's Rules UI and the "Calmer than you are" nudge

Part of the Lebowski epic. See [index.md](../index.md). Realm: Moderation. Phase 4. Blocked by: WEB-5, AUTH-8, API-43, FEED-14, FEED-19.

**Scope:** A static "There are rules" guidelines page, a "This aggression will not stand" report button on every abiding, an admin moderation queue, visible "Over the line" and "Mark it zero" states, and a gentle "Calmer than you are?" nudge before a heated reply posts.

## Gap

API-43 can take reports and set states, but members cannot report and admins have no queue. The app has no written rules. And the cheapest moderation is the post that never gets sent in anger.

## Scope

- `apps/web/src/app/rules/page.tsx`, title "There are rules": the community guidelines in plain words, numbered. Sections: be kind, no harassment, no hate, keep it legal, adults only for alcohol recipes, respect the film's owners (no stills, clips or long quotes), how reports work, what "Over the line" and "Mark it zero" mean. Fully static.
- Report button on `AbidingCard` and dude pages: "This aggression will not stand". It opens a `<dialog>` with the reasons from API-43 as radio buttons and an optional note. Server Action `report` calls `POST /reports`. Confirmation: "Thanks. An admin will take a look."
- States on cards:
  - `over-the-line`: a yellow bar "Over the line: [reason]" above the message. The message shows below it.
  - `marked-zero`: lists never show it (Nest drops it). The author sees their own card greyed with "Marked zero: [reason]" and a link to `/rules`.
- `apps/web/src/app/(app)/admin/reports/page.tsx` (with FEED-19's `requireAdmin()` and nav): the open queue from `GET /reports`, grouped by target, copyright reports first. For each target: the abiding, the reasons and counts, and buttons "Over the line", "Mark it zero", "Dismiss", each asking for a reason. Server Actions call `POST /abidings/:id/moderation` or `POST /reports/:id/dismiss`, then `revalidateTag("abiding:" + id, "max")` and `updateTag("abidings")`. `after()` writes the audit line, as in FEED-19.
- "Calmer than you are?" nudge in `ComposeBox` (FEED-14), for replies only:
  - `apps/web/src/lib/calm/heat.ts`: `heatScore(text: string): number`, pure. Signals: share of capital letters over 60 percent in words of 3 or more letters; three or more `!` in a row; second-person insults from a short word list. Returns 0 to 1.
  - At 0.6 or above, pressing "Abide" first shows: "Calmer than you are? Take a breath; this one will still be here." Buttons "Post anyway" and "Take it easy" (returns to the box). The nudge shows at most once per reply.
  - No server call. Nothing is logged.

## Design notes

- **The nudge never blocks.** "Post anyway" always works. It is a pause, not a filter.
- **No word list in the page source that reads as a slur list.** The insult list is short, mild and second-person ("you idiot"); slurs are left to reports.
- **Plain meaning next to the film phrase.** Every state shows its plain meaning: "Over the line" means a warning; "Mark it zero" means removed.
- **The rules page carries the legal line.** It says Dudesphere is fan-made, not affiliated, and how to send a copyright report.

## Rendering strategy

`/rules` is fully static with `ensureStatic`. The admin queue is dynamic behind `forbidden()`. The nudge is pure client logic inside an existing Server Action form.

## Verification

- `/rules` is static in `next build`.
- Report a post: the dialog works with the keyboard; the confirmation shows; the admin queue lists it.
- Admin marks it "Over the line": the bar shows on the card for everyone.
- Admin marks it zero: it disappears from feeds; the author sees it greyed with the reason.
- `heatScore` specs: "YOU ARE WRONG!!!" scores 0.6 or more; "you're wrong, man" scores under 0.6; an empty string scores 0.
- A hot reply shows the nudge once; "Post anyway" posts it.
- Reduced motion: the dialog appears without the slide.

## Done when

- [ ] `/rules` page
- [ ] Report button and dialog on cards and dude pages
- [ ] Card states for over-the-line and marked-zero
- [ ] Admin reports queue with actions and audit line
- [ ] `heatScore` and the nudge in replies
- [ ] Vitest specs for `heatScore` and the card states
- [ ] Row added to `rendering-strategies.md`
