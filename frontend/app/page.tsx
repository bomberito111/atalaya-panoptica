"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnomalies, getStats, type Anomaly } from "@/lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

const TIPO: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  sobreprecio:             { color: "text-red-400",    bg: "bg-red-950",    border: "border-red-700",    icon: "💰", label: "Sobreprecio" },
  conflicto_interes:       { color: "text-orange-400", bg: "bg-orange-950", border: "border-orange-700", icon: "🤝", label: "Conflicto de Interés" },
  puerta_giratoria:        { color: "text-yellow-400", bg: "bg-yellow-950", border: "border-yellow-700", icon: "🚪", label: "Puerta Giratoria" },
  bot_network:             { color: "text-purple-400", bg: "bg-purple-950", border: "border-purple-700", icon: "🤖", label: "Red de Bots" },
  fake_news:               { color: "text-teal-400",   bg: "bg-teal-950",   border: "border-teal-700",   icon: "📰", label: "Fake News" },
};

function getTipo(type: string) {
  return TIPO[type] ?? { color: "text-gray-400", bg: "bg-gray-900", border: "border-gray-700", icon: "⚠️", label: type.replace(/_/g, " ") };
}

// Extrae la fecha real del evento (de la noticia original, no de cuándo se detectó)
function getEventDate(a: Anomaly): { display: string; iso: string } {
  const raw = (a.evidence?.fecha_evento as string | undefined) ?? a.created_at;
  const d = new Date(raw);
  const isValid = !isNaN(d.getTime());
  return {
    display: isValid
      ? d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Fecha desconocida",
    iso: isValid ? d.toISOString() : a.created_at,
  };
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "hace menos de 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const day = Math.floor(h / 24);
  return `hace ${day} día${day > 1 ? "s" : ""}`;
}

// ── Tarjeta de caso estilo noticiero ──────────────────────────────────────────

