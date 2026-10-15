# Testing shared parts

Specs sit next to the part (`ui/<Name>/<Name>.spec.tsx`) and run with `pnpm --filter @dudesphere/web test`. Use Vitest and Testing Library, as the rest of `apps/web` does. Act as the member with `@testing-library/user-event`: call `const user = userEvent.setup()` before `render`, then `await user.click(...)`, `user.type`, `user.keyboard` or `user.tab`. Never use `fireEvent`. A lint rule blocks it (see `context/coding-standards.md`). Write the spec first.

## What every part's spec covers

1. **Role and name.** Query by role and accessible name, never by class.
2. **`className` merges.** A passed class is added. The part's own class is kept.
3. **Variant or tone.** Each value shows up as the matching data attribute.
4. **Native props and `ref` reach the root.** For example `type`, `aria-*`, `data-*` and `id`, and a ref object ends up holding the root element.
5. **The accessibility the part owns.** For example, `pending` sets `aria-disabled` and blocks the click. A composed field's error is linked through `aria-describedby`, and `aria-invalid` is set. A Notice is a status region.

## Template

```tsx
// apps/web/src/components/ui/Button/Button.spec.tsx
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders a button with its accessible name", () => {
    render(<Button>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<Button className="extra">Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass("extra");
    expect(button.classList.length).toBeGreaterThan(1);
  });

  it("shows the variant as a data attribute", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("data-variant", "primary");
  });

  it("passes native props and ref to the button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" aria-describedby="hint">
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("aria-describedby", "hint");
    expect(ref.current).toBe(button);
  });

  it("stays focusable but ignores clicks while pending", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });
});
```

## Feature specs that use parts

- A feature spec tests what the feature does: its copy, its data, its states, and what it sends. It doesn't test a part's internals again. If the Button spec proves `pending` blocks clicks, the SignInForm spec checks only that the button is pending while the action runs.
- Keep querying by role and name. Then moving markup into a part doesn't break feature specs. Today's specs already work this way. The one exception was a class-name check in `ThemeToggle.spec.tsx`. WEB-54 rewrote it to check visibility and role.
- Check styles only through data attributes, never through computed CSS. jsdom doesn't apply CSS Modules.
- **Server HTML.** jsdom runs with JavaScript on, so it can't show what a browser gets with JavaScript off. For that, render with `renderToString` from `react-dom/server` and assert on the HTML string: the label's `for`, `aria-invalid="true"`, `aria-describedby` naming the hint and error ids, both elements, and no `novalidate`. `SignInForm.server.spec.tsx` and `SignUpForm.server.spec.tsx` show it. A Playwright test can't do this yet, because Next bug vercel/next.js#99756 gives a blank page with JavaScript off.

## Browser checks

- Playwright with `@axe-core/playwright` runs the accessibility scan on pages, not on single parts.
- A part with real behaviour (Dialog, Popover, a composed field with server errors) also gets a keyboard path in the first story's Playwright flow: Tab in, Escape out, and focus coming back to the trigger.
