import { render, screen } from "@testing-library/react";

import { ResetPasswordFromLink, type ResetPasswordParams } from "./ResetPasswordFromLink";

vi.mock("./ResetPasswordForm", () => ({
  ResetPasswordForm: ({ token }: { token: string | null }) => (
    <p data-testid="form">{token === null ? "none" : token}</p>
  ),
}));

async function renderLink(params: ResetPasswordParams) {
  render(await ResetPasswordFromLink({ searchParams: Promise.resolve(params) }));
  return screen.getByTestId("form");
}

describe("ResetPasswordFromLink", () => {
  it("passes the token on", async () => {
    expect(await renderLink({ token: "e2e-abc" })).toHaveTextContent("e2e-abc");
  });

  it.each([{}, { token: "" }, { token: ["a", "b"] }])("passes null for %j", async (params) => {
    expect(await renderLink(params)).toHaveTextContent("none");
  });
});
