import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Cluster } from "./Cluster";

describe("Cluster", () => {
  it("renders its children in a div by default", () => {
    render(<Cluster data-testid="cluster">Inside</Cluster>);
    const cluster = screen.getByTestId("cluster");
    expect(cluster.tagName).toBe("DIV");
    expect(cluster).toHaveTextContent("Inside");
  });

  it("renders the element named by as, keeping its role", () => {
    render(
      <Cluster as="ul" aria-label="Links">
        <li>One</li>
      </Cluster>,
    );
    expect(screen.getByRole("list", { name: "Links" })).toBeInTheDocument();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <Cluster className="extra" data-testid="cluster">
        x
      </Cluster>,
    );
    const cluster = screen.getByTestId("cluster");
    expect(cluster).toHaveClass("extra");
    expect(cluster.classList.length).toBeGreaterThan(1);
  });

  it("shows gap, align and justify as data attributes, with defaults", () => {
    const { rerender } = render(<Cluster data-testid="cluster">x</Cluster>);
    const cluster = screen.getByTestId("cluster");
    expect(cluster).toHaveAttribute("data-gap", "3");
    expect(cluster).toHaveAttribute("data-align", "center");
    expect(cluster).toHaveAttribute("data-justify", "start");
    rerender(
      <Cluster gap={5} align="end" justify="between" data-testid="cluster">
        x
      </Cluster>,
    );
    expect(cluster).toHaveAttribute("data-gap", "5");
    expect(cluster).toHaveAttribute("data-align", "end");
    expect(cluster).toHaveAttribute("data-justify", "between");
  });

  it("has no column gap attribute unless one is set", () => {
    const { rerender } = render(<Cluster data-testid="cluster">x</Cluster>);
    const cluster = screen.getByTestId("cluster");
    expect(cluster).not.toHaveAttribute("data-column-gap");
    rerender(
      <Cluster gap={3} columnGap={4} data-testid="cluster">
        x
      </Cluster>,
    );
    expect(cluster).toHaveAttribute("data-gap", "3");
    expect(cluster).toHaveAttribute("data-column-gap", "4");
  });

  it("passes native props and ref to the root, with no inline style", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Cluster ref={ref} id="c" data-testid="cluster">
        x
      </Cluster>,
    );
    const cluster = screen.getByTestId("cluster");
    expect(cluster).toHaveAttribute("id", "c");
    expect(ref.current).toBe(cluster);
    expect(cluster).not.toHaveAttribute("style");
  });
});
