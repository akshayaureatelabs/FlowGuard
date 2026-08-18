import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowGuard",
  description: "Codeless browser test automation",
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
        <header className="header">
          <div className="container header-inner">
            <a href="/" className="logo">
              FlowGuard
            </a>
            <nav>
              <a href="/">Projects</a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
