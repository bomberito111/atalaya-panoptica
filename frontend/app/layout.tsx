import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import InfoModal from "@/components/InfoModal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATALAYA PANÓPTICA — Investigador Digital Anticorrupción Chile",
  description:
    "Sistema de IA que monitorea el Estado chileno en tiempo real: licitaciones, lobbies, contratos y redes de influencia.",
  keywords: ["corrupción Chile", "transparencia", "licitaciones", "anticorrupción", "IA"],
};

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/grafo/", label: "🕸️ Grafo de Poder" },
  { href: "/muro-realidad/", label: "⚖️ Promesas vs Realidad" },
  { href: "/radar/", label: "📡 Radar de Bots" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <InfoModal />
            <div className="flex gap-1 sm:gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-400 hover:text-white px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-800 py-6 text-center text-gray-600 text-xs">
          ATALAYA PANÓPTICA — Sistema de IA Anticorrupción Chile 🇨🇱 — Datos de fuentes públicas del Estado
        </footer>
      </body>
    </html>
  );
}
