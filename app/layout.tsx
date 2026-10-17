import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pedí por WhatsApp", description: "Catálogo y pedidos por WhatsApp para tu kiosco o almacén" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#128c4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es-AR"><body><main>{children}<footer className="mut" style={{ marginTop: 32, fontSize: 14 }}><Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link></footer></main></body></html>);
}
