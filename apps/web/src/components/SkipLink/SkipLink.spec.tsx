import { render, screen } from "@testing-library/react";

import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("is a link to the main landmark", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });
});
