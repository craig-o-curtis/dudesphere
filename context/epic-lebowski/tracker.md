# Lebowski epic tracker

Stories are listed in build order. The first story whose status is not `Done` is the
next one to build. Story ids never change and do not match GitHub issue numbers. This
file is the source of truth, and the GitHub issues mirror it.

A story is `⬜ Todo`, `⏳ In progress` or `✅ Done` (all dev work done and its PR open).
Always write the emoji with its word, so the status reads at a glance and a search for
the word still finds it.

Each entry reads: id and title; then status, issue and what blocks it; then what it
delivers. A story drops out of every "Blocked by" once it is `Done`, so REPO-1 appears
in none.

Each phase heading below is one GitHub milestone, with the same name.

## Phase 0: Foundation

The monorepo, the web shell, auth through the BFF, and the rendering-strategies guide.

1. **REPO-1** · [Monorepo move into apps/api](issues/REPO-1.md)\
   ✅ Done · [#35][35] · Blocked by: none\
   Nest in `apps/api`, pnpm workspace, root scripts, hooks, compose, Docker, CI

2. **REPO-2** · [Shared tsconfig base in packages/config](issues/REPO-2.md)\
   ✅ Done · [#36][36] · Blocked by: none\
   `packages/config/tsconfig.base.json`, extended by each app

3. **REPO-3** · [Shared response types in packages/api-types](issues/REPO-3.md)\
   ✅ Done · [#37][37] · Blocked by: none\
   Hand-written `.d.ts` response types and a type-level drift check in the API

4. **REPO-4** · [CI per app](issues/REPO-4.md)\
   ✅ Done · [#38][38] · Blocked by: none\
   API checks, migrations and e2e jobs on filters; a `web` job for lint and build

5. **WEB-5** · [Next.js 16.4 app shell](issues/WEB-5.md)\
   ✅ Done · [#39][39] · Blocked by: none\
   `apps/web` scaffold: Cache Components, React Compiler, CSS Modules, port 3001

6. **WEB-6** · [Design tokens, fonts, root layout and motion rules](issues/WEB-6.md)\
   ✅ Done · [#40][40] · Blocked by: none\
   `tokens.css`, light and dark, root layout, reduced-motion rules, disclaimer

7. **AUTH-7** · [BFF sign-up, sign-in and sign-out with httpOnly cookies](issues/AUTH-7.md)\
   ✅ Done · [#41][41] · Blocked by: none\
   `/signup`, `/login`, Server Actions that set the session and refresh cookies, sign-out handlers

8. **WEB-54** · [Shared UI parts and the auth form refactor](issues/WEB-54.md)\
   ✅ Done · [#90][90] · Blocked by: none\
   `components/ui/` native parts on the tokens, auth forms rebuilt on them

9. **AUTH-8** · [proxy.ts refresh and the Data Access Layer](issues/AUTH-8.md)\
   ✅ Done · [#42][42] · Blocked by: none\
   `proxy.ts` redirect-to-refresh, `lib/session.ts` with `verifySession`, `/api/bff`

10. **AUTH-9** · [Forgot and reset password pages](issues/AUTH-9.md)\
    ✅ Done · [#43][43] · Blocked by: none\
    `/forgot-password`, `/reset-password`, a "required" cue on every auth form

11. **API-10** · [Trust the BFF's client IP for rate limits](issues/API-10.md)\
    ✅ Done · [#44][44] · Blocked by: none\
    `BFF_SECRET`, `X-Bff-Secret` and `X-Client-Ip` read by `AuthThrottlerGuard`

12. **WEB-11** · [Rendering strategies guide and the /lab page](issues/WEB-11.md)\
    ✅ Done · [#45][45] · Blocked by: none\
    `rendering-strategies.md` and a `/lab` index of every strategy

## Phase 1: The Feed

Passwordless sign-in, then the Twitter part of the app.

13. **AUTH-52** · [Passwordless sign-in](issues/AUTH-52.md)\
    ⬜ Todo · [#46][46] · Blocked by: API-10\
    Email links, email verification, passkeys, Google and GitHub, one "Roll in" form

14. **FEED-12** · [Splash page](issues/FEED-12.md)\
    ⬜ Todo · [#47][47] · Blocked by: none\
    Static shell, cached abidings ticker and hashtags, "who is signed in" in Suspense

15. **FEED-13** · [Feed with infinite scroll and hashtag chips](issues/FEED-13.md)\
    ⬜ Todo · [#48][48] · Blocked by: none\
    `/feed`, dynamic, `useInfiniteQuery` on `links.next`, up to 10 chips

16. **FEED-14** · [Compose and reply with optimistic insert](issues/FEED-14.md)\
    ⬜ Todo · [#49][49] · Blocked by: FEED-13\
    Server Action, `useActionState`, `useOptimistic`, `updateTag('abidings')`

17. **API-15** · [Replies list and reply count](issues/API-15.md)\
    ⬜ Todo · [#50][50] · Blocked by: none\
    `GET /abidings?replyToId=` and `replyCount` on every abiding

18. **FEED-16** · [Thread page and thread modal](issues/FEED-16.md)\
    ⬜ Todo · [#51][51] · Blocked by: API-15, FEED-14\
    `/abidings/[id]`, intercepting-route modal, `<Activity>`, View Transitions

19. **FEED-17** · [Dude pages and edit forms](issues/FEED-17.md)\
    ⬜ Todo · [#52][52] · Blocked by: none\
    `/dudes/[id]` and `/dudes/me`, edit forms with Nest's field errors

20. **API-18** · [Hidden hashtags list for admins](issues/API-18.md)\
    ⬜ Todo · [#53][53] · Blocked by: none\
    An admin-only list of every tag, hidden ones included

21. **FEED-19** · [Admin users and hashtags tables](issues/FEED-19.md)\
    ⬜ Todo · [#54][54] · Blocked by: API-18\
    `/admin/users`, `/admin/hashtags`, `forbidden()`, `after()` audit line

22. **WEB-20** · [SEO and sharing](issues/WEB-20.md)\
    ⬜ Todo · [#55][55] · Blocked by: FEED-12, FEED-16, FEED-17\
    Metadata, OG image, sitemap, robots, "You're out of your element" 404

## Phase 2: Lane Night

The anchor: async bowling and the Score Sheet.

23. **LANE-21** · [Bowling scoring engine in packages/lane-engine](issues/LANE-21.md)\
    ⬜ Todo · [#56][56] · Blocked by: none\
    Pure TS scoring, roll validation and fouls, with the USBC test vectors

24. **API-22** · [Lane Night tables and game routes](issues/API-22.md)\
    ⬜ Todo · [#57][57] · Blocked by: LANE-21\
    `lane_game`, `lane_player`, `lane_roll`; create, invite, state, my-turn list

25. **API-23** · [Server-authoritative pinfall](issues/API-23.md)\
    ⬜ Todo · [#58][58] · Blocked by: LANE-21, API-22\
    Seeded pin model in `lane-engine`; `POST /lanes/games/:id/rolls` takes inputs only

26. **LANE-24** · [Lane Night UI](issues/LANE-24.md)\
    ⬜ Todo · [#59][59] · Blocked by: LANE-21, API-22, API-23\
    2D lane, release meter, Over-the-line foul, scorecard, "MARK IT ZERO" stamp

27. **LANE-25** · [Turn flow and gentle timeout](issues/LANE-25.md)\
    ⬜ Todo · [#60][60] · Blocked by: LANE-24\
    Invites, "Phone's ringing, Dude", my-turn list, 72-hour pause, rematch

28. **LANE-26** · [Jesus taunt cards](issues/LANE-26.md)\
    ⬜ Todo · [#61][61] · Blocked by: LANE-24\
    A curated card set sent with a turn; no free text

29. **LANE-27** · [SSE lane ticker](issues/LANE-27.md)\
    ⬜ Todo · [#62][62] · Blocked by: API-22, LANE-24\
    Streaming Route Handler, 25-second cap, `EventSource` reconnect

30. **LANE-28** · [Score Sheet for a real alley game](issues/LANE-28.md)\
    ⬜ Todo · [#63][63] · Blocked by: LANE-21, API-22, FEED-14\
    Log a real game frame by frame; same engine; posts an abiding

## Phase 3: Rituals and identity

Check-ins, the timer, quiet mode, the Rug, the quiz, the certificate and the Stranger.

31. **API-29** · [Profile extensions, check-ins and timer sessions](issues/API-29.md)\
    ⬜ Todo · [#64][64] · Blocked by: none\
    Rug, alignment, quiet day, time zone, certificate columns; two new tables

32. **ABIDE-30** · [Daily "The Dude abides" check-in](issues/ABIDE-30.md)\
    ⬜ Todo · [#65][65] · Blocked by: API-29\
    One-tap check-in, optional mood, soft streaks, `after()`

33. **ABIDE-31** · [Take-It-Easy timer](issues/ABIDE-31.md)\
    ⬜ Todo · [#66][66] · Blocked by: API-29\
    1 to 10 minute calm timer that saves a session

34. **ABIDE-32** · [Shomer Shabbos quiet mode](issues/ABIDE-32.md)\
    ⬜ Todo · [#67][67] · Blocked by: API-29, LANE-25\
    A weekly quiet day the member picks; turn clocks pause

35. **RUG-33** · [The Rug profile theme](issues/RUG-33.md)\
    ⬜ Todo · [#68][68] · Blocked by: API-29, FEED-17\
    Seeded rug pattern generator; config saved through Nest

36. **RUG-34** · [Laws of the Lane quiz](issues/RUG-34.md)\
    ⬜ Todo · [#69][69] · Blocked by: API-29\
    Original tenets, fully static quiz, alignment saved by a Server Action

37. **RUG-35** · [Lane Certificate](issues/RUG-35.md)\
    ⬜ Todo · [#70][70] · Blocked by: RUG-34, ABIDE-30\
    `ImageResponse` certificate and share card; never implies ordination

38. **RUG-36** · [Ask the Stranger](issues/RUG-36.md)\
    ⬜ Todo · [#71][71] · Blocked by: none\
    Curated original aphorisms, daily pick with `cacheLife('days')`

## Phase 4: Achievers

Groups, Bowling Nights, recipe posts and moderation.

39. **API-37** · [Achievers groups and the group feed](issues/API-37.md)\
    ⬜ Todo · [#72][72] · Blocked by: none\
    `achiever_group`, `group_member`, `GET /abidings?groupId=`

40. **ACHV-38** · [Groups UI](issues/ACHV-38.md)\
    ⬜ Todo · [#73][73] · Blocked by: API-37, FEED-14\
    Group list, group page with its feed, join and leave

41. **API-39** · [Bowling Night events and the group leaderboard](issues/API-39.md)\
    ⬜ Todo · [#74][74] · Blocked by: API-22, API-37\
    `bowling_night`, `rsvp`, check-in, leaderboard read

42. **ACHV-40** · [Bowling Night UI and group leaderboard](issues/ACHV-40.md)\
    ⬜ Todo · [#75][75] · Blocked by: API-39, ACHV-38, LANE-28\
    Night pages, RSVP and check-in, leaderboard from both game sources

43. **API-41** · [Caucasian Bar recipe post type](issues/API-41.md)\
    ⬜ Todo · [#76][76] · Blocked by: none\
    `kind: 'recipe'` on abidings, recipe sub-document, 21+ attestation

44. **FEED-42** · [Caucasian Bar UI](issues/FEED-42.md)\
    ⬜ Todo · [#77][77] · Blocked by: API-41, FEED-14\
    Recipe compose form, recipe card, 21+ gate

45. **API-43** · [Walter's Rules reports and moderation states](issues/API-43.md)\
    ⬜ Todo · [#78][78] · Blocked by: none\
    `report` table, Over the line and Mark it zero states, admin routes

46. **MOD-44** · [Walter's Rules UI and the "Calmer than you are" nudge](issues/MOD-44.md)\
    ⬜ Todo · [#79][79] · Blocked by: API-43, FEED-14, FEED-19\
    "There are rules" page, report dialog, moderation queue, pre-post nudge

## Phase 5: Polish and deploy

Deploy, browser tests, and a performance and accessibility pass.

47. **WEB-53** · [Privacy and cookies page](issues/WEB-53.md)\
    ⬜ Todo · [#89][89] · Blocked by: none\
    `/privacy`: what Dudesphere keeps and why, the cookie table and members' rights

48. **WEB-45** · [Deploy to Vercel and a Docker host](issues/WEB-45.md)\
    ⬜ Todo · [#80][80] · Blocked by: API-10, WEB-53\
    Next on Vercel, Nest on Railway or Fly, Neon, production env

49. **WEB-46** · [Playwright flows and instant() navigation tests](issues/WEB-46.md)\
    ⬜ Todo · [#81][81] · Blocked by: AUTH-52, FEED-16, LANE-25\
    Browser flows for sign-in, feed, thread and Lane Night

50. **WEB-47** · [Performance and accessibility pass](issues/WEB-47.md)\
    ⬜ Todo · [#82][82] · Blocked by: WEB-46\
    Partial Prefetching, budgets, keyboard, contrast, reduced motion everywhere

## Later

Tracked, not scheduled.

51. **WORLD-48** · [React Three Fiber world](issues/WORLD-48.md)\
    ⬜ Todo · [#83][83] · Blocked by: WEB-47\
    Stations, HDRI backdrops, the yin-yang ball, the strike, quality tiers

52. **LANE-49** · [Live Lane rooms](issues/LANE-49.md)\
    ⬜ Todo · [#84][84] · Blocked by: LANE-27, WEB-45\
    Nest WebSocket gateway, CORS for the web origin only

53. **SPHERE-50** · [The globe and opt-in coarse location](issues/SPHERE-50.md)\
    ⬜ Todo · [#85][85] · Blocked by: FEED-17\
    Location modes, `GET /sphere/cells`, `GET /dudes/nearby`, the globe

54. **ACHV-51** · [Fest Finder and Day of the Dude](issues/ACHV-51.md)\
    ⬜ Todo · [#86][86] · Blocked by: API-39, ACHV-40\
    Member-submitted fests and screenings; a March 6 event

## Definition of Done

Every story meets every line below before it says `Done`.

- The code and its tests are merged to `main` through a PR.
- A backend story has unit specs and e2e specs. The e2e specs follow the repo's rules:
  - users are `e2e-` prefixed, with an `e2e-...@example.com` email;
  - hashtags are `e2e` plus 12 lower-case hex characters;
  - every new table or collection an e2e run writes to is added to the shared e2e cleanup in `apps/api/test/`. Both the API and the web e2e suites run it before and after every run.
- Nothing created by e2e is left in the dev databases: no `e2e-` users, profiles, refresh tokens, sessions, email tokens, abidings or hashtags. After the story's e2e runs and review rounds, `pnpm e2e:check` passes.
- Every Postgres change goes through a migration in `apps/api/src/database/migrations/`.
  Migrations are append-only.
- Every date goes through `@northguild/gmt`. No code holds a `Date`.
- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` pass, and every CI job is green.
- A web story works with the keyboard alone and under `prefers-reduced-motion: reduce`.
- The rendering strategy the story uses is recorded in the Routes table of
  `context/epic-lebowski/rendering-strategies.md` and in `apps/web/src/content/lab.ts`,
  and the Vitest spec that compares them passes.
- The docs are updated. An API change updates `context/overview.md`.
- The story is set to `Done` in this tracker, and its GitHub issue is closed.

<!-- Issue links -->

[35]: https://github.com/craig-o-curtis/dudesphere/issues/35
[36]: https://github.com/craig-o-curtis/dudesphere/issues/36
[37]: https://github.com/craig-o-curtis/dudesphere/issues/37
[38]: https://github.com/craig-o-curtis/dudesphere/issues/38
[39]: https://github.com/craig-o-curtis/dudesphere/issues/39
[40]: https://github.com/craig-o-curtis/dudesphere/issues/40
[41]: https://github.com/craig-o-curtis/dudesphere/issues/41
[42]: https://github.com/craig-o-curtis/dudesphere/issues/42
[43]: https://github.com/craig-o-curtis/dudesphere/issues/43
[44]: https://github.com/craig-o-curtis/dudesphere/issues/44
[45]: https://github.com/craig-o-curtis/dudesphere/issues/45
[46]: https://github.com/craig-o-curtis/dudesphere/issues/46
[47]: https://github.com/craig-o-curtis/dudesphere/issues/47
[48]: https://github.com/craig-o-curtis/dudesphere/issues/48
[49]: https://github.com/craig-o-curtis/dudesphere/issues/49
[50]: https://github.com/craig-o-curtis/dudesphere/issues/50
[51]: https://github.com/craig-o-curtis/dudesphere/issues/51
[52]: https://github.com/craig-o-curtis/dudesphere/issues/52
[53]: https://github.com/craig-o-curtis/dudesphere/issues/53
[54]: https://github.com/craig-o-curtis/dudesphere/issues/54
[55]: https://github.com/craig-o-curtis/dudesphere/issues/55
[56]: https://github.com/craig-o-curtis/dudesphere/issues/56
[57]: https://github.com/craig-o-curtis/dudesphere/issues/57
[58]: https://github.com/craig-o-curtis/dudesphere/issues/58
[59]: https://github.com/craig-o-curtis/dudesphere/issues/59
[60]: https://github.com/craig-o-curtis/dudesphere/issues/60
[61]: https://github.com/craig-o-curtis/dudesphere/issues/61
[62]: https://github.com/craig-o-curtis/dudesphere/issues/62
[63]: https://github.com/craig-o-curtis/dudesphere/issues/63
[64]: https://github.com/craig-o-curtis/dudesphere/issues/64
[65]: https://github.com/craig-o-curtis/dudesphere/issues/65
[66]: https://github.com/craig-o-curtis/dudesphere/issues/66
[67]: https://github.com/craig-o-curtis/dudesphere/issues/67
[68]: https://github.com/craig-o-curtis/dudesphere/issues/68
[69]: https://github.com/craig-o-curtis/dudesphere/issues/69
[70]: https://github.com/craig-o-curtis/dudesphere/issues/70
[71]: https://github.com/craig-o-curtis/dudesphere/issues/71
[72]: https://github.com/craig-o-curtis/dudesphere/issues/72
[73]: https://github.com/craig-o-curtis/dudesphere/issues/73
[74]: https://github.com/craig-o-curtis/dudesphere/issues/74
[75]: https://github.com/craig-o-curtis/dudesphere/issues/75
[76]: https://github.com/craig-o-curtis/dudesphere/issues/76
[77]: https://github.com/craig-o-curtis/dudesphere/issues/77
[78]: https://github.com/craig-o-curtis/dudesphere/issues/78
[79]: https://github.com/craig-o-curtis/dudesphere/issues/79
[80]: https://github.com/craig-o-curtis/dudesphere/issues/80
[81]: https://github.com/craig-o-curtis/dudesphere/issues/81
[82]: https://github.com/craig-o-curtis/dudesphere/issues/82
[83]: https://github.com/craig-o-curtis/dudesphere/issues/83
[84]: https://github.com/craig-o-curtis/dudesphere/issues/84
[85]: https://github.com/craig-o-curtis/dudesphere/issues/85
[86]: https://github.com/craig-o-curtis/dudesphere/issues/86
[89]: https://github.com/craig-o-curtis/dudesphere/issues/89
[90]: https://github.com/craig-o-curtis/dudesphere/issues/90
