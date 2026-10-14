import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

type Tokens = Record<string, string>;

/** Returns the text between the braces that follow `header`, matching nested braces. */
function blockAfter(header: string): string {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`No block found for: ${header}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`Unclosed block for: ${header}`);
}

function declarations(block: string): Tokens {
  const result: Tokens = {};
  for (const match of block.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) {
    result[match[1]] = match[2].trim();
  }
  return result;
}

const light = declarations(blockAfter(":root {"));
const darkByAttribute = declarations(blockAfter(':root[data-theme="dark"]'));
const darkByMedia = declarations(blockAfter(':root:not([data-theme="light"])'));
const reduced = declarations(blockAfter("@media (prefers-reduced-motion: reduce)"));

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes: Array<[string, () => Tokens]> = [
  ["light", () => light],
  ["dark", () => ({ ...light, ...darkByAttribute })],
];

const surfaces = ["bg", "surface", "surface-raised"];

describe.each(themes)("%s theme contrast", (_name, getTokens) => {
  const t = getTokens();
  const color = (key: string) => t[`--color-${key}`];

  it("defines every color token as a hex value", () => {
    for (const key of [
      "bg",
      "surface",
      "surface-raised",
      "text",
      "text-muted",
      "accent",
      "on-accent",
      "accent-2",
      "danger",
      "success",
      "focus",
      "border",
      "border-strong",
    ]) {
      expect(color(key), key).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it.each(["text", "text-muted", "accent", "accent-2", "danger", "success"])(
    "%s reaches 4.5:1 on every surface",
    (fg) => {
      for (const bg of surfaces) {
        expect(contrast(color(fg), color(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("on-accent reaches 4.5:1 on accent", () => {
    expect(contrast(color("on-accent"), color("accent"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["focus", "border-strong"])("%s reaches 3:1 on bg and surface", (fg) => {
    for (const bg of ["bg", "surface"]) {
      expect(contrast(color(fg), color(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("theme switching", () => {
  it("sets color-scheme for each theme", () => {
    expect(light["color-scheme"]).toBe("light");
    expect(darkByAttribute["color-scheme"]).toBe("dark");
    expect(darkByMedia["color-scheme"]).toBe("dark");
  });

  it("gives the OS-driven dark block the same values as the data-theme block", () => {
    expect(darkByMedia).toEqual(darkByAttribute);
  });

  it("has a dark value for every color token", () => {
    const colors = Object.keys(light).filter((k) => k.startsWith("--color-"));
    expect(
      Object.keys(darkByAttribute)
        .filter((k) => k.startsWith("--color-"))
        .sort(),
    ).toEqual(colors.sort());
  });
});

describe("scales and motion", () => {
  it("defines space, radius, type and font tokens", () => {
    for (let i = 1; i <= 8; i++) {
      expect(light[`--space-${i}`]).toBe(`${i * 4}px`);
    }
    for (const k of ["--radius-s", "--radius-m", "--radius-pill"]) {
      expect(light[k], k).toBeDefined();
    }
    for (const k of ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"]) {
      expect(light[`--text-${k}`], k).toMatch(/^clamp\(/);
    }
    expect(light["--font-display"]).toBeDefined();
    expect(light["--font-text"]).toBeDefined();
  });

  it("defines the motion tokens", () => {
    expect(light["--dur-fast"]).toBe("150ms");
    expect(light["--dur-base"]).toBe("200ms");
    expect(light["--dur-slow"]).toBe("250ms");
    expect(light["--dur-fade"]).toBe("150ms");
    expect(light["--ease-out"]).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
  });

  it("shortens the three durations under reduced motion and keeps the fade", () => {
    expect(reduced["--dur-fast"]).toBe("0.01ms");
    expect(reduced["--dur-base"]).toBe("0.01ms");
    expect(reduced["--dur-slow"]).toBe("0.01ms");
    expect(reduced).not.toHaveProperty("--dur-fade");
  });
});

describe("browser theme color", () => {
  const layout = readFileSync(join(import.meta.dirname, "../app/layout.tsx"), "utf8");

  function themeColor(scheme: "light" | "dark"): string {
    const match = layout.match(
      new RegExp(`prefers-color-scheme: ${scheme}\\)",\\s*color:\\s*"(#[0-9A-Fa-f]{6})"`),
    );
    if (!match) throw new Error(`No ${scheme} themeColor found in layout.tsx`);
    return match[1];
  }

  it("matches --color-bg in the light theme", () => {
    expect(themeColor("light").toLowerCase()).toBe(light["--color-bg"].toLowerCase());
  });

  it("matches --color-bg in the dark theme", () => {
    expect(themeColor("dark").toLowerCase()).toBe(darkByAttribute["--color-bg"].toLowerCase());
  });
});
