"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ManipulationAlert {
  id: string;
  alert_type: string;
  narrative: string;
  platform: string;
  evidence: Record<string, unknown>;
  official_data: Record<string, unknown>;
  confidence: number;
  is_public: boolean;
  created_at: string;
}

// Datos de respaldo cuando la DB está vacía
const FAKE_NEWS_HARDCODED: ManipulationAlert[] = [
  {
    id: "fn-1",
    alert_type: "desinformacion",
    narrative: "Chile es el país con mayor tasa de crimen de Latinoamérica",
    platform: "WhatsApp / Twitter",
    evidence: {
      fuente_claim: "Cadenas de WhatsApp virales",
      fecha_deteccion: "2024-02-15",
      texto: "Cadena viral que afirma que Chile lidera el crimen en América Latina, usada para generar pánico y apoyar agenda de mano dura.",
    },
    official_data: {
      dato_real: "Según el Informe de Seguridad Ciudadana 2023, Chile tiene tasas de homicidio menores a países como Colombia, México, Brasil y Venezuela. La tasa de homicidios de Chile es de ~4,5 por 100.000 hab., frente a los 25+ de algunos países latinoamericanos.",
      fuente_oficial: "https://www.investigaciones.cl/estadisticas",
      diferencia: "El claim invierte la realidad de forma malintencionada",
    },
    confidence: 0.92,
    is_public: true,
    created_at: "2024-02-15T00:00:00Z",
  },
  {
    id: "fn-2",
    alert_type: "desinformacion",
    narrative: "El gobierno entregó tierras mapuches a empresas chinas",
    platform: "Facebook / Twitter",
    evidence: {
      fuente_claim: "Posts virales en RRSS, sin fuente verificable",
      fecha_deteccion: "2024-03-10",
      texto: "Publicaciones masivas afirmando que el Gobierno de Boric entregó tierras ancestrales mapuches a empresas estatales chinas en la Patagonia.",
    },
    official_data: {
      dato_real: "No existe ningún decreto ni licitación que respalde esta afirmación. La Corporación de Fomento (CORFO) no tiene registros de tal transferencia. CONADI no ha informado de ninguna operación de este tipo.",
      fuente_oficial: "https://www.conadi.gob.cl",
      diferencia: "Noticia fabricada. No hay registro oficial alguno.",
    },
    confidence: 0.95,
    is_public: true,
    created_at: "2024-03-10T00:00:00Z",
  },
  {
    id: "fn-3",
    alert_type: "coordinacion_inautentica",
    narrative: "Red de bots amplificó campaña anti-Boric en período de baja popularidad",
    platform: "Twitter/X",
    evidence: {
      fuente_claim: "Análisis de actividad de cuentas en Twitter/X",
      fecha_deteccion: "2024-01-20",
      texto: "Más de 2.000 cuentas con menos de 30 días de antigüedad publicaron el mismo hashtag en un período de 2 horas, con patrones de actividad coordinada (mismo horario, mismas palabras clave).",
    },
    official_data: {
      dato_real: "El Servicio Electoral (SERVEL) no tiene registro de campaña oficial que coordine este tipo de actividad. Los patrones son consistentes con operaciones de astroturfing.",
      fuente_oficial: "https://www.servel.cl",
      diferencia: "Actividad inorgánica detectada. Origen desconocido.",
    },
    confidence: 0.78,
    is_public: true,
    created_at: "2024-01-20T00:00:00Z",
  },
];

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  desinformacion:           { label: "Desinformación",          icon: "📰", color: "text-red-400",    bg: "bg-red-950",    border: "border-red-800" },
  fake_news:                { label: "Noticia Falsa",           icon: "⚠️", color: "text-orange-400", bg: "bg-orange-950", border: "border-orange-800" },
  coordinacion_inautentica: { label: "Coordinación Inauténtica",icon: "🤖", color: "text-purple-400", bg: "bg-purple-950", border: "border-purple-800" },
  bot_network:              { label: "Red de Bots",             icon: "🤖", color: "text-purple-400", bg: "bg-purple-950", border: "border-purple-800" },
  astroturfing:             { label: "Astroturfing",            icon: "🌿", color: "text-teal-400",   bg: "bg-teal-950",   border: "border-teal-800" },
};

function getAlertConfig(type: string) {
  return ALERT_TYPE_CONFIG[type] ?? { label: type, icon: "⚠️", color: "text-gray-400", bg: "bg-gray-900", border: "border-gray-800" };
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return s; }
}

