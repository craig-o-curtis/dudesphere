import { render, screen } from "@testing-library/react";

import Home from "./page";

describe("Home", () => {
  it("names the app", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "The Dudesphere" })).toBeInTheDocument();
  });

  it("reads the frame count from the shared lane engine", () => {
    render(<Home />);
    expect(screen.getByText(/10 frames, no hurry/)).toBeInTheDocument();
  });
});
