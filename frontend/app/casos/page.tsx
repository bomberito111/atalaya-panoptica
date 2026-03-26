"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnomalies, type Anomaly } from "@/lib/supabase";
import CasoModal from "@/components/CasoModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      colorText: "text-gray-700",
      colorBadge: "bg-gray-600 text-white",
      icon: "⚠️",
      label: type.replace(/_/g, " "),
    }
  );
}

// SOLO usamos evidence.fecha_evento — NUNCA created_at como sustituto de fecha real
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

// ── Tarjeta de caso ────────────────────────────────────────────────────────

function CasoRow({ a, idx }: { a: Anomaly; idx: number }) {
  const t = getTipo(a.anomaly_type);
  const pct = Math.round(a.confidence * 100);
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  const sourceUrl = (ev.source_url ?? ev.url) as string | undefined;
  const entities = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
  const evidenceText = ev.texto as string | undefined;
  const recomendacion = ev.recomendacion as string | undefined;
  const { display: dateDisplay } = getEventDate(a);

  const [open, setOpen] = useState(false);

  async function share() {
    const { short: dateShort } = getEventDate(a);
    const txt = `${t.icon} ${t.label.toUpperCase()} — ${dateShort}\n\n${a.description}\n\nFuente: ATALAYA PANÓPTICA 🇨🇱\nhttps://bomberito111.github.io/atalaya-panoptica/casos/`;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      alert(txt);
    }
  }

  return (
    <article className="bg-white border border-[#ECECEC] rounded overflow-hidden hover:shadow-md transition-shadow">
      {/* Franja tipo */}
      <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 ${t.colorBg}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold tracking-widest uppercase flex items-center gap-1 ${t.colorText}`}>
            {t.icon} {t.label}
          </span>
          <span className={`text-xs font-black px-2 py-0.5 rounded ${
            pct >= 80 ? "bg-[#E00911] text-white" : pct >= 65 ? "bg-orange-500 text-white" : "bg-yellow-500 text-white"
          }`}>
            {pct}% certeza
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8090A6] font-mono">#{idx + 1}</span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#213E76] hover:underline font-medium"
            >
              🔗 Fuente
            </a>
          )}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="px-5 py-4 space-y-3">
        {/* Fecha prominente */}
        <time className="block text-xs text-[#8090A6] font-semibold uppercase tracking-wider">
          📅 {dateDisplay}
        </time>

        {/* Titular */}
        <p className="text-[#1B212C] text-base sm:text-lg font-semibold leading-snug">
          {a.description}
        </p>

        {/* Entidades */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-[#1B212C] rounded-full text-xs border border-[#ECECEC]">
                👤 {e}
              </span>
            ))}
          </div>
        )}

        {/* Mini barra de probabilidad */}
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 80 ? "bg-[#E00911]" : pct >= 65 ? "bg-orange-500" : "bg-yellow-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Expandible */}
        {(evidenceText || recomendacion) && (
          <>
            <button
              onClick={() => setOpen((x) => !x)}
              className={`text-xs font-semibold transition-colors text-[#213E76] hover:text-[#E00911]`}
            >
              {open ? "▲ Ocultar detalle" : "▼ Ver evidencia y línea de investigación"}
            </button>

            {open && (
              <div className="space-y-3 pt-2 border-t border-[#ECECEC]">
                {evidenceText && (
                  <blockquote className="border-l-4 border-[#213E76] pl-4 bg-gray-50 py-2 pr-3 rounded-r">
                    <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold mb-1">Evidencia del documento</p>
                    <p className="text-[#1B212C] text-sm italic leading-relaxed">&ldquo;{evidenceText}&rdquo;</p>
                  </blockquote>
                )}
                {recomendacion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-1">🔎 Línea de investigación</p>
                    <p className="text-amber-900 text-sm leading-relaxed">{recomendacion}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[#ECECEC]">
          <button
            onClick={share}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#1B212C] rounded text-xs font-medium transition-colors border border-[#ECECEC]"
          >
            📤 Compartir
          </button>
          <Link
            href="/red-corrupcion/"
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#1B212C] rounded text-xs font-medium transition-colors border border-[#ECECEC]"
          >
            🕸 Ver red
          </Link>
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
  { key: "fecha_desc", label: "Más recientes" },
  { key: "fecha_asc",  label: "Más antiguos" },
  { key: "conf_desc",  label: "Mayor certeza" },
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
    const raw = await getAnomalies(0.4);
    // Ordenar: primero por fecha_evento si existe
    const sorted = [...raw].sort((x, y) => {
      const rawX = x.evidence?.fecha_evento as string | undefined;
      const rawY = y.evidence?.fecha_evento as string | undefined;
      const dx = rawX && rawX.trim().length >= 4 ? new Date(rawX).getTime() : 0;
      const dy = rawY && rawY.trim().length >= 4 ? new Date(rawY).getTime() : 0;
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
  const filtrados = all.filter((a) => {
    if (filtro !== "todos" && a.anomaly_type !== filtro) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      const ev = (a.evidence ?? {}) as Record<string, unknown>;
      const entityNames = (Array.isArray(ev.entidades_nombradas) ? ev.entidades_nombradas : []) as string[];
      if (
        !a.description.toLowerCase().includes(q) &&
        !entityNames.some((e: string) => e.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  // Ordenar (solo por fecha_evento — NUNCA usando created_at como sustituto)
  const ordenados = [...filtrados].sort((x, y) => {
    if (orden === "conf_desc") return y.confidence - x.confidence;

    const rawX = x.evidence?.fecha_evento as string | undefined;
    const rawY = y.evidence?.fecha_evento as string | undefined;
    const dx = rawX && rawX.trim().length >= 4 ? new Date(rawX).getTime() : 0;
    const dy = rawY && rawY.trim().length >= 4 ? new Date(rawY).getTime() : 0;

    if (orden === "fecha_asc") return dx - dy;
    return dy - dx; // fecha_desc default
  });

  const visibles = ordenados.slice(0, visible);

  return (
    <div className="space-y-5 pb-16">

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <header className="bg-white border border-[#ECECEC] rounded overflow-hidden">
        <div className="bg-[#213E76] text-white px-5 py-3">
          <h1 className="text-xl font-black tracking-tight">🚨 Registro de Casos Detectados</h1>
          <p className="text-white/70 text-sm mt-0.5">
            {loading
              ? "Cargando…"
              : `${all.length} casos registrados · ${filtrados.length} con los filtros actuales`}
            {lastRefresh && (
              <span className="ml-3 text-green-300 text-xs">
                ● actualizado {lastRefresh.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="px-5 py-3 text-xs text-[#8090A6]">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </header>

      {/* ── Búsqueda y orden ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, empresa, descripción…"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setVisible(20); }}
          className="flex-1 bg-white border border-[#ECECEC] rounded px-4 py-2 text-sm text-[#1B212C] placeholder-[#8090A6] focus:outline-none focus:border-[#213E76]"
        />
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="bg-white border border-[#ECECEC] rounded px-3 py-2 text-sm text-[#1B212C] focus:outline-none focus:border-[#213E76]"
        >
          {ORDEN.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Filtros por tipo ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const count = f.key === "todos" ? all.length : all.filter((a) => a.anomaly_type === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => { setFiltro(f.key); setVisible(20); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors border ${
                filtro === f.key
                  ? "bg-[#213E76] text-white border-[#213E76]"
                  : "bg-white text-[#1B212C] border-[#ECECEC] hover:border-[#213E76] hover:text-[#213E76]"
              }`}
            >
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Lista de casos ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded bg-white border border-[#ECECEC] animate-pulse" />
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <div className="text-center py-16 text-[#8090A6] bg-white border border-[#ECECEC] rounded">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-lg font-medium text-[#1B212C]">Sin casos con esos filtros</p>
          <p className="text-sm mt-1">
            {busqueda ? "Prueba con otro término de búsqueda" : "El sistema está acumulando datos — vuelve pronto"}
          </p>
          <button
            onClick={() => { setFiltro("todos"); setBusqueda(""); }}
            className="mt-4 px-4 py-2 bg-[#213E76] hover:bg-blue-900 text-white rounded text-sm transition-colors"
          >
            Ver todos los casos
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-[#8090A6]">Haz clic en cualquier caso para ver la investigación completa</p>
          <div className="space-y-4">
            {visibles.map((a, i) => (
              <div key={a.id} onClick={() => setModalAnomaly(a)} className="cursor-pointer">
                <CasoRow a={a} idx={i} />
              </div>
            ))}
          </div>

          {visible < ordenados.length && (
            <div className="text-center pt-2">
              <button
                onClick={() => setVisible((v) => v + 20)}
                className="px-6 py-2.5 bg-white hover:bg-gray-50 text-[#213E76] rounded text-sm font-semibold transition-colors border border-[#ECECEC]"
              >
                Cargar más ({ordenados.length - visible} restantes)
              </button>
            </div>
          )}

          {visible >= ordenados.length && ordenados.length > 0 && (
            <p className="text-center text-xs text-[#8090A6] pt-2">
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
      <div className="bg-white border border-[#E00911]/30 rounded p-5 text-center space-y-3">
        <div className="bg-[#E00911] text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded inline-block mb-1">
          ¿Conoces un caso de corrupción?
        </div>
        <p className="text-[#8090A6] text-sm">
          El sistema detecta automáticamente, pero la ciudadanía tiene información clave que los datos públicos no muestran.
        </p>
        <Link
          href="/ayudanos/"
          className="inline-block px-6 py-2.5 bg-[#E00911] hover:bg-red-700 text-white font-bold rounded text-sm transition-colors"
        >
          🚨 Enviar denuncia ciudadana
        </Link>
      </div>
    </div>
  );
}
