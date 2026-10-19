import { render, screen } from "@testing-library/react";

import Forbidden from "./forbidden";

describe("forbidden.tsx", () => {
  it("says the room is one of the rules", () => {
    render(<Forbidden />);
    expect(screen.getByText("There are rules, and this room is one of them.")).toBeInTheDocument();
  });

  it("has one h1 of its own", () => {
    render(<Forbidden />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Off limits" })).toBeInTheDocument();
  });

  it("links back to the feed", () => {
    render(<Forbidden />);
    expect(screen.getByRole("link", { name: "Back to the feed" })).toHaveAttribute("href", "/feed");
  });
});
