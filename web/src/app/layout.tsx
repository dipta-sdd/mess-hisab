import type { Metadata, Viewport } from "next";
import { themeInitScript } from "@/lib/theme/theme";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mess Hisab — মেসের হিসাব",
  description: "Shared-house accounts · মেসের সবার হিসাব এক জায়গায়",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Mess Hisab", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#134e4a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
