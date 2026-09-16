import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { isAuthenticated } from "@/lib/session";

export const metadata: Metadata = {
  title: "PMP Trainer",
  description: "Private PMP exam prep — 2026 ECO, PMBOK 8.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PMP Trainer" },
};

export const viewport: Viewport = {
  themeColor: "#1f4f8f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthenticated();
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {authed ? <Nav /> : null}
        <main className={authed ? "mx-auto max-w-3xl px-4 pb-24 pt-4 md:pb-8" : "mx-auto max-w-md px-4 pt-16"}>{children}</main>
      </body>
    </html>
  );
}
