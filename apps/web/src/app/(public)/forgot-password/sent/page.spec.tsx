import { render, screen } from "@testing-library/react";

import SentPage, { metadata } from "./page";

describe("ForgotPasswordSentPage", () => {
  it("says the same thing whether or not an account exists, and links to sign in", () => {
    render(<SentPage />);
    expect(metadata.title).toBe("Check your email");
    expect(screen.getByRole("heading", { level: 1, name: "Check your email" })).toBeInTheDocument();
    expect(
      screen.getByText("If that address has an account, we sent it a link."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });
});
