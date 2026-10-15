import { render, screen } from "@testing-library/react";
import { Suspense } from "react";

import FeedPage, { metadata } from "./page";

vi.mock("@/components/FeedWelcome/FeedWelcome", () => ({
  FeedWelcome: () => <p>welcome</p>,
  FeedWelcomeSkeleton: () => <p data-testid="skeleton" />,
}));

describe("FeedPage", () => {
  it("has the title Feed", () => {
    expect(metadata.title).toBe("Feed");
  });

  it("renders the h1 Feed", () => {
    render(<FeedPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Feed" })).toBeInTheDocument();
  });

  it("wraps the welcome in Suspense with the skeleton as the fallback", () => {
    const { props } = FeedPage() as unknown as {
      props: { children: Array<{ type: unknown; props: { fallback?: { type: unknown } } }> };
    };
    const children = [props.children].flat();
    const suspense = children.find((child) => child.type === Suspense);
    expect(suspense).toBeDefined();
    expect(suspense?.props.fallback).toBeDefined();
  });
});
