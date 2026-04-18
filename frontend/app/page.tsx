"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnomalies, getStats, safeUrl, type Anomaly } from "@/lib/supabase";
import CasoModal from "@/components/CasoModal";

// ── Tipos de anomalía ──────────────────────────────────────────────────────

const TIPO: Record<string, { colorBg: string; colorText: string; colorBadge: string; icon: string; label: string }> = {
  sobreprecio:       { colorBg: "bg-red-100",    colorText: "text-red-800",    colorBadge: "bg-red-600 text-white",    icon: "💰", label: "Sobreprecio" },
  conflicto_interes: { colorBg: "bg-orange-100", colorText: "text-orange-800", colorBadge: "bg-orange-500 text-white", icon: "🤝", label: "Conflicto de Interés" },
  puerta_giratoria:  { colorBg: "bg-yellow-100", colorText: "text-yellow-800", colorBadge: "bg-yellow-500 text-white", icon: "🚪", label: "Puerta Giratoria" },
  bot_network:       { colorBg: "bg-purple-100", colorText: "text-purple-800", colorBadge: "bg-purple-600 text-white", icon: "🤖", label: "Red de Bots" },
  fake_news:         { colorBg: "bg-teal-100",   colorText: "text-teal-800",   colorBadge: "bg-teal-600 text-white",   icon: "📰", label: "Fake News" },
};

function getTipo(type: string) {
  return (
    TIPO[type] ?? {
      colorBg: "bg-gray-100",
      colorText: "text-gray-800",
      colorBadge: "bg-gray-600 text-white",
      icon: "⚠️",
      label: type.replace(/_/g, " "),
    }
  );
}

// ── Fecha del evento (SOLO evidence.fecha_evento) ──────────────────────────

function getEventDate(a: Anomaly): { display: string; short: string; isReal: boolean } {
  const raw = a.evidence?.fecha_evento as string | undefined | null;
  if (!raw || String(raw).trim().length < 4) {
    return { display: "Fecha no disponible", short: "Fecha no disponible", isReal: false };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { display: "Fecha no disponible", short: "Fecha no disponible", isReal: false };
  }
  return {
    display: d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    short: d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }),
    isReal: true,
  };
}

// ── Barra de probabilidad ──────────────────────────────────────────────────

function ProbBar({ pct, tipo }: { pct: number; tipo: string }) {
  const barColor = pct >= 85 ? "bg-[#E00911]" : pct >= 70 ? "bg-orange-500" : "bg-yellow-500";
  const textColor = pct >= 85 ? "text-[#E00911]" : pct >= 70 ? "text-orange-600" : "text-yellow-600";
  const label = pct >= 85 ? "Alta probabilidad" : pct >= 70 ? "Probabilidad moderada" : "Indicios detectados";
  const tipoLabel = getTipo(tipo).label.toLowerCase();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8090A6]">
          La IA estima <span className={`font-black tabular-nums ${textColor}`}>{pct}%</span> de probabilidad de {tipoLabel}
        </span>
        <span className="text-[#8090A6] font-medium">{label}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── CASO DESTACADO (featured, large) ──────────────────────────────────────

