import { render, screen } from "@testing-library/react";
import { Suspense } from "react";

import LabPage, { metadata } from "./page";

vi.mock("@/components/LabIndex/LabIndex", () => ({
  LabIndex: () => <p>rows</p>,
  LabIndexSkeleton: () => <p data-testid="skeleton" />,
}));

describe("LabPage", () => {
  it("has the title and keeps crawlers out", () => {
    expect(metadata.title).toBe("Rendering lab");
    expect(metadata.robots).toEqual({ index: false });
  });

  it("renders the h1 and an intro line", () => {
    render(<LabPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Rendering lab" })).toBeInTheDocument();
    expect(screen.getByText(/every rendering strategy/i)).toBeInTheDocument();
  });

  it("wraps the index in Suspense with the skeleton as the fallback", () => {
    const { props } = LabPage() as unknown as {
      props: { children: Array<{ type: unknown; props: { fallback?: unknown } }> };
    };
    const suspense = [props.children].flat().find((child) => child.type === Suspense);
    expect(suspense?.props.fallback).toBeDefined();
  });
});
