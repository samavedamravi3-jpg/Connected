import type { Metadata, Viewport } from "next";
import InstallPrompt from "@/components/install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connected — Your next connection is closer",
  description: "Meet nearby people who are ready to help you take your next step.",
  applicationName: "Connected",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iOS home-screen app: full screen, own title, light status bar over the app background.
  appleWebApp: { capable: true, title: "Connected", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Older iOS (before reading the manifest) still needs these to open full screen from the home screen.
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the app use the full screen; CSS pads for notches with env(safe-area-inset-*)
  themeColor: "#fffdfb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
