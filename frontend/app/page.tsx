"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStats, getAnomalies, getManipulationAlerts, type Anomaly, type ManipulationAlert } from "@/lib/supabase";

const ANOMALY_COLORS: Record<string, string> = {
  sobreprecio: "text-red-400",
  conflicto_interes: "text-orange-400",
  puerta_giratoria: "text-yellow-400",
  triangulacion: "text-purple-400",
  nepotismo: "text-pink-400",
  irregular_procedimiento: "text-blue-400",
  bot_network: "text-green-400",
  fake_news: "text-teal-400",
};

const ALERT_ICONS: Record<string, string> = {
  bot_farm: "🤖",
  coordinated_inauthentic: "🎭",
  fake_news: "📰",
  astroturfing: "🌿",
  narrative_hijacking: "🎯",
};

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-2">
      <span className="text-3xl">{icon}</span>
      <span className="text-3xl font-bold text-white">{value.toLocaleString("es-CL")}</span>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({ totalNodes: 0, totalEdges: 0, totalAnomalies: 0, totalAlerts: 0 });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [alerts, setAlerts] = useState<ManipulationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getAnomalies(0.6), getManipulationAlerts()]).then(
      ([s, a, al]) => {
        setStats(s);
        setAnomalies(a.slice(0, 5));
        setAlerts(al.slice(0, 5));
        setLoading(false);
      }
    );
  }, []);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
          🏛️ ATALAYA PANÓPTICA
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Investigador digital autónomo del Estado chileno. Monitorea licitaciones, lobbies,
          redes sociales y detecta corrupción con IA en tiempo real.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <span className="px-3 py-1 bg-blue-900/50 text-blue-300 rounded-full text-xs border border-blue-800">
            🤖 Groq/Llama 3
          </span>
          <span className="px-3 py-1 bg-green-900/50 text-green-300 rounded-full text-xs border border-green-800">
            🗄️ Supabase
          </span>
          <span className="px-3 py-1 bg-purple-900/50 text-purple-300 rounded-full text-xs border border-purple-800">
            ⚙️ GitHub Actions
          </span>
          <span className="px-3 py-1 bg-yellow-900/50 text-yellow-300 rounded-full text-xs border border-yellow-800">
            💰 Costo $0
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Entidades en el grafo" value={stats.totalNodes} icon="🔷" />
        <StatCard label="Relaciones detectadas" value={stats.totalEdges} icon="🔗" />
        <StatCard label="Anomalías activas" value={stats.totalAnomalies} icon="🚨" />
        <StatCard label="Alertas de manipulación" value={stats.totalAlerts} icon="📡" />
      </div>

      {/* CTA Modules */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          href="/grafo/"
          className="group bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-xl p-6 transition-all"
        >
          <div className="text-4xl mb-3">🕸️</div>
          <h2 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
            Grafo de Corrupción
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Mapa interactivo de políticos, empresas y contratos conectados
          </p>
        </Link>

        <Link
          href="/muro-realidad/"
          className="group bg-gray-900 border border-gray-800 hover:border-yellow-700 rounded-xl p-6 transition-all"
        >
          <div className="text-4xl mb-3">⚖️</div>
          <h2 className="text-lg font-semibold text-white group-hover:text-yellow-400 transition-colors">
            Muro de la Realidad
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Promesas de políticos vs. datos oficiales del Estado
          </p>
        </Link>

        <Link
          href="/radar/"
          className="group bg-gray-900 border border-gray-800 hover:border-green-700 rounded-xl p-6 transition-all"
        >
          <div className="text-4xl mb-3">📡</div>
          <h2 className="text-lg font-semibold text-white group-hover:text-green-400 transition-colors">
            Radar de Manipulación
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Alertas en vivo de bots y fake news detectadas
          </p>
        </Link>
      </div>

      {/* Últimas Anomalías */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">🚨 Anomalías Recientes</h2>
          <Link href="/grafo/" className="text-blue-400 text-sm hover:underline">
            Ver grafo completo →
          </Link>
        </div>

        {loading ? (
          <div className="text-gray-500 text-center py-8">Cargando datos...</div>
        ) : anomalies.length === 0 ? (
          <div className="text-gray-600 text-center py-8 bg-gray-900 rounded-xl border border-gray-800">
            No hay anomalías detectadas aún. El sistema está procesando datos.
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((a) => (
              <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div
                    className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold"
                    style={{ color: ANOMALY_COLORS[a.anomaly_type]?.replace("text-", "") }}
                  >
                    {Math.round(a.confidence * 100)}%
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-mono ${ANOMALY_COLORS[a.anomaly_type] || "text-gray-400"}`}>
                      {a.anomaly_type.toUpperCase().replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-600 text-xs">
                      {new Date(a.created_at).toLocaleDateString("es-CL")}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm mt-1 leading-relaxed">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Últimas Alertas */}
      {alerts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">🤖 Alertas de Manipulación</h2>
            <Link href="/radar/" className="text-green-400 text-sm hover:underline">
              Ver radar →
            </Link>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{ALERT_ICONS[alert.alert_type] || "⚠️"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-green-400">{alert.alert_type.toUpperCase().replace(/_/g, " ")}</span>
                    <span className="text-gray-600 text-xs">{alert.platform}</span>
                    <span className="text-yellow-400 text-xs">{Math.round(alert.confidence * 100)}% confianza</span>
                  </div>
                  <p className="text-gray-300 text-sm mt-1">{alert.narrative}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
