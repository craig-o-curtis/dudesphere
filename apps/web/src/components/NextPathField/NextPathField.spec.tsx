import { render } from "@testing-library/react";

import { NextPathField } from "./NextPathField";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

function hidden(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[name="next"]');
}

describe("NextPathField", () => {
  it("writes the next param into a hidden input", () => {
    search = "next=%2Fdudes%2F1%3Fx%3D1";
    const { container } = render(<NextPathField />);
    const input = hidden(container);
    expect(input).toHaveAttribute("type", "hidden");
    expect(input).toHaveValue("/dudes/1?x=1");
  });

  it("renders nothing when the param is missing", () => {
    search = "";
    const { container } = render(<NextPathField />);
    expect(hidden(container)).toBeNull();
  });

  it("renders nothing when the param is empty", () => {
    search = "next=";
    const { container } = render(<NextPathField />);
    expect(hidden(container)).toBeNull();
  });
});
