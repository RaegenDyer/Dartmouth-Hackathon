import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Warm hearth direction (docs/design/README.md, decided 2026-10-31).
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Candid",
  description: "Candid: a nonclinical AI companion for settling into a new place.",
  robots: { index: false, follow: false },
};

// Phones: edge-to-edge (safe-area padding is in globals.css) and a warm browser chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Always the cozy light look, even in device dark mode.
  colorScheme: "light",
  themeColor: "#f6eee3",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
