"use client";

import { useEffect, useState, useCallback } from "react";
import { getAnomalies, type Anomaly } from "@/lib/supabase";
import CasoModal from "@/components/CasoModal";

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

function getEventDate(a: Anomaly): { display: string; iso: string; short: string } {
  const raw = (a.evidence?.fecha_evento as string | undefined) ?? a.created_at;
  const d = new Date(raw);
  const isValid = !isNaN(d.getTime());
  return {
    display: isValid
      ? d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Fecha desconocida",
    short: isValid
      ? d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
      : "—",
    iso: isValid ? d.toISOString() : a.created_at,
  };
}

function ConfBadge({ pct }: { pct: number }) {
  const cls = pct >= 80
    ? "bg-red-900/60 text-red-300 border-red-800"
    : pct >= 65
    ? "bg-orange-900/60 text-orange-300 border-orange-800"
    : "bg-yellow-900/60 text-yellow-300 border-yellow-800";
  return (
    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full border ${cls}`}>
      {pct}% certeza
    </span>
  );
}

// ── Tarjeta expandible ────────────────────────────────────────────────────────

function CasoRow({ a, idx }: { a: Anomaly; idx: number }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const recomendacion = ev.recomendacion as string | undefined;
  const { display: dateDisplay, short: dateShort } = getEventDate(a);

  const [open, setOpen] = useState(false);

  async function share() {
    const txt = `${t.icon} ${t.label.toUpperCase()} — ${dateShort}\n\n${a.description}\n\nFuente: ATALAYA PANÓPTICA 🇨🇱\nhttps://bomberito111.github.io/atalaya-panoptica/casos/`;
    try { await navigator.clipboard.writeText(txt); }
    catch { alert(txt); }
  }

  return (
    <article className={`rounded-xl overflow-hidden border ${t.border} bg-gray-950 transition-shadow hover:shadow-lg`}>

      {/* Franja tipo */}
      <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 ${t.bg} border-b ${t.border}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold tracking-widest uppercase ${t.color} flex items-center gap-1`}>
            {t.icon} {t.label}
          </span>
          <ConfBadge pct={pct} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">#{idx + 1}</span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver fuente original"
              className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              🔗 Fuente
            </a>
          )}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="px-5 py-4 space-y-3">

        {/* Fecha prominente */}
        <time className="block text-xs text-gray-500 font-medium uppercase tracking-wider">
          📅 {dateDisplay}
        </time>

        {/* Titular */}
        <p className="text-white text-base sm:text-lg font-semibold leading-snug">
          {a.description}
        </p>

        {/* Entidades */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-800 text-gray-300 rounded-full text-xs border border-gray-700">
                👤 {e}
              </span>
            ))}
          </div>
        )}

        {/* Expandible */}
        {(evidenceText || recomendacion) && (
          <>
            <button
              onClick={() => setOpen(x => !x)}
              className={`text-xs font-medium transition-colors ${t.color} hover:opacity-80`}
            >
              {open ? "▲ Ocultar detalle" : "▼ Ver evidencia y línea de investigación"}
            </button>

            {open && (
              <div className="space-y-3 pt-1 border-t border-gray-800 mt-2">
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
          </>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={share}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs font-medium transition-colors border border-gray-700"
          >
            📤 Compartir
          </button>
          <a
            href={`/red-corrupcion/`}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs font-medium transition-colors border border-gray-700"
          >
            🕸 Ver red
          </a>
        </div>
      </div>
    </article>
  );
}

// ── Filtros ───────────────────────────────────────────────────────────────────

const FILTROS = [
  { key: "todos",              label: "📋 Todos" },
  { key: "sobreprecio",        label: "💰 Sobreprecio" },
  { key: "conflicto_interes",  label: "🤝 Conflicto de Interés" },
  { key: "puerta_giratoria",   label: "🚪 Puerta Giratoria" },
  { key: "bot_network",        label: "🤖 Bots" },
  { key: "fake_news",          label: "📰 Fake News" },
];

const ORDEN = [
  { key: "fecha_desc",  label: "Más recientes" },
  { key: "fecha_asc",   label: "Más antiguos" },
  { key: "conf_desc",   label: "Mayor certeza" },
];

// ── Página ────────────────────────────────────────────────────────────────────

export default function CasosPage() {
  const [all, setAll] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [orden, setOrden] = useState("fecha_desc");
  const [busqueda, setBusqueda] = useState("");
  const [visible, setVisible] = useState(20);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [modalAnomaly, setModalAnomaly] = useState<Anomaly | null>(null);

  const cargar = useCallback(async () => {
    const raw = await getAnomalies(0.4); // umbral más bajo para mostrar más casos
    // Ordenar inicialmente por fecha evento
    const sorted = [...raw].sort((x, y) => {
      const dx = new Date((x.evidence?.fecha_evento as string) || x.created_at).getTime();
      const dy = new Date((y.evidence?.fecha_evento as string) || y.created_at).getTime();
      return dy - dx;
    });
    setAll(sorted);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  // Filtrar
  const filtrados = all.filter(a => {
    if (filtro !== "todos" && a.anomaly_type !== filtro) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      const ev = (a.evidence ?? {}) as Record<string, unknown>;
      const entityNames = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
      if (
        !a.description.toLowerCase().includes(q) &&
        !entityNames.some((e: string) => e.toLowerCase().includes(q))
      ) return false;
    }
    return true;
  });

  // Ordenar
  const ordenados = [...filtrados].sort((x, y) => {
    if (orden === "fecha_asc") {
      return new Date((x.evidence?.fecha_evento as string) || x.created_at).getTime()
           - new Date((y.evidence?.fecha_evento as string) || y.created_at).getTime();
    }
    if (orden === "conf_desc") return y.confidence - x.confidence;
    // fecha_desc (default)
    return new Date((y.evidence?.fecha_evento as string) || y.created_at).getTime()
         - new Date((x.evidence?.fecha_evento as string) || x.created_at).getTime();
  });

  const visibles = ordenados.slice(0, visible);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* Cabecera */}
      <header className="border-b-2 border-white pb-4 pt-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {lastRefresh && <span className="ml-3 text-green-500">● actualizado hace {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s</span>}
        </p>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">
          🚨 Registro de Casos
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {loading ? "Cargando…" : `${all.length} casos registrados · ${filtrados.length} con los filtros actuales`}
        </p>
      </header>

      {/* Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, empresa, descripción…"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setVisible(20); }}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
        <select
          value={orden}
          onChange={e => setOrden(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-gray-500"
        >
          {ORDEN.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Filtros por tipo */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const count = f.key === "todos"
            ? all.length
            : all.filter(a => a.anomaly_type === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => { setFiltro(f.key); setVisible(20); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                filtro === f.key
                  ? "bg-white text-gray-900 border-white"
                  : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Lista de casos */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-28 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-lg font-medium">Sin casos con esos filtros</p>
          <p className="text-sm mt-1">
            {busqueda ? "Prueba con otro término de búsqueda" : "El sistema está acumulando datos — vuelve pronto"}
          </p>
          <button
            onClick={() => { setFiltro("todos"); setBusqueda(""); }}
            className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Ver todos los casos
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-600 mb-2">Haz clic en cualquier caso para ver la investigación completa</p>
          <div className="space-y-4">
            {visibles.map((a, i) => (
              <div key={a.id} onClick={() => setModalAnomaly(a)} className="cursor-pointer">
                <CasoRow a={a} idx={i} />
              </div>
            ))}
          </div>

          {/* Cargar más */}
          {visible < ordenados.length && (
            <div className="text-center pt-4">
              <button
                onClick={() => setVisible(v => v + 20)}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors border border-gray-700"
              >
                Cargar más ({ordenados.length - visible} restantes)
              </button>
            </div>
          )}

          {visible >= ordenados.length && ordenados.length > 0 && (
            <p className="text-center text-xs text-gray-600 pt-2">
              — Mostrando todos los {ordenados.length} casos —
            </p>
          )}
        </>
      )}

      {/* Modal de caso completo */}
      {modalAnomaly && (
        <CasoModal anomaly={modalAnomaly} onClose={() => setModalAnomaly(null)} />
      )}

      {/* CTA denunciar */}
      <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-5 text-center space-y-3">
        <p className="text-red-300 font-bold text-lg">¿Conoces un caso de corrupción?</p>
        <p className="text-gray-400 text-sm">
          El sistema detecta automáticamente, pero la ciudadanía tiene información clave que los datos públicos no muestran.
        </p>
        <a
          href="/ayudanos/"
          className="inline-block px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
        >
          🚨 Enviar denuncia ciudadana
        </a>
      </div>
    </div>
  );
}
