import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "QG — De l'Ombre à la Lumière", template: "%s · QG De l'Ombre à la Lumière" },
  description: "Quartier général interne du média De l'Ombre à la Lumière.",
  robots: { index: false, follow: false },
  applicationName: "QG DLAL",
  appleWebApp: { capable: true, title: "QG DLAL", statusBarStyle: "black-translucent" },
  icons: { icon: "/brand/icon-32.png", apple: "/brand/icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
