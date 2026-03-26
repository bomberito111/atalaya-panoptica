"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnomalies, getStats, type Anomaly } from "@/lib/supabase";
import CasoModal from "@/components/CasoModal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

const TIPO: Record<string, { color: string; bg: string; border: string; accentBg: string; icon: string; label: string }> = {
  sobreprecio:       { color: "text-red-400",    bg: "bg-red-950",    border: "border-red-700",    accentBg: "bg-red-600",    icon: "💰", label: "Sobreprecio" },
  conflicto_interes: { color: "text-orange-400", bg: "bg-orange-950", border: "border-orange-700", accentBg: "bg-orange-600", icon: "🤝", label: "Conflicto de Interés" },
  puerta_giratoria:  { color: "text-yellow-400", bg: "bg-yellow-950", border: "border-yellow-700", accentBg: "bg-yellow-600", icon: "🚪", label: "Puerta Giratoria" },
  bot_network:       { color: "text-purple-400", bg: "bg-purple-950", border: "border-purple-700", accentBg: "bg-purple-600", icon: "🤖", label: "Red de Bots" },
  fake_news:         { color: "text-teal-400",   bg: "bg-teal-950",   border: "border-teal-700",   accentBg: "bg-teal-600",   icon: "📰", label: "Fake News" },
};

function getTipo(type: string) {
  return TIPO[type] ?? { color: "text-gray-400", bg: "bg-gray-900", border: "border-gray-700", accentBg: "bg-gray-700", icon: "⚠️", label: type.replace(/_/g, " ") };
}

