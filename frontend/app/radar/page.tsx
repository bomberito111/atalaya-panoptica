"use client";

import { useEffect, useState } from "react";
import { supabase, getManipulationAlerts, type ManipulationAlert } from "@/lib/supabase";

const ALERT_CONFIG = {
  bot_farm: {
    icon: "🤖",
    label: "Granja de Bots",
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    cardBorder: "border-[#ECECEC]",
  },
  coordinated_inauthentic: {
    icon: "🎭",
    label: "Comportamiento Inauténtico",
    badgeClass: "bg-orange-50 text-orange-700 border border-orange-200",
    cardBorder: "border-[#ECECEC]",
  },
  fake_news: {
    icon: "📰",
    label: "Noticia Falsa",
    badgeClass: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    cardBorder: "border-[#ECECEC]",
  },
  astroturfing: {
    icon: "🌿",
    label: "Astroturfing",
    badgeClass: "bg-green-50 text-green-700 border border-green-200",
    cardBorder: "border-[#ECECEC]",
  },
  narrative_hijacking: {
    icon: "🎯",
    label: "Secuestro de Narrativa",
    badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",
    cardBorder: "border-[#ECECEC]",
  },
} as const;

// Hardcoded example alerts shown when DB is empty
const EXAMPLE_ALERTS: ManipulationAlert[] = [
  {
    id: "ex-1",
    alert_type: "bot_farm",
    narrative: "Red de cuentas coordinadas amplifica críticas al gobierno usando hashtags idénticos",
    platform: "Twitter/X",
    evidence: {
      patrones_detectados: ["Cuentas creadas el mismo día", "Publicaciones en minutos consecutivos", "Texto idéntico con variaciones mínimas"],
    },
    official_data: {
      dato_correcto: "El SERVEL no tiene registro de campaña oficial que coordine esta actividad. Patrones consistentes con astroturfing.",
    },
    confidence: 0.91,
    is_public: true,
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: "ex-2",
    alert_type: "fake_news",
    narrative: "Chile tiene la tasa de homicidios más alta de América Latina",
    platform: "WhatsApp / Facebook",
    evidence: {
      patrones_detectados: ["Cadena viral sin fuente", "Cifras no verificables", "Comparación incorrecta de indicadores"],
    },
    official_data: {
      dato_correcto: "Según datos de la PDI 2023, Chile tiene una tasa de ~4,5 homicidios por 100.000 hab., significativamente menor que países como Venezuela, Honduras o México.",
    },
    confidence: 0.94,
    is_public: true,
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: "ex-3",
    alert_type: "coordinated_inauthentic",
    narrative: "Campaña coordinada difunde desinformación sobre reforma de pensiones",
    platform: "Twitter/X",
    evidence: {
      patrones_detectados: ["2.400 cuentas con menos de 30 días de antigüedad", "Mismo horario de publicación", "Hashtags idénticos"],
    },
    official_data: {
      dato_correcto: "La Superintendencia de Pensiones publicó cifras oficiales que contradicen las afirmaciones viralizadas.",
    },
    confidence: 0.87,
    is_public: true,
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

function AlertCard({ alert }: { alert: ManipulationAlert }) {
  const config = ALERT_CONFIG[alert.alert_type as keyof typeof ALERT_CONFIG] ?? {
    icon: "⚠️",
    label: alert.alert_type.replace(/_/g, " "),
    badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]",
    cardBorder: "border-[#ECECEC]",
  };

  const evidence = alert.evidence as Record<string, unknown>;
  const officialData = alert.official_data as Record<string, unknown>;

  return (
    <div className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-[#ECECEC] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${config.badgeClass}`}>
            {config.label}
          </span>
          <span className="text-xs text-[#8090A6] border border-[#ECECEC] rounded-full px-2 py-0.5">
            {alert.platform}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-[#213E76]">
            {Math.round(alert.confidence * 100)}% certeza
          </span>
          <span className="text-xs text-[#8090A6]">
            {new Date(alert.created_at).toLocaleString("es-CL", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-4 space-y-3">
        <div>
          <p className="text-xs text-[#8090A6] uppercase tracking-wide font-semibold mb-1">Narrativa detectada</p>
          <p className="text-[#1B212C] text-sm font-medium leading-snug">&ldquo;{alert.narrative}&rdquo;</p>
        </div>

        {Boolean(evidence.patrones_detectados) && Array.isArray(evidence.patrones_detectados) && (
          <div>
            <p className="text-xs text-[#8090A6] uppercase tracking-wide font-semibold mb-1">Patrones detectados</p>
            <div className="flex flex-wrap gap-1">
              {(evidence.patrones_detectados as string[]).map((p, i) => (
                <span key={i} className="px-2 py-0.5 bg-[#F5F5F5] border border-[#ECECEC] rounded text-xs text-[#1B212C]">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {Boolean(officialData.dato_correcto) && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-700 uppercase tracking-wide font-semibold mb-1">Dato oficial verificado</p>
            <p className="text-green-800 text-sm leading-relaxed">{String(officialData.dato_correcto)}</p>
          </div>
        )}
      </div>
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

  const displayAlerts = alerts.length === 0 && !loading ? EXAMPLE_ALERTS : alerts;
  const botAlerts = displayAlerts.filter((a) => a.alert_type === "bot_farm" || a.alert_type === "coordinated_inauthentic");
  const fakeNewsAlerts = displayAlerts.filter((a) => a.alert_type === "fake_news");
  const avgConfidence = displayAlerts.length > 0
    ? Math.round(displayAlerts.reduce((acc, a) => acc + a.confidence, 0) / displayAlerts.length * 100)
    : 0;

  return (
    <div className="space-y-6">

      {/* Section header */}
      <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between">
        <span>📡 Radar de Manipulación</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-normal normal-case tracking-normal">En vivo</span>
          {liveCount > 0 && (
            <span className="ml-2 text-xs bg-white/20 rounded px-2 py-0.5">
              {liveCount} nueva{liveCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-[#8090A6] text-sm">
          Detección en tiempo real de bots, granjas de cuentas y fake news en redes sociales chilenas.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#ECECEC] rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-700">{botAlerts.length}</div>
          <div className="text-xs text-[#8090A6] mt-1">Granjas de Bots</div>
        </div>
        <div className="bg-white border border-[#ECECEC] rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-yellow-700">{fakeNewsAlerts.length}</div>
          <div className="text-xs text-[#8090A6] mt-1">Fake News</div>
        </div>
        <div className="bg-white border border-[#ECECEC] rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-700">
            {displayAlerts.filter((a) => a.alert_type === "coordinated_inauthentic").length}
          </div>
          <div className="text-xs text-[#8090A6] mt-1">CIB Detectados</div>
        </div>
        <div className="bg-white border border-[#ECECEC] rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#213E76]">{avgConfidence}%</div>
          <div className="text-xs text-[#8090A6] mt-1">Confianza Media</div>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-xs text-[#8090A6]">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Conectado a Supabase Realtime — actualizaciones automáticas
      </div>

      {loading ? (
        <div className="text-[#8090A6] text-center py-16 bg-white border border-[#ECECEC] rounded-lg">
          Cargando alertas...
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.length === 0 && (
            <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
              <p className="text-[#8090A6] text-sm">
                El sistema está monitoreando redes sociales y medios de comunicación.
              </p>
              <p className="text-xs text-[#8090A6] mt-1">Mostrando alertas de ejemplo:</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1B212C]">
              {alerts.length > 0 ? `Alertas recientes (${alerts.length})` : "Ejemplos de alertas detectadas"}
            </h2>
          </div>
          {displayAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
