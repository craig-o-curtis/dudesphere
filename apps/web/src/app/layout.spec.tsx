import { renderToStaticMarkup } from "react-dom/server";

import RootLayout from "./layout";

vi.mock("next/font/google", () => ({ Bowlby_One: () => ({ variable: "bowlby" }) }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "atkinson" }) }));
vi.mock("@/components/MotionProvider/MotionProvider", () => ({
  MotionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SiteHeader/SiteHeader", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/SiteFooter/SiteFooter", () => ({ SiteFooter: () => <footer /> }));

describe("RootLayout", () => {
  it("puts the skip link first in the body, aimed at main", () => {
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>Page</p>
      </RootLayout>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const first = doc.body.firstElementChild;
    expect(first?.tagName).toBe("A");
    expect(first?.getAttribute("href")).toBe("#main");
    expect(first?.textContent).toBe("Skip to content");
    expect(doc.querySelector("main#main")).not.toBeNull();
  });

  it("puts the header after the skip link and before main", () => {
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>Page</p>
      </RootLayout>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tags = [...doc.body.children].map((el) => el.tagName);
    expect(tags.slice(0, 3)).toEqual(["A", "HEADER", "MAIN"]);
  });
});
