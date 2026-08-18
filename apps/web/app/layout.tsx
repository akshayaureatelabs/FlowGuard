import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowGuard — Codeless browser testing",
  description:
    "Record, edit, and monitor automated browser tests without writing code.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mesh-grid" aria-hidden />
        <header className="header">
          <div className="header-inner">
            <a href="/" className="logo">
              <span className="logo-mark">✓</span>
              FlowGuard
            </a>
            <nav>
              <a href="/">Projects</a>
              <a href="/login">Sign in</a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
