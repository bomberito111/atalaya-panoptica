"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface Nodo {
  id: string;
  canonical_name: string;
  node_type: string;
  risk_score: number;
  metadata: Record<string, unknown>;
}

interface Arista {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  weight: number;
  evidence_text: string;
  evidence_url: string;
}

interface Anomalia {
  id: string;
  anomaly_type: string;
  confidence: number;
  description: string;
  entities: string[];
  evidence: Record<string, unknown>;
  status: string;
  created_at: string;
}

// ─── Teorías hardcoded de flujo de dinero (casos documentados) ──────────────
const TEORIAS = [
  {
    id: "sqm",
    titulo: "La Red SQM: Cómo la Minera Compró la Política Chilena",
    emoji: "💰",
    nivel_riesgo: "CRÍTICO",
    color: "red",
    resumen: "SQM financió ilegalmente a políticos de todos los partidos por $8.000 millones CLP. El dinero fluía como 'asesorías' falsas o 'donaciones' a fundaciones pantalla.",
    flujo: [
      { de: "SQM (Sociedad Química y Minera)", a: "Fundaciones pantalla", monto: "$8.000M CLP", metodo: "Facturas falsas de 'asesorías'" },
      { de: "Fundaciones pantalla", a: "Campañas UDI / RN / PS / DC / PPD", monto: "Variable", metodo: "Transferencias en efectivo y cheques" },
      { de: "Políticos beneficiados", a: "Legislación favorable a SQM", monto: "Sin cuantificar", metodo: "Votos parlamentarios / regulación blanda" },
    ],
    involucrados: ["Julio Ponce Lerou (dueño SQM)", "Múltiples senadores y diputados 2008-2015", "Pablo Longueira", "Fulvio Rossi"],
    fuente: "https://www.ciper.cl/2015/03/10/sqm-financiaba-politicos-de-todos-los-sectores/",
    estado: "Proceso penal — condenas menores, impunidad generalizada",
  },
  {
    id: "dominga",
    titulo: "Dominga: El Negocio del Presidente",
    emoji: "⛏️",
    nivel_riesgo: "ALTO",
    color: "orange",
    resumen: "Mientras era presidente, Piñera negoció la venta de su participación en Minera Dominga por USD 152M en BVI. El proyecto necesitaba aprobaciones ambientales de su propio gobierno.",
    flujo: [
      { de: "Piñera / Familia", a: "Minera Dominga (participación accionaria)", monto: "USD 152M precio venta", metodo: "Sociedad BVI (paraíso fiscal)" },
      { de: "Comprador (Délano family)", a: "Piñera", monto: "USD 152M en cuotas", metodo: "Último pago condicionado a NO declaración parque nacional" },
      { de: "Gobierno Piñera", a: "Decisión ambiental favorable", monto: "—", metodo: "Presión sobre SERNAGEOMIN / MMA" },
    ],
    involucrados: ["Sebastián Piñera", "Andes Iron (empresa propietaria)", "Carlos Délano"],
    fuente: "https://www.icij.org/investigations/pandora-papers/",
    estado: "Pandora Papers 2021 — imputado, juicio en curso",
  },
  {
    id: "penta",
    titulo: "Caso PENTA: El Financiamiento Negro de la UDI",
    emoji: "🏦",
    nivel_riesgo: "ALTO",
    color: "orange",
    resumen: "El grupo PENTA (Délano-Lavín) usó boletas ideológicamente falsas para financiar campañas de la UDI. Involucra al menos 37 políticos. Solo los ejecutores fueron condenados.",
    flujo: [
      { de: "PENTA (grupo empresarial)", a: "Emisores de boletas falsas", monto: "$1.400M CLP documentados", metodo: "Boletas de 'asesoría' sin servicio real" },
      { de: "Emisores de boletas", a: "Candidatos UDI / RN", monto: "Transferencias directas", metodo: "Cash / transferencia / pago de campaña" },
      { de: "Políticos UDI financiados", a: "PENTA (beneficio regulatorio)", monto: "Sin cuantificar", metodo: "Influencia en regulación bancaria y tributaria" },
    ],
    involucrados: ["Carlos Délano", "Carlos Lavín", "Iván Moreira", "Pablo Zalaquett", "Egon Montecinos"],
    fuente: "https://www.ciper.cl/investigacion/caso-penta/",
    estado: "Délano y Lavín condenados — mayoría de políticos, sobreseídos",
  },
  {
    id: "carabineros",
    titulo: "Carabineros: El Saqueo de los Fondos Reservados",
    emoji: "👮",
    nivel_riesgo: "ALTO",
    color: "yellow",
    resumen: "Altos mandos de Carabineros desviaron $11.000 millones de fondos reservados (sin control ni rendición) para beneficio personal: bonos irregulares, vehículos, viajes.",
    flujo: [
      { de: "Estado de Chile", a: "Fondos Reservados Carabineros", monto: "$11.000M CLP", metodo: "Transferencia anual sin fiscalización" },
      { de: "Fondos Reservados", a: "Altos mandos (generales y coroneles)", monto: "$11.000M CLP", metodo: "Bonos irregulares, facturas falsas, uso personal" },
      { de: "Carabineros institucional", a: "Encubrimiento", monto: "—", metodo: "Cadena de mando que toleró el sistema" },
    ],
    involucrados: ["Heraldo Muñoz (ex Director General)", "Múltiples generales 2017-2019"],
    fuente: "https://www.fiscaliadechile.cl",
    estado: "Formalizado — proceso penal activo",
  },
  {
    id: "corpesca",
    titulo: "Corpesca: La Ley Que Se Compraron",
    emoji: "🐟",
    nivel_riesgo: "MEDIO",
    color: "blue",
    resumen: "La empresa pesquera Corpesca pagó asesorías a la entonces senadora Jacqueline van Rysselberghe para influir en la 'Ley Longueira' de pesca, que privatizó cuotas pesqueras por 20 años.",
    flujo: [
      { de: "Corpesca (Grupo Angelini)", a: "Senadora van Rysselberghe", monto: "$12M CLP en 'asesorías'", metodo: "Contrato de asesoría empresa vinculada" },
      { de: "Van Rysselberghe", a: "Voto favorable Ley de Pesca", monto: "—", metodo: "Apoyo legislativo en comisión y sala" },
      { de: "Ley de Pesca aprobada", a: "Corpesca / Angelini", monto: "Cuotas pesqueras por USD miles de millones", metodo: "Privatización de recurso público por 20 años" },
    ],
    involucrados: ["Jacqueline van Rysselberghe", "Grupo Angelini (Corpesca)", "Pablo Longueira (ministro promotor de la ley)"],
    fuente: "https://www.ciper.cl/2018/08/22/quien-financio-la-campana-de-van-rysselberghe/",
    estado: "Investigada — proceso cerrado sin condena",
  },
];

