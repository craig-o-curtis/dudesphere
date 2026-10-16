import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { FocusedNotice } from "./FocusedNotice";

// The sign-in form is in the static shell, and the notice streams in later.
// This stands in for that: the member is typing before the notice arrives.
function LoginLike() {
  const [shown, setShown] = useState(false);
  return (
    <>
      {shown ? <FocusedNotice>Password changed. Roll in with the new one.</FocusedNotice> : null}
      <label>
        Email
        <input onChange={(event) => setShown(event.target.value.length >= 3)} />
      </label>
    </>
  );
}

describe("FocusedNotice", () => {
  it("takes focus when nothing else has it", () => {
    render(<FocusedNotice>Password changed.</FocusedNotice>);
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("leaves focus where it is when the member is already typing", async () => {
    const user = userEvent.setup();
    render(<LoginLike />);

    await user.click(screen.getByLabelText("Email"));
    await user.keyboard("e2e-0a1b2c3d4e5f@example.com");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("e2e-0a1b2c3d4e5f@example.com");
  });
});
