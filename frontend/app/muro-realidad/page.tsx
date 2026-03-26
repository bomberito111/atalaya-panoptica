"use client";

import { useEffect, useState } from "react";
import { getPromises, type Promesa } from "@/lib/supabase";

const VERDICT_CONFIG = {
  cumplida:   { label: "Cumplida",     icon: "✅", badgeClass: "bg-green-50 text-green-700 border border-green-200",   headerClass: "bg-green-50 border-b border-green-200" },
  incumplida: { label: "Incumplida",   icon: "❌", badgeClass: "bg-red-50 text-red-700 border border-red-200",         headerClass: "bg-red-50 border-b border-red-200" },
  parcial:    { label: "Parcial",      icon: "⚠️", badgeClass: "bg-yellow-50 text-yellow-700 border border-yellow-200", headerClass: "bg-yellow-50 border-b border-yellow-200" },
  pendiente:  { label: "Pendiente",    icon: "⏳", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",     headerClass: "bg-blue-50 border-b border-blue-200" },
  sin_datos:  { label: "Sin Datos",    icon: "❓", badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]",    headerClass: "bg-gray-50 border-b border-[#ECECEC]" },
} as const;

function PromisaCard({ promise }: { promise: Promesa }) {
  const verdict = promise.verdict as keyof typeof VERDICT_CONFIG | null;
  const config = verdict ? VERDICT_CONFIG[verdict] : VERDICT_CONFIG.sin_datos;

  return (
    <div className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">
      {/* Verdict header */}
      <div className={`px-4 py-2 flex items-center justify-between gap-2 ${config.headerClass}`}>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${config.badgeClass}`}>
          {config.icon} {config.label}
        </span>
        {promise.promise_date && (
          <span className="text-xs text-[#8090A6] flex-shrink-0">
            {new Date(promise.promise_date).toLocaleDateString("es-CL")}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-4 space-y-3">
        <div>
          <p className="text-xs text-[#8090A6] uppercase tracking-wide font-semibold mb-1">Promesa</p>
          <p className="text-[#1B212C] text-sm font-medium leading-relaxed">&ldquo;{promise.promise_text}&rdquo;</p>
          {promise.promise_source && (
            <a
              href={promise.promise_source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#213E76] hover:underline mt-1 inline-block"
            >
              Ver fuente original ↗
            </a>
          )}
        </div>

        {promise.reality_text && (
          <div className="bg-[#F5F5F5] border border-[#ECECEC] rounded-lg p-3">
            <p className="text-xs text-[#8090A6] uppercase tracking-wide font-semibold mb-1">Realidad (datos oficiales)</p>
            <p className="text-[#1B212C] text-sm leading-relaxed">{promise.reality_text}</p>
            {promise.reality_source && (
              <a
                href={promise.reality_source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-700 hover:underline mt-1 inline-block"
              >
                Fuente oficial ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MuroRealidadPage() {
  const [promises, setPromesas] = useState<Promesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVerdict, setFilterVerdict] = useState<string>("all");

  useEffect(() => {
    getPromises().then((p) => {
      setPromesas(p);
      setLoading(false);
    });
  }, []);

  const filtered = promises.filter(
    (p) => filterVerdict === "all" || p.verdict === filterVerdict
  );

  const counts = {
    cumplidas:   promises.filter((p) => p.verdict === "cumplida").length,
    incumplidas: promises.filter((p) => p.verdict === "incumplida").length,
    pendientes:  promises.filter((p) => p.verdict === "pendiente").length,
  };

  return (
    <div className="space-y-6">

      {/* Section header */}
      <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide">
        ⚖️ Muro de la Realidad
      </div>

      <div>
        <p className="text-[#8090A6] text-sm">
          Promesas públicas de políticos chilenos contrastadas con datos oficiales del Estado.
        </p>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-700">{counts.cumplidas}</div>
          <div className="text-xs text-[#8090A6] mt-1">Cumplidas ✅</div>
        </div>
        <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-700">{counts.incumplidas}</div>
          <div className="text-xs text-[#8090A6] mt-1">Incumplidas ❌</div>
        </div>
        <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-[#213E76]">{counts.pendientes}</div>
          <div className="text-xs text-[#8090A6] mt-1">Pendientes ⏳</div>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {["all", "cumplida", "incumplida", "parcial", "pendiente"].map((v) => (
          <button
            key={v}
            onClick={() => setFilterVerdict(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              filterVerdict === v
                ? "bg-[#213E76] text-white border-[#213E76]"
                : "bg-white text-[#8090A6] border-[#ECECEC] hover:border-[#213E76] hover:text-[#213E76]"
            }`}
          >
            {v === "all" ? "Todas" : VERDICT_CONFIG[v as keyof typeof VERDICT_CONFIG]?.label || v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#8090A6] text-center py-16 bg-white border border-[#ECECEC] rounded-lg">
          Cargando promesas...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-[#8090A6] text-center py-16 bg-white border border-[#ECECEC] rounded-lg shadow-sm">
          {promises.length === 0
            ? "No hay promesas registradas aún. El sistema está analizando datos de RRSS."
            : "No hay promesas con este filtro."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((p) => <PromisaCard key={p.id} promise={p} />)}
        </div>
      )}
    </div>
  );
}