const RIESGO_COLORES: Record<string, string> = {
  red: "bg-red-900/30 border-red-700 text-red-400",
  orange: "bg-orange-900/30 border-orange-700 text-orange-400",
  yellow: "bg-yellow-900/30 border-yellow-700 text-yellow-400",
  blue: "bg-blue-900/30 border-blue-700 text-blue-400",
};

const NIVEL_BADGE: Record<string, string> = {
  "CRÍTICO": "bg-red-500 text-white",
  "ALTO": "bg-orange-500 text-white",
  "MEDIO": "bg-yellow-500 text-black",
};

// ─── Componente de flujo de dinero ──────────────────────────────────────────
function FlujoStep({ de, a, monto, metodo, idx }: { de: string; a: string; monto: string; metodo: string; idx: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-xs font-bold text-gray-300">
          {idx + 1}
        </div>
        <div className="w-px flex-1 bg-gray-700 mt-1 min-h-4" />
      </div>
      <div className="flex-1 pb-4 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-white font-medium">{de}</span>
          <span className="text-gray-500 text-xs">→</span>
          <span className="text-sm text-yellow-400 font-medium">{a}</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs px-2 py-0.5 bg-green-900/40 border border-green-800 text-green-400 rounded">
            💵 {monto}
          </span>
          <span className="text-xs text-gray-500">{metodo}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de teoría ───────────────────────────────────────────────────────
function TarjetaTeoria({ t, expanded, onToggle }: { t: typeof TEORIAS[0]; expanded: boolean; onToggle: () => void }) {
  const colorCls = RIESGO_COLORES[t.color] || RIESGO_COLORES.blue;
  const badgeCls = NIVEL_BADGE[t.nivel_riesgo] || "bg-gray-600 text-white";

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${colorCls}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 flex items-start gap-4"
      >
        <span className="text-3xl flex-shrink-0">{t.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${badgeCls}`}>
              {t.nivel_riesgo}
            </span>
            <span className="text-xs text-gray-500">{t.estado}</span>
          </div>
          <h3 className="text-white font-semibold text-base mt-1 leading-snug">{t.titulo}</h3>
          <p className="text-gray-400 text-sm mt-1 leading-relaxed line-clamp-2">{t.resumen}</p>
        </div>
        <span className="text-gray-500 flex-shrink-0 mt-1">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="border-t border-current/20 p-5 space-y-6 bg-black/20">
          {/* Flujo de dinero */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              📊 Flujo del Dinero
            </h4>
            <div className="bg-black/30 rounded-lg p-4">
              {t.flujo.map((f, i) => (
                <FlujoStep key={i} {...f} idx={i} />
              ))}
            </div>
          </div>

          {/* Involucrados */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              👤 Involucrados Documentados
            </h4>
            <div className="flex flex-wrap gap-2">
              {t.involucrados.map((p) => (
                <span key={p} className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Estado legal */}
          <div className="flex items-start gap-2 bg-black/20 rounded-lg p-3">
            <span className="text-lg">⚖️</span>
            <div>
              <p className="text-xs text-gray-500 font-medium">Estado Legal</p>
              <p className="text-gray-300 text-sm">{t.estado}</p>
            </div>
          </div>

          {/* Fuente */}
          <a
            href={t.fuente}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            🔗 Fuente: {t.fuente}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Mapa de nodos en vivo (simplificado en SVG) ─────────────────────────────
function MiniGrafo({ nodos, aristas }: { nodos: Nodo[]; aristas: Arista[] }) {
  if (nodos.length === 0) return null;

  // Layout circular simple
  const W = 600, H = 320, CX = W / 2, CY = H / 2, R = 120;
  const positions: Record<string, { x: number; y: number }> = {};
  nodos.slice(0, 10).forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.min(nodos.length, 10) - Math.PI / 2;
    positions[n.id] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
  });

  const riskColor = (score: number) =>
    score > 0.7 ? "#ef4444" : score > 0.5 ? "#f97316" : score > 0.3 ? "#eab308" : "#22c55e";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Red de Entidades Detectadas</span>
        <Link href="/grafo/" className="text-blue-400 text-xs hover:underline">
          Ver grafo interactivo completo →
        </Link>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: "320px" }}>
        {/* Aristas */}
        {aristas.slice(0, 20).map((a) => {
          const s = positions[a.source_node_id];
          const t = positions[a.target_node_id];
          if (!s || !t) return null;
          return (
            <line
              key={a.id}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="#374151" strokeWidth={Math.max(1, a.weight * 2)}
              strokeDasharray={a.relation_type === "conflicto_interes" ? "4 2" : undefined}
            />
          );
        })}
        {/* Nodos */}
        {nodos.slice(0, 10).map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const col = riskColor(n.risk_score);
          const r = 8 + n.risk_score * 12;
          return (
            <g key={n.id}>
              <circle cx={pos.x} cy={pos.y} r={r} fill={col} fillOpacity={0.25} stroke={col} strokeWidth={2} />
              <text
                x={pos.x} y={pos.y + r + 12}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
              >
                {n.canonical_name.split(" ").slice(0, 2).join(" ")}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="px-4 py-2 border-t border-gray-800 flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Riesgo alto</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Riesgo medio</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Riesgo bajo</span>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function RedCorrupcion() {
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [aristas, setAristas] = useState<Arista[]>([]);
  const [anomalias, setAnomalias] = useState<Anomalia[]>([]);
  const [expanded, setExpanded] = useState<string | null>("sqm");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("nodes").select("*").order("risk_score", { ascending: false }).limit(20),
      supabase.from("edges").select("*").limit(50),
      supabase.from("anomalies").select("*").eq("status", "confirmada").order("confidence", { ascending: false }).limit(10),
    ]).then(([n, e, a]) => {
      setNodos(n.data || []);
      setAristas(e.data || []);
      setAnomalias(a.data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-8 pb-12">

      {/* Hero */}
      <section className="relative rounded-2xl overflow-hidden border border-red-900/40 bg-gradient-to-br from-gray-900 via-gray-900 to-red-950/20 p-6 sm:p-10">
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🕵️</span>
            <span className="text-xs font-mono text-red-400 uppercase tracking-widest">Red de Corrupción — Análisis Profundo</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Sigue el dinero.<br />
            <span className="text-red-400">Encuentra al corrupto.</span>
          </h1>
          <p className="text-gray-400 leading-relaxed">
            Teorías documentadas de cómo fluye el dinero entre élites políticas y económicas en Chile.
            Basado en investigaciones de CIPER, ICIJ, Contraloría y Fiscalía.
          </p>
        </div>
      </section>

      {/* Mini grafo en vivo */}
      {!loading && (
        <MiniGrafo nodos={nodos} aristas={aristas} />
      )}

      {/* Anomalías confirmadas por IA */}
      {anomalias.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Casos confirmados por análisis IA
          </h2>
          <div className="space-y-2">
            {anomalias.map((a) => (
              <div key={a.id} className="bg-gray-900 border border-red-900/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-red-400 uppercase px-2 py-0.5 bg-red-900/30 rounded border border-red-800">
                    {a.anomaly_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-500">{Math.round(a.confidence * 100)}% confianza</span>
                  <span className="text-xs text-green-400">{a.status}</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{a.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Teorías documentadas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Flujos documentados de corrupción
          </h2>
          <span className="text-xs text-gray-600">{TEORIAS.length} casos analizados</span>
        </div>
        <div className="space-y-3">
          {TEORIAS.map((t) => (
            <TarjetaTeoria
              key={t.id}
              t={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
        <p className="text-gray-400 text-sm">
          El sistema IA detecta nuevas conexiones automáticamente cada 5 minutos analizando contratos, lobbies, prensa y redes sociales chilenas.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/grafo/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            🕸️ Grafo Interactivo
          </Link>
          <Link href="/radar/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors">
            📡 Radar de Bots
          </Link>
        </div>
      </section>

    </div>
  );
}
