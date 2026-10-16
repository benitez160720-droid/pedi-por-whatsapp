import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Pedí por WhatsApp", description: "Catálogo y pedidos por WhatsApp para tu kiosco o almacén" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#128c4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es-AR"><body><main>{children}</main></body></html>);
}
