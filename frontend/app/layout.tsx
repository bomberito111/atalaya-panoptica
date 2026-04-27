import type { Metadata } from "next";
import Link from "next/link";
import LiveViewers from "@/components/LiveViewers";
import "./globals.css";

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
  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <html lang="es" className="h-full">
      <head>
        {/* Anti-clickjacking: redirigir si estamos en un iframe */}
        <script
          dangerouslySetInnerHTML={{
            __html: "if(window.self!==window.top){window.top.location.replace(window.self.location.href);}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F5F5F5] text-[#1B212C] font-sans antialiased">

        {/* ── Barra superior delgada ─────────────────────────────────────── */}
        <div className="bg-[#1B212C] text-white text-xs px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="font-semibold tracking-wider uppercase">
              ATALAYA PANÓPTICA
            </span>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 hidden sm:inline">{today}</span>
              <span className="flex items-center gap-1 text-[#E00911] font-bold">
                <span className="inline-block w-2 h-2 rounded-full bg-[#E00911] animate-pulse" />
                EN VIVO
              </span>
            </div>
          </div>
        </div>

        {/* ── Header principal blanco ────────────────────────────────────── */}
        <div className="bg-white border-b border-[#ECECEC]">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex flex-col leading-none">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black text-[#E00911] tracking-tight">
                  ATALAYA
                </span>
                <span className="text-3xl sm:text-4xl font-black text-[#213E76] tracking-tight">
                  PANÓPTICA
                </span>
              </div>
              <p className="text-[#1B212C] text-xs mt-0.5 tracking-wide">
                El diario digital que caza la corrupción en Chile 🇨🇱
              </p>
            </Link>
            <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-[#8090A6]">
              <span>Vigilancia ciudadana · Código abierto</span>
              <a
                href="https://github.com/bomberito111/atalaya-panoptica"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#213E76] transition-colors"
              >
                GitHub →
              </a>
            </div>
          </div>
        </div>

        {/* ── Barra de navegación azul ────────────────────────────────────── */}
        <nav className="bg-[#213E76] sticky top-0 z-50 shadow-md">
          <div className="max-w-7xl mx-auto px-4 flex items-center h-10">
            <div className="flex items-center gap-0 flex-1 overflow-x-auto">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex-shrink-0 text-white/90 hover:text-white hover:bg-white/10 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <Link
              href="/ayudanos/"
              className="flex-shrink-0 ml-2 px-3 py-1.5 bg-[#E00911] hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wide transition-colors"
            >
              DENUNCIAR
            </Link>
          </div>
        </nav>

        {/* ── Contenido principal ─────────────────────────────────────────── */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          {children}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="bg-[#1B212C] text-gray-400 text-xs py-5 mt-4">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              © {new Date().getFullYear()} ATALAYA PANÓPTICA · Datos públicos del Estado chileno · Código abierto
            </span>
            <span className="text-gray-600">
              Las detecciones son indicios automatizados de IA, no acusaciones ni sentencias judiciales.
            </span>
          </div>
        </footer>

        {/* Contador de visitantes en tiempo real — esquina inferior derecha */}
        <LiveViewers />
        
        {/* Gatito superpuesto (Arsenal Mode) */}
        <img 
          src="/atalaya-panoptica/gatito.jpg" 
          alt=""
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100vw', 
            height: '100vh', 
            zIndex: 999999, 
            pointerEvents: 'none', 
            objectFit: 'cover', 
            opacity: 0.9 
          }} 
        />
      </body>
    </html>
  );
}
