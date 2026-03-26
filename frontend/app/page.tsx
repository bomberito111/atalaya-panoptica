"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getStats,
  getAnomalies,
  getManipulationAlerts,
  getEventDate,
  type Anomaly,
  type ManipulationAlert,
} from "@/lib/supabase";

// ─── Tipos de anomalía → color + etiqueta ───────────────────────────────────
const ANOMALY_META: Record<string, { color: string; label: string; icon: string }> = {
  sobreprecio:              { color: "red",    label: "Sobreprecio",          icon: "💰" },
  conflicto_interes:        { color: "orange", label: "Conflicto de Interés", icon: "🤝" },
  puerta_giratoria:         { color: "yellow", label: "Puerta Giratoria",     icon: "🚪" },
  triangulacion:            { color: "purple", label: "Triangulación",        icon: "🔺" },
  nepotismo:                { color: "pink",   label: "Nepotismo",            icon: "👨‍👩‍👧" },
  irregular_procedimiento:  { color: "blue",   label: "Procedimiento Irregular", icon: "📋" },
  bot_network:              { color: "green",  label: "Red de Bots",          icon: "🤖" },
  fake_news:                { color: "teal",   label: "Fake News",            icon: "📰" },
};

const COLOR_CLASSES: Record<string, string> = {
  red:    "bg-red-900/30 text-red-400 border-red-800",
  orange: "bg-orange-900/30 text-orange-400 border-orange-800",
  yellow: "bg-yellow-900/30 text-yellow-400 border-yellow-800",
  purple: "bg-purple-900/30 text-purple-400 border-purple-800",
  pink:   "bg-pink-900/30 text-pink-400 border-pink-800",
  blue:   "bg-blue-900/30 text-blue-400 border-blue-800",
  green:  "bg-green-900/30 text-green-400 border-green-800",
  teal:   "bg-teal-900/30 text-teal-400 border-teal-800",
};

// ─── Módulos del sistema ─────────────────────────────────────────────────────
const MODULES = [
  {
    href: "/grafo/",
    icon: "🕸️",
    title: "Grafo de Poder",
    desc: "Red interactiva de políticos, empresas y contratos. Filtra por riesgo para ver los nodos más sospechosos.",
    color: "blue",
    cta: "Ver conexiones →",
  },
  {
    href: "/muro-realidad/",
    icon: "⚖️",
    title: "Muro de la Realidad",
    desc: "Las promesas de los políticos frente a los datos del Estado. Cumplida, incumplida o pendiente.",
    color: "yellow",
    cta: "Ver promesas →",
  },
  {
    href: "/radar/",
    icon: "📡",
    title: "Radar de Manipulación",
    desc: "Alertas en tiempo real: granjas de bots, fake news y narrativas coordinadas en redes sociales.",
    color: "green",
    cta: "Ver alertas →",
  },
];

const MODULE_COLORS: Record<string, string> = {
  blue:   "border-blue-800/50 hover:border-blue-600",
  yellow: "border-yellow-800/50 hover:border-yellow-600",
  green:  "border-green-800/50 hover:border-green-600",
};

const MODULE_CTA_COLORS: Record<string, string> = {
  blue:   "text-blue-400",
  yellow: "text-yellow-400",
  green:  "text-green-400",
};

// ─── Fuentes vigiladas ───────────────────────────────────────────────────────
const FUENTES = [
  { label: "Mercado Público",  icon: "🏛️", desc: "Licitaciones y contratos del Estado" },
  { label: "Contraloría",      icon: "📜", desc: "Resoluciones e irregularidades" },
  { label: "Lobby Register",   icon: "🤝", desc: "Reuniones de lobbistas con autoridades" },
  { label: "SERVEL",           icon: "🗳️", desc: "Financiamiento electoral" },
  { label: "DIPRES",           icon: "💼", desc: "Presupuesto nacional" },
  { label: "30+ Medios RSS",   icon: "📡", desc: "Prensa nacional e internacional" },
  { label: "Bing News RSS",     icon: "🔍", desc: "Búsqueda web ampliada sobre Chile" },
  { label: "Reddit Chile",     icon: "💬", desc: "Conversaciones ciudadanas" },
  { label: "Medios Investigados", icon: "🔬", desc: "Ownership y conflictos en prensa" },
];

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, sub,
}: { label: string; value: number; icon: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-3xl font-bold text-white tabular-nums">
          {value.toLocaleString("es-CL")}
        </span>
      </div>
      <span className="text-sm text-gray-400 mt-1">{label}</span>
      {sub && <span className="text-xs text-gray-600">{sub}</span>}
    </div>
  );
}

