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

const NIVEL_COLOR: Record<string, { headerBg: string; headerText: string; badge: string; border: string; accent: string }> = {
  "CRÍTICO": { headerBg: "bg-red-700",    headerText: "text-white", badge: "bg-red-100 text-red-800 border-red-300",    border: "border-red-200",   accent: "bg-red-50" },
  "ALTO":    { headerBg: "bg-orange-600", headerText: "text-white", badge: "bg-orange-100 text-orange-800 border-orange-300", border: "border-orange-200", accent: "bg-orange-50" },
  "MEDIO":   { headerBg: "bg-[#213E76]",  headerText: "text-white", badge: "bg-blue-100 text-blue-800 border-blue-300",   border: "border-blue-200",  accent: "bg-blue-50" },
};

// ─── Componente de flujo de dinero ──────────────────────────────────────────
function FlujoStep({ de, a, monto, metodo, idx }: { de: string; a: string; monto: string; metodo: string; idx: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-[#213E76] text-white flex items-center justify-center text-xs font-bold">
          {idx + 1}
        </div>
        <div className="w-px flex-1 bg-gray-200 mt-1 min-h-4" />
      </div>
      <div className="flex-1 pb-4 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[#1B212C] font-semibold">{de}</span>
          <span className="text-[#8090A6] text-xs font-bold">→</span>
          <span className="text-sm text-[#213E76] font-semibold">{a}</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs px-2 py-0.5 bg-green-100 border border-green-300 text-green-800 rounded font-medium">
            💵 {monto}
          </span>
          <span className="text-xs text-[#8090A6]">{metodo}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de teoría (artículo estilo Emol) ─────────────────────────────
function TarjetaTeoria({ t, expanded, onToggle }: { t: typeof TEORIAS[0]; expanded: boolean; onToggle: () => void }) {
  const colors = NIVEL_COLOR[t.nivel_riesgo] ?? NIVEL_COLOR["MEDIO"];

  return (
    <article className={`bg-white border ${colors.border} rounded overflow-hidden hover:shadow-md transition-shadow`}>
      {/* Header de sección estilo Emol */}
      <button
        onClick={onToggle}
        className={`w-full text-left ${colors.headerBg} ${colors.headerText} px-5 py-3 flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{t.emoji}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors.badge}`}>
                NIVEL {t.nivel_riesgo}
              </span>
            </div>
            <h3 className="text-base font-black leading-snug mt-0.5">
              {t.titulo}
            </h3>
          </div>
        </div>
        <span className="text-lg flex-shrink-0 opacity-80">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Resumen siempre visible */}
      <div className="px-5 py-4 border-b border-[#ECECEC]">
        <p className="text-[#1B212C] text-sm leading-relaxed">{t.resumen}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-[#8090A6] rounded border border-[#ECECEC]">
            ⚖️ {t.estado}
          </span>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className={`${colors.accent} px-5 py-5 space-y-6`}>

          {/* Flujo de dinero */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-[#213E76] uppercase tracking-widest border-b border-[#ECECEC] pb-2">
              📊 Flujo del Dinero
            </h4>
            <div className="bg-white rounded border border-[#ECECEC] p-4">
              {t.flujo.map((f, i) => (
                <FlujoStep key={i} {...f} idx={i} />
              ))}
            </div>
          </div>

          {/* Involucrados */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-[#213E76] uppercase tracking-widest border-b border-[#ECECEC] pb-2">
              👤 Involucrados Documentados
            </h4>
            <div className="flex flex-wrap gap-2">
              {t.involucrados.map((p) => (
                <span key={p} className="text-xs px-2.5 py-1 bg-white border border-[#ECECEC] rounded-full text-[#1B212C] font-medium">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Estado legal */}
          <div className="flex items-start gap-3 bg-white rounded border border-[#ECECEC] p-4">
            <span className="text-xl">⚖️</span>
            <div>
              <p className="text-xs text-[#8090A6] font-semibold uppercase tracking-wide">Estado Legal</p>
              <p className="text-[#1B212C] text-sm font-medium mt-0.5">{t.estado}</p>
            </div>
          </div>

          {/* Fuente */}
          <a
            href={t.fuente}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#213E76] hover:underline font-medium"
          >
            🔗 Ver fuente original
          </a>
        </div>
      )}
    </article>
  );
}

// ─── Mini grafo en SVG ───────────────────────────────────────────────────────
function MiniGrafo({ nodos, aristas }: { nodos: Nodo[]; aristas: Arista[] }) {
  if (nodos.length === 0) return null;

  const W = 600, H = 320, CX = W / 2, CY = H / 2, R = 120;
  const positions: Record<string, { x: number; y: number }> = {};
  nodos.slice(0, 10).forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.min(nodos.length, 10) - Math.PI / 2;
    positions[n.id] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
  });

  const riskColor = (score: number) =>
    score > 0.7 ? "#E00911" : score > 0.5 ? "#f97316" : score > 0.3 ? "#eab308" : "#22c55e";

  return (
    <div className="bg-white border border-[#ECECEC] rounded overflow-hidden">
      <div className="bg-[#213E76] text-white px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-bold">Red de Entidades Detectadas</span>
        <Link href="/pared/" className="text-white/80 text-xs hover:text-white">
          Ver mapa completo →
        </Link>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-gray-50" style={{ maxHeight: "320px" }}>
        {aristas.slice(0, 20).map((a) => {
          const s = positions[a.source_node_id];
          const tPos = positions[a.target_node_id];
          if (!s || !tPos) return null;
          return (
            <line
              key={a.id}
              x1={s.x} y1={s.y} x2={tPos.x} y2={tPos.y}
              stroke="#ECECEC" strokeWidth={Math.max(1, a.weight * 2)}
              strokeDasharray={a.relation_type === "conflicto_interes" ? "4 2" : undefined}
            />
          );
        })}
        {nodos.slice(0, 10).map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const col = riskColor(n.risk_score);
          const r = 8 + n.risk_score * 12;
          return (
            <g key={n.id}>
              <circle cx={pos.x} cy={pos.y} r={r} fill={col} fillOpacity={0.2} stroke={col} strokeWidth={2} />
              <text x={pos.x} y={pos.y + r + 12} textAnchor="middle" fontSize={9} fill="#8090A6">
                {n.canonical_name.split(" ").slice(0, 2).join(" ")}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="px-4 py-2 border-t border-[#ECECEC] flex gap-4 text-xs text-[#8090A6]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#E00911] inline-block" /> Riesgo alto</span>
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
    <div className="space-y-6 pb-12">

      {/* ── Header de sección principal ─────────────────────────────────── */}
      <header className="bg-white border border-[#ECECEC] rounded overflow-hidden">
        <div className="bg-[#1B212C] text-white px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🕵️</span>
            <span className="text-xs font-mono text-[#E00911] uppercase tracking-widest">
              Red de Corrupción — Análisis Profundo
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight">
            Sigue el dinero.{" "}
            <span className="text-[#E00911]">Encuentra al corrupto.</span>
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed mt-2">
            Teorías documentadas de cómo fluye el dinero entre élites políticas y económicas en Chile.
            Basado en investigaciones de CIPER, ICIJ, Contraloría y Fiscalía.
          </p>
        </div>
        <div className="px-5 py-2 border-t border-[#ECECEC] flex flex-wrap gap-4 text-xs text-[#8090A6]">
          <span>{TEORIAS.length} casos documentados</span>
          <span>·</span>
          <span>Actualizado continuamente</span>
        </div>
      </header>

      {/* ── Mini grafo en vivo ───────────────────────────────────────────── */}
      {!loading && (
        <MiniGrafo nodos={nodos} aristas={aristas} />
      )}

      {/* ── Anomalías confirmadas por IA ─────────────────────────────────── */}
      {anomalias.length > 0 && (
        <section className="space-y-3">
          <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded">
            Casos confirmados por análisis IA
          </div>
          <div className="space-y-3">
            {anomalias.map((a) => (
              <div key={a.id} className="bg-white border border-[#ECECEC] rounded p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 bg-[#E00911] text-white rounded uppercase">
                    {a.anomaly_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-[#8090A6]">{Math.round(a.confidence * 100)}% confianza</span>
                  <span className="text-xs text-green-700 font-semibold">{a.status}</span>
                </div>
                <p className="text-[#1B212C] text-sm leading-relaxed">{a.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CASOS DOCUMENTADOS (sección principal) ──────────────────────── */}
      <section className="space-y-4">
        <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded flex items-center justify-between">
          <span>Flujos documentados de corrupción</span>
          <span className="text-white/60">{TEORIAS.length} casos analizados</span>
        </div>
        <p className="text-xs text-[#8090A6] px-1">
          Haz clic en cada caso para ver el análisis completo del flujo de dinero.
        </p>
        <div className="space-y-4">
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

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-white border border-[#ECECEC] rounded overflow-hidden">
        <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
          Herramientas de investigación
        </div>
        <div className="p-5 text-center space-y-3">
          <p className="text-[#8090A6] text-sm">
            El sistema IA detecta nuevas conexiones automáticamente cada 5 minutos analizando contratos, lobbies, prensa y redes sociales chilenas.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/pared/"
              className="px-4 py-2 bg-[#213E76] hover:bg-blue-900 text-white rounded text-sm font-bold transition-colors"
            >
              🕸️ Mapa Interactivo
            </Link>
            <Link
              href="/casos/"
              className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#ECECEC] text-[#1B212C] rounded text-sm font-medium transition-colors"
            >
              📋 Ver todos los casos
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