function CasoDestacado({ a, onClick }: { a: Anomaly; onClick: () => void }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const { display: dateDisplay, isReal } = getEventDate(a);
  const cuerpoInforme = ev.cuerpo_informe as string | undefined;
  const seccionHallazgo = ev.seccion_hallazgo as string | undefined;

  const cuerpoFull = cuerpoInforme || seccionHallazgo;
  const cuerpoPreview = cuerpoFull ? cuerpoFull.slice(0, 600) : null;
  const showFullDescription = !cuerpoFull && a.description.length > 150;

  return (
    <article
      onClick={onClick}
      className="cursor-pointer bg-white border border-[#ECECEC] rounded hover:shadow-lg transition-shadow overflow-hidden"
    >
      {/* Header rojo con tipo */}
      <div className="bg-[#E00911] px-4 py-2 flex items-center justify-between gap-3">
        <span className="text-white text-xs font-black tracking-widest uppercase flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
          ÚLTIMO CASO DETECTADO · {t.icon} {t.label}
        </span>
        <span className="text-white/90 text-xs font-bold bg-black/20 px-2 py-0.5 rounded">
          {pct}% probable
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Fecha del hecho */}
        <time className={`block text-xs uppercase tracking-widest font-semibold ${isReal ? "text-[#8090A6]" : "text-gray-400 italic"}`}>
          📅 {dateDisplay}
        </time>

        {/* Badge de tipo */}
        <div>
          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${t.colorBadge}`}>
            {t.icon} {t.label}
          </span>
        </div>

        {/* Titular grande */}
        <h2 className="text-xl sm:text-2xl font-black text-[#1B212C] leading-tight">
          {a.description}
        </h2>

        {/* Barra de probabilidad */}
        <ProbBar pct={pct} tipo={a.anomaly_type} />

        {/* Cita de evidencia */}
        {evidenceText && (
          <blockquote className="border-l-4 border-[#213E76] pl-4 bg-gray-50 py-2 pr-3 rounded-r">
            <p className="text-[#1B212C] text-sm italic leading-relaxed line-clamp-3">
              &ldquo;{evidenceText}&rdquo;
            </p>
          </blockquote>
        )}

        {/* Cuerpo del informe o sección de hallazgo (primeros 600 chars) */}
        {cuerpoPreview && (
          <div className="text-sm text-[#1B212C] leading-relaxed mt-3 border-t border-[#ECECEC] pt-3">
            <p>{cuerpoPreview}{cuerpoFull && cuerpoFull.length > 600 ? "…" : ""}</p>
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="mt-2 text-xs text-[#213E76] font-semibold hover:underline"
            >
              Leer reportaje completo →
            </button>
          </div>
        )}

        {/* Descripción completa cuando no hay cuerpo y es larga */}
        {showFullDescription && !cuerpoPreview && (
          <p className="text-sm text-[#1B212C] leading-relaxed mt-3 border-t border-[#ECECEC] pt-3">
            {a.description}
          </p>
        )}

        {/* Entidades como chips */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e, i) => (
              <span key={i} className="px-2.5 py-1 bg-gray-100 text-[#1B212C] rounded-full text-xs border border-[#ECECEC]">
                👤 {e}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#ECECEC]">
          {safeUrl(sourceUrl) ? (
            <a
              href={safeUrl(sourceUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-[#213E76] hover:underline"
            >
              🔗 Ver fuente original
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs text-[#E00911] font-bold">
            📰 Leer reportaje completo →
          </span>
        </div>
      </div>
    </article>
  );
}

// ── TARJETA MINI (grid 2 columnas) ─────────────────────────────────────────

function CasoMini({ a, onClick }: { a: Anomaly; onClick: () => void }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const { short: dateShort, isReal } = getEventDate(a);

  return (
    <article
      onClick={onClick}
      className="cursor-pointer bg-white border border-[#ECECEC] rounded hover:shadow-md transition-shadow overflow-hidden group"
    >
      {/* Barra de categoría */}
      <div className={`px-3 py-1.5 flex items-center justify-between ${t.colorBg}`}>
        <span className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${t.colorText}`}>
          {t.icon} {t.label}
        </span>
        <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
          pct >= 80 ? "bg-[#E00911] text-white" : pct >= 65 ? "bg-orange-500 text-white" : "bg-yellow-500 text-white"
        }`}>
          {pct}%
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <time className={`block text-xs font-medium ${isReal ? "text-[#8090A6]" : "text-gray-400 italic"}`}>
          📅 {dateShort}
        </time>
        <p className="text-[#1B212C] text-sm font-semibold leading-snug group-hover:text-[#213E76] transition-colors line-clamp-3">
          {a.description}
        </p>
        {entities.length > 0 && (
          <p className="text-[#8090A6] text-xs truncate">
            {entities.slice(0, 2).join(" · ")}
          </p>
        )}
        {/* Mini barra */}
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 80 ? "bg-[#E00911]" : pct >= 65 ? "bg-orange-500" : "bg-yellow-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[#213E76] font-semibold">Ver →</p>
      </div>
    </article>
  );
}

// ── Filtros ────────────────────────────────────────────────────────────────

const FILTROS = [
  { key: "todos",              label: "Todos" },
  { key: "sobreprecio",        label: "💰 Sobreprecio" },
  { key: "conflicto_interes",  label: "🤝 Conflicto" },
  { key: "puerta_giratoria",   label: "🚪 Puerta Giratoria" },
  { key: "bot_network",        label: "🤖 Bots" },
];

// ── PÁGINA PRINCIPAL ───────────────────────────────────────────────────────

export default function HomePage() {
  const [stats, setStats]         = useState({ totalNodes: 0, totalEdges: 0, totalAnomalies: 0, totalAlerts: 0 });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState("todos");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [visible, setVisible]     = useState(8);
  const [modalAnomaly, setModalAnomaly] = useState<Anomaly | null>(null);

  const cargar = useCallback(async () => {
    const [s, raw] = await Promise.all([getStats(), getAnomalies(0.5)]);
    setStats(s);
    // Ordenar: primero por fecha_evento (si existe), sino dejar el orden del servidor
    const sorted = [...raw].sort((x, y) => {
      const rawX = x.evidence?.fecha_evento as string | undefined;
      const rawY = y.evidence?.fecha_evento as string | undefined;
      const dx = rawX ? new Date(rawX).getTime() : 0;
      const dy = rawY ? new Date(rawY).getTime() : 0;
      return dy - dx;
    });
    setAnomalies(sorted);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  const filtrados =
    filtro === "todos"
      ? anomalies
      : anomalies.filter((a) =>
          filtro === "bot_network"
            ? a.anomaly_type === "bot_network" || a.anomaly_type === "fake_news"
            : a.anomaly_type === filtro
        );

  const featured = filtrados[0] ?? null;
  const rest = filtrados.slice(1, visible);

  return (
    <>
      {/* ── Barra de estadísticas en vivo ─────────────────────────────── */}
      {!loading && (
        <div className="bg-[#213E76] text-white rounded mb-4 px-4 py-2 flex flex-wrap gap-4 items-center text-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#E00911] animate-pulse" />
            <strong className="text-[#E00911]">{stats.totalAnomalies}</strong>
            <span className="text-white/80">casos detectados</span>
          </span>
          <span className="text-white/40">|</span>
          <span className="text-white/80"><strong className="text-white">{stats.totalNodes}</strong> entidades rastreadas</span>
          <span className="text-white/40">|</span>
          <span className="text-white/80"><strong className="text-white">{stats.totalEdges}</strong> vínculos detectados</span>
          <span className="text-white/40">|</span>
          <span className="text-white/80"><strong className="text-white">{stats.totalAlerts}</strong> alertas desinformación</span>
          {lastUpdated && (
            <>
              <span className="text-white/40 hidden sm:inline">|</span>
              <span className="text-white/60 text-xs hidden sm:inline">
                Actualizado{" "}
                {lastUpdated.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Layout de dos columnas ─────────────────────────────────────── */}
      <div className="flex gap-6 items-start">

        {/* ══ COLUMNA PRINCIPAL (~68%) ══════════════════════════════════ */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Tabs de filtro */}
          <div className="flex items-center gap-0 border-b-2 border-[#213E76] overflow-x-auto">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFiltro(f.key); setVisible(8); }}
                className={`flex-shrink-0 px-4 py-2 text-sm font-bold border-b-2 -mb-0.5 transition-all whitespace-nowrap ${
                  filtro === f.key
                    ? "border-[#E00911] text-[#E00911] bg-white"
                    : "border-transparent text-[#1B212C] hover:text-[#213E76] hover:border-[#213E76]"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="ml-auto flex-shrink-0 px-3 py-2 text-xs text-[#8090A6]">
              {filtrados.length} casos
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 space-y-4 bg-white border border-[#ECECEC] rounded">
              <div className="text-5xl animate-spin">📡</div>
              <p className="text-[#1B212C] font-bold text-lg">Cargando casos en tiempo real…</p>
              <p className="text-[#8090A6] text-sm">El sistema analiza fuentes chilenas cada 2 horas automáticamente.</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 bg-white border border-[#ECECEC] rounded space-y-3">
              <p className="text-4xl">🔍</p>
              <p className="text-[#1B212C] font-semibold">Sin casos con ese filtro</p>
              <button onClick={() => setFiltro("todos")} className="text-[#E00911] underline text-sm">
                Ver todos los casos
              </button>
            </div>
          ) : (
            <div className="space-y-5">

              {/* ── CASO DESTACADO ─────────────────────────────────────── */}
              {featured && (
                <CasoDestacado a={featured} onClick={() => setModalAnomaly(featured)} />
              )}

              {/* ── SECCIÓN "MÁS CASOS" ─────────────────────────────────── */}
              {rest.length > 0 && (
                <div>
                  {/* Header de sección azul */}
                  <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-t">
                    MÁS CASOS DETECTADOS
                  </div>
                  {/* Grid 2 columnas */}
                  <div className="grid sm:grid-cols-2 gap-3 pt-3">
                    {rest.map((a) => (
                      <CasoMini key={a.id} a={a} onClick={() => setModalAnomaly(a)} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Cargar más ─────────────────────────────────────────── */}
              {visible < filtrados.length && (
                <button
                  onClick={() => setVisible((v) => v + 8)}
                  className="w-full py-3 bg-white hover:bg-gray-50 text-[#213E76] rounded border border-[#ECECEC] text-sm font-bold transition-colors"
                >
                  Cargar más ({filtrados.length - visible} restantes)
                </button>
              )}
            </div>
          )}

          {/* ── Cómo funciona ─────────────────────────────────────────── */}
          <div className="bg-white border border-[#ECECEC] rounded p-5 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#213E76] border-b border-[#ECECEC] pb-2">
              Cómo funciona el sistema
            </h2>
            <div className="space-y-3 text-sm">
              {[
                { i: "🔍", t: "Rastreador (cada 2h)", d: "Revisa Google News RSS, Contraloría, ChileCompra y portales de transparencia." },
                { i: "🧠", t: "Detective IA (cada 5min)", d: "Llama 3 analiza cada ítem, extrae entidades, detecta irregularidades y cita evidencia textual." },
                { i: "📰", t: "Investigador (automático)", d: "Para casos de alta certeza, busca más contexto y genera un informe periodístico completo." },
                { i: "📅", t: "Fechas reales del hecho", d: "Siempre muestra la fecha de la noticia original, no cuándo el sistema la procesó." },
              ].map((x) => (
                <div key={x.t} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{x.i}</span>
                  <div>
                    <p className="text-[#1B212C] font-semibold text-xs">{x.t}</p>
                    <p className="text-[#8090A6] text-xs leading-relaxed">{x.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ SIDEBAR (~30%) ════════════════════════════════════════════ */}
        <aside className="w-72 xl:w-80 flex-shrink-0 space-y-4">

          {/* 📊 EN NÚMEROS */}
          <div className="bg-white border border-[#ECECEC] rounded overflow-hidden">
            <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
              📊 EN NÚMEROS
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                <p className="text-[#8090A6] text-sm">Cargando estadísticas…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8090A6] text-sm">Casos detectados</span>
                    <span className="text-[#E00911] font-black text-xl tabular-nums">{stats.totalAnomalies}</span>
                  </div>
                  <div className="border-t border-[#ECECEC]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[#8090A6] text-sm">Entidades rastreadas</span>
                    <span className="text-[#1B212C] font-black text-xl tabular-nums">{stats.totalNodes}</span>
                  </div>
                  <div className="border-t border-[#ECECEC]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[#8090A6] text-sm">Vínculos detectados</span>
                    <span className="text-[#213E76] font-black text-xl tabular-nums">{stats.totalEdges}</span>
                  </div>
                  <div className="border-t border-[#ECECEC]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[#8090A6] text-sm">Alertas de desinformación</span>
                    <span className="text-purple-600 font-black text-xl tabular-nums">{stats.totalAlerts}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 💡 ¿SABES ALGO? */}
          <div className="bg-red-50 border border-red-200 rounded p-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-[#E00911]">💡 ¿Sabes algo que no aparece aquí?</p>
            <p className="text-[#1B212C] text-xs leading-relaxed">
              La ciudadanía tiene información clave que los sistemas automáticos no pueden ver. Puedes denunciar de forma completamente anónima.
            </p>
            <Link
              href="/ayudanos/"
              className="text-xs text-[#E00911] font-bold hover:underline"
            >
              Enviar denuncia anónima →
            </Link>
          </div>

          {/* ⚠️ AVISO IA */}
          <div className="bg-amber-50 border border-amber-200 rounded overflow-hidden">
            <div className="bg-amber-500 text-white text-xs font-black uppercase tracking-widest px-4 py-2">
              ⚠️ AVISO IMPORTANTE
            </div>
            <div className="p-4 space-y-2">
              <p className="text-amber-900 text-xs leading-relaxed font-semibold">
                Este sistema usa Inteligencia Artificial y puede cometer errores.
              </p>
              <p className="text-amber-800 text-xs leading-relaxed">
                Las detecciones son indicios basados en análisis automático de fuentes públicas, NO acusaciones ni sentencias. Verifica siempre con fuentes oficiales: Contraloría, Fiscalía, Poder Judicial.
              </p>
            </div>
          </div>

          {/* 🔗 EXPLORAR */}
          <div className="bg-white border border-[#ECECEC] rounded overflow-hidden">
            <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
              🔗 EXPLORAR
            </div>
            <div className="p-4 space-y-2">
              {[
                { href: "/pared/", label: "🕸 Ver Red de Corrupción", desc: "Mapa interactivo de vínculos" },
                { href: "/promesas/", label: "📋 Ver Promesas Incumplidas", desc: "Realidad vs. promesas políticas" },
                { href: "/fake-news/", label: "📰 Ver Fake News Detectadas", desc: "Desinformación en tiempo real" },
                { href: "/red-corrupcion/", label: "🔍 Casos Documentados", desc: "Flujos de dinero analizados" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col py-2 border-b border-[#ECECEC] last:border-0 hover:text-[#213E76] transition-colors"
                >
                  <span className="text-sm font-semibold text-[#1B212C] hover:text-[#213E76]">{item.label}</span>
                  <span className="text-xs text-[#8090A6]">{item.desc}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Aviso legal breve */}
          <div className="bg-white border border-[#ECECEC] rounded p-4">
            <p className="text-[#8090A6] text-xs leading-relaxed">
              Datos extraídos de fuentes públicas: Contraloría, ChileCompra, Mercado Público, CIPER, Google News RSS. Código abierto en{" "}
              <a href="https://github.com/bomberito111/atalaya-panoptica" target="_blank" rel="noopener noreferrer" className="text-[#213E76] hover:underline">
                GitHub
              </a>
              .
            </p>
          </div>
        </aside>
      </div>

      {/* Modal */}
      {modalAnomaly && (
        <CasoModal anomaly={modalAnomaly} onClose={() => setModalAnomaly(null)} />
      )}
    </>
  );
}
