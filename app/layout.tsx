import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./autoram-brand.css";
import "./work-pricing.css";
import "./real-maps.css";
import "./trip-map.css";

const SITE_URL = "https://autoram-colombia.netlify.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Autoram | Control inteligente de tu vehículo",
  description: "Combustible, recorridos, mantenimiento y rentabilidad en un solo lugar.",
  applicationName: "Autoram",
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Autoram", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/`,
    siteName: "Autoram Colombia",
    locale: "es_CO",
    title: "Autoram | Control inteligente de tu vehículo",
    description: "Tu vehículo. Tus números. Tu camino.",
    images: [{ url: `${SITE_URL}/og.jpg`, width: 1731, height: 909, type: "image/jpeg", alt: "Autoram — Tu vehículo. Tus números. Tu camino." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Autoram | Control inteligente de tu vehículo",
    description: "Tu vehículo. Tus números. Tu camino.",
    images: [`${SITE_URL}/og.jpg`],
  },
};

export const viewport: Viewport = { themeColor: "#080B0A", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
