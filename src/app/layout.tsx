import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dartmouth Hackathon | Foundation",
  description: "Development foundation for the Dartmouth AI hackathon project.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