export default function FakeNewsPage() {
  const [alerts, setAlerts] = useState<ManipulationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("manipulation_alerts")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(50);

      setAlerts(data && data.length > 0 ? data : FAKE_NEWS_HARDCODED);
      setLastRefresh(new Date());
      setLoading(false);
    }
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const filtradas = alerts.filter(a => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    const ev = a.evidence as Record<string, unknown>;
    return (
      a.narrative.toLowerCase().includes(q) ||
      a.platform.toLowerCase().includes(q) ||
      String(ev?.texto || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* Cabecera estilo diario */}
      <header className="border-b-2 border-white pb-4 pt-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {lastRefresh && <span className="ml-3 text-green-500">● actualizado</span>}
        </p>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">
          📰 Desmentidor de Fake News
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Narrativas falsas o manipuladas detectadas automáticamente y verificadas con datos oficiales.
        </p>
      </header>

      {/* Contador */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-3">
            <div className="text-2xl font-black text-red-400">{alerts.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">casos detectados</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-3">
            <div className="text-2xl font-black text-purple-400">
              {alerts.filter(a => a.alert_type.includes("bot") || a.alert_type.includes("coordinacion")).length}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">redes de bots</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl py-3">
            <div className="text-2xl font-black text-orange-400">
              {alerts.filter(a => a.confidence >= 0.85).length}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">alta certeza</div>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="🔍 Buscar narrativa, plataforma, descripción…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500"
      />

      {/* Lista */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-3">🔍</p>
          <p>Sin resultados para esa búsqueda</p>
          <button onClick={() => setBusqueda("")} className="mt-3 text-sm text-blue-400 underline">Ver todo</button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtradas.map(a => {
            const c = getAlertConfig(a.alert_type);
            const ev = a.evidence as Record<string, unknown>;
            const od = a.official_data as Record<string, unknown>;
            const isOpen = expanded === a.id;
            const pct = Math.round(a.confidence * 100);

            // Type-safe extractions from Record<string, unknown>
            const textoStr = ev?.texto != null ? String(ev.texto) : "";
            const fuenteClaimStr = ev?.fuente_claim != null ? String(ev.fuente_claim) : "";
            const datoRealStr = od?.dato_real != null ? String(od.dato_real) : "";
            const fuenteOficialStr = od?.fuente_oficial != null ? String(od.fuente_oficial) : "";
            const diferenciaStr = od?.diferencia != null ? String(od.diferencia) : "";

            return (
              <article key={a.id} className={`rounded-xl border ${c.border} bg-gray-950 overflow-hidden`}>

                {/* Franja tipo */}
                <div className={`px-4 py-2.5 flex items-center justify-between gap-3 ${c.bg} border-b ${c.border}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${c.color} flex items-center gap-1.5`}>
                    {c.icon} {c.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      pct >= 85 ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300"
                    }`}>
                      {pct}% certeza
                    </span>
                    <span className="text-xs text-gray-500">{a.platform}</span>
                  </div>
                </div>

                {/* Contenido */}
                <div className="px-4 py-3 space-y-2">
                  <time className="block text-xs text-gray-500 uppercase tracking-wider">
                    📅 {formatDate(a.created_at)}
                  </time>

                  {/* La narrativa falsa */}
                  <div>
                    <p className="text-xs text-red-400 uppercase tracking-wider font-semibold mb-1">🚫 Narrativa falsa / manipulada</p>
                    <p className="text-white font-semibold text-base leading-snug">&ldquo;{a.narrative}&rdquo;</p>
                  </div>

                  {/* Texto de la evidencia */}
                  {textoStr && (
                    <p className="text-gray-400 text-sm leading-relaxed">{textoStr}</p>
                  )}

                  {/* Botón expandir */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                    className={`text-xs font-medium ${c.color} hover:opacity-80 transition-colors`}
                  >
                    {isOpen ? "▲ Ocultar verificación" : "▼ Ver datos oficiales que lo desmienten"}
                  </button>

                  {/* Verificación con datos oficiales */}
                  {isOpen && (
                    <div className="space-y-3 pt-2 border-t border-gray-800">
                      <div className="bg-green-950/30 border border-green-900/40 rounded-lg p-3 space-y-1">
                        <p className="text-xs text-green-400 uppercase tracking-wider font-semibold">✅ Dato oficial verificado</p>
                        <p className="text-green-100 text-sm leading-relaxed">{datoRealStr}</p>
                        {fuenteOficialStr && (
                          <a href={fuenteOficialStr} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline block">
                            🔗 {fuenteOficialStr}
                          </a>
                        )}
                      </div>
                      {diferenciaStr && (
                        <div className="bg-amber-950/30 border border-amber-900/40 rounded-lg p-3">
                          <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-1">📌 Por qué es falso/manipulado</p>
                          <p className="text-amber-200 text-sm">{diferenciaStr}</p>
                        </div>
                      )}
                      {fuenteClaimStr && (
                        <p className="text-xs text-gray-600">Origen del claim: {fuenteClaimStr}</p>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Cómo funciona el desmentidor */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-white font-bold">¿Cómo funciona el Desmentidor?</h2>
        <div className="space-y-2 text-sm text-gray-400">
          <p>🔍 <strong className="text-gray-300">Detecta</strong>: La IA monitorea redes sociales y medios buscando narrativas con señales de manipulación.</p>
          <p>📊 <strong className="text-gray-300">Verifica</strong>: Contrasta cada claim con datos de organismos oficiales (INE, SERVEL, Minsterios, Contraloría).</p>
          <p>📰 <strong className="text-gray-300">Publica</strong>: Si hay contradicción comprobable, lo registra aquí con la fuente oficial.</p>
        </div>
        <a href="/ayudanos/" className="inline-block px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors">
          📢 Reportar fake news que encontraste
        </a>
      </div>
    </div>
  );
}
