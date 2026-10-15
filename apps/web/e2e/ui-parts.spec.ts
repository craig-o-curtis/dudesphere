import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// Styles of the shared parts that jsdom can't test. No route uses SwitchInput
// or CheckboxInput yet, so each test mounts their real module CSS, the tokens
// and the global styles in a bare page. These tests need no server.
const SRC = join(process.cwd(), "src");

function read(file: string) {
  return readFileSync(join(SRC, file), "utf8").replace(/@import[^;]*;/g, "");
}

function barePage(scheme: "light" | "dark") {
  const css = [
    read("styles/tokens.css"),
    read("components/ui/SwitchInput/SwitchInput.module.css").replaceAll(".root", ".sw"),
    read("components/ui/CheckboxInput/CheckboxInput.module.css").replaceAll(".root", ".cb"),
    read("styles/globals.css"),
  ].join("\n");
  return `<!doctype html><html lang="en" data-theme="${scheme}"><head><title>t</title><style>${css}</style></head><body><main>
<input class="sw" type="checkbox" role="switch" id="switch" aria-invalid="true" aria-label="Switch">
<input class="cb" type="checkbox" id="checkbox" aria-invalid="true" aria-label="Checkbox">
</main></body></html>`;
}

for (const scheme of ["light", "dark"] as const) {
  for (const id of ["switch", "checkbox"]) {
    test.describe(`invalid ${id} (${scheme})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setContent(barePage(scheme));
      });

      test("shows the global focus ring when focused by keyboard (WCAG 2.4.7)", async ({
        page,
      }) => {
        await page.keyboard.press("Tab");
        if (id === "checkbox") await page.keyboard.press("Tab");
        const [focusColor, outlineColor, outlineWidth] = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const el = document.activeElement as HTMLElement;
          const probe = document.createElement("i");
          probe.style.color = root.getPropertyValue("--color-focus");
          document.body.append(probe);
          const style = getComputedStyle(el);
          return [getComputedStyle(probe).color, style.outlineColor, style.outlineWidth];
        });
        expect(outlineColor).toBe(focusColor);
        expect(outlineWidth).toBe("3px");
      });

      test("shows the danger cue when not focused (WCAG 1.4.11)", async ({ page }) => {
        const [dangerColor, shadow] = await page.evaluate((targetId) => {
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement("i");
          probe.style.color = root.getPropertyValue("--color-danger");
          document.body.append(probe);
          const el = document.getElementById(targetId) as HTMLElement;
          return [getComputedStyle(probe).color, getComputedStyle(el).boxShadow];
        }, id);
        expect(shadow).toContain(dangerColor);
        expect(shadow).toContain("2px");
      });
    });
  }
}

// In forced colours the shadow cue is dropped. Focus must show a ring and the
// invalid cue together, and the invalid look must differ from a valid one.
test.describe("focused invalid parts in forced colours", () => {
  test.use({ forcedColors: "active" });

  test.beforeEach(async ({ page }) => {
    await page.setContent(barePage("light"));
  });

  test("the switch keeps its thick border and shows the focus ring", async ({ page }) => {
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as HTMLElement);
      return { border: s.borderTopWidth, outline: s.outlineWidth, outlineStyle: s.outlineStyle };
    });
    expect(style.border).toBe("3px");
    expect(style.outlineStyle).not.toBe("none");
    expect(style.outline).toBe("3px");
  });

  test("the checkbox shows a double ring that a valid checkbox does not", async ({ page }) => {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const read = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.activeElement as HTMLElement);
        return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
      });
    const invalid = await read();
    expect(invalid.style).toBe("double");
    expect(invalid.offset).toBe("3px");

    await page.evaluate(() => document.getElementById("checkbox")!.removeAttribute("aria-invalid"));
    const valid = await read();
    expect(valid.style).toBe("solid");
    expect(valid.offset).toBe("3px");
    expect(parseFloat(invalid.width)).toBeGreaterThan(parseFloat(valid.width));
  });

  test("the unfocused checkbox keeps a solid invalid outline", async ({ page }) => {
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById("checkbox")!);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(style.style).toBe("solid");
    expect(style.width).toBe("3px");
  });
});
