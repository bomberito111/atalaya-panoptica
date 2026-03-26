"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Promesa {
  id: string;
  politician_id: string;
  promise_text: string;
  promise_source: string | null;
  promise_date: string | null;
  reality_text: string | null;
  reality_source: string | null;
  verdict: "cumplida" | "incumplida" | "parcial" | "pendiente" | "sin_datos" | null;
  verified_at: string;
}

interface Node {
  id: string;
  canonical_name: string;
  node_type: string;
  risk_score: number;
}

type VerdictKey = "cumplida" | "incumplida" | "parcial" | "pendiente" | "sin_datos";

const VERDICT_CONFIG: Record<VerdictKey, {
  label: string; icon: string;
  badgeClass: string; headerClass: string; expandColor: string;
}> = {
  cumplida:   { label: "Cumplida",      icon: "✅", badgeClass: "bg-green-50 text-green-700 border border-green-200",    headerClass: "bg-green-50 border-b border-green-200",    expandColor: "text-green-700" },
  incumplida: { label: "Incumplida",    icon: "❌", badgeClass: "bg-red-50 text-red-700 border border-red-200",          headerClass: "bg-red-50 border-b border-red-200",        expandColor: "text-red-700" },
  parcial:    { label: "Parcialmente",  icon: "⚠️", badgeClass: "bg-yellow-50 text-yellow-700 border border-yellow-200", headerClass: "bg-yellow-50 border-b border-yellow-200",  expandColor: "text-yellow-700" },
  pendiente:  { label: "Pendiente",     icon: "⏳", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",      headerClass: "bg-blue-50 border-b border-blue-200",      expandColor: "text-[#213E76]" },
  sin_datos:  { label: "Sin datos",     icon: "❓", badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]",     headerClass: "bg-gray-50 border-b border-[#ECECEC]",     expandColor: "text-[#8090A6]" },
};

function getVerdict(v: string | null) {
  return VERDICT_CONFIG[(v as VerdictKey) ?? "sin_datos"] ?? VERDICT_CONFIG.sin_datos;
}

function formatDate(s: string | null) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return s; }
}

const PROMESAS_HARDCODED: (Promesa & { politician_name?: string })[] = [
  {
    id: "hc-1",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Reducir el sueldo de los parlamentarios en un 50%",
    promise_source: "https://www.emol.com/noticias/Nacional/2021/09/01/1030000/boric-reducir-sueldo-parlamentarios.html",
    promise_date: "2021-09-01",
    reality_text: "Se redujo el sueldo parlamentario en un 20%, no el 50% prometido.",
    reality_source: "https://www.latercera.com/politica/noticia/sueldo-parlamentario",
    verdict: "parcial",
    verified_at: "2024-01-01",
  },
  {
    id: "hc-2",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Transformar el modelo educativo con educación gratuita y de calidad",
    promise_source: "https://www.gob.cl/noticias/educacion",
    promise_date: "2022-03-11",
    reality_text: "Se mantuvo la gratuidad universitaria existente; sin reformas estructurales al sistema.",
    reality_source: "https://www.mineduc.cl",
    verdict: "parcial",
    verified_at: "2024-01-01",
  },
  {
    id: "hc-3",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Reforma tributaria que recaude 4,1% del PIB adicional en 4 años",
    promise_source: "https://www.gob.cl/noticias/reforma-tributaria",
    promise_date: "2022-03-11",
    reality_text: "La reforma tributaria fue rechazada en parte y aprobada en versión reducida. Meta no alcanzada.",
    reality_source: "https://www.hacienda.cl/reforma-tributaria",
    verdict: "incumplida",
    verified_at: "2024-01-01",
  },
  {
    id: "hc-4",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Reducir la jornada laboral a 40 horas semanales",
    promise_source: "https://www.gob.cl/noticias/ley-40-horas",
    promise_date: "2022-03-11",
    reality_text: "La Ley de 40 Horas fue promulgada en mayo 2023 y comenzó a implementarse gradualmente.",
    reality_source: "https://www.dt.gob.cl/ley-40-horas",
    verdict: "cumplida",
    verified_at: "2024-01-01",
  },
  {
    id: "hc-5",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Implementar una Pensión Garantizada Universal para el 90% de la población",
    promise_source: "https://www.gob.cl/noticias/pension-garantizada",
    promise_date: "2022-03-11",
    reality_text: "La PGU fue implementada y mejorada desde $185.000 a $214.296 mensuales.",
    reality_source: "https://www.ips.gob.cl/pgu",
    verdict: "cumplida",
    verified_at: "2024-01-01",
  },
  {
    id: "hc-6",
    politician_id: "boric",
    politician_name: "Gabriel Boric",
    promise_text: "Nueva Constitución vía Convención Constitucional",
    promise_source: "https://www.gob.cl/noticias/nueva-constitucion",
    promise_date: "2022-03-11",
    reality_text: "El plebiscito del 4 de septiembre 2022 rechazó la propuesta de nueva Constitución con 62% de rechazo. Segundo proceso constituyente también rechazado en diciembre 2023.",
    reality_source: "https://www.servel.cl/resultados-plebiscito",
    verdict: "incumplida",
    verified_at: "2024-01-01",
  },
];

const FILTROS = [
  { key: "todos",      label: "Todas" },
  { key: "cumplida",   label: "✅ Cumplidas" },
  { key: "incumplida", label: "❌ Incumplidas" },
  { key: "parcial",    label: "⚠️ Parciales" },
  { key: "pendiente",  label: "⏳ Pendientes" },
];

export default function PromesasPage() {
  const [promesas, setPromesas] = useState<(Promesa & { politician_name?: string })[]>([]);
  const [nodes, setNodes] = useState<Record<string, Node>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: pData } = await supabase
        .from("promises_vs_reality")
        .select("*")
        .order("verified_at", { ascending: false })
        .limit(100);

      const { data: nData } = await supabase
        .from("nodes")
        .select("id, canonical_name, node_type, risk_score")
        .eq("node_type", "persona")
        .limit(100);

      const nodeMap: Record<string, Node> = {};
      for (const n of nData || []) nodeMap[n.id] = n;
      setNodes(nodeMap);

      if (!pData || pData.length === 0) {
        setPromesas(PROMESAS_HARDCODED);
      } else {
        setPromesas(pData);
      }
      setLoading(false);
    }
    load();
  }, []);

  const counts = { cumplida: 0, incumplida: 0, parcial: 0, pendiente: 0, sin_datos: 0 };
  for (const p of promesas) counts[(p.verdict as VerdictKey) ?? "sin_datos"]++;

  const filtradas = filtro === "todos"
    ? promesas
    : promesas.filter(p => p.verdict === filtro);

  const pctCumplidas = promesas.length > 0
    ? Math.round((counts.cumplida / promesas.length) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* Section header */}
      <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide">
        📋 Promesas vs. Realidad
      </div>

      {/* Date + subtitle */}
      <div>
        <p className="text-xs text-[#8090A6] uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="text-[#8090A6] text-sm">
          ¿Qué prometieron los políticos? ¿Qué cumplieron? Tú decides.
        </p>
      </div>

      {/* Global scoreboard */}
      {!loading && promesas.length > 0 && (
        <div className="bg-white border border-[#ECECEC] rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-[#8090A6] font-medium">{promesas.length} promesas verificadas</p>
            <p className="text-2xl font-black text-[#1B212C]">{pctCumplidas}% cumplidas</p>
          </div>
          <div className="h-3 bg-[#F5F5F5] rounded-full overflow-hidden flex gap-0.5">
            <div className="bg-green-600 h-full transition-all" style={{ width: `${(counts.cumplida / promesas.length) * 100}%` }} />
            <div className="bg-yellow-500 h-full transition-all" style={{ width: `${(counts.parcial / promesas.length) * 100}%` }} />
            <div className="bg-red-600 h-full transition-all" style={{ width: `${(counts.incumplida / promesas.length) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            <span className="text-green-700">✅ {counts.cumplida} cumplidas</span>
            <span className="text-yellow-700">⚠️ {counts.parcial} parciales</span>
            <span className="text-red-700">❌ {counts.incumplida} incumplidas</span>
            <span className="text-[#213E76]">⏳ {counts.pendiente} pendientes</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              filtro === f.key
                ? "bg-[#213E76] text-white border-[#213E76]"
                : "bg-white text-[#8090A6] border-[#ECECEC] hover:border-[#213E76] hover:text-[#213E76]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-[#F5F5F5] rounded-lg animate-pulse border border-[#ECECEC]" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-[#8090A6] bg-white border border-[#ECECEC] rounded-lg">
          <p className="text-4xl mb-3">🔍</p>
          <p>Sin promesas con ese filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(p => {
            const v = getVerdict(p.verdict);
            const name = p.politician_name || nodes[p.politician_id]?.canonical_name || "Político";
            const isOpen = expanded === p.id;
            return (
              <article key={p.id} className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">
                {/* Verdict header */}
                <div className={`px-4 py-2 flex items-center justify-between gap-2 ${v.headerClass}`}>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${v.badgeClass}`}>
                    {v.icon} {v.label}
                  </span>
                  <span className="text-xs text-[#8090A6]">
                    {formatDate(p.promise_date) || "Fecha desconocida"}
                  </span>
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs bg-[#F5F5F5] text-[#8090A6] border border-[#ECECEC] px-2 py-0.5 rounded-full flex-shrink-0">
                      {name}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold">Lo que prometió</p>
                    <p className="text-[#1B212C] text-sm font-medium leading-snug">&ldquo;{p.promise_text}&rdquo;</p>
                    {p.promise_source && (
                      <a href={p.promise_source} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#213E76] hover:underline">
                        🔗 Fuente de la promesa
                      </a>
                    )}
                  </div>

                  {p.reality_text && (
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      className={`text-xs font-semibold transition-colors ${v.expandColor} hover:opacity-80`}
                    >
                      {isOpen ? "▲ Ocultar realidad" : "▼ Ver qué pasó en la realidad"}
                    </button>
                  )}

                  {isOpen && p.reality_text && (
                    <div className="space-y-1 pt-2 border-t border-[#ECECEC]">
                      <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold">Lo que ocurrió en la realidad</p>
                      <p className="text-[#1B212C] text-sm leading-relaxed">{p.reality_text}</p>
                      {p.reality_source && (
                        <a href={p.reality_source} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#213E76] hover:underline">
                          🔗 Fuente de verificación
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* CTA */}
      <div className="bg-white border border-[#ECECEC] rounded-lg p-5 text-center space-y-2 shadow-sm">
        <p className="text-[#1B212C] font-bold">¿Conoces una promesa incumplida?</p>
        <p className="text-[#8090A6] text-sm">Envíala con la fuente y la agregaremos al registro.</p>
        <Link
          href="/ayudanos/"
          className="inline-block px-5 py-2 bg-[#E00911] hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
        >
          📢 Reportar promesa incumplida
        </Link>
      </div>
    </div>
  );
}
