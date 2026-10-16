# WORLD-48: React Three Fiber world

Part of the Lebowski epic. See [index.md](../index.md). Realm: World. Later. Blocked by: WEB-47.

**Scope:** One fixed 3D canvas behind the DOM turns each route group into a station in a photographed world, a yin-yang bowling ball rolls between them on every page change, and the strike knocks over physics pins with a bloom flare, in three quality tiers, ported from the old Nuxt plan to React Three Fiber. The auth forms open in a native `<dialog>` over the page instead of as plain pages.

## Gap

The MVP is 2D with strong motion. Craig kept the 3D world for after it. The old plan designed it for TresJS in Vue; that design is sound, and this story ports it to the React ecosystem, which has more examples for the ball, the pins and the globe.

Sign-in, sign-up and the password pages are plain pages today (AUTH-7, AUTH-9). Leaving the page to sign in is a poor experience, and those plain forms were only ever scaffolding. Craig wants each auth form in a dialog over the page, both from a link and on a direct visit.

## Scope

**Packages** (`apps/web`): `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `@react-three/postprocessing`. Versions confirmed against React 19.3 before install.

**The one world:**

- `apps/web/src/components/world/World.tsx` (Client Component): one `<Canvas>` rendered once in the root layout, `position: fixed` behind the DOM at `z-index: 0`, `aria-hidden`. Pages render above it with transparent backgrounds.
- Loaded with `next/dynamic` and `ssr: false`, so it is its own chunk and never renders on the server. Pages work without it.
- Text never lives in the canvas. The DOM is the source of truth for content, links, forms and accessibility. If the canvas fails, each station shows a still photo.
- `use(browser())` gates the canvas setup to the browser.

**Stations** (camera pose per route group):

| Route           | Place                                              | Backdrop                  |
| --------------- | -------------------------------------------------- | ------------------------- |
| `/`             | Venice boardwalk at dusk; the ball rolls into view | beach photo HDRI          |
| `/login`        | The alley front desk                               | alley interior            |
| `/signup`       | The shoe counter                                   | alley interior            |
| `/feed`         | The lanes, seen from the ball return               | neon alley                |
| `/abidings/:id` | One lane, camera close on the pins                 | same                      |
| `/lanes/:id`    | The same lane, from the foul line                  | same                      |
| `/dudes/:id`    | A straight Mojave road                             | desert HDRI               |
| `/sphere`       | Earth from orbit (SPHERE-50)                       | globe texture, star field |
| `/admin/*`      | The pinsetter room behind the lanes                | machinery, work lights    |

**Backdrops:** photographs, not models. Each station uses an HDRI through drei's `<Environment>`, plus two or three large photo planes at different depths for parallax. The alley and the pins are the only modelled geometry. All photos are original or licensed stock; no film stills.

**The ball:** a sphere with a yin-yang texture and a Rapier rigid body (`<RigidBody>` from `@react-three/rapier`). It is always on screen. Between stations it rolls ahead of the camera.

**Transitions:** a route change becomes a camera move.

1. `World` reads `usePathname()` and picks the station.
2. `useFrame` moves the camera along a spline to the station's pose in 600 to 900 ms, eased out; the ball rolls ahead on the same path.
3. The DOM swaps under React's `<ViewTransition>` in sync.
4. Under reduced motion the camera cuts, the ball sits still, and the DOM cross-fades in 150 ms.

Signature moves: splash to login (ball rolls through the alley doors); feed to thread (camera dives down a lane, the card grows into the header); posting an abiding (ball rolls, pins fall, bloom flares, the card lands on the same beat); dude to sphere (camera lifts off the desert road to orbit).

**The strike:** ten Rapier pin bodies; on a strike, `<EffectComposer><Bloom /></EffectComposer>` from `@react-three/postprocessing` flares the neon. In Lane Night the 3D pins only decorate the `knocked` set Nest already chose (API-23); physics never decides a score.

**Quality tiers**, chosen on first load from `navigator.deviceMemory` and `hardwareConcurrency` (others get medium), changeable in settings:

- High: full HDRI, bloom, shadows.
- Medium: smaller HDRI, no bloom, no shadows.
- Still: a photo per station, no canvas.

`<Canvas frameloop="demand">`: frames render only during transitions, the strike and pointer parallax, through `invalidate()`.

**Budgets:** under 6 MB of canvas assets across all stations; the 200 KB pre-canvas JavaScript budget from WEB-47 still holds. HDRIs and the next station's texture preload with `<link rel="preload">`.

**Auth dialogs** (parallel routes plus intercepting routes, the native `<dialog>` element). Each auth route shows its form in a dialog: `/login`, `/signup`, `/forgot-password`, `/forgot-password/sent` and `/reset-password`. It opens from a link click inside the app, and on a direct visit: a refresh, a typed URL, or the emailed reset link.

- **From a link (a soft navigation):** an `@auth` slot intercepts the route and shows the form in the dialog over the current page, which stays where it was behind it.
  - `apps/web/src/app/layout.tsx` takes the `auth` slot and renders it next to `children`.
  - `app/@auth/(.)login/page.tsx`, `(.)signup`, `(.)forgot-password` and `(.)forgot-password/sent` wrap the existing forms. `/reset-password` only ever opens from an email, so it has no intercepting route.
  - `app/@auth/default.tsx` returns `null`.
  - `app/@auth/page.tsx` and `app/@auth/[...catchAll]/page.tsx` return `null`. A soft navigation keeps a slot's last state, so without these the dialog stays open after a sign-in redirect or any other link.
- **On a direct visit (a hard navigation):** Next renders the full page, never the intercepting route. So each full page in `app/(public)/` renders the same form in the same dialog, already open, over the home page behind it.
  - The server renders `<dialog open>`, which shows without JavaScript. After hydration the client closes it and calls `showModal()`, so it becomes a real modal: on top, with the page behind it inert, and Escape closing it.
- **One `AuthDialog` part** wraps every auth form, with compound parts for the two ways in (from a link, or a direct visit) instead of a boolean prop.
  - It uses the native `<dialog>`, not Base UI.
  - The form's heading names the dialog through `aria-labelledby`.
  - It has a close button.
- **Closing:** Escape, the close button and a click on the backdrop all close it.
  - After a link opened it, close calls `router.back()`, so the page behind is where the member left it. Forward opens the dialog again.
  - After a direct visit there is no page of ours to go back to, so close calls `router.replace("/")`.
- **Moving between auth dialogs:** "Sign up", "Sign in" and "Forgot password?" inside a dialog use `<Link replace>`. One dialog swaps for the next, and Back closes the dialog instead of reopening the last one.
- **Success:** the Server Actions keep their redirects (`signIn`, `signUp`, `requestReset`, `resetPassword`). The catch-all closes the dialog on the way.

## Design notes

- **Port, not redesign.** Stations, photo backdrops, the ball, the four signature moves and the tiers come from the old plan unchanged. TresJS becomes Fiber, Cientos becomes drei, `@tresjs/rapier` becomes `@react-three/rapier`, `@tresjs/post-processing` becomes `@react-three/postprocessing`, Pinia becomes React state in `World`.
- **WebGPU stays optional.** Turn on three's WebGPU renderer only when it is stable and the WebGL fallback is proven.
- **Tumbleweeds ambient mode** is parked in `experiences.md` with "revisit with the World phase"; decide here whether to unpark it.
- **Name the slot `@auth`, not `@modal`.** FEED-16 already plans an `@modal` slot in `app/(app)` for the abiding thread. Two slots with the same name in different layouts are easy to confuse.
- **Decide which station sits behind an auth dialog.** `usePathname()` reads `/login` whether the dialog came from a link or a direct visit, but after a link the page behind is still the old one. Recommended: behind an intercepted dialog, the camera stays at the current station; on a direct visit it moves to the `/login` or `/signup` station; and "splash to login" plays when the dialog opens from `/`. `World` needs a signal from the slot (for example the active `@auth` segment) to tell the two apart.
- **The forms stay the fallback.** The dialog changes only how a form is shown. The form inside stays the accessible, JavaScript-off version AUTH-7 and AUTH-9 built. With JavaScript off, a direct visit shows the form in the open, non-modal dialog, and it still posts. AUTH-9's limit still holds: the reset form needs JavaScript, because it sits in a Suspense hole.
- **Motion:** any open or close animation for the dialog (for example `@starting-style` on `dialog[open]` and `::backdrop`) has a reduced-motion branch.
- **Patterns checked** against the Next 16.4 docs (`parallel-routes.md` › Modals and `intercepting-routes.md`), whose own example is a login modal. They are the same as in older guides, apart from the catch-all needed to close the slot.

## Rendering strategy

A client-only canvas loaded with `next/dynamic` and `ssr: false`, gated by `use(browser())`, under DOM pages that keep their own strategies. View Transitions run the DOM half of each move.

The auth dialogs use parallel routes and intercepting routes: an `@auth` slot in the root layout, with `default.tsx` and a catch-all. Each full auth page keeps its rendering (◐, with the form in the static shell, except reset's form, which sits in a hole). Add the auth dialogs to the parallel and intercepting routes row in `rendering-strategies.md`, next to FEED-16's thread modal.

## Verification

- Every page works with the canvas blocked (still tier) and with JavaScript off.
- Each station's camera pose is reached on navigation; reduced motion cuts.
- A strike in Lane Night shows the 3D pins matching Nest's `knocked` set.
- Canvas assets total under 6 MB; pre-canvas JS stays under 200 KB.
- The canvas idles at zero frames when nothing moves (devtools performance).
- Contrast holds over every backdrop (cards on surfaces).
- A link to Sign in, Sign up or Forgot password from any page opens its dialog over that page. The URL changes, Back closes the dialog, and Forward opens it again.
- A direct visit to each auth route (a refresh, a typed URL, the emailed reset link) shows the same dialog, open, over the home page.
- Escape, the close button and the backdrop close the dialog: back to the page after a link, and to `/` after a direct visit.
- Moving from Sign in to Sign up inside the dialog swaps it, and Back then closes the dialog.
- A successful sign-in, sign-up, forgot or reset closes the dialog and lands where the action redirects.
- With JavaScript off, each auth route shows its form in an open dialog, and the form posts. Reset shows its noscript line.
- By keyboard: focus moves into the dialog on open, stays inside it, and returns to the link that opened it on close. axe is clean, in light and dark.

## Done when

- [ ] `World` canvas with stations, HDRI backdrops and the ball
- [ ] Camera transitions and the four signature moves, with reduced-motion cuts
- [ ] Rapier pins and bloom strike
- [ ] Three quality tiers and the settings switch
- [ ] Budgets met
- [ ] Auth dialogs: the `@auth` slot with its intercepting routes, `default.tsx` and the catch-all, and the full auth pages showing the same dialog on a direct visit
- [ ] `context/frontend-architecture.md` World section updated to what was built
- [ ] Row added to `rendering-strategies.md`
