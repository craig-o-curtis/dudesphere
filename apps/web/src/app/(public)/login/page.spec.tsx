import { render, screen } from "@testing-library/react";

import LoginPage, { metadata } from "./page";

vi.mock("@/components/SignInForm/SignInForm", () => ({
  SignInForm: () => <form aria-label="form" />,
}));

describe("LoginPage", () => {
  it("has the title and an h1 reading Sign in", () => {
    render(<LoginPage />);
    expect(metadata.title).toBe("Sign in");
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "form" })).toBeInTheDocument();
  });
});
