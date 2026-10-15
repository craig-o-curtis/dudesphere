# Forms: React Hook Form, Next.js form actions or TanStack Form

Written on 2026-10-15, before WEB-54 builds the shared `Field` part. It answers one question: which tool should own form state in `apps/web`?

**Recommendation: keep Next.js form actions** (a Server Action passed to `<form action>`, with React's `useActionState`). Build the shared `Field` on Base UI `Form` and `Field`. Add no form library now. If a form later needs heavy state in the browser, use TanStack Form for that form, not React Hook Form.

## What our forms must do

These come from AUTH-7, FEED-14 and `context/frontend-architecture.md`:

1. **Work with JavaScript off.** A member can sign up, sign in and post with scripts blocked or not loaded yet.
2. **Show Nest's errors.** Nest validates. Its 400 body is mapped to fields by `lib/api.ts`. The web app doesn't repeat Nest's rules in a schema.
3. **No zod and no client validation library.** Native attributes (`required`, `type`, `minlength`, `pattern`) catch most bad input in the browser, even with JavaScript off.
4. **Work with React Compiler,** which is on.
5. **Fit the shared parts.** The form tool must work with the Base UI `Field` that `ui-composition` plans, and keep the client boundary low.
6. **Add as little as possible.** Every dependency is something to learn, update and audit.

## The three options

|                            | Next.js form actions                                                                        | React Hook Form                                                                                                                                                                       | TanStack Form                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What it is                 | React 19's `<form action>`, `useActionState` and `useFormStatus`, with a Next Server Action | A client form-state library built on uncontrolled inputs and `register`                                                                                                               | A headless, typed form-state library, with a Next.js adapter                                                                                                                                            |
| Version (npm, 2026-10-15)  | Ships with React 19.3 and Next 16.4                                                         | 7.90.0 stable. 8.0.0 is in beta                                                                                                                                                       | 1.33.5 stable. 2.0.0 is in alpha                                                                                                                                                                        |
| New dependencies           | None                                                                                        | `react-hook-form`                                                                                                                                                                     | `@tanstack/react-form` or `@tanstack/react-form-nextjs`, which bring `form-core` and `react-store`                                                                                                      |
| Works with JavaScript off  | **Yes.** The form posts to the Server Action, and the page renders with the returned state  | **No, in the documented pattern.** `onSubmit={handleSubmit(data => submitAction(data))}` only runs with JavaScript. You could add `action` as well, but then you run two submit paths | **Mostly.** Its Next guide sets both `action` and `onSubmit`, so the form still posts. Inputs are controlled, so each needs an explicit `name`                                                          |
| Server errors from Nest    | Return them from the action. Render them from `state`                                       | Copy them into the form with `setError` inside a `useEffect`, as its docs show                                                                                                        | Return a TanStack form state from the action (`createServerValidate` and `ServerValidateError`), then merge it with `useTransform` and `mergeForm`. We would map Nest's 400 into TanStack's error shape |
| Validation in the browser  | Native attributes only                                                                      | Rules in `register`, or a resolver. Resolvers point towards zod and similar libraries                                                                                                 | Validator functions per field, or a Standard Schema library                                                                                                                                             |
| React Compiler             | Native React, so nothing to check                                                           | **Supported in v8 only**, which is still beta. v7's `formState` is a proxy that subscribes only to properties read during render                                                      | No compiler problems documented. It uses a store with selectors. Check before adopting                                                                                                                  |
| Base UI `Field` and `Form` | **Documented.** Pass `state.errors` to `<Form errors>`                                      | Documented, through `Controller`                                                                                                                                                      | Not documented. We would wire `field.state.meta.errors` into `Field.Root invalid` and `Field.Error match` by hand                                                                                       |
| Composition style          | Plain JSX and shared parts                                                                  | Hooks plus `Controller` render props                                                                                                                                                  | `form.Field` render props, and `createFormHook` for pre-bound field components                                                                                                                          |
| Strong at                  | Simple forms that post and show server errors                                               | Large client forms, field arrays, a big ecosystem                                                                                                                                     | Typed field-level state, arrays, dependent fields, async validators, server merge                                                                                                                       |

Sources: React Hook Form docs (advanced usage, the v7 to v8 migration, `formState`); TanStack Form docs (SSR guide); Next.js docs (forms and authentication guides); Base UI v1.9.0 docs (forms handbook). Each was checked through Context7 on 2026-10-15.

## Why Next.js form actions win today

- **They meet every requirement with nothing added.** They work with JavaScript off, and they show Nest's errors directly. They need no schema, are plain React, and add no dependency.
- **Base UI documents this exact pairing.** `<Form action={formAction} errors={state.errors}>` puts server errors on the right `Field.Error`, and sets `aria-invalid` and the described-by link. This is what the audit's culprit 2 needs.
- **Almost every form planned in the epic is small:** sign up, sign in, forgot and reset password, an abiding of 1 to 280 characters, a reply, a report, a new group. Only the Lane Night invite and group roles might hold a list, and those are Phase 3 and 4 work.
- **AUTH-7 already works this way.** Switching now would mean rewriting working forms for no gain to members.

## Why not React Hook Form

- **It breaks rule 1.** Its documented Server Action pattern submits only from JavaScript.
- **It doesn't handle server errors well.** It pulls them in through `setError` in an effect, which is extra code in every form.
- **React Compiler support is in a beta.** v7, the stable line, has no official support, and its proxy-based `formState` needs care. v8 fixes that but isn't stable.
- **It pulls towards zod.** Its strength is client validation through resolvers, which this app has chosen not to do.

## When to bring in TanStack Form

Bring it in for **one form** when any of these is true, and record the choice in that story:

- The form holds a list the member can add to and remove from. Examples: picking several friends to invite to a Lane Night game (API-22), or managing roles on a group's settings page.
- The form has steps, and its state must survive moving between them.
- One field's rules or options depend on another field's live value, in a way native attributes can't express.
- The form needs async checks while typing, such as "username taken".

Why TanStack Form over React Hook Form at that point:

- It keeps `action` on the form, so JavaScript-off posting still works.
- It has a documented way to merge server state.
- It needs no schema library.
- Its `createFormHook` lets us bind our `Field` parts once, which matches `ui-composition`.

Its 2.0 is in alpha today. Check whether 2.0 is stable before adopting it, and confirm React Compiler behaviour with a spec.

## What this changes

- **WEB-54** builds `Field` on Base UI `Form` and `Field`, fed by `useActionState`. The shared `Field` also takes `invalid` and `errors` props directly, so a form library can drive it later without changing the part.
- **`ui-composition`** (`references/base-ui.md`) points here for form state.
- **`fe-tdd-dev`** adds no form library without a story that meets the "When to bring in TanStack Form" test above.
- **`context/frontend-architecture.md`**: the Forms row links here.
