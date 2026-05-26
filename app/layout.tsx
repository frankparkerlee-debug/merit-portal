import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merit Portal",
  description: "Internal staff portal for Merit Sciences Rx workflow.",
  robots: { index: false, follow: false }, // never index this
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
