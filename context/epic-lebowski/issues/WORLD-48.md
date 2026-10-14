# WORLD-48: React Three Fiber world

Part of the Lebowski epic. See [index.md](../index.md). Realm: World. Later. Blocked by: WEB-47.

**Scope:** One fixed 3D canvas behind the DOM turns each route group into a station in a photographed world, a yin-yang bowling ball rolls between them on every page change, and the strike knocks over physics pins with a bloom flare, in three quality tiers, ported from the old Nuxt plan to React Three Fiber.

## Gap

The MVP is 2D with strong motion. Craig kept the 3D world for after it. The old plan designed it for TresJS in Vue; that design is sound, and this story ports it to the React ecosystem, which has more examples for the ball, the pins and the globe.

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

## Design notes

- **Port, not redesign.** Stations, photo backdrops, the ball, the four signature moves and the tiers come from the old plan unchanged. TresJS becomes Fiber, Cientos becomes drei, `@tresjs/rapier` becomes `@react-three/rapier`, `@tresjs/post-processing` becomes `@react-three/postprocessing`, Pinia becomes React state in `World`.
- **WebGPU stays optional.** Turn on three's WebGPU renderer only when it is stable and the WebGL fallback is proven.
- **Tumbleweeds ambient mode** is parked in `experiences.md` with "revisit with the World phase"; decide here whether to unpark it.

## Rendering strategy

A client-only canvas loaded with `next/dynamic` and `ssr: false`, gated by `use(browser())`, under DOM pages that keep their own strategies. View Transitions run the DOM half of each move.

## Verification

- Every page works with the canvas blocked (still tier) and with JavaScript off.
- Each station's camera pose is reached on navigation; reduced motion cuts.
- A strike in Lane Night shows the 3D pins matching Nest's `knocked` set.
- Canvas assets total under 6 MB; pre-canvas JS stays under 200 KB.
- The canvas idles at zero frames when nothing moves (devtools performance).
- Contrast holds over every backdrop (cards on surfaces).

## Done when

- [ ] `World` canvas with stations, HDRI backdrops and the ball
- [ ] Camera transitions and the four signature moves, with reduced-motion cuts
- [ ] Rapier pins and bloom strike
- [ ] Three quality tiers and the settings switch
- [ ] Budgets met
- [ ] `context/frontend-architecture.md` World section updated to what was built
- [ ] Row added to `rendering-strategies.md`
