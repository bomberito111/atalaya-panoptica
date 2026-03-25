"use client";

import { useEffect, useState } from "react";
import { supabase, getManipulationAlerts, type ManipulationAlert } from "@/lib/supabase";

const ALERT_CONFIG = {
  bot_farm: { icon: "🤖", color: "text-red-400", bg: "bg-red-900/20 border-red-800" },
  coordinated_inauthentic: { icon: "🎭", color: "text-orange-400", bg: "bg-orange-900/20 border-orange-800" },
  fake_news: { icon: "📰", color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800" },
  astroturfing: { icon: "🌿", color: "text-green-400", bg: "bg-green-900/20 border-green-800" },
  narrative_hijacking: { icon: "🎯", color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800" },
} as const;

function AlertCard({ alert }: { alert: ManipulationAlert }) {
  const config = ALERT_CONFIG[alert.alert_type as keyof typeof ALERT_CONFIG] || {
    icon: "⚠️", color: "text-gray-400", bg: "bg-gray-900/20 border-gray-800"
  };

  const evidence = alert.evidence as Record<string, unknown>;
  const officialData = alert.official_data as Record<string, unknown>;

  return (
    <div className={`border rounded-xl p-5 space-y-3 ${config.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <span className={`text-sm font-semibold ${config.color}`}>
              {alert.alert_type.replace(/_/g, " ").toUpperCase()}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">{alert.platform}</span>
              <span className="text-xs text-yellow-400">{Math.round(alert.confidence * 100)}% confianza</span>
            </div>
          </div>
        </div>
        <span className="text-xs text-gray-600 flex-shrink-0">
          {new Date(alert.created_at).toLocaleString("es-CL", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Narrativa detectada</p>
        <p className="text-white text-sm">{alert.narrative}</p>
      </div>

      {Boolean(evidence.patrones_detectados) && Array.isArray(evidence.patrones_detectados) && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Patrones</p>
          <div className="flex flex-wrap gap-1">
            {(evidence.patrones_detectados as string[]).map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {Boolean(officialData.dato_correcto) && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Dato oficial</p>
          <p className="text-gray-300 text-sm">{officialData.dato_correcto as string}</p>
        </div>
      )}
    </div>
  );
}

export default function RadarPage() {
  const [alerts, setAlerts] = useState<ManipulationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    getManipulationAlerts().then((a) => {
      setAlerts(a);
      setLoading(false);
    });

    // Suscripción en tiempo real via Supabase Realtime
    const channel = supabase
      .channel("manipulation_alerts_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "manipulation_alerts" },
        (payload) => {
          const newAlert = payload.new as ManipulationAlert;
          if (newAlert.is_public) {
            setAlerts((prev) => [newAlert, ...prev.slice(0, 29)]);
            setLiveCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const botAlerts = alerts.filter((a) => a.alert_type === "bot_farm" || a.alert_type === "coordinated_inauthentic");
  const fakeNewsAlerts = alerts.filter((a) => a.alert_type === "fake_news");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">📡 Radar de Manipulación</h1>
          <p className="text-gray-400 mt-1">
            Detección en tiempo real de bots, granjas de cuentas y fake news en redes sociales.
          </p>
        </div>
        {liveCount > 0 && (
          <div className="flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">{liveCount} nueva{liveCount !== 1 ? "s" : ""} en vivo</span>
          </div>
        )}
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{botAlerts.length}</div>
          <div className="text-xs text-red-600">Granjas de Bots 🤖</div>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-400">{fakeNewsAlerts.length}</div>
          <div className="text-xs text-yellow-600">Fake News 📰</div>
        </div>
        <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {alerts.filter((a) => a.alert_type === "coordinated_inauthentic").length}
          </div>
          <div className="text-xs text-orange-600">CIB 🎭</div>
        </div>
        <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {alerts.length > 0
              ? Math.round(alerts.reduce((acc, a) => acc + a.confidence, 0) / alerts.length * 100)
              : 0}%
          </div>
          <div className="text-xs text-purple-600">Confianza Media</div>
        </div>
      </div>

      {/* Indicador en vivo */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Conectado a Supabase Realtime — actualizaciones automáticas
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-16">Cargando alertas...</div>
      ) : alerts.length === 0 ? (
        <div className="text-gray-600 text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          No hay alertas activas. El sistema está monitoreando redes sociales.
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Alertas Recientes ({alerts.length})</h2>
          {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
        </div>
      )}
    </div>
  );
}
