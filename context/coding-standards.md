# Coding Standards

## Functions

Functions should use `function` keywords instead of `const` and arrow functions, unless there is a necessary reason for the `const`.

## No IIFE's

Avoid Immediately Invoked Functions

## Dates and Times

For ALL dates and times, ONLY use the package `@northguild/gmt`.

Never add another date library to any `package.json`, as a dependency, dev dependency or peer, and never import one. That includes `date-fns`, `date-fns-tz`, `moment`, `moment-timezone`, `dayjs`, `luxon`, `spacetime` and any time zone add-on. When a package lists a date library as an optional peer (Base UI lists `date-fns`), leave it uninstalled. When a feature seems to need one, ask for the missing piece in `@northguild/gmt` instead.

The lint rule `@northguild/gmt-oxlint/no-date-library-imports` fails any import of these packages. The one copy in the lockfile, `dayjs`, comes in through TypeORM's own code. It is not ours to use.

## Memoization

React Compiler is on in `apps/web` (`reactCompiler: true` in `next.config.ts`). It memoizes components and values for you. Don't write `useMemo`, `useCallback` or `memo`. If a profile shows a real problem the compiler doesn't fix, write down why next to the one place you add it.

## Composability and Reusability

Build from small parts that each do one thing, and compose them. This goes for utilities, hooks and services as much as for components.

- When the same code shows up a second time, extract it into its own file before the task is done, and give it a unit test.
- Shared code knows nothing about the features that use it. Features import shared code. Shared code never imports a feature.
- Prefer composition to configuration: pass `children` and use compound parts rather than adding boolean props.

In `apps/web`:

- Build UI from the shared parts in `src/components/ui/`. Before you write a button, field, heading, text style, surface, layout wrapper or dialog, use the part that exists, or extend it with a variant.
- Style with tokens, never raw values. Every shared part accepts `className`, its root element's native props and `ref`, and changes its look only through a `variant` or `tone` prop or its component tokens.
- Base UI (`@base-ui/react`) is the only UI library. Only files in `src/components/ui/` import it.
- Full rules: `.agents/skills/ui-composition/SKILL.md`. Current problems: `context/audits/frontend-audit.md`.

## Tests that act like a member

In component tests, act as the member would, with `@testing-library/user-event`. Never use `fireEvent`.

- Call `const user = userEvent.setup()` before `render`. Then `await` each action: `user.click`, `user.type`, `user.clear`, `user.keyboard` and `user.tab`.
- With fake timers, pass `vi.advanceTimersByTime` as `advanceTimers` to `userEvent.setup`. Don't set `delay: null`.

`fireEvent` sends one bare DOM event. A real click or keypress is a chain of events: pointer and mouse events, focus, key events and input. That chain is what `user-event` plays. A test that uses `fireEvent` can pass while the real browser fails, for example on a button that can't take focus.

A lint rule in `apps/web/.oxlintrc.json` fails any import of `fireEvent`.

## Topic standards

The rules above apply to every task. Each topic below has its own file. Read a topic file when its "Read when" matches your task.

| Topic   | File                          | Read when                                                                             |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| Next.js | `context/standards/nextjs.md` | You plan, build or review routes, layouts, rendering, caching or modals in `apps/web` |

To add a topic, make `context/standards/<topic>.md`, add a row here, and add the file to the "Read first" list of each agent that needs it.
