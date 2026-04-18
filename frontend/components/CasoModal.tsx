"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { safeUrl } from "@/lib/supabase";
import type { Anomaly } from "@/lib/supabase";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO: Record<string, { badgeColor: string; borderTop: string; icon: string; label: string }> = {
  sobreprecio:       { badgeColor: "bg-red-100 text-red-800 border-red-200",       borderTop: "border-t-4 border-[#E00911]",    icon: "💰", label: "Sobreprecio" },
  conflicto_interes: { badgeColor: "bg-orange-100 text-orange-800 border-orange-200", borderTop: "border-t-4 border-orange-500",  icon: "🤝", label: "Conflicto de Interés" },
  puerta_giratoria:  { badgeColor: "bg-yellow-100 text-yellow-800 border-yellow-200", borderTop: "border-t-4 border-yellow-500",  icon: "🚪", label: "Puerta Giratoria" },
  bot_network:       { badgeColor: "bg-purple-100 text-purple-800 border-purple-200", borderTop: "border-t-4 border-purple-600",  icon: "🤖", label: "Red de Bots" },
  fake_news:         { badgeColor: "bg-teal-100 text-teal-800 border-teal-200",       borderTop: "border-t-4 border-teal-600",    icon: "📰", label: "Fake News" },
};

function getTipo(type: string) {
  return TIPO[type] ?? {
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    borderTop: "border-t-4 border-[#213E76]",
    icon: "⚠️",
    label: type.replace(/_/g, " "),
  };
}