// ─── Badge de tipo ───────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const meta = ANOMALY_META[type] || { color: "blue", label: type, icon: "⚠️" };
  const cls = COLOR_CLASSES[meta.color] || COLOR_CLASSES.blue;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-mono ${cls}`}>
      {meta.icon} {meta.label}
    </span>
  );
}

// ─── Barra de progreso de confianza ─────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-orange-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-8">{pct}%</span>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState({ totalNodes: 0, totalEdges: 0, totalAnomalies: 0, totalAlerts: 0 });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [alerts, setAlerts] = useState<ManipulationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getAnomalies(0.6), getManipulationAlerts()]).then(
      ([s, a, al]) => {
        setStats(s);
        setAnomalies(a.slice(0, 6));
        setAlerts(al.slice(0, 3));
        setLoading(false);
      }
    );

    // Auto-refresh stats and anomalies every 60 seconds
    const interval = setInterval(() => {
      Promise.all([getStats(), getAnomalies(0.6)]).then(([s, a]) => {
        setStats(s);
        setAnomalies(a.slice(0, 6));
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const hasData = stats.totalNodes > 0 || stats.totalAnomalies > 0;

  return (
    <div className="space-y-12 pb-12">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950/30 p-8 sm:p-12">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative space-y-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-xs text-green-400 font-mono">SISTEMA ACTIVO — actualiza automáticamente cada 2h • datos en tiempo real</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Vigila el poder.<br />
            <span className="text-blue-400">Documenta la corrupción.</span>
          </h1>

          <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
            IA autónoma que monitorea contratos del Estado, lobbies, prensa y redes sociales chilenas.
            Detecta sobreprecios, conflictos de interés y manipulación mediática — sin parar, sin costo.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/grafo/"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              🕸️ Ver Grafo de Poder
            </Link>
            <Link
              href="/radar/"
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-medium text-sm transition-colors border border-gray-700"
            >
              📡 Radar en Vivo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Estado del sistema
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Entidades mapeadas"    value={stats.totalNodes}     icon="🔷" sub="personas, empresas, contratos" />
          <StatCard label="Relaciones detectadas" value={stats.totalEdges}     icon="🔗" sub="vínculos entre entidades" />
          <StatCard label="Anomalías activas"     value={stats.totalAnomalies} icon="🚨" sub="con confianza ≥ 60%" />
          <StatCard label="Alertas de manipulación" value={stats.totalAlerts}  icon="📡" sub="bots y fake news" />
        </div>

        {!hasData && !loading && (
          <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-5 flex gap-4 items-start">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="text-blue-300 font-medium text-sm">El sistema aún está cargando datos iniciales</p>
              <p className="text-gray-500 text-sm mt-1">
                El Rastreador se ejecuta cada 12 horas via GitHub Actions. Una vez que procese las primeras fuentes,
                el Detective (IA) comenzará a construir el grafo automáticamente.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Módulos ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Herramientas de investigación
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`group bg-gray-900 border rounded-xl p-6 transition-all space-y-3 ${MODULE_COLORS[m.color]}`}
            >
              <div className="text-3xl">{m.icon}</div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-white transition-colors text-base">
                  {m.title}
                </h3>
                <p className="text-gray-500 text-sm mt-1 leading-relaxed">{m.desc}</p>
              </div>
              <span className={`text-sm font-medium ${MODULE_CTA_COLORS[m.color]}`}>{m.cta}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Últimas anomalías ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Anomalías detectadas recientemente
          </h2>
          <Link href="/grafo/" className="text-blue-400 text-xs hover:underline">
            Ver todas en el grafo →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : anomalies.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-2">
            <div className="text-4xl">🔍</div>
            <p className="text-gray-400 font-medium">Sin anomalías detectadas aún</p>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              El Detective (Groq/Llama 3) analiza cada ítem de la cola. Aparecerá aquí tan pronto
              detecte sobreprecios, conflictos de interés o puerta giratoria.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.map((a) => (
              <div
                key={a.id}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-4 space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <TypeBadge type={a.anomaly_type} />
                  <span className="text-xs text-gray-600" title={`Detectado: ${new Date(a.created_at).toLocaleDateString("es-CL")}`}>
                    📅 {getEventDate(a)}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{a.description}</p>
                <ConfidenceBar value={a.confidence} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Alertas de manipulación ───────────────────────────────────────── */}
      {(loading || alerts.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Alertas de manipulación recientes
            </h2>
            <Link href="/radar/" className="text-green-400 text-xs hover:underline">
              Ver radar →
            </Link>
          </div>
          {!loading && alerts.map((alert) => (
            <div key={alert.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex gap-3">
              <span className="text-2xl flex-shrink-0">
                {alert.alert_type === "bot_farm" ? "🤖" :
                 alert.alert_type === "fake_news" ? "📰" :
                 alert.alert_type === "coordinated_inauthentic" ? "🎭" : "⚠️"}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-green-400 uppercase">
                    {alert.alert_type.replace(/_/g, " ")}
                  </span>
                  {alert.platform && (
                    <span className="text-xs text-gray-600">{alert.platform}</span>
                  )}
                  <span className="text-xs text-yellow-500">
                    {Math.round(alert.confidence * 100)}% confianza
                  </span>
                </div>
                <p className="text-gray-300 text-sm">{alert.narrative}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Fuentes vigiladas ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Fuentes bajo vigilancia
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {FUENTES.map((f) => (
            <div
              key={f.label}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3"
            >
              <span className="text-lg">{f.icon}</span>
              <div>
                <p className="text-gray-300 text-xs font-medium">{f.label}</p>
                <p className="text-gray-600 text-xs mt-0.5 leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-700 text-center">
          Incluye medios de comunicación: investigados como posibles actores corruptos, no solo como fuentes.
        </p>
      </section>

      {/* ── Cómo funciona ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Cómo funciona
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            {
              step: "1",
              title: "Rastreador (c/12h)",
              desc: "GitHub Actions ejecuta scrapers que recopilan contratos, lobbies, prensa y RRSS. Todo va a una cola en Supabase.",
              color: "blue",
            },
            {
              step: "2",
              title: "Detective IA (c/5min)",
              desc: "Groq/Llama 3 analiza cada ítem: extrae entidades, detecta anomalías y construye el grafo de corrupción.",
              color: "purple",
            },
            {
              step: "3",
              title: "Dashboard (tiempo real)",
              desc: "Tú ves los resultados aquí. El grafo, el radar y el muro se actualizan automáticamente vía Supabase Realtime.",
              color: "green",
            },
          ].map((s) => (
            <div key={s.step} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
              <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                {s.step}
              </div>
              <h3 className="text-white font-medium text-sm">{s.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
