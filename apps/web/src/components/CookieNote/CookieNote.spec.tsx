import { render, screen } from "@testing-library/react";

import { CookieNote } from "./CookieNote";

describe("CookieNote", () => {
  it("says what the cookies are for, word for word", () => {
    render(<CookieNote />);
    expect(
      screen.getByText(
        "Signing in sets two cookies that keep you signed in. Picking a theme sets one more. No tracking, no ads. Take it easy.",
      ),
    ).toBeInTheDocument();
  });
});
