import { render, screen } from "@testing-library/react";

import ForgotPasswordPage, { metadata } from "./page";

vi.mock("@/components/ForgotPasswordForm/ForgotPasswordForm", () => ({
  ForgotPasswordForm: () => <form aria-label="form" />,
}));

describe("ForgotPasswordPage", () => {
  it("has the title, an h1 and the form", () => {
    render(<ForgotPasswordPage />);
    expect(metadata.title).toBe("Forgot password");
    expect(screen.getByRole("heading", { level: 1, name: "Forgot password" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "form" })).toBeInTheDocument();
  });
});
