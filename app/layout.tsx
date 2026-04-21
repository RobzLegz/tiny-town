import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Townhall World",
  description:
    "Zoomable and pannable canvas world prototype for a future city-builder.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
