import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import { getMe, requireSession } from "@/lib/session";

import { FeedWelcome, FeedWelcomeSkeleton } from "./FeedWelcome";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(), getMe: vi.fn() }));

async function renderWelcome() {
  return render(await FeedWelcome());
}

describe("FeedWelcome", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue({ accessToken: "e2e-fake-token", exp: 1 });
  });

  it("checks the session for /feed", async () => {
    vi.mocked(getMe).mockResolvedValue({ profile: { displayName: "Walter" } } as never);
    await renderWelcome();
    expect(requireSession).toHaveBeenCalledWith("/feed");
  });

  it("greets the member by display name", async () => {
    vi.mocked(getMe).mockResolvedValue({ profile: { displayName: "Walter" } } as never);
    await renderWelcome();
    expect(screen.getByText("Signed in as Walter.")).toBeInTheDocument();
  });

  it("says Signed in. when the profile is missing", async () => {
    vi.mocked(getMe).mockResolvedValue({} as never);
    await renderWelcome();
    expect(screen.getByText("Signed in.")).toBeInTheDocument();
  });

  it("says Signed in. when the profile has no display name", async () => {
    vi.mocked(getMe).mockResolvedValue({ profile: {} } as never);
    await renderWelcome();
    expect(screen.getByText("Signed in.")).toBeInTheDocument();
  });

  it("sends the member to /login?next=%2Ffeed when Nest answered 401 (null)", async () => {
    vi.mocked(getMe).mockResolvedValue(null);
    await expect(FeedWelcome()).rejects.toThrow("NEXT_REDIRECT /login?next=%2Ffeed");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Ffeed");
  });

  it("lets a Nest outage throw to the error boundary", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("outage"));
    await expect(FeedWelcome()).rejects.toThrow("outage");
  });
});

describe("FeedWelcomeSkeleton", () => {
  it("uses the same box classes as the greeting", async () => {
    vi.mocked(requireSession).mockResolvedValue({ accessToken: "e2e-fake-token", exp: 1 });
    vi.mocked(getMe).mockResolvedValue({ profile: { displayName: "Walter" } } as never);
    const real = await renderWelcome();
    const realClass = real.container.firstElementChild?.className;
    real.unmount();
    const { container } = render(<FeedWelcomeSkeleton />);
    expect(container.firstElementChild?.tagName).toBe("P");
    expect(container.firstElementChild?.className).toBe(realClass);
    expect(container).toHaveTextContent(/^\s*$/);
  });
});
