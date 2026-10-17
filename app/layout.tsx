import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// Tres familias con rol fijo: Fraunces para titulares de afiche,
// Plex Sans para la interfaz, Plex Mono para precios, montos y etiquetas.
const display = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], weight: ["500", "600"], variable: "--font-display", display: "swap" });
const ui = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Pedí por WhatsApp",
  description: "Catálogo y pedidos por WhatsApp para tu kiosco o almacén",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16302a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <header className="franja">
          <Link href="/" className="franja-marca">Pedí<i>.</i> por WhatsApp</Link>
          <span className="franja-punto" aria-hidden="true" />
        </header>
        <main>
          {children}
          <footer className="pie">
            <span>Pedí por WhatsApp</span>
            <Link href="/terminos">Términos</Link>
            <Link href="/privacidad">Privacidad</Link>
          </footer>
        </main>
      </body>
    </html>
  );
}
