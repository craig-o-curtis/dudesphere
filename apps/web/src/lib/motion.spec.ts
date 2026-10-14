import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DURATION, EASE_OUT, enter, fadeIn, pickPreset, press, presets } from "./motion";

const tokens = readFileSync(join(import.meta.dirname, "../styles/tokens.css"), "utf8");

function readToken(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!match?.[1]) throw new Error(`Token ${name} not found in tokens.css`);
  return match[1].trim();
}

function msToSeconds(value: string): number {
  const match = /^([\d.]+)ms$/.exec(value);
  if (!match?.[1]) throw new Error(`Not a millisecond value: ${value}`);
  return Number(match[1]) / 1000;
}

describe("motion constants", () => {
  it.each(["fast", "base", "slow", "fade"] as const)("DURATION.%s matches --dur-%s", (key) => {
    expect(DURATION[key]).toBeCloseTo(msToSeconds(readToken(`--dur-${key}`)), 5);
  });

  it("EASE_OUT matches --ease-out", () => {
    const parts = /cubic-bezier\(([^)]+)\)/
      .exec(readToken("--ease-out"))?.[1]
      ?.split(",")
      .map(Number);
    expect([...EASE_OUT]).toEqual(parts);
  });
});

describe("presets", () => {
  function animatedKeys(value: object): string[] {
    const { transition: _transition, ...states } = value as Record<string, unknown>;
    return Object.values(states).flatMap((state) =>
      state && typeof state === "object" ? Object.keys(state) : [],
    );
  }

  it("includes fadeIn, enter and press", () => {
    expect(Object.keys(presets).sort()).toEqual(["enter", "fadeIn", "press"]);
  });

  it.each(Object.entries(presets))("%s reduced variant animates only opacity", (_name, preset) => {
    const keys = animatedKeys(preset.reduced);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set(["opacity"]));
  });

  it.each(Object.entries(presets))(
    "%s reduced variant is no longer than DURATION.fade",
    (_name, preset) => {
      expect(preset.reduced.transition.duration).toBeLessThanOrEqual(DURATION.fade);
    },
  );

  it("pickPreset returns the reduced variant when asked to reduce", () => {
    expect(pickPreset(enter, true)).toBe(enter.reduced);
    expect(pickPreset(enter, false)).toBe(enter.full);
    expect(pickPreset(enter, null)).toBe(enter.full);
  });

  it("full variants use the shared ease", () => {
    for (const preset of [fadeIn, enter, press]) {
      expect(preset.full.transition.ease).toEqual(EASE_OUT);
    }
  });
});
