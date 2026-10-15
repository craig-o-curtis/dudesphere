import { render, screen } from "@testing-library/react";

import Home from "./page";

// SessionCorner is an async Server Component, which Testing Library cannot
// render. Swap it for a stand-in.
vi.mock("@/components/SessionCorner/SessionCorner", () => ({
  SessionCorner: () => null,
  SessionCornerSkeleton: () => <p>Sign in</p>,
}));

describe("Home", () => {
  it("names the app", () => {
    render(<Home searchParams={Promise.resolve({})} />);
    expect(screen.getByRole("heading", { level: 1, name: "Dudesphere" })).toBeInTheDocument();
  });

  it("reads the frame count from the shared lane engine", () => {
    render(<Home searchParams={Promise.resolve({})} />);
    expect(screen.getByText(/10 frames, no hurry/)).toBeInTheDocument();
  });
});
