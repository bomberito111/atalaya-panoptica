import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import LiveViewers from "@/components/LiveViewers";
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
  title: "ATALAYA PANÓPTICA — Vigilancia ciudadana anticorrupción Chile",
  description:
    "Sistema de IA que detecta corrupción en el Estado chileno: licitaciones, lobbies, contratos y conflictos de interés. Gratis y de código abierto.",
  keywords: ["corrupción Chile", "transparencia", "licitaciones", "anticorrupción", "ciudadanía"],
};

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/casos/", label: "🚨 Casos" },
  { href: "/pared/", label: "🕸 Red" },
  { href: "/promesas/", label: "📋 Promesas" },
  { href: "/fake-news/", label: "📰 Fake News" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="text-white font-bold text-lg tracking-tight flex-shrink-0">
              ATALAYA 🇨🇱
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1 sm:gap-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-400 hover:text-white px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/ayudanos/"
                className="ml-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-xs sm:text-sm font-semibold transition-colors flex-shrink-0"
              >
                🚨 Denunciar
              </Link>
            </div>
          </div>
        </nav>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="border-t border-gray-800 py-4 text-center text-gray-600 text-xs">
          ATALAYA PANÓPTICA · Código abierto · Datos públicos del Estado chileno
        </footer>

        {/* Contador de visitantes en tiempo real — esquina inferior derecha */}
        <LiveViewers />
      </body>
    </html>
  );
}
