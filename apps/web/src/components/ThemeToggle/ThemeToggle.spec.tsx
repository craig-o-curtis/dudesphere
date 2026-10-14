import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { setTheme } from "@/lib/actions/theme";
import { themeFromCookieHeader } from "@/lib/theme";

import { ThemeToggle } from "./ThemeToggle";

vi.mock("@/lib/actions/theme", () => ({ setTheme: vi.fn() }));
vi.mock("@/lib/theme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/theme")>()),
  themeFromCookieHeader: vi.fn(),
}));

type Saved = "light" | "dark" | null;

function light() {
  return screen.getByRole("button", { name: "Light" });
}

function dark() {
  return screen.getByRole("button", { name: "Dark" });
}

function deferred() {
  let resolve!: (value: Saved) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Saved>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.mocked(setTheme).mockReset();
    vi.mocked(setTheme).mockResolvedValue(null);
    vi.mocked(themeFromCookieHeader).mockReset();
    vi.mocked(themeFromCookieHeader).mockReturnValue(null);
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("shows Light and Dark buttons in a group named Theme", () => {
    render(<ThemeToggle current={null} />);
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toContainElement(light());
    expect(group).toContainElement(dark());
  });

  it("makes both buttons type=button, so no form can post", () => {
    const { container } = render(<ThemeToggle current={null} />);
    expect(light()).toHaveAttribute("type", "button");
    expect(dark()).toHaveAttribute("type", "button");
    expect(container.querySelector("form")).toBeNull();
  });

  it("carries data-theme-toggle on its root element", () => {
    const { container } = render(<ThemeToggle current={null} />);
    expect(container.firstElementChild).toHaveAttribute("data-theme-toggle");
  });

  it("presses neither button when there is no saved theme", () => {
    render(<ThemeToggle current={null} />);
    expect(light()).toHaveAttribute("aria-pressed", "false");
    expect(dark()).toHaveAttribute("aria-pressed", "false");
  });

  it("presses only Dark when the saved theme is dark", () => {
    render(<ThemeToggle current="dark" />);
    expect(light()).toHaveAttribute("aria-pressed", "false");
    expect(dark()).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the change at once and calls setTheme with the pressed theme", async () => {
    const pending = deferred();
    vi.mocked(setTheme).mockReturnValue(pending.promise);
    render(<ThemeToggle current={null} />);
    fireEvent.click(dark());
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(dark()).toHaveAttribute("aria-pressed", "true");
    expect(vi.mocked(setTheme)).toHaveBeenCalledWith("dark");
    await act(async () => pending.resolve("dark"));
  });

  it("shows neither pressed at once when the pressed button is pressed again", async () => {
    const pending = deferred();
    vi.mocked(setTheme).mockReturnValue(pending.promise);
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle current="dark" />);
    fireEvent.click(dark());
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(dark()).toHaveAttribute("aria-pressed", "false");
    expect(vi.mocked(setTheme)).toHaveBeenCalledWith("dark");
    await act(async () => pending.resolve(null));
  });

  it("adopts a null result: nothing pressed and no data-theme", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle current="light" />);
    fireEvent.click(dark());
    await act(async () => {});
    expect(light()).toHaveAttribute("aria-pressed", "false");
    expect(dark()).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("adopts a result that differs from the press (two tabs)", async () => {
    // Dark was pressed on a stale screen; the server says dark is saved.
    vi.mocked(setTheme).mockResolvedValue("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle current="dark" />);
    fireEvent.click(dark());
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    await act(async () => {});
    expect(dark()).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("lets the last press win when an older response arrives late", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(setTheme).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<ThemeToggle current={null} />);
    fireEvent.click(dark());
    fireEvent.click(light());
    await act(async () => second.resolve("light"));
    await act(async () => first.resolve("dark"));
    expect(light()).toHaveAttribute("aria-pressed", "true");
    expect(dark()).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  describe("when the save fails", () => {
    const MESSAGE = "Could not save your theme. Try again.";

    it("shows what the cookie says, reading it back from document.cookie, and does not throw", async () => {
      vi.mocked(setTheme).mockRejectedValue(new Error("Failed to fetch"));
      vi.mocked(themeFromCookieHeader).mockReturnValue("light");
      render(<ThemeToggle current={null} />);
      fireEvent.click(dark());
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      await act(async () => {});
      expect(vi.mocked(themeFromCookieHeader)).toHaveBeenCalledWith(document.cookie);
      expect(light()).toHaveAttribute("aria-pressed", "true");
      expect(dark()).toHaveAttribute("aria-pressed", "false");
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    it("adopts a cookie that changed even though the call failed (cut response)", async () => {
      vi.mocked(setTheme).mockRejectedValue(new Error("cut"));
      vi.mocked(themeFromCookieHeader).mockReturnValue("dark");
      render(<ThemeToggle current={null} />);
      fireEvent.click(dark());
      await act(async () => {});
      expect(dark()).toHaveAttribute("aria-pressed", "true");
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    it("shows no data-theme when the cookie holds no theme", async () => {
      vi.mocked(setTheme).mockRejectedValue(new Error("down"));
      document.documentElement.setAttribute("data-theme", "dark");
      render(<ThemeToggle current="dark" />);
      fireEvent.click(dark());
      await act(async () => {});
      expect(dark()).toHaveAttribute("aria-pressed", "false");
      expect(document.documentElement).not.toHaveAttribute("data-theme");
    });

    it("ignores a rejection from an older press when a newer press is in flight", async () => {
      const first = deferred();
      const second = deferred();
      vi.mocked(setTheme).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      render(<ThemeToggle current={null} />);
      fireEvent.click(dark());
      fireEvent.click(light());
      await act(async () => {
        first.reject(new Error("down"));
      });
      expect(light()).toHaveAttribute("aria-pressed", "true");
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      await act(async () => second.resolve("light"));
      expect(light()).toHaveAttribute("aria-pressed", "true");
    });

    it("keeps an empty status region until a save fails", () => {
      render(<ThemeToggle current={null} />);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("says the save failed in the status region, and clears it on the next press", async () => {
      vi.mocked(setTheme).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("dark");
      render(<ThemeToggle current={null} />);
      fireEvent.click(dark());
      await act(async () => {});
      expect(screen.getByRole("status")).toHaveTextContent(MESSAGE);
      fireEvent.click(dark());
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      await act(async () => {});
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("keeps the message out of the buttons' names", async () => {
      vi.mocked(setTheme).mockRejectedValue(new Error("down"));
      render(<ThemeToggle current={null} />);
      fireEvent.click(dark());
      await act(async () => {});
      expect(dark()).toHaveAccessibleName("Dark");
    });
  });

  describe("before hydration", () => {
    it("serves both buttons aria-disabled", () => {
      const html = renderToString(<ThemeToggle current={null} />);
      expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    });

    it("leaves them enabled once it is running in the browser", () => {
      render(<ThemeToggle current={null} />);
      expect(dark()).not.toHaveAttribute("aria-disabled");
    });
  });

  describe("pending (the streaming fallback)", () => {
    it("marks both buttons aria-disabled but keeps them type=button", () => {
      render(<ThemeToggle current={null} pending />);
      expect(light()).toHaveAttribute("aria-disabled", "true");
      expect(dark()).toHaveAttribute("aria-disabled", "true");
      expect(dark()).toHaveAttribute("type", "button");
    });

    it("does nothing when a button is pressed", () => {
      render(<ThemeToggle current={null} pending />);
      fireEvent.click(dark());
      expect(vi.mocked(setTheme)).not.toHaveBeenCalled();
      expect(document.documentElement).not.toHaveAttribute("data-theme");
      expect(dark()).toHaveAttribute("aria-pressed", "false");
    });

    it("leaves data-theme alone, so a dark page stays dark", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      render(<ThemeToggle current={null} pending />);
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    it("is not aria-disabled when it is not pending", () => {
      render(<ThemeToggle current={null} />);
      expect(dark()).not.toHaveAttribute("aria-disabled");
    });
  });

  describe("hint", () => {
    it("is visible text, not visually hidden", () => {
      render(<ThemeToggle current="dark" />);
      const hint = screen.getByText(/press the selected button again/i);
      expect(hint).toBeVisible();
      expect(hint.className).not.toMatch(/visuallyHidden|sr-only/);
    });

    it("describes only the pressed button", () => {
      render(<ThemeToggle current="dark" />);
      expect(dark()).toHaveAccessibleDescription(/device setting/i);
      expect(light()).not.toHaveAccessibleDescription();
    });

    it("describes nothing when no theme is chosen", () => {
      render(<ThemeToggle current={null} />);
      expect(dark()).not.toHaveAccessibleDescription();
      expect(light()).not.toHaveAccessibleDescription();
    });
  });
});
