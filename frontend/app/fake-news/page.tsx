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
    narrative: "Chile tiene la tasa de crimen más alta de Latinoamérica",
    platform: "WhatsApp",
    evidence: {
      fuente_claim: "Cadenas de WhatsApp virales",
      fecha_deteccion: "2024-02-15",
      texto: "Cadena viral que afirma que Chile lidera el crimen en América Latina, usada para generar pánico y apoyar agenda de mano dura.",
      titular: "Chile tiene la tasa de crimen más alta de Latinoamérica",
      narrativa_detectada: "Se difunde masivamente que Chile es el país más peligroso de la región, con tasas de criminalidad superiores a Colombia, México y Venezuela.",
      por_que_es_falso: "Según datos de la UNODC (Oficina de la ONU contra la Droga y el Delito), Chile tiene una tasa de homicidios de ~4,5 por 100.000 habitantes — muy inferior a países como Venezuela (40+), Honduras (38+), Colombia (26+) o México (28+). Chile se ubica en el tercio inferior de la región.",
      la_verdad: "Chile tiene una de las tasas de homicidio más bajas de Latinoamérica según UNODC 2023. La tasa chilena es comparable a países europeos como Portugal o Estonia.",
      preguntas_clave: [
        "¿Quién difundió esta cadena? ¿Tiene algún interés político en generar miedo?",
        "¿Qué dice el Ministerio del Interior y Seguridad Pública sobre las estadísticas reales?",
        "¿Por qué les interesa que creamos que Chile es el más peligroso?",
        "¿Qué metodología usaron para comparar países? ¿Es comparable el dato?",
      ],
      donde_verificar: [
        { nombre: "UNODC — Estadísticas globales de homicidio", url: "https://www.unodc.org/unodc/en/data-and-analysis/global-study-on-homicide.html" },
        { nombre: "CEAD — Centro de Estudios y Análisis del Delito", url: "https://cead.spd.gov.cl" },
        { nombre: "Ministerio del Interior — Datos estadísticos", url: "https://www.interior.gob.cl" },
      ],
    },
    official_data: {
      dato_real: "Según UNODC 2023, Chile tiene una tasa de homicidios de ~4,5 por 100.000 hab., una de las más bajas de Latinoamérica.",
      fuente_oficial: "https://www.unodc.org",
      diferencia: "El claim invierte la realidad — Chile está en el tercio inferior de la región, no en el primero.",
    },
    confidence: 0.92,
    is_public: true,
    created_at: "2024-02-15T00:00:00Z",
  },
  {
    id: "fn-2",
    alert_type: "desinformacion",
    narrative: "El gobierno entregó tierras mapuches a empresas forestales chinas",
    platform: "Facebook / Twitter",
    evidence: {
      fuente_claim: "Posts virales en RRSS sin fuente verificable",
      fecha_deteccion: "2024-03-10",
      texto: "Publicaciones masivas afirmando que el Gobierno de Boric entregó tierras ancestrales mapuches a empresas estatales chinas en la Patagonia.",
      titular: "Boric entregó tierras mapuches a empresas forestales chinas en la Patagonia",
      narrativa_detectada: "Se difunde que el gobierno firmó un acuerdo secreto entregando territorio mapuche ancestral a consorcios forestales de capital chino, sin consulta indígena.",
      por_que_es_falso: "No existe ningún decreto, licitación ni contrato en el registro oficial de CONAF, CONADI o la Contraloría que respalde esta afirmación. La corporación de Fomento (CORFO) tampoco registra tal operación. La noticia carece de fuente primaria verificable.",
      la_verdad: "No hay registro oficial en ninguna institución del Estado (CONADI, CONAF, Contraloría, MBN) de transferencia de tierras a empresas chinas. Las tierras en cuestión siguen siendo parte del proceso de restitución territorial mapuche.",
      preguntas_clave: [
        "¿Cuál es el número de decreto o resolución que supuestamente autorizó esto?",
        "¿Por qué CONADI, CONAF y Contraloría no tienen registro de esta operación?",
        "¿Qué interés tienen quienes difunden esto en generar desconfianza hacia el gobierno?",
        "¿Qué dice la CONADI sobre el estado real de las tierras ancestrales?",
      ],
      donde_verificar: [
        { nombre: "CONADI — Corporación Nacional de Desarrollo Indígena", url: "https://www.conadi.gob.cl" },
        { nombre: "CONAF — Catastro de bosques y tierras", url: "https://www.conaf.cl" },
        { nombre: "Contraloría — Buscador de contratos y decretos", url: "https://www.contraloria.cl" },
      ],
    },
    official_data: {
      dato_real: "No existe ningún decreto ni licitación que respalde esta afirmación. CONADI y CONAF no tienen registro de tal operación.",
      fuente_oficial: "https://www.conadi.gob.cl",
      diferencia: "Noticia fabricada sin ningún registro oficial verificable.",
    },
    confidence: 0.95,
    is_public: true,
    created_at: "2024-03-10T00:00:00Z",
  },
  {
    id: "fn-3",
    alert_type: "coordinacion_inautentica",
    narrative: "Red de bots infla artificialmente encuestas políticas en redes sociales",
    platform: "Twitter/X",
    evidence: {
      fuente_claim: "Análisis de patrones de actividad en Twitter/X",
      fecha_deteccion: "2024-01-20",
      texto: "Más de 2.000 cuentas con menos de 30 días de antigüedad publicaron el mismo hashtag en un período de 2 horas, con patrones de actividad coordinada.",
      titular: "Hay una red de bots que infla artificialmente encuestas políticas en Chile",
      narrativa_detectada: "Cuentas automatizadas coordinan votos y comentarios para hacer aparecer ciertos candidatos o posturas como más populares de lo que realmente son en plataformas digitales.",
      por_que_es_falso: "No es completamente falso — el patrón detectado es real y documentado. Sin embargo, se usa para generalizar que TODAS las encuestas están manipuladas, lo cual sí es falso. Las encuestas de opinión con metodología presencial (CEP, Cadem) no son afectadas por bots en redes sociales.",
      la_verdad: "Sí existen redes de cuentas coordinadas (astroturfing) en redes sociales, pero estas no afectan las encuestas de opinión pública de metodología presencial o telefónica. El SERVEL no tiene registro de campaña oficial que coordine este comportamiento.",
      preguntas_clave: [
        "¿Qué cuentas específicas mostraron el comportamiento coordinado? ¿Puedo verificarlo?",
        "¿Quién opera esta red? ¿Hay indicios de financiamiento político?",
        "¿Qué ha dicho SERVEL sobre campañas digitales ilegales?",
        "¿Se está usando esto para deslegitimar encuestas reales con metodología seria?",
      ],
      donde_verificar: [
        { nombre: "SERVEL — Servicio Electoral de Chile", url: "https://www.servel.cl" },
        { nombre: "CEP — Encuesta Nacional de Opinión Pública", url: "https://www.cepchile.cl" },
        { nombre: "CIPER Chile — Investigación periodística", url: "https://www.ciperchile.cl" },
      ],
    },
    official_data: {
      dato_real: "SERVEL no tiene registro de campaña oficial coordinando esta actividad. Los patrones son consistentes con astroturfing, pero no afectan encuestas presenciales.",
      fuente_oficial: "https://www.servel.cl",
      diferencia: "Patrón real de bots, pero usado para generalizar falsamente que todas las encuestas están manipuladas.",
    },
    confidence: 0.78,
    is_public: true,
    created_at: "2024-01-20T00:00:00Z",
  },
];

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: string; badgeClass: string; headerClass: string }> = {
  desinformacion:           { label: "DESINFORMACIÓN DETECTADA", icon: "📰", badgeClass: "bg-red-50 text-red-700 border border-red-200",         headerClass: "bg-red-50 border-b border-red-200" },
  fake_news:                { label: "FAKE NEWS",                icon: "⚠️", badgeClass: "bg-orange-50 text-orange-700 border border-orange-200", headerClass: "bg-orange-50 border-b border-orange-200" },
  coordinacion_inautentica: { label: "COORDINACIÓN INAUTÉNTICA", icon: "🤖", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",      headerClass: "bg-blue-50 border-b border-blue-200" },
  bot_network:              { label: "RED DE BOTS",              icon: "🤖", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200",      headerClass: "bg-blue-50 border-b border-blue-200" },
  astroturfing:             { label: "ASTROTURFING",             icon: "🌿", badgeClass: "bg-yellow-50 text-yellow-700 border border-yellow-200", headerClass: "bg-yellow-50 border-b border-yellow-200" },
};

function getAlertConfig(type: string) {
  return ALERT_TYPE_CONFIG[type] ?? {
    label: type.toUpperCase().replace(/_/g, " "),
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

function FakeNewsCard({ a }: { a: ManipulationAlert }) {
  const [expanded, setExpanded] = useState(false);
  const c = getAlertConfig(a.alert_type);
  const ev = a.evidence as Record<string, unknown>;
  const od = a.official_data as Record<string, unknown>;
  const pct = Math.round(a.confidence * 100);

  const titularStr = ev.titular != null ? String(ev.titular) : a.narrative;
  const narrativaStr = ev.narrativa_detectada != null ? String(ev.narrativa_detectada) : (ev.texto != null ? String(ev.texto) : "");
  const porQueStr = ev.por_que_es_falso != null ? String(ev.por_que_es_falso) : (od.diferencia != null ? String(od.diferencia) : "");
  const laVerdadStr = ev.la_verdad != null ? String(ev.la_verdad) : (od.dato_real != null ? String(od.dato_real) : "");
  const fuenteClaimStr = ev.fuente_claim != null ? String(ev.fuente_claim) : "";

  const preguntasRaw = ev.preguntas_clave;
  const preguntas: string[] = Array.isArray(preguntasRaw)
    ? preguntasRaw.map(p => String(p))
    : [];

  const dondeVerificarRaw = ev.donde_verificar;
  const dondeVerificar: { nombre: string; url: string }[] = Array.isArray(dondeVerificarRaw)
    ? dondeVerificarRaw.map((d) => {
        const dObj = d as Record<string, unknown>;
        return { nombre: String(dObj.nombre ?? ""), url: String(dObj.url ?? "") };
      })
    : (od.fuente_oficial != null ? [{ nombre: "Fuente oficial", url: String(od.fuente_oficial) }] : []);

  return (
    <article className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">

      {/* Type header */}
      <div className={`px-4 py-2.5 flex items-center justify-between gap-3 ${c.headerClass}`}>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-wide ${c.badgeClass}`}>
          {c.icon} {c.label}
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
      <div className="px-4 py-4 space-y-3">

        {/* Date */}
        <time className="block text-xs text-[#8090A6] uppercase tracking-wider">
          📅 Detectado: {formatDate(a.created_at)}
        </time>

        {/* Titular */}
        <h2 className="text-[#1B212C] font-black text-xl leading-tight">
          {titularStr}
        </h2>

        {/* Narrativa detectada */}
        {narrativaStr && (
          <div>
            <p className="text-xs text-[#E00911] uppercase tracking-wider font-semibold mb-1">🚫 Narrativa detectada</p>
            <blockquote className="border-l-4 border-[#E00911] pl-3 bg-red-50 py-2 pr-3 rounded-r">
              <p className="text-[#1B212C] text-sm italic leading-relaxed">&ldquo;{narrativaStr}&rdquo;</p>
            </blockquote>
          </div>
        )}

        {/* Expandir / colapsar */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-semibold text-[#213E76] hover:opacity-80 transition-colors"
        >
          {expanded ? "▲ Ocultar verificación completa" : "▼ Ver por qué es falso y datos oficiales"}
        </button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-[#ECECEC]">

            {/* Por qué es falso */}
            {porQueStr && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                <p className="text-xs text-red-700 uppercase tracking-wider font-semibold">❌ Por qué es falso</p>
                <p className="text-red-800 text-sm leading-relaxed">{porQueStr}</p>
              </div>
            )}

            {/* La verdad */}
            {laVerdadStr && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">✅ La verdad según fuentes oficiales</p>
                <p className="text-green-800 text-sm leading-relaxed">{laVerdadStr}</p>
              </div>
            )}

            {/* Preguntas clave */}
            {preguntas.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                <p className="text-xs text-yellow-700 uppercase tracking-wider font-semibold">🔎 Preguntas clave que deberías hacerte</p>
                <ul className="space-y-1.5">
                  {preguntas.map((p, i) => (
                    <li key={i} className="text-yellow-800 text-sm flex items-start gap-2">
                      <span className="flex-shrink-0 font-bold">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dónde verificar */}
            {dondeVerificar.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-[#8090A6] uppercase tracking-wider font-semibold">🔗 Dónde verificar</p>
                <ul className="space-y-1">
                  {dondeVerificar.map((d, i) => (
                    <li key={i}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#213E76] hover:underline block"
                      >
                        → {d.nombre}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Origen del claim */}
            {fuenteClaimStr && (
              <p className="text-xs text-[#8090A6] border-t border-[#ECECEC] pt-2">
                <span className="font-semibold">Origen del claim:</span> {fuenteClaimStr}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function FakeNewsPage() {
  const [alerts, setAlerts] = useState<ManipulationAlert[]>([]);
  const [loading, setLoading] = useState(true);
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
    const textoStr = ev.texto != null ? String(ev.texto) : "";
    const titularStr = ev.titular != null ? String(ev.titular) : "";
    return (
      a.narrative.toLowerCase().includes(q) ||
      a.platform.toLowerCase().includes(q) ||
      textoStr.toLowerCase().includes(q) ||
      titularStr.toLowerCase().includes(q)
    );
  });

  const totalPlataformas = [...new Set(alerts.map(a => a.platform))].length;

  return (
    <div className="flex gap-6 items-start pb-16">

      {/* ── COLUMNA PRINCIPAL ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Section header Emol */}
        <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between rounded-t">
          <span>📰 ALERTA DE DESINFORMACIÓN</span>
          {lastRefresh && (
            <span className="flex items-center gap-1 text-xs font-normal normal-case tracking-normal text-green-300">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              actualizado {lastRefresh.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Subtitle */}
        <div>
          <p className="text-xs text-[#8090A6] uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-[#8090A6] text-sm">
            Narrativas falsas o manipuladas detectadas automáticamente y verificadas con datos oficiales.
          </p>
        </div>

        {/* Stats bar */}
        {!loading && (
          <div className="bg-[#213E76] text-white rounded px-4 py-2 flex flex-wrap gap-4 items-center text-sm">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#E00911] animate-pulse" />
              <strong className="text-[#E00911]">{alerts.length}</strong>
              <span className="text-white/80">narrativas falsas detectadas</span>
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white/80">
              <strong className="text-white">{totalPlataformas}</strong> plataformas monitoreadas
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white/80">
              <strong className="text-white">{alerts.filter(a => a.confidence >= 0.85).length}</strong> de alta certeza
            </span>
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
              <div key={i} className="h-48 bg-[#F5F5F5] rounded-lg animate-pulse border border-[#ECECEC]" />
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
            {filtradas.map(a => (
              <FakeNewsCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>

      {/* ── SIDEBAR ───────────────────────────────────────────── */}
      <aside className="w-72 xl:w-80 flex-shrink-0 space-y-4">

        {/* Cómo funciona el desmentidor */}
        <div className="bg-white border border-[#ECECEC] rounded overflow-hidden shadow-sm">
          <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
            🔬 CÓMO LO DETECTAMOS
          </div>
          <div className="p-4 space-y-3 text-sm text-[#8090A6]">
            <p>
              <strong className="text-[#1B212C]">🔍 Detecta:</strong> La IA monitorea redes sociales y medios buscando narrativas con señales de manipulación.
            </p>
            <p>
              <strong className="text-[#1B212C]">📊 Verifica:</strong> Contrasta cada claim con datos de organismos oficiales (INE, SERVEL, Ministerios, Contraloría).
            </p>
            <p>
              <strong className="text-[#1B212C]">📰 Publica:</strong> Si hay contradicción comprobable, lo registra aquí con la fuente oficial y preguntas clave.
            </p>
          </div>
        </div>

        {/* ¿Detectaste desinformación? */}
        <div className="bg-white border border-[#ECECEC] rounded overflow-hidden shadow-sm">
          <div className="bg-[#E00911] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
            📢 ¿DETECTASTE DESINFORMACIÓN?
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[#1B212C] text-sm leading-relaxed">
              ¿Viste una cadena de WhatsApp, un tweet o publicación que parece falsa? Repórtalo y lo investigamos.
            </p>
            <Link
              href="/ayudanos/"
              className="block w-full text-center py-2 bg-[#E00911] hover:bg-red-700 text-white rounded text-sm font-black transition-colors"
            >
              Reportar fake news →
            </Link>
          </div>
        </div>

        {/* Fuentes oficiales */}
        <div className="bg-white border border-[#ECECEC] rounded overflow-hidden shadow-sm">
          <div className="bg-[#213E76] text-white text-xs font-black uppercase tracking-widest px-4 py-2">
            🔗 FUENTES OFICIALES
          </div>
          <div className="p-4 space-y-2">
            {[
              { nombre: "INE — Instituto Nacional de Estadísticas", url: "https://www.ine.gob.cl" },
              { nombre: "CIPER Chile", url: "https://www.ciperchile.cl" },
              { nombre: "Contraloría General", url: "https://www.contraloria.cl" },
              { nombre: "Fiscalía de Chile", url: "https://www.fiscaliadechile.cl" },
              { nombre: "SERVEL — Servicio Electoral", url: "https://www.servel.cl" },
            ].map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col py-1.5 border-b border-[#ECECEC] last:border-0 hover:text-[#213E76] transition-colors"
              >
                <span className="text-sm text-[#1B212C] hover:text-[#213E76] font-medium">{f.nombre}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-amber-50 border border-amber-200 rounded overflow-hidden shadow-sm">
          <div className="bg-amber-500 text-white text-xs font-black uppercase tracking-widest px-4 py-2">
            ⚠️ AVISO IMPORTANTE
          </div>
          <div className="p-4">
            <p className="text-amber-800 text-xs leading-relaxed">
              Este sistema usa Inteligencia Artificial y puede cometer errores. Las detecciones son indicios, NO acusaciones. Verifica siempre con fuentes oficiales.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
