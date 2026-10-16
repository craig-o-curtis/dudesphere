import { render, screen } from "@testing-library/react";
import { use } from "react";
import { renderToString } from "react-dom/server";

import ResetPasswordPage, { metadata } from "./page";

let pending = false;

vi.mock("@/components/ResetPasswordForm/ResetPasswordFromLink", () => ({
  ResetPasswordFromLink: ({ searchParams }: { searchParams: Promise<unknown> }) => {
    // A promise that never settles keeps the <Suspense> fallback on screen.
    if (pending) use(new Promise(() => {}));
    void searchParams;
    return <form aria-label="form" />;
  },
}));

describe("ResetPasswordPage", () => {
  it("has the title, an h1 and the form hole", () => {
    render(<ResetPasswordPage searchParams={Promise.resolve({})} />);
    expect(metadata.title).toBe("Reset password");
    expect(screen.getByRole("heading", { level: 1, name: "Reset password" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "form" })).toBeInTheDocument();
  });

  it("tells a visitor without JavaScript what to do, in the fallback", () => {
    pending = true;
    try {
      const html = renderToString(<ResetPasswordPage searchParams={Promise.resolve({})} />);
      expect(html).toContain("<noscript>");
      expect(html).toContain("Turn on JavaScript to set a new password.");
    } finally {
      pending = false;
    }
  });
});
