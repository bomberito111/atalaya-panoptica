"use client";

import { useEffect, useState } from "react";
import { getPromesas, type Promesa } from "@/lib/supabase";

const VERDICT_CONFIG = {
  cumplida: { label: "Cumplida", color: "text-green-400", bg: "bg-green-900/30 border-green-800", icon: "✅" },
  incumplida: { label: "Incumplida", color: "text-red-400", bg: "bg-red-900/30 border-red-800", icon: "❌" },
  parcial: { label: "Parcial", color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-800", icon: "⚠️" },
  pendiente: { label: "Pendiente", color: "text-blue-400", bg: "bg-blue-900/30 border-blue-800", icon: "⏳" },
  sin_datos: { label: "Sin Datos", color: "text-gray-400", bg: "bg-gray-900/30 border-gray-800", icon: "❓" },
} as const;

function PromisaCard({ promise }: { promise: Promesa }) {
  const verdict = promise.verdict as keyof typeof VERDICT_CONFIG | null;
  const config = verdict ? VERDICT_CONFIG[verdict] : VERDICT_CONFIG.sin_datos;

  return (
    <div className={`border rounded-xl p-5 space-y-3 ${config.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
        </div>
        {promise.promise_date && (
          <span className="text-xs text-gray-600 flex-shrink-0">
            {new Date(promise.promise_date).toLocaleDateString("es-CL")}
          </span>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Promesa</p>
        <p className="text-white text-sm leading-relaxed">"{promise.promise_text}"</p>
        {promise.promise_source && (
          <a
            href={promise.promise_source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-1 inline-block"
          >
            Ver fuente original ↗
          </a>
        )}
      </div>

      {promise.reality_text && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Realidad (datos oficiales)</p>
          <p className="text-gray-300 text-sm leading-relaxed">{promise.reality_text}</p>
          {promise.reality_source && (
            <a
              href={promise.reality_source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-500 hover:underline mt-1 inline-block"
            >
              Fuente oficial ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function MuroRealidadPage() {
  const [promises, setPromesas] = useState<Promesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVerdict, setFilterVerdict] = useState<string>("all");

  useEffect(() => {
    getPromesas().then((p) => {
      setPromesas(p);
      setLoading(false);
    });
  }, []);

  const filtered = promises.filter(
    (p) => filterVerdict === "all" || p.verdict === filterVerdict
  );

  const counts = {
    cumplidas: promises.filter((p) => p.verdict === "cumplida").length,
    incumplidas: promises.filter((p) => p.verdict === "incumplida").length,
    pendientes: promises.filter((p) => p.verdict === "pendiente").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">⚖️ Muro de la Realidad</h1>
        <p className="text-gray-400 mt-1">
          Promesas públicas de políticos chilenos contrastadas con datos oficiales del Estado.
        </p>
      </div>

      {/* Marcador */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-green-400">{counts.cumplidas}</div>
          <div className="text-xs text-green-600 mt-1">Cumplidas ✅</div>
        </div>
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{counts.incumplidas}</div>
          <div className="text-xs text-red-600 mt-1">Incumplidas ❌</div>
        </div>
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-400">{counts.pendientes}</div>
          <div className="text-xs text-blue-600 mt-1">Pendientes ⏳</div>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-2 flex-wrap">
        {["all", "cumplida", "incumplida", "parcial", "pendiente"].map((v) => (
          <button
            key={v}
            onClick={() => setFilterVerdict(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterVerdict === v
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {v === "all" ? "Todas" : VERDICT_CONFIG[v as keyof typeof VERDICT_CONFIG]?.label || v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-16">Cargando promesas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-600 text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
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
