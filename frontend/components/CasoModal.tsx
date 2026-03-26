"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import type { Anomaly } from "@/lib/supabase";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  sobreprecio:       { color: "text-red-400",    bg: "bg-red-950",    border: "border-red-700",    icon: "💰", label: "Sobreprecio" },
  conflicto_interes: { color: "text-orange-400", bg: "bg-orange-950", border: "border-orange-700", icon: "🤝", label: "Conflicto de Interés" },
  puerta_giratoria:  { color: "text-yellow-400", bg: "bg-yellow-950", border: "border-yellow-700", icon: "🚪", label: "Puerta Giratoria" },
  bot_network:       { color: "text-purple-400", bg: "bg-purple-950", border: "border-purple-700", icon: "🤖", label: "Red de Bots" },
  fake_news:         { color: "text-teal-400",   bg: "bg-teal-950",   border: "border-teal-700",   icon: "📰", label: "Fake News" },
};

function getTipo(type: string) {
  return TIPO[type] ?? { color: "text-gray-400", bg: "bg-gray-900", border: "border-gray-700", icon: "⚠️", label: type.replace(/_/g, " ") };
}

function getEventDate(a: Anomaly): string {
  const raw = (a.evidence?.fecha_evento as string | undefined) ?? a.created_at;
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? "Fecha desconocida"
    : d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Componente Modal ──────────────────────────────────────────────────────────

interface CasoModalProps {
  anomaly: Anomaly;
  onClose: () => void;
}

export default function CasoModal({ anomaly: a, onClose }: CasoModalProps) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const recomendacion = ev.recomendacion as string | undefined;
  const lineasInvestigacion = (Array.isArray(ev.lineas_investigacion) ? ev.lineas_investigacion : []) as string[];
  const fuentesAdicionales = (Array.isArray(ev.fuentes_adicionales) ? ev.fuentes_adicionales : []) as string[];
  const montos = (Array.isArray(ev.montos) ? ev.montos : []) as string[];
  const titular = ev.titular as string | undefined;
  const subtitular = ev.subtitular as string | undefined;

  const dateDisplay = getEventDate(a);

  // Cerrar con Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  async function handleShare() {
    const text = `${t.icon} ${t.label.toUpperCase()} — ${dateDisplay}\n\n${a.description}\n\n${sourceUrl ? `Fuente: ${sourceUrl}\n` : ""}ATALAYA PANÓPTICA 🇨🇱\nhttps://bomberito111.github.io/atalaya-panoptica/`;
    try { await navigator.clipboard.writeText(text); }
    catch { /* silently fail */ }
  }

  const googleSearchUrl = entities.length > 0
    ? `https://www.google.com/search?q=${encodeURIComponent(entities.slice(0, 2).join(" ") + " corrupción Chile")}`
    : null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Blur + dark overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Franja tipo ── */}
        <div className={`sticky top-0 z-10 px-5 py-3 flex items-center justify-between gap-3 ${t.bg} border-b ${t.border}`}>
          <span className={`text-sm font-bold tracking-widest uppercase ${t.color} flex items-center gap-2`}>
            {t.icon} {t.label}
          </span>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              pct >= 80 ? "bg-red-900 text-red-300" : pct >= 65 ? "bg-orange-900 text-orange-300" : "bg-yellow-900 text-yellow-300"
            }`}>
              {pct}% certeza
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl leading-none transition-colors"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Contenido ── */}
        <div className="px-5 py-5 space-y-5">

          {/* Fecha del hecho */}
          <time className="block text-xs text-gray-500 font-medium uppercase tracking-wider">
            📅 {dateDisplay}
          </time>

          {/* Titular generado por IA (si existe) o descripción */}
          {titular && (
            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">{titular}</h2>
          )}
          {subtitular && (
            <p className="text-gray-400 text-sm leading-relaxed">{subtitular}</p>
          )}
          {!titular && (
            <h2 className="text-xl font-bold text-white leading-snug">{a.description}</h2>
          )}
          {titular && (
            <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-gray-700 pl-4">{a.description}</p>
          )}

          {/* Montos detectados */}
          {montos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {montos.map((m, i) => (
                <span key={i} className="px-3 py-1 bg-red-950/60 border border-red-900/40 text-red-300 rounded-full text-xs font-bold">
                  💵 {m}
                </span>
              ))}
            </div>
          )}

          {/* Entidades involucradas */}
          {entities.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Entidades involucradas</p>
              <div className="flex flex-wrap gap-2">
                {entities.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-800 text-gray-200 rounded-full text-sm border border-gray-700">
                    👤 {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Evidencia textual del documento */}
          {evidenceText && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Evidencia del documento</p>
              <blockquote className="border-l-3 border-gray-600 pl-4 bg-gray-900/50 rounded-r-lg py-3 pr-3">
                <p className="text-gray-300 text-sm italic leading-relaxed">"{evidenceText}"</p>
              </blockquote>
            </div>
          )}

          {/* Recomendación / línea de investigación */}
          {recomendacion && (
            <div className="bg-amber-950/40 border border-amber-900/50 rounded-xl p-4 space-y-1">
              <p className="text-xs text-amber-500 uppercase tracking-wider font-bold">🔎 Qué debería investigar un fiscal</p>
              <p className="text-amber-200 text-sm leading-relaxed">{recomendacion}</p>
            </div>
          )}

          {/* Líneas de investigación adicionales */}
          {lineasInvestigacion.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Líneas de investigación</p>
              <ul className="space-y-1.5">
                {lineasInvestigacion.map((l, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-amber-500 flex-shrink-0">→</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fuentes adicionales */}
          {fuentesAdicionales.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Fuentes adicionales</p>
              <ul className="space-y-1">
                {fuentesAdicionales.slice(0, 5).map((url, i) => (
                  <li key={i}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 hover:underline break-all"
                    >
                      🔗 {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Acciones */}
          <div className="pt-2 border-t border-gray-800 flex flex-wrap gap-2">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-800/60 text-blue-300 rounded-xl text-sm font-medium transition-colors"
              >
                🔗 Ver fuente original
              </a>
            )}
            {googleSearchUrl && (
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors"
              >
                🔍 Buscar en Google
              </a>
            )}
            <button
              onClick={handleShare}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors"
            >
              📤 Compartir
            </button>
            <Link
              href="/pared/"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-purple-950/40 hover:bg-purple-900/40 border border-purple-900/50 text-purple-300 rounded-xl text-sm font-medium transition-colors"
            >
              🕸 Ver red de corrupción
            </Link>
            <Link
              href="/ayudanos/"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 text-red-300 rounded-xl text-sm font-medium transition-colors"
            >
              🚨 Enviar denuncia
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
