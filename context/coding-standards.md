# Coding Standards

## Functions

Functions should use `function` keywords instead of `const` and arrow functions, unless there is a necessary reason for the `const`.

## No IIFE's

Avoid Immediately Invoked Functions

## Dates and Times

For ALL dates and times, ONLY use the package `@northguild/gmt`.

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
