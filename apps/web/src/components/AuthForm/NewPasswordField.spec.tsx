import { render, screen } from "@testing-library/react";

import { NewPasswordField } from "./NewPasswordField";

describe("NewPasswordField", () => {
  it("carries the password rules and new-password autofill", () => {
    render(<NewPasswordField name="password" label="Password" hint="12 to 128 characters." />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "12");
    expect(input).toHaveAttribute("maxlength", "128");
    expect(input).toHaveAttribute("title", "12 to 128 characters.");
    expect(input).toHaveAttribute("pattern");
    expect(screen.getByText("12 to 128 characters.")).toBeInTheDocument();
  });
});
