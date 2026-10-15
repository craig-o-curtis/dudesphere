import type { Metadata, Viewport } from "next";
import { Bowlby_One } from "next/font/google";
import localFont from "next/font/local";

import { MotionProvider } from "@/components/MotionProvider/MotionProvider";
import { SiteFooter } from "@/components/SiteFooter/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader/SiteHeader";
import { SkipLink } from "@/components/ui/SkipLink/SkipLink";
import { themeInitScript } from "@/lib/theme";

import "../styles/globals.css";
import styles from "./layout.module.css";

const bowlby = Bowlby_One({
  weight: "400",
  variable: "--font-bowlby",
  display: "swap",
  subsets: ["latin"],
});

// Self-hosted so Next can measure the file and build a size-matched fallback.
// next/font/local cannot split files by unicode-range, so only the latin file
// loads. Only the latin subset is self-hosted, so letters outside it (for
// example ő or ł) use the size-matched Arial fallback.
const atkinson = localFont({
  src: [
    {
      path: "./fonts/AtkinsonHyperlegibleNext-latin.woff2",
      weight: "200 800",
      style: "normal",
    },
  ],
  variable: "--font-atkinson",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Dudesphere",
  description:
    "A place for dudes to abide: bowling, take-it-easy rituals and the occasional Caucasian.",
};

// The theme colors match --color-bg in tokens.css for each theme.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F0E4" },
    { media: "(prefers-color-scheme: dark)", color: "#14111F" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bowlby.variable} ${atkinson.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Without JavaScript the theme script cannot run, so the toggle has no effect. */}
        <noscript>
          <style>{"[data-theme-toggle]{display:none}"}</style>
        </noscript>
      </head>
      <body>
        <SkipLink href="#main">Skip to content</SkipLink>
        <SiteHeader />
        <MotionProvider>
          <main id="main" tabIndex={-1} className={styles.main}>
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
