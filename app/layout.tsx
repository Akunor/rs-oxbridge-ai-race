import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700;800&display=swap";

export const metadata: Metadata = {
  title: "PayeeGuard · Confirmation of Payee for AI agents",
  description:
    "AI agents can now send money. Nobody checks who they're paying. PayeeGuard is Confirmation of Payee for agents — block lookalike wallets and diverted payments before the agent signs.",
};

const links = [
  { href: "/demo", label: "Demo" },
  { href: "/shop", label: "Coffee shop" },
  { href: "/invoice", label: "Invoices" },
  { href: "/developers", label: "For agents" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <header className="header">
          <div className="header-inner">
            <Link href="/" className="wordmark">
              <b>PayeeGuard</b>
              <span>agent payment gate</span>
            </Link>
            <Nav links={links} />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>Solana devnet · test money only</span>
            <span className="footer-links">
              <Link href="/race">AI Race</Link>
              <Link href="/merchant/verify">Verify a wallet</Link>
              <Link href="/developers">API</Link>
              <Link href="/setup">Setup</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
