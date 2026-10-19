import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { requireAdmin } from "@/lib/session";

import { LabIndex, LabIndexSkeleton } from "./LabIndex";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireAdmin: vi.fn() }));

import { labRoutes, labStrategies } from "@/content/lab";

async function renderIndex() {
  vi.mocked(requireAdmin).mockResolvedValue({} as never);
  return render(await LabIndex());
}

describe("LabIndex", () => {
  it("checks the admin role for /lab before any row renders", async () => {
    vi.mocked(requireAdmin).mockReturnValue(new Promise(() => {}));
    const { container } = render(<div />);
    void LabIndex();
    expect(requireAdmin).toHaveBeenCalledWith("/lab");
    expect(container.textContent).toBe("");
    expect(screen.queryByText(labRoutes[0].why)).toBeNull();
  });

  it("does not catch what requireAdmin throws", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;403"));
    await expect(LabIndex()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
  });

  it("renders one h2 per strategy, in order, with its meaning", async () => {
    await renderIndex();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(labStrategies.length);
    expect(headings.map((heading) => heading.textContent)).toEqual(
      labStrategies.map((strategy) => strategy.name.replaceAll("`", "")),
    );
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("renders every row under its strategy, with story and status", async () => {
    await renderIndex();
    const groups = screen.getAllByRole("region");
    expect(groups).toHaveLength(labStrategies.length);
    labStrategies.forEach((strategy, index) => {
      const rows = labRoutes.filter((row) => row.strategy === strategy.name);
      const items = within(groups[index]).getAllByRole("listitem");
      expect(items).toHaveLength(rows.length);
      rows.forEach((row, rowIndex) => {
        const text = items[rowIndex].textContent ?? "";
        expect(text).toContain(row.route);
        expect(text).toContain(row.story);
        expect(text).toContain(row.status === "built" ? "Built" : "Planned");
        expect(text).toContain(row.why.replaceAll("`", ""));
        expect(text).toContain(row.apis.replaceAll("`", ""));
      });
    });
  });

  it("links a row only when it has an href", async () => {
    await renderIndex();
    const withHref = labRoutes.filter((row) => row.href);
    expect(screen.getAllByRole("link")).toHaveLength(withHref.length);
    for (const row of withHref) {
      expect(
        screen
          .getAllByRole("link", { name: row.route })
          .some((a) => a.getAttribute("href") === row.href),
      ).toBe(true);
    }
  });

  it("shows backticked text as code", async () => {
    const { container } = await renderIndex();
    expect(container.querySelector("code")).not.toBeNull();
    expect(container.textContent).not.toContain("`");
  });

  it("has a skeleton", () => {
    render(<LabIndexSkeleton />);
    expect(screen.getByText("Loading the lab.")).toBeInTheDocument();
  });

  it("tells a visitor without JavaScript what to do, in the fallback", () => {
    const html = renderToString(<LabIndexSkeleton />);
    expect(html).toContain("<noscript>");
    expect(html).toContain("This page needs JavaScript.");
    expect(html).not.toContain("<script");
  });
});
