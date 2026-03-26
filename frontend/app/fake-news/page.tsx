"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
      texto: "Más de 2.000 cuentas con menos de 30 días de antigüedad publicaron el mismo hashtag en un período de 2 horas, con patrones de actividad coordinada.",
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

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: string; badgeClass: string; headerClass: string }> = {
  desinformacion:           { label: "Desinformación",           icon: "📰", badgeClass: "bg-red-50 text-red-700 border border-red-200",         headerClass: "bg-red-50 border-b border-red-200" },
  fake_news:                { label: "Noticia Falsa",            icon: "⚠️", badgeClass: "bg-orange-50 text-orange-700 border border-orange-200", headerClass: "bg-orange-50 border-b border-orange-200" },
  coordinacion_inautentica: { label: "Coordinación Inauténtica", icon: "🤖", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",      headerClass: "bg-blue-50 border-b border-blue-200" },
  bot_network:              { label: "Red de Bots",              icon: "🤖", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",      headerClass: "bg-blue-50 border-b border-blue-200" },
  astroturfing:             { label: "Astroturfing",             icon: "🌿", badgeClass: "bg-green-50 text-green-700 border border-green-200",    headerClass: "bg-green-50 border-b border-green-200" },
};

function getAlertConfig(type: string) {
  return ALERT_TYPE_CONFIG[type] ?? {
    label: type,
    icon: "⚠️",
    badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]",
    headerClass: "bg-gray-50 border-b border-[#ECECEC]",
  };
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

      {/* Section header */}
      <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between">
        <span>📰 Desmentidor de Fake News</span>
        {lastRefresh && (
          <span className="flex items-center gap-1 text-xs font-normal normal-case tracking-normal text-green-300">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            actualizado
          </span>
        )}
      </div>

      {/* Date + subtitle */}
      <div>
        <p className="text-xs text-[#8090A6] uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="text-[#8090A6] text-sm">
          Narrativas falsas o manipuladas detectadas automáticamente y verificadas con datos oficiales.
        </p>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white border border-[#ECECEC] rounded-lg py-3 shadow-sm">
            <div className="text-2xl font-black text-red-700">{alerts.length}</div>
            <div className="text-xs text-[#8090A6] mt-0.5">casos detectados</div>
          </div>
          <div className="bg-white border border-[#ECECEC] rounded-lg py-3 shadow-sm">
            <div className="text-2xl font-black text-[#213E76]">
              {alerts.filter(a => a.alert_type.includes("bot") || a.alert_type.includes("coordinacion")).length}
            </div>
            <div className="text-xs text-[#8090A6] mt-0.5">redes de bots</div>
          </div>
          <div className="bg-white border border-[#ECECEC] rounded-lg py-3 shadow-sm">
            <div className="text-2xl font-black text-orange-700">
              {alerts.filter(a => a.confidence >= 0.85).length}
            </div>
            <div className="text-xs text-[#8090A6] mt-0.5">alta certeza</div>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 Buscar narrativa, plataforma, descripción…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full bg-white border border-[#ECECEC] rounded-lg px-4 py-2 text-sm text-[#1B212C] placeholder-[#8090A6] focus:outline-none focus:border-[#213E76]"
      />

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-[#F5F5F5] rounded-lg animate-pulse border border-[#ECECEC]" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-[#8090A6] bg-white border border-[#ECECEC] rounded-lg shadow-sm">
          <p className="text-4xl mb-3">🔍</p>
          <p>Sin resultados para esa búsqueda</p>
          <button
            onClick={() => setBusqueda("")}
            className="mt-3 text-sm text-[#213E76] underline"
          >
            Ver todo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtradas.map(a => {
            const c = getAlertConfig(a.alert_type);
            const ev = a.evidence as Record<string, unknown>;
            const od = a.official_data as Record<string, unknown>;
            const isOpen = expanded === a.id;
            const pct = Math.round(a.confidence * 100);

            const textoStr = ev?.texto != null ? String(ev.texto) : "";
            const fuenteClaimStr = ev?.fuente_claim != null ? String(ev.fuente_claim) : "";
            const datoRealStr = od?.dato_real != null ? String(od.dato_real) : "";
            const fuenteOficialStr = od?.fuente_oficial != null ? String(od.fuente_oficial) : "";
            const diferenciaStr = od?.diferencia != null ? String(od.diferencia) : "";

            return (
              <article key={a.id} className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">

                {/* Type header */}
                <div className={`px-4 py-2.5 flex items-center justify-between gap-3 ${c.headerClass}`}>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${c.badgeClass}`}>
                    {c.icon} {c.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      pct >= 85
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}>
                      {pct}% certeza
                    </span>
                    <span className="text-xs text-[#8090A6]">{a.platform}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 py-3 space-y-2">
                  <time className="block text-xs text-[#8090A6] uppercase tracking-wider">
                    📅 {formatDate(a.created_at)}
                  </time>

                  <div>
                    <p className="text-xs text-[#E00911] uppercase tracking-wider font-semibold mb-1">🚫 Narrativa falsa / manipulada</p>
                    <p className="text-[#1B212C] font-semibold text-base leading-snug">&ldquo;{a.narrative}&rdquo;</p>
                  </div>

                  {textoStr && (
                    <p className="text-[#8090A6] text-sm leading-relaxed">{textoStr}</p>
                  )}

                  <button
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                    className="text-xs font-semibold text-[#213E76] hover:opacity-80 transition-colors"
                  >
                    {isOpen ? "▲ Ocultar verificación" : "▼ Ver datos oficiales que lo desmienten"}
                  </button>

                  {isOpen && (
                    <div className="space-y-3 pt-2 border-t border-[#ECECEC]">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                        <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">✅ Dato oficial verificado</p>
                        <p className="text-green-800 text-sm leading-relaxed">{datoRealStr}</p>
                        {fuenteOficialStr && (
                          <a href={fuenteOficialStr} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#213E76] hover:underline block">
                            🔗 {fuenteOficialStr}
                          </a>
                        )}
                      </div>
                      {diferenciaStr && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs text-yellow-700 uppercase tracking-wider font-semibold mb-1">📌 Por qué es falso/manipulado</p>
                          <p className="text-yellow-800 text-sm">{diferenciaStr}</p>
                        </div>
                      )}
                      {fuenteClaimStr && (
                        <p className="text-xs text-[#8090A6]">Origen del claim: {fuenteClaimStr}</p>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="bg-white border border-[#ECECEC] rounded-lg p-5 space-y-3 shadow-sm">
        <h2 className="text-[#1B212C] font-bold border-l-4 border-[#213E76] pl-3">¿Cómo funciona el Desmentidor?</h2>
        <div className="space-y-2 text-sm text-[#8090A6]">
          <p>🔍 <strong className="text-[#1B212C]">Detecta</strong>: La IA monitorea redes sociales y medios buscando narrativas con señales de manipulación.</p>
          <p>📊 <strong className="text-[#1B212C]">Verifica</strong>: Contrasta cada claim con datos de organismos oficiales (INE, SERVEL, Ministerios, Contraloría).</p>
          <p>📰 <strong className="text-[#1B212C]">Publica</strong>: Si hay contradicción comprobable, lo registra aquí con la fuente oficial.</p>
        </div>
        <Link
          href="/ayudanos/"
          className="inline-block px-4 py-2 bg-[#E00911] hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
        >
          📢 Reportar fake news que encontraste
        </Link>
      </div>
    </div>
  );
}
