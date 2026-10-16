import { render, screen } from "@testing-library/react";

import { LoginNotice, type ResetParams } from "./LoginNotice";

async function renderNotice(params: ResetParams) {
  render(await LoginNotice({ searchParams: Promise.resolve(params) }));
}

describe("LoginNotice", () => {
  it("shows the success notice for reset=1", async () => {
    await renderNotice({ reset: "1" });
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Password changed. Roll in with the new one.");
    expect(notice).toHaveAttribute("data-tone", "success");
    expect(notice).toHaveFocus();
  });

  it.each([{}, { reset: "0" }, { reset: "" }, { reset: "yes" }, { reset: ["1", "1"] }])(
    "shows nothing for %j",
    async (params) => {
      await renderNotice(params);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );
});
