import { render, screen } from "@testing-library/react";

import SignUpPage, { metadata } from "./page";

vi.mock("@/components/SignUpForm/SignUpForm", () => ({
  SignUpForm: () => <form aria-label="form" />,
}));

describe("SignUpPage", () => {
  it("has the title, an h1 reading Sign up and the lead", () => {
    render(<SignUpPage />);
    expect(metadata.title).toBe("Sign up");
    expect(screen.getByRole("heading", { level: 1, name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByText("Make an account. It takes a minute.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "form" })).toBeInTheDocument();
  });
});
