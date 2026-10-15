import { render, screen } from "@testing-library/react";

import { readSessionCookies } from "@/lib/session";

import { SessionCorner, SessionCornerSkeleton } from "./SessionCorner";

vi.mock("@/lib/session", () => ({ readSessionCookies: vi.fn() }));

const TOKEN = "e2e-fake-access-token-value";
const REFRESH = "e2e-fake-refresh-token-value";

async function renderCorner(accessToken: string | null, signout?: string | string[]) {
  vi.mocked(readSessionCookies).mockResolvedValue({
    accessToken,
    refreshToken: accessToken ? REFRESH : null,
  });
  return render(await SessionCorner({ searchParams: Promise.resolve(signout ? { signout } : {}) }));
}

describe("SessionCorner", () => {
  describe("signed out", () => {
    it("shows the Sign in and Sign up links", async () => {
      await renderCorner(null);
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
      expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("signed out after a partial sign-out", () => {
    const message =
      "You're signed out here, but we couldn't reach your other devices. Sign in and try Sign out everywhere again.";

    it("shows the message in a status element", async () => {
      await renderCorner(null, "partial");
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    });

    it("shows the ended message for signout=ended", async () => {
      await renderCorner(null, "ended");
      expect(screen.getByRole("status")).toHaveTextContent(
        "This sign-in had already ended, so you're signed out here. To be sure your other devices are signed out, sign in and press Sign out everywhere.",
      );
    });

    it("shows nothing for ended when signed in", async () => {
      await renderCorner(TOKEN, "ended");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows nothing for any other value", async () => {
      await renderCorner(null, "nope");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows nothing when there is no signout value", async () => {
      await renderCorner(null);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows nothing when signed in", async () => {
      await renderCorner(TOKEN, "partial");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("signed in", () => {
    it("says so and offers two post forms to the logout handlers", async () => {
      const { container } = await renderCorner(TOKEN);
      expect(screen.getByText("You're signed in.")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();

      const forms = container.querySelectorAll("form");
      expect(forms).toHaveLength(2);
      expect(forms[0]).toHaveAttribute("method", "post");
      expect(forms[0]).toHaveAttribute("action", "/api/auth/logout");
      expect(forms[1]).toHaveAttribute("method", "post");
      expect(forms[1]).toHaveAttribute("action", "/api/auth/logout-everywhere");
      expect(forms[0]?.querySelector("button")).toHaveTextContent("Sign out");
      expect(forms[0]?.querySelectorAll("input")).toHaveLength(0);
      expect(forms[1]?.querySelectorAll("input")).toHaveLength(0);
    });

    it("links the hint to the Sign out everywhere button", async () => {
      await renderCorner(TOKEN);
      const button = screen.getByRole("button", { name: "Sign out everywhere" });
      expect(button).toHaveAccessibleDescription("Signs you out on every device.");
    });

    it("renders no token", async () => {
      const { container } = await renderCorner(TOKEN);
      expect(container.innerHTML).not.toContain(TOKEN);
      expect(container.innerHTML).not.toContain(REFRESH);
    });
  });

  describe("SessionCornerSkeleton", () => {
    it("matches the signed-out view", async () => {
      const signedOut = await renderCorner(null);
      const expected = signedOut.container.innerHTML;
      signedOut.unmount();
      const { container } = render(<SessionCornerSkeleton />);
      expect(container.innerHTML).toBe(expected);
    });
  });
});