function getEventDate(a: Anomaly): { display: string; isReal: boolean } {
  const raw = a.evidence?.fecha_evento as string | undefined | null;
  if (!raw || String(raw).trim().length < 4) {
    return { display: "Fecha no disponible", isReal: false };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { display: "Fecha no disponible", isReal: false };
  }
  return {
    display: d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    isReal: true,
  };
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
  const cuerpoInforme = ev.cuerpo_informe as string | undefined;
  const seccionHallazgo = ev.seccion_hallazgo as string | undefined;
  const seccionAntecedentes = ev.seccion_antecedentes as string | undefined;
  const seccionEvidencia = ev.seccion_evidencia as string | undefined;
  const seccionImplicancias = ev.seccion_implicancias as string | undefined;

  const { display: dateDisplay, isReal: dateIsReal } = getEventDate(a);

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

  const pctColor = pct >= 80 ? "bg-[#E00911]" : pct >= 65 ? "bg-orange-500" : "bg-yellow-500";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel — Emol light theme */}
      <div
        className={`relative w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-white shadow-2xl ${t.borderTop}`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header sticky ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#ECECEC] px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border ${t.badgeColor} flex-shrink-0`}>
              {t.icon} {t.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold text-white ${pctColor} flex-shrink-0`}>
              {pct}% probabilidad
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8090A6] hover:text-[#1B212C] text-xl leading-none transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Contenido ── */}
        <div className="px-5 py-5 space-y-5">

          {/* Fecha del hecho */}
          <time className={`block text-xs font-medium uppercase tracking-wider ${dateIsReal ? "text-[#213E76]" : "text-[#8090A6]"}`}>
            📅 {dateDisplay}
            {!dateIsReal && (
              <span className="ml-2 text-amber-600 normal-case">(fecha no verificada)</span>
            )}
          </time>

          {/* Titular generado por IA */}
          {titular ? (
            <>
              <h2 className="text-xl sm:text-2xl font-black text-[#1B212C] leading-tight">{titular}</h2>
              {subtitular && (
                <p className="text-[#8090A6] text-sm leading-relaxed">{subtitular}</p>
              )}
              <p className="text-[#1B212C] text-sm leading-relaxed border-l-4 border-[#213E76] pl-4 bg-blue-50 py-2 pr-3 rounded-r">
                {a.description}
              </p>
            </>
          ) : (
            <h2 className="text-xl font-bold text-[#1B212C] leading-snug">{a.description}</h2>
          )}

          {/* Barra de probabilidad */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#8090A6] font-medium uppercase tracking-wide">Probabilidad estimada por IA</span>
              <span className="text-sm font-bold text-[#1B212C]">{pct}%</span>
            </div>
            <div className="w-full bg-[#ECECEC] rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${pctColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-[#8090A6] mt-1">
              La IA estima {pct}% de probabilidad de que esto sea {t.label.toLowerCase()}. No es una acusación.
            </p>
          </div>

          {/* Montos detectados */}
          {montos.length > 0 && (
            <div>
              <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-2">Montos detectados</p>
              <div className="flex flex-wrap gap-2">
                {montos.map((m, i) => (
                  <span key={i} className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-bold">
                    💵 {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Entidades involucradas */}
          {entities.length > 0 && (
            <div>
              <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-2">Entidades involucradas</p>
              <div className="flex flex-wrap gap-2">
                {entities.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-[#F5F5F5] text-[#1B212C] rounded text-sm border border-[#ECECEC]">
                    👤 {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cuerpo del informe de investigación (si existe) */}
          {cuerpoInforme && (
            <div className="bg-[#F5F5F5] rounded border border-[#ECECEC] p-4">
              <p className="text-xs text-[#213E76] uppercase tracking-wider font-bold mb-3">📰 Informe de investigación completo</p>
              <div className="text-sm text-[#1B212C] leading-relaxed whitespace-pre-wrap">{cuerpoInforme}</div>
            </div>
          )}

          {/* Secciones del informe (cuando el cuerpo completo no está disponible) */}
          {!cuerpoInforme && (seccionHallazgo || seccionAntecedentes || seccionEvidencia || seccionImplicancias) && (
            <div className="space-y-4">
              {seccionHallazgo && (
                <div>
                  <p className="text-xs text-[#E00911] uppercase tracking-wider font-bold mb-1">El hallazgo</p>
                  <p className="text-sm text-[#1B212C] leading-relaxed">{seccionHallazgo}</p>
                </div>
              )}
              {seccionAntecedentes && (
                <div>
                  <p className="text-xs text-[#213E76] uppercase tracking-wider font-bold mb-1">Antecedentes</p>
                  <p className="text-sm text-[#1B212C] leading-relaxed">{seccionAntecedentes}</p>
                </div>
              )}
              {seccionEvidencia && (
                <div>
                  <p className="text-xs text-[#213E76] uppercase tracking-wider font-bold mb-1">La evidencia</p>
                  <p className="text-sm text-[#1B212C] leading-relaxed">{seccionEvidencia}</p>
                </div>
              )}
              {seccionImplicancias && (
                <div>
                  <p className="text-xs text-[#213E76] uppercase tracking-wider font-bold mb-1">Las implicancias</p>
                  <p className="text-sm text-[#1B212C] leading-relaxed">{seccionImplicancias}</p>
                </div>
              )}
            </div>
          )}

          {/* Evidencia textual del documento original */}
          {evidenceText && !cuerpoInforme && (
            <div>
              <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-2">Extracto del documento fuente</p>
              <blockquote className="border-l-4 border-[#213E76] pl-4 bg-blue-50 py-3 pr-3 rounded-r">
                <p className="text-[#1B212C] text-sm italic leading-relaxed">"{evidenceText}"</p>
              </blockquote>
            </div>
          )}

          {/* Recomendación */}
          {recomendacion && (
            <div className="bg-amber-50 border border-amber-200 rounded p-4 space-y-1">
              <p className="text-xs text-amber-700 uppercase tracking-wider font-bold">🔎 Qué debería investigar un fiscal</p>
              <p className="text-amber-900 text-sm leading-relaxed">{recomendacion}</p>
            </div>
          )}

          {/* Líneas de investigación */}
          {lineasInvestigacion.length > 0 && (
            <div>
              <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-2">Líneas de investigación abiertas</p>
              <ul className="space-y-2">
                {lineasInvestigacion.map((l, i) => (
                  <li key={i} className="text-sm text-[#1B212C] flex items-start gap-2">
                    <span className="text-[#E00911] flex-shrink-0 font-bold">→</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fuentes adicionales */}
          {fuentesAdicionales.length > 0 && (
            <div>
              <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-2">Fuentes consultadas</p>
              <ul className="space-y-1">
                {fuentesAdicionales.slice(0, 6).map((url, i) => safeUrl(url) ? (
                  <li key={i}>
                    <a
                      href={safeUrl(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#213E76] hover:underline break-all"
                    >
                      🔗 {url}
                    </a>
                  </li>
                ) : null)}
              </ul>
            </div>
          )}

          {/* Acciones */}
          <div className="pt-3 border-t border-[#ECECEC] flex flex-wrap gap-2">
            {safeUrl(sourceUrl) && (
              <a
                href={safeUrl(sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#213E76] hover:bg-[#1a3260] text-white rounded text-sm font-medium transition-colors"
              >
                🔗 Ver fuente original
              </a>
            )}
            {googleSearchUrl && (
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#ECECEC] border border-[#ECECEC] text-[#1B212C] rounded text-sm font-medium transition-colors"
              >
                🔍 Buscar en Google
              </a>
            )}
            <button
              onClick={handleShare}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#ECECEC] border border-[#ECECEC] text-[#1B212C] rounded text-sm font-medium transition-colors"
            >
              📤 Compartir
            </button>
            <Link
              href="/pared/"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#ECECEC] border border-[#ECECEC] text-[#1B212C] rounded text-sm font-medium transition-colors"
            >
              🕸 Ver red
            </Link>
            <Link
              href="/ayudanos/"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#E00911] hover:bg-red-700 text-white rounded text-sm font-bold transition-colors"
            >
              🚨 Denunciar
            </Link>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-[#8090A6] leading-relaxed border-t border-[#ECECEC] pt-3">
            ⚠️ Las detecciones son indicios automatizados generados por IA (Llama 3). No constituyen acusaciones ni sentencias judiciales. Los datos provienen de fuentes públicas del Estado chileno.
          </p>
        </div>
      </div>
    </div>
  );
}
