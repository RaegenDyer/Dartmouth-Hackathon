import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candid",
  description: "Candid: a nonclinical AI companion for settling into a new place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
