import { render, screen } from "@testing-library/react";

import { MotionProvider } from "./MotionProvider";

describe("MotionProvider", () => {
  it("renders its children", () => {
    render(
      <MotionProvider>
        <p>Strike</p>
      </MotionProvider>,
    );
    expect(screen.getByText("Strike")).toBeInTheDocument();
  });
});
