"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase, getAnomalies, type Anomaly } from "@/lib/supabase";

const ANOMALY_ICONS: Record<string, string> = {
  sobreprecio: "💰", conflicto_interes: "🤝", puerta_giratoria: "🚪",
  bot_network: "🤖", fake_news: "📰",
};

const ANOMALY_LABELS: Record<string, string> = {
  sobreprecio: "Sobreprecio", conflicto_interes: "Conflicto de Interés",
  puerta_giratoria: "Puerta Giratoria", bot_network: "Red de Bots", fake_news: "Fake News",
};

/** btoa seguro para textos con caracteres UTF-8 / españoles */
function safeHash(text: string): string {
  try {
    const bytes = new TextEncoder().encode(text.slice(0, 80));
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  } catch {
    return String(Date.now());
  }
}

export default function AyudanosPage() {
  const [tipo, setTipo] = useState("Sobreprecio en licitación");
  const [descripcion, setDescripcion] = useState("");
  const [urlEvidencia, setUrlEvidencia] = useState("");
  const [anonimo, setAnonimo] = useState(true);
  const [contacto, setContacto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentAnomalies, setRecentAnomalies] = useState<Anomaly[]>([]);
  const [copied, setCopied] = useState(false);

  const PROJECT_URL = "https://bomberito111.github.io/atalaya-panoptica/";

  useEffect(() => {
    getAnomalies(0.5).then(a => setRecentAnomalies(a.slice(0, 5)));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) return;
    setSubmitting(true);
    setError(null);

    const p_source_hash = safeHash(descripcion + tipo + Date.now());
    const p_raw_text = `DENUNCIA CIUDADANA — ${tipo}\n\n${descripcion}`;
    const p_source_url = urlEvidencia.trim() || null;
    const p_raw_metadata: Record<string, unknown> = {
      tipo_denuncia: tipo,
      anonimo,
      submitted_at: new Date().toISOString(),
      fecha: new Date().toISOString().slice(0, 10),
    };
    if (!anonimo && contacto.trim()) p_raw_metadata.contacto = contacto.trim();

    const { error: rpcError } = await supabase.rpc('submit_denuncia', {
      p_raw_text,
      p_source_url,
      p_raw_metadata,
      p_source_hash,
    });

    setSubmitting(false);

    if (rpcError) {
      setError("Hubo un error. Intenta nuevamente o usa el enlace alternativo.");
    } else {
      setSubmitted(true);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(PROJECT_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 pb-12 max-w-3xl mx-auto">

      {/* Cabecera estilo Emol */}
      <header className="border-b-2 border-[#ECECEC] pb-4 pt-2">
        <p className="text-xs text-[#8090A6] uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <h1 className="text-3xl font-black text-[#1B212C] tracking-tight leading-none">
          Enviar Denuncia Ciudadana
        </h1>
        <p className="text-[#8090A6] text-sm mt-1">
          ¿Sabes de corrupción que no estamos cubriendo? Cuéntanos — de forma anónima.
        </p>
      </header>

      {/* Form / Éxito */}
      {submitted ? (
        <section className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-bold text-green-800">¡Gracias!</h2>
          <p className="text-green-700 leading-relaxed max-w-lg mx-auto">
            Tu denuncia fue enviada. El sistema de IA la analizará en los próximos minutos
            y buscará evidencia adicional en portales de transparencia.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-[#1B212C] rounded-lg text-sm border border-[#ECECEC] transition-colors"
            >
              {copied ? "¡Copiado!" : "📋 Copiar enlace"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Esta IA vigila la corrupción en Chile gratis 🇨🇱 #transparencia")}&url=${encodeURIComponent(PROJECT_URL)}`}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-[#213E76] hover:bg-blue-900 text-white rounded-lg text-sm transition-colors"
            >
              𝕏 Compartir en Twitter
            </a>
            <button
              onClick={() => { setSubmitted(false); setDescripcion(""); setUrlEvidencia(""); setContacto(""); }}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-[#8090A6] rounded-lg text-sm border border-[#ECECEC] transition-colors"
            >
              Enviar otra denuncia
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-sm">
          {/* Emol-style section header */}
          <div className="bg-[#213E76] text-white px-5 py-3 font-bold text-sm uppercase tracking-widest">
            📢 ENVIAR DENUNCIA CIUDADANA
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#1B212C]">Tipo de irregularidad</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="w-full bg-white border border-[#ECECEC] rounded-lg px-3 py-2.5 text-sm text-[#1B212C] focus:outline-none focus:border-[#213E76]"
              >
                <option>Sobreprecio en licitación</option>
                <option>Conflicto de interés</option>
                <option>Puerta giratoria</option>
                <option>Tráfico de influencias</option>
                <option>Nepotismo</option>
                <option>Malversación de fondos</option>
                <option>Desvío de fondos públicos</option>
                <option>Contrato irregular</option>
                <option>Corrupción en hospital o FONASA</option>
                <option>Irregularidad en municipio</option>
                <option>Otro</option>
              </select>
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#1B212C]">
                Descripción del caso <span className="text-[#E00911]">*</span>
              </label>
              <textarea
                required
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={6}
                placeholder="Describe el caso: ¿quién?, ¿qué institución?, ¿cuándo ocurrió?, ¿cuánto dinero?, ¿cómo lo sabes?"
                className="w-full bg-white border border-[#ECECEC] rounded-lg px-3 py-2.5 text-sm text-[#1B212C] placeholder-[#8090A6] focus:outline-none focus:border-[#213E76] resize-vertical"
              />
              <p className="text-xs text-[#8090A6]">
                Mientras más detalles, mejor puede investigar la IA. Nombra personas, empresas, fechas y montos si los sabes.
              </p>
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#1B212C]">
                URL de evidencia <span className="text-[#8090A6]">(opcional)</span>
              </label>
              <input
                type="url"
                value={urlEvidencia}
                onChange={e => setUrlEvidencia(e.target.value)}
                placeholder="https://..."
                className="w-full bg-white border border-[#ECECEC] rounded-lg px-3 py-2.5 text-sm text-[#1B212C] placeholder-[#8090A6] focus:outline-none focus:border-[#213E76]"
              />
            </div>

            {/* Anonimato */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonimo}
                  onChange={e => setAnonimo(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#213E76]"
                />
                <span className="text-sm text-[#1B212C]">Quiero mantener el anonimato</span>
              </label>
              {!anonimo && (
                <div className="pl-7 space-y-1.5">
                  <label className="block text-sm font-medium text-[#1B212C]">
                    Contacto <span className="text-[#8090A6]">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={contacto}
                    onChange={e => setContacto(e.target.value)}
                    placeholder="Email o teléfono de contacto"
                    className="w-full bg-white border border-[#ECECEC] rounded-lg px-3 py-2.5 text-sm text-[#1B212C] placeholder-[#8090A6] focus:outline-none focus:border-[#213E76]"
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <p className="text-sm text-red-800 font-semibold">⚠️ {error}</p>
                <div className="pt-1 border-t border-red-200 space-y-1">
                  <p className="text-xs text-[#8090A6]">Alternativa para enviar tu denuncia:</p>
                  <a
                    href="https://github.com/bomberito111/atalaya-panoptica/issues/new?title=Denuncia+ciudadana&labels=denuncia"
                    target="_blank" rel="noopener noreferrer"
                    className="block text-xs text-[#213E76] hover:underline"
                  >
                    → Abrir un issue en GitHub (anónimo con cuenta)
                  </a>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !descripcion.trim()}
              className="w-full py-3 px-6 bg-[#E00911] hover:bg-red-700 disabled:bg-gray-200 disabled:text-[#8090A6] text-white font-bold rounded-xl text-sm transition-colors"
            >
              {submitting ? "⏳ Enviando…" : "🚨 Enviar denuncia al sistema"}
            </button>
          </form>
        </section>
      )}

      {/* Por qué es seguro */}
      <section className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: "🚫", t: "Sin metadatos personales", d: "No guardamos IPs ni datos de dispositivo." },
          { icon: "📂", t: "Código abierto", d: "Puedes ver exactamente cómo procesamos los datos en GitHub." },
          { icon: "👤", t: "Anonimato real", d: "Si marcas anónimo, no guardamos ningún dato de contacto." },
        ].map((x, i) => (
          <div key={i} className="bg-white border border-[#ECECEC] rounded-xl p-4 space-y-1.5 shadow-sm">
            <div className="text-2xl">{x.icon}</div>
            <p className="text-[#1B212C] text-sm font-semibold">{x.t}</p>
            <p className="text-[#8090A6] text-xs leading-relaxed">{x.d}</p>
          </div>
        ))}
      </section>

      {/* Casos recientes */}
      {recentAnomalies.length > 0 && (
        <section className="space-y-3">
          <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-t">
            🔍 Casos que ya investigamos
          </div>
          <div className="space-y-2">
            {recentAnomalies.map(a => {
              const ev = (a.evidence ?? {}) as Record<string, unknown>;
              const rawFecha = ev.fecha_evento as string | undefined;
              let dateStr = "Fecha no disponible";
              if (rawFecha && String(rawFecha).trim().length >= 4) {
                const d = new Date(rawFecha);
                if (!isNaN(d.getTime())) {
                  dateStr = d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
                }
              }
              return (
                <div key={a.id} className="bg-white border border-[#ECECEC] rounded-lg p-3 flex items-start gap-3 shadow-sm">
                  <span className="text-lg flex-shrink-0">{ANOMALY_ICONS[a.anomaly_type] || "⚠️"}</span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[#8090A6] uppercase tracking-wider">
                        {ANOMALY_LABELS[a.anomaly_type] || a.anomaly_type}
                      </span>
                      <span className="text-xs text-[#8090A6]">📅 {dateStr}</span>
                    </div>
                    <p className="text-[#1B212C] text-xs leading-snug line-clamp-2">
                      {a.description.length > 150 ? a.description.slice(0, 150) + "…" : a.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Compartir */}
      <section className="bg-white border border-[#ECECEC] rounded-2xl p-5 text-center space-y-3 shadow-sm">
        <p className="text-[#1B212C] font-bold">📣 Comparte el proyecto</p>
        <p className="text-[#8090A6] text-sm">Más ciudadanos vigilando = más presión para la transparencia.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-white hover:bg-gray-50 text-[#1B212C] rounded-lg text-sm border border-[#ECECEC] transition-colors"
          >
            {copied ? "¡Copiado!" : "📋 Copiar enlace"}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Esta IA vigila la corrupción en Chile 🇨🇱 #transparencia")}&url=${encodeURIComponent(PROJECT_URL)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-[#213E76] hover:bg-blue-900 text-white rounded-lg text-sm transition-colors"
          >
            𝕏 Compartir
          </a>
        </div>
      </section>
    </div>
  );
}
