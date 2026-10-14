# SPHERE-50: The globe and opt-in coarse location

Part of the Lebowski epic. See [index.md](../index.md). Realm: Sphere. Later. Blocked by: FEED-17.

**Scope:** Members may opt in to a coarse location (off, anonymous or named), Nest stores only a 4-character geohash cell, and `/sphere` shows a globe of dots for cells with three or more members and a "Dudes near you" list.

## Gap

"The Dudesphere" is the app's name, and nothing shows the sphere. Members also cannot find dudes nearby. The design is already written in `context/overview.md` under "Deferred work", "Dude location"; this story builds it.

## Scope

**Nest**, as `overview.md` designs it:

- `profile` gains `locationMode` enum `off`, `anonymous`, `named` (default `off`), `locationCell` varchar(4) nullable, `locationLabel` varchar(100) nullable. One migration and an index on `locationCell`.
- `PUT /profiles/me/location`, Token: `{ mode, cell, label }`. `cell` must be exactly 4 base-32 geohash characters; anything longer is refused.
- `DELETE /profiles/me/location`, Token: mode `off`, both columns null. No history.
- `GET /sphere/cells`, Public: `{ cell, count }` for cells with 3 or more live profiles in `anonymous` or `named` mode. One `GROUP BY` with `HAVING count(*) >= 3`, cached for a minute.
- `GET /dudes/nearby?cell=`, Token: `named` profiles in the cell and its eight neighbours, paginated. `WHERE "locationCell" IN (...)` with nine values from a geohash neighbour function. No PostGIS.
- The API never receives, stores or logs a latitude or longitude.

**Next:**

- `/dudes/me` "Where you are" section: the three modes; a "Use my location" button that asks the browser only on click; or a typed city geocoded to the same cell. The browser rounds to a 4-character geohash before anything leaves the device.
- `/sphere`: the globe (an R3F scene of its own, or WORLD-48's sphere station if that story is done), one dot per cell with a count, a slow orbiting ball; "Dudes near you" beside it, empty with a kind message when the viewer's location is off. Clicking a dot filters the list.
- A `named` member's dude page shows "near Venice, CA".

## Design notes

- **Privacy rules from `overview.md` hold:** opt-in and off by default; never precise coordinates; a three-member threshold for anonymous dots; "Turn off" deletes the cell and label.
- **Not a 4D world.** A time axis would need location history, which the privacy rules forbid.
- **"Near" means the same or an adjacent cell,** not a radius. That is the price of never holding a precise point.

## Rendering strategy

`/sphere` is dynamic for the list and caches the public cells with `'use cache'` and `cacheLife('minutes')`. The globe is a client-only canvas, gated by `use(browser())`.

## Verification

- `PUT` with a 5-character cell: 400. With a 4-character non-geohash: 400.
- Two anonymous members in one cell: no dot. Three: one dot with count 3.
- `GET /dudes/nearby` includes a named member in a neighbouring cell and excludes an anonymous one.
- "Turn off" nulls both columns; the dot count drops.
- A soft-deleted member drops out of both queries.
- No request from the browser carries coordinates (network panel).
- Location columns are cleared for e2e users by the existing profile cleanup.

## Done when

- [ ] Profile location columns, routes and the threshold query
- [ ] Location settings with on-device rounding
- [ ] `/sphere` globe and nearby list
- [ ] Unit and e2e specs as listed
- [ ] `context/overview.md` moves "Dude location" from deferred to built
- [ ] Row added to `rendering-strategies.md`