function getEventDate(a: Anomaly): { display: string; short: string; iso: string } {
  const raw = (a.evidence?.fecha_evento as string | undefined) ?? a.created_at;
  const d = new Date(raw);
  const ok = !isNaN(d.getTime());
  return {
    display: ok ? d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Fecha desconocida",
    short:   ok ? d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "—",
    iso:     ok ? d.toISOString() : a.created_at,
  };
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "hace menos de 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// ── Barra de probabilidad ──────────────────────────────────────────────────────

function ProbBar({ pct, tipo }: { pct: number; tipo: string }) {
  const color = pct >= 85 ? "bg-red-600" : pct >= 70 ? "bg-orange-500" : "bg-yellow-500";
  const label = pct >= 85 ? "Alta probabilidad" : pct >= 70 ? "Probabilidad moderada" : "Indicios detectados";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{label} de {getTipo(tipo).label.toLowerCase()}</span>
        <span className={`font-black tabular-nums ${pct >= 85 ? "text-red-400" : pct >= 70 ? "text-orange-400" : "text-yellow-400"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Tarjeta destacada (caso más importante) ────────────────────────────────────

function CasoDestacado({ a, onClick }: { a: Anomaly; onClick: () => void }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const { display: dateDisplay, short: dateShort } = getEventDate(a);

  return (
    <article
      onClick={onClick}
      className={`cursor-pointer rounded-2xl overflow-hidden border-2 ${t.border} bg-gray-950 hover:shadow-2xl transition-shadow`}
    >
      {/* Franja de color */}
      <div className={`${t.accentBg} px-5 py-2.5 flex items-center justify-between gap-3`}>
        <span className="text-white text-sm font-black tracking-widest uppercase flex items-center gap-2">
          {t.icon} CASO DESTACADO · {t.label}
        </span>
        <span className="text-white/80 text-xs font-bold bg-black/20 px-2.5 py-0.5 rounded-full">
          {pct}% probable
        </span>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Fecha */}
        <time className="block text-xs text-gray-500 uppercase tracking-widest font-medium">
          📅 {dateDisplay}
        </time>

        {/* Titular grande */}
        <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
          {a.description}
        </h2>

        {/* Barra de probabilidad */}
        <ProbBar pct={pct} tipo={a.anomaly_type} />

        {/* Evidencia (si existe) */}
        {evidenceText && (
          <blockquote className="border-l-4 border-gray-600 pl-4">
            <p className="text-gray-400 text-sm italic leading-relaxed line-clamp-3">
              &ldquo;{evidenceText}&rdquo;
            </p>
          </blockquote>
        )}

        {/* Entidades */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e, i) => (
              <span key={i} className="px-2.5 py-1 bg-gray-800 text-gray-300 rounded-full text-xs border border-gray-700">
                👤 {e}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <div className="flex items-center gap-2">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                🔗 Ver fuente
              </a>
            )}
          </div>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            Haz clic para ver la investigación completa →
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Tarjeta secundaria (grid) ─────────────────────────────────────────────────

function CasoMini({ a, idx, onClick }: { a: Anomaly; idx: number; onClick: () => void }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const { short: dateShort } = getEventDate(a);

  return (
    <article
      onClick={onClick}
      className={`cursor-pointer rounded-xl overflow-hidden border ${t.border} bg-gray-950 hover:bg-gray-900 transition-colors group`}
    >
      {/* Barra categoría */}
      <div className={`px-3 py-1.5 flex items-center justify-between ${t.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-wider ${t.color} flex items-center gap-1`}>
          {t.icon} {t.label}
        </span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          pct >= 80 ? "bg-red-900/70 text-red-300" : pct >= 65 ? "bg-orange-900/70 text-orange-300" : "bg-yellow-900/70 text-yellow-300"
        }`}>
          {pct}%
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <time className="block text-xs text-gray-600 uppercase tracking-wide">📅 {dateShort}</time>
        <p className="text-white text-sm font-semibold leading-snug group-hover:text-gray-200 transition-colors line-clamp-3">
          {a.description}
        </p>
        {entities.length > 0 && (
          <p className="text-gray-500 text-xs truncate">
            {entities.slice(0, 2).map(e => `👤 ${e}`).join(" · ")}
          </p>
        )}
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 80 ? "bg-red-600" : pct >= 65 ? "bg-orange-500" : "bg-yellow-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </article>
  );
}

// ── Filtros ────────────────────────────────────────────────────────────────────

const FILTROS = [
  { key: "todos",            label: "Todos" },
  { key: "sobreprecio",      label: "💰 Sobreprecio" },
  { key: "conflicto_interes",label: "🤝 Conflicto" },
  { key: "puerta_giratoria", label: "🚪 Puerta Giratoria" },
  { key: "bot_network",      label: "🤖 Bots / Fake News" },
];

// ── Página principal ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [stats, setStats]         = useState({ totalNodes: 0, totalEdges: 0, totalAnomalies: 0, totalAlerts: 0 });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState("todos");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const [visible, setVisible]     = useState(8);
  const [modalAnomaly, setModalAnomaly] = useState<Anomaly | null>(null);

  const cargar = useCallback(async () => {
    const [s, raw] = await Promise.all([getStats(), getAnomalies(0.5)]);
    setStats(s);
    const sorted = [...raw].sort((x, y) => {
      const dx = new Date((x.evidence?.fecha_evento as string) || x.created_at).getTime();
      const dy = new Date((y.evidence?.fecha_evento as string) || y.created_at).getTime();
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

  const filtrados = filtro === "todos"
    ? anomalies
    : anomalies.filter(a =>
        filtro === "bot_network"
          ? a.anomaly_type === "bot_network" || a.anomaly_type === "fake_news"
          : a.anomaly_type === filtro
      );

  const featured = filtrados[0] ?? null;
  const rest = filtrados.slice(1, visible);

  const share = async (a: Anomaly) => {
    const t = getTipo(a.anomaly_type);
    const { display: d } = getEventDate(a);
    const txt = `${t.icon} ${t.label.toUpperCase()} — ${d}\n\n${a.description}\n\nFuente: ATALAYA PANÓPTICA 🇨🇱\nhttps://bomberito111.github.io/atalaya-panoptica/`;
    try { await navigator.clipboard.writeText(txt); setToast("¡Copiado!"); }
    catch { setToast("No se pudo copiar."); }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-0">

      {/* ─── MASTHEAD estilo periódico digital ────────────────────────────────── */}
      <header className="border-b border-gray-700 pb-3 mb-5">

        {/* Barra superior: fecha + actualización */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3 pb-2 border-b border-gray-800">
          <span className="uppercase tracking-wider">
            {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                Actualizado {timeAgo(lastUpdated)}
              </span>
            )}
            <span>Chile 🇨🇱</span>
          </div>
        </div>

        {/* Nombre y subtítulo */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-none">
              ATALAYA
            </h1>
            <p className="text-lg sm:text-xl font-bold text-red-500 tracking-[0.15em] uppercase">
              Panóptica
            </p>
            <p className="text-gray-500 text-xs mt-1 tracking-wide">
              Periodismo de datos · Vigilancia ciudadana anticorrupción · Chile
            </p>
          </div>
          <Link
            href="/ayudanos/"
            className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-black text-sm transition-colors border border-red-500 shadow-lg shadow-red-900/30"
          >
            🚨 DENUNCIAR
          </Link>
        </div>

        {/* Aviso IA */}
        <div className="mt-3 px-3 py-2 bg-amber-950/40 border border-amber-900/50 rounded-lg flex items-start gap-2">
          <span className="text-amber-500 flex-shrink-0 text-sm">⚠️</span>
          <p className="text-amber-400/90 text-xs leading-relaxed">
            <strong>Este sistema usa Inteligencia Artificial y puede cometer errores.</strong>
            {" "}Las detecciones son indicios basados en análisis automático de fuentes públicas, no acusaciones ni sentencias.
            Verifica siempre con fuentes oficiales antes de compartir.
          </p>
        </div>
      </header>

      {/* ─── TICKERS de estadísticas ──────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[
            { n: stats.totalAnomalies, label: "casos detectados", color: "text-red-400" },
            { n: stats.totalNodes,     label: "entidades rastreadas", color: "text-white" },
            { n: stats.totalEdges,     label: "vínculos detectados", color: "text-blue-400" },
            { n: stats.totalAlerts,    label: "alertas desinformación", color: "text-purple-400" },
          ].map(({ n, label, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl py-3 px-2 text-center">
              <div className={`text-2xl font-black tabular-nums ${color}`}>{n}</div>
              <div className="text-xs text-gray-600 mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── NAVEGACIÓN DE SECCIONES ─────────────────────────────────────────── */}
      <div className="flex items-center gap-0 mb-5 border-b border-gray-800 overflow-x-auto pb-0">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFiltro(f.key); setVisible(8); }}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              filtro === f.key
                ? "border-red-600 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex-shrink-0 px-3 py-2.5 text-xs text-gray-600">
          {filtrados.length} casos
        </div>
      </div>

      {/* ─── CUERPO PRINCIPAL ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-20 space-y-4">
          <div className="text-5xl animate-spin">📡</div>
          <p className="text-gray-400 font-bold text-lg">Cargando casos en tiempo real…</p>
          <p className="text-gray-600 text-sm">El sistema analiza fuentes chilenas cada 2 horas automáticamente.</p>
        </div>

      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border border-gray-800 rounded-2xl space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-gray-400 font-semibold">Sin casos con ese filtro</p>
          <button onClick={() => setFiltro("todos")} className="text-red-400 underline text-sm">Ver todos los casos</button>
        </div>

      ) : (
        <div className="space-y-6">

          {/* ── CASO DESTACADO (el más reciente) ── */}
          {featured && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-red-600 rounded-full" />
                <h2 className="text-xs font-black text-red-500 uppercase tracking-widest">Último Caso</h2>
              </div>
              <CasoDestacado a={featured} onClick={() => setModalAnomaly(featured)} />
            </div>
          )}

          {/* ── GRID DE CASOS SECUNDARIOS ── */}
          {rest.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-gray-600 rounded-full" />
                <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Más Casos</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rest.map((a, i) => (
                  <CasoMini
                    key={a.id}
                    a={a}
                    idx={i + 1}
                    onClick={() => setModalAnomaly(a)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Cargar más ── */}
          {visible < filtrados.length && (
            <button
              onClick={() => setVisible(v => v + 8)}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-sm font-bold transition-colors border border-gray-800"
            >
              ↓ Cargar más casos ({filtrados.length - visible} restantes)
            </button>
          )}
        </div>
      )}

      {/* ─── SEPARADOR ─────────────────────────────────────────────────────────── */}
      <div className="border-t-2 border-gray-800 mt-10 pt-8">

        {/* Cómo funciona + disclaimer */}
        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-2">
              Cómo funciona
            </h2>
            <div className="space-y-3 text-sm">
              {[
                { i: "🔍", t: "Rastreador (cada 2h)", d: "Revisa Google News RSS, Contraloría, ChileCompra y portales de transparencia." },
                { i: "🧠", t: "Detective IA (cada 5min)", d: "Llama 3 analiza cada ítem, extrae entidades, detecta irregularidades y cita evidencia textual." },
                { i: "📰", t: "Investigador (automático)", d: "Para casos de alta certeza, busca más contexto y genera un informe periodístico completo." },
                { i: "📅", t: "Fechas reales del hecho", d: "Siempre muestra la fecha de la noticia original, no cuándo el sistema la procesó." },
              ].map(x => (
                <div key={x.t} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{x.i}</span>
                  <div>
                    <p className="text-white font-semibold text-xs">{x.t}</p>
                    <p className="text-gray-500 text-xs leading-relaxed">{x.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-2">
              Aviso Legal y Limitaciones
            </h2>
            <div className="space-y-2 text-xs text-gray-500 leading-relaxed">
              <p>
                <strong className="text-amber-400">⚠️ Sistema automatizado de IA</strong> — Las detecciones son análisis estadísticos de
                información pública, NO acusaciones ni conclusiones judiciales.
              </p>
              <p>
                La IA puede cometer errores: falsos positivos (detectar irregularidad donde no la hay)
                y falsos negativos (no detectar corrupción real). El porcentaje mostrado es la <em>certeza
                del modelo</em>, no evidencia judicial.
              </p>
              <p>
                Siempre verifica con fuentes primarias oficiales: Contraloría, Fiscalía, Poder Judicial, Supertransparencia.
              </p>
              <p>
                <strong className="text-white">Código abierto</strong> — Puedes revisar exactamente cómo funciona en{" "}
                <a href="https://github.com/bomberito111/atalaya-panoptica" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  GitHub
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-white font-bold">¿Sabes de un caso que no aparece?</p>
            <p className="text-gray-500 text-sm">Envíalo de forma anónima. El sistema lo analiza en minutos.</p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <Link
              href="/ayudanos/"
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-red-900/20"
            >
              📢 Denunciar →
            </Link>
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText("https://bomberito111.github.io/atalaya-panoptica/"); setToast("¡Copiado!"); }
                catch { /* ignore */ }
                setTimeout(() => setToast(null), 2000);
              }}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm border border-gray-700 transition-colors"
            >
              🔗 Compartir
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-xl border border-gray-700 z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Modal */}
      {modalAnomaly && (
        <CasoModal anomaly={modalAnomaly} onClose={() => setModalAnomaly(null)} />
      )}
    </div>
  );
}
