import { render, screen } from "@testing-library/react";

import { SiteFooter } from "./SiteFooter";

// ThemeSetting is an async Server Component, which Testing Library cannot
// render. Swap it for a sync stand-in that renders the real ThemeToggle.
vi.mock("@/components/ThemeToggle/ThemeSetting", async () => {
  const { ThemeToggle } = await import("@/components/ThemeToggle/ThemeToggle");
  return { ThemeSetting: () => <ThemeToggle current="dark" /> };
});
vi.mock("@/lib/actions/theme", () => ({ setTheme: vi.fn() }));

const DISCLAIMER =
  "Dudesphere is a fan community inspired by The Big Lebowski. It is not affiliated with the film, its makers or Universal, nor with Dudeism and the Church of the Latter-Day Dude.";

describe("SiteFooter", () => {
  it("is a contentinfo landmark holding the exact disclaimer", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(DISCLAIMER);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("holds the Theme group inside the footer", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toContainElement(screen.getByRole("group", { name: "Theme" }));
  });
});
