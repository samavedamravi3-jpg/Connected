import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connected — Your next connection is closer",
  description: "Meet nearby people who are ready to help you take your next step.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