function CasoCard({ a, onShare }: { a: Anomaly; onShare: (a: Anomaly) => void }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const recomendacion = ev.recomendacion as string | undefined;
  const { display: dateDisplay } = getEventDate(a);

  const [expanded, setExpanded] = useState(false);
  const hasMore = Boolean(evidenceText || recomendacion);

  return (
    <article className={`rounded-xl overflow-hidden border ${t.border} bg-gray-950`}>

      {/* ── Franja tipo ── */}
      <div className={`px-4 py-2 flex items-center justify-between gap-3 ${t.bg} border-b ${t.border}`}>
        <span className={`text-xs font-bold tracking-widest uppercase ${t.color} flex items-center gap-1.5`}>
          {t.icon} {t.label}
        </span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${
            pct >= 80 ? "bg-red-900 text-red-300" : pct >= 65 ? "bg-orange-900 text-orange-300" : "bg-yellow-900 text-yellow-300"
          }`}>
            {pct}% certeza
          </span>
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div className="px-5 py-4 space-y-3">

        {/* Fecha del hecho — prominente como en un diario */}
        <time className="block text-xs text-gray-500 font-medium uppercase tracking-wider">
          📅 {dateDisplay}
        </time>

        {/* Titular / descripción */}
        <p className="text-white text-base sm:text-lg font-semibold leading-snug">
          {a.description}
        </p>

        {/* Entidades involucradas */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-800 text-gray-300 rounded-full text-xs border border-gray-700">
                👤 {e}
              </span>
            ))}
          </div>
        )}

        {/* Expandible: cita de evidencia + recomendación */}
        {hasMore && (
          <>
            {expanded && (
              <div className="space-y-3 pt-1">
                {evidenceText && (
                  <blockquote className="border-l-2 border-gray-600 pl-4 space-y-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Evidencia del documento</p>
                    <p className="text-gray-300 text-sm italic leading-relaxed">"{evidenceText}"</p>
                  </blockquote>
                )}
                {recomendacion && (
                  <div className="bg-amber-950/50 border border-amber-900/60 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-500 uppercase tracking-wider font-semibold mb-1">🔎 Línea de investigación</p>
                    <p className="text-amber-200 text-sm leading-relaxed">{recomendacion}</p>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setExpanded(x => !x)}
              className={`text-xs font-medium transition-colors ${t.color} hover:opacity-80`}
            >
              {expanded ? "▲ Ocultar detalle" : "▼ Ver evidencia y qué investigar"}
            </button>
          </>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-700 flex items-center gap-1"
            >
              🔗 Ver fuente original →
            </a>
          )}
          <button
            onClick={() => onShare(a)}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs font-medium transition-colors border border-gray-700"
          >
            📤 Compartir este caso
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Filtros ───────────────────────────────────────────────────────────────────

const FILTROS = [
  { key: "todos",           label: "📋 Todos" },
  { key: "sobreprecio",     label: "💰 Sobreprecio" },
  { key: "conflicto_interes", label: "🤝 Conflicto" },
  { key: "puerta_giratoria",  label: "🚪 Puerta Giratoria" },
  { key: "bot_network",     label: "🤖 Bots / Fake News" },
];

// ── Página principal ──────────────────────────────────────────────────────────

export default function HomePage() {
  const [stats, setStats]       = useState({ totalNodes: 0, totalEdges: 0, totalAnomalies: 0, totalAlerts: 0 });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("todos");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [visible, setVisible]   = useState(10);

  const cargar = useCallback(async () => {
    const [s, raw] = await Promise.all([getStats(), getAnomalies(0.5)]);
    setStats(s);
    // Ordenar por fecha real del evento (más recientes primero)
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
          ? (a.anomaly_type === "bot_network" || a.anomaly_type === "fake_news")
          : a.anomaly_type === filtro
      );

  const handleShare = async (a: Anomaly) => {
    const t = getTipo(a.anomaly_type);
    const { display: d } = getEventDate(a);
    const txt = `${t.icon} ${t.label.toUpperCase()} — ${d}\n\n${a.description}\n\nFuente: ATALAYA PANÓPTICA 🇨🇱\nhttps://bomberito111.github.io/atalaya-panoptica/`;
    try { await navigator.clipboard.writeText(txt); setToast("¡Copiado al portapapeles!"); }
    catch { setToast("Copia manualmente el texto."); }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">

      {/* ── Cabecera estilo diario ── */}
      <header className="border-b-2 border-white pb-4 pt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
              {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {lastUpdated && <span className="ml-3 text-green-500">● {timeAgo(lastUpdated)}</span>}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none">
              ATALAYA PANÓPTICA
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Vigilancia ciudadana anticorrupción — Chile 🇨🇱
            </p>
          </div>
          <Link
            href="/ayudanos/"
            className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm transition-colors"
          >
            🚨 Denunciar
          </Link>
        </div>
      </header>

      {/* ── Contador destacado ── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-4">
            <div className="text-3xl font-black text-red-400 tabular-nums">{stats.totalAnomalies}</div>
            <div className="text-xs text-gray-500 mt-1">casos activos</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-4">
            <div className="text-3xl font-black text-white tabular-nums">{stats.totalNodes}</div>
            <div className="text-xs text-gray-500 mt-1">entidades</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-4">
            <div className="text-3xl font-black text-blue-400 tabular-nums">{stats.totalEdges}</div>
            <div className="text-xs text-gray-500 mt-1">vínculos</div>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFiltro(f.key); setVisible(10); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              filtro === f.key
                ? "bg-white text-gray-950 border-white font-bold"
                : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Feed ── */}
      <section>
        {loading ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-5xl animate-pulse">📡</div>
            <p className="text-gray-400 font-medium">Cargando casos…</p>
            <p className="text-gray-600 text-sm">El sistema analiza fuentes chilenas cada 2 horas.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16 space-y-3 border border-gray-800 rounded-xl">
            <div className="text-4xl">🔍</div>
            <p className="text-gray-400">Sin casos con ese filtro.</p>
            <button onClick={() => setFiltro("todos")} className="text-blue-400 text-sm underline">Ver todos</button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              {filtrados.length} caso{filtrados.length !== 1 ? "s" : ""} · ordenados por fecha del hecho
            </p>
            {filtrados.slice(0, visible).map(a => (
              <CasoCard key={a.id} a={a} onShare={handleShare} />
            ))}
            {visible < filtrados.length && (
              <button
                onClick={() => setVisible(v => v + 10)}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-sm font-medium transition-colors border border-gray-800"
              >
                Cargar más ({filtrados.length - visible} casos restantes)
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Cómo funciona (muy breve) ── */}
      <section className="border-t border-gray-800 pt-6">
        <h2 className="text-xs uppercase tracking-widest text-gray-600 font-semibold mb-4">¿Cómo detectamos los casos?</h2>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          {[
            { i: "🔍", t: "La IA busca", s: "Contratos, lobbies y prensa chilena cada 2h" },
            { i: "🧠", t: "Analiza evidencia", s: "Llama 3 (IA) detecta irregularidades y cita el texto" },
            { i: "📋", t: "Publica aquí", s: "Con fecha real del hecho y explicación completa" },
          ].map(x => (
            <div key={x.t} className="space-y-2">
              <div className="text-2xl">{x.i}</div>
              <div className="text-gray-300 font-semibold">{x.t}</div>
              <div className="text-gray-600 leading-snug">{x.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA compartir ── */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center space-y-3">
        <p className="text-white font-bold">¿Sabes de un caso que no aparece?</p>
        <p className="text-gray-500 text-sm">Envíalo de forma anónima y el sistema lo analizará en minutos.</p>
        <Link
          href="/ayudanos/"
          className="inline-block px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm transition-colors"
        >
          📢 Denunciar un caso →
        </Link>
        <div className="flex justify-center gap-3 pt-1">
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText("https://bomberito111.github.io/atalaya-panoptica/"); setToast("¡Enlace copiado!"); }
              catch { setToast("No se pudo copiar."); }
              setTimeout(() => setToast(null), 2000);
            }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            Copiar enlace del sitio
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Esta IA vigila la corrupción en Chile gratis 🇨🇱 #transparencia")}&url=${encodeURIComponent("https://bomberito111.github.io/atalaya-panoptica/")}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-sky-500 hover:text-sky-400 transition-colors underline"
          >
            Compartir en X/Twitter
          </a>
        </div>
      </section>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-xl border border-gray-700 z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
