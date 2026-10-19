import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The real module throws outside a server bundle.
vi.mock("server-only", () => ({}));

import { labRoutes, labStrategies } from "./lab";

const markdown = readFileSync(
  resolve(import.meta.dirname, "../../../../context/epic-lebowski/rendering-strategies.md"),
  "utf8",
);

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

// The rows of the first table that follows `heading` and starts with `firstHeader`.
function tableRows(heading: RegExp, firstHeader: string): string[][] {
  const lines = markdown.split("\n");
  const from = lines.findIndex((line) => heading.test(line));
  const header = lines.findIndex(
    (line, index) => index >= from && line.startsWith(`| ${firstHeader} `),
  );
  if (from === -1 || header === -1) throw new Error(`No "${firstHeader}" table after ${heading}`);
  const rows: string[][] = [];
  for (let i = header + 2; lines[i]?.startsWith("|"); i++) rows.push(cells(lines[i]));
  return rows;
}

const markdownStrategyRows = tableRows(/^## The strategies/, "Strategy");
const markdownStrategies = markdownStrategyRows.map(([name]) => name);

// The route cell must be wrapped in backticks, as the Routes table writes it.
function routeOf(cell: string): string {
  const match = /^`([^`]+)`$/.exec(cell);
  if (!match) throw new Error(`The route needs backticks in the markdown: ${cell}`);
  return match[1];
}

// Only "Built" and "Planned" are valid. Anything else, such as "PLANNED", fails.
function statusOf(cell: string): "built" | "planned" {
  if (cell === "Built") return "built";
  if (cell === "Planned") return "planned";
  throw new Error(`Status must be exactly "Built" or "Planned": ${cell}`);
}

const markdownRoutes = tableRows(/^## Routes/, "Route").map(
  ([route, strategy, apis, why, story, status]) => ({
    route: routeOf(route),
    strategy,
    apis,
    why,
    story,
    status: statusOf(status),
  }),
);

type Row = {
  route: string;
  strategy: string;
  apis: string;
  why: string;
  story: string;
  status: string;
};

function key(row: Row): string {
  return [row.route, row.strategy, row.apis, row.why, row.story, row.status].join(" | ");
}

describe("lab.ts and rendering-strategies.md", () => {
  it("lists the same strategies, in the same order", () => {
    expect(labStrategies.map((strategy) => strategy.name)).toEqual(markdownStrategies);
  });

  it("gives every strategy the same meaning in both copies", () => {
    expect(labStrategies.map((strategy) => strategy.meaning)).toEqual(
      markdownStrategyRows.map(([, meaning]) => meaning),
    );
  });

  it("has at least one row for every strategy", () => {
    for (const { name } of labStrategies) {
      expect(
        labRoutes.some((row) => row.strategy === name),
        `no row for "${name}"`,
      ).toBe(true);
    }
  });

  it("has a row in the markdown for every row in lab.ts", () => {
    const inMarkdown = new Set(markdownRoutes.map(key));
    for (const row of labRoutes) {
      expect(inMarkdown.has(key(row)), `missing from the markdown: ${key(row)}`).toBe(true);
    }
  });

  it("has a row in lab.ts for every row in the markdown", () => {
    const inCode = new Set(labRoutes.map(key));
    for (const row of markdownRoutes) {
      expect(inCode.has(key(row)), `missing from lab.ts: ${key(row)}`).toBe(true);
    }
  });

  it("has no repeated route and strategy in either copy", () => {
    function pair(row: Row): string {
      return `${row.route} | ${row.strategy}`;
    }
    expect(new Set(labRoutes.map(pair)).size).toBe(labRoutes.length);
    expect(new Set(markdownRoutes.map(pair)).size).toBe(markdownRoutes.length);
  });

  it("gives a planned row no href", () => {
    for (const row of labRoutes.filter((r) => r.status === "planned")) {
      expect(row.href, `${row.route} is planned`).toBeUndefined();
    }
  });

  it("links a built page row to its own route, and no other row", () => {
    for (const row of labRoutes) {
      // A route with a [param] can't be linked. A /api route is a handler, and a file path is
      // not a URL.
      const linkable =
        row.status === "built" &&
        row.route.startsWith("/") &&
        row.route !== "/api" &&
        !row.route.startsWith("/api/") &&
        !row.route.includes("[");
      expect(row.href, `${row.route} (${row.strategy})`).toBe(linkable ? row.route : undefined);
    }
  });

  it("starts every href with / and never links into /api", () => {
    for (const row of labRoutes) {
      if (row.href === undefined) continue;
      expect(row.href.startsWith("/"), row.href).toBe(true);
      expect(row.href.startsWith("//"), row.href).toBe(false);
      expect(row.href === "/api" || row.href.startsWith("/api/"), row.href).toBe(false);
    }
  });
});
