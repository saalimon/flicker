import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Big_Shoulders } from "next/font/google";
import "./globals.css";
import "../components/stage.css";

// next/font self-hosts the fonts at build time, so the exported site needs no font CDN.
const display = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--nf-display", adjustFontFallback: false });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--nf-body" });

export const metadata: Metadata = {
  title: "Flicker Forge",
  description: "Describe a camera motion game in plain words. Jev turns it into one you can play.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
