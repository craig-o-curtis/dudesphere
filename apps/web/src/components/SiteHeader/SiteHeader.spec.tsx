import { render, screen } from "@testing-library/react";

import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("is a banner landmark", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("holds a link named Dudesphere that goes to the home page", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "Dudesphere" });
    expect(link).toHaveAttribute("href", "/");
    expect(screen.getByRole("banner")).toContainElement(link);
  });
});
