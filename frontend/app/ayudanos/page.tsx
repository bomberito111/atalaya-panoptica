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
    // Encode as UTF-8 then base64
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
    setErrorDetail(null);

    const sourceHash = safeHash(descripcion + tipo + Date.now());

    const rawMetadata: Record<string, unknown> = {
      tipo_denuncia: tipo,
      anonimo,
      submitted_at: new Date().toISOString(),
      fecha: new Date().toISOString().slice(0, 10),
    };
    if (!anonimo && contacto.trim()) rawMetadata.contacto = contacto.trim();

    const { error: insertError } = await supabase.from("investigation_queue").insert({
      source: "ciudadano",
      raw_text: `DENUNCIA CIUDADANA — ${tipo}\n\n${descripcion}`,
      source_url: urlEvidencia.trim() || null,
      priority: 1,
      status: "pending",
      raw_metadata: rawMetadata,
      source_hash: sourceHash,
    });

    setSubmitting(false);

    if (insertError) {
      // Mostrar mensaje amigable + detalle técnico para debug
      setError("No se pudo enviar la denuncia al servidor.");
      setErrorDetail(
        insertError.code === "42501"
          ? "El servidor tiene una restricción de permisos (RLS). El administrador debe ejecutar la migración 001_rls_citizen_tips.sql en Supabase."
          : `Código: ${insertError.code || "?"} — ${insertError.message}`
      );
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
    <div className="space-y-10 pb-12 max-w-3xl mx-auto">

      {/* Cabecera estilo diario */}
      <header className="border-b-2 border-white pb-4 pt-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">
          📢 Enviar Denuncia
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          ¿Sabes de corrupción que no estamos cubriendo? Cuéntanos — de forma anónima.
        </p>
      </header>

      {/* Form / Éxito */}
      {submitted ? (
        <section className="bg-green-950/40 border border-green-800 rounded-2xl p-8 text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-bold text-green-400">¡Gracias!</h2>
          <p className="text-gray-300 leading-relaxed max-w-lg mx-auto">
            Tu denuncia fue enviada. El sistema de IA la analizará en los próximos minutos
            y buscará evidencia adicional en portales de transparencia.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              {copied ? "¡Copiado!" : "📋 Copiar enlace"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Esta IA vigila la corrupción en Chile gratis 🇨🇱 #transparencia")}&url=${encodeURIComponent(PROJECT_URL)}`}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-sky-900 hover:bg-sky-800 text-sky-300 rounded-lg text-sm border border-sky-800 transition-colors"
            >
              𝕏 Compartir en Twitter
            </a>
            <button
              onClick={() => { setSubmitted(false); setDescripcion(""); setUrlEvidencia(""); setContacto(""); }}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-400 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              Enviar otra denuncia
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">Tipo de irregularidad</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
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
              <label className="block text-sm font-medium text-gray-300">
                Descripción del caso <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={6}
                placeholder="Describe el caso: ¿quién?, ¿qué institución?, ¿cuándo ocurrió?, ¿cuánto dinero?, ¿cómo lo sabes?"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-vertical"
              />
              <p className="text-xs text-gray-600">
                Mientras más detalles, mejor puede investigar la IA. Nombra personas, empresas, fechas y montos si los sabes.
              </p>
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">
                URL de evidencia <span className="text-gray-500">(opcional)</span>
              </label>
              <input
                type="url"
                value={urlEvidencia}
                onChange={e => setUrlEvidencia(e.target.value)}
                placeholder="https://..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Anonimato */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonimo}
                  onChange={e => setAnonimo(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-300">Quiero mantener el anonimato</span>
              </label>
              {!anonimo && (
                <div className="pl-7 space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">
                    Contacto <span className="text-gray-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={contacto}
                    onChange={e => setContacto(e.target.value)}
                    placeholder="Email o teléfono de contacto"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 space-y-2">
                <p className="text-sm text-red-400 font-semibold">⚠️ {error}</p>
                {errorDetail && (
                  <p className="text-xs text-red-500/80 font-mono leading-relaxed">{errorDetail}</p>
                )}
                <div className="pt-1 border-t border-red-900/40 space-y-1">
                  <p className="text-xs text-gray-500">Alternativas para enviar tu denuncia:</p>
                  <a
                    href="https://github.com/bomberito111/atalaya-panoptica/issues/new?title=Denuncia+ciudadana&labels=denuncia"
                    target="_blank" rel="noopener noreferrer"
                    className="block text-xs text-blue-400 hover:underline"
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
              className="w-full py-3 px-6 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl text-sm transition-colors"
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
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-1.5">
            <div className="text-2xl">{x.icon}</div>
            <p className="text-white text-sm font-semibold">{x.t}</p>
            <p className="text-gray-500 text-xs leading-relaxed">{x.d}</p>
          </div>
        ))}
      </section>

      {/* Casos recientes */}
      {recentAnomalies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            🔍 Casos que ya investigamos
          </h2>
          <div className="space-y-2">
            {recentAnomalies.map(a => {
              const ev = (a.evidence ?? {}) as Record<string, unknown>;
              const raw = (ev.fecha_evento as string | undefined) ?? a.created_at;
              const dateStr = new Date(raw).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{ANOMALY_ICONS[a.anomaly_type] || "⚠️"}</span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">
                        {ANOMALY_LABELS[a.anomaly_type] || a.anomaly_type}
                      </span>
                      <span className="text-xs text-gray-600">📅 {dateStr}</span>
                    </div>
                    <p className="text-gray-400 text-xs leading-snug line-clamp-2">
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
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center space-y-3">
        <p className="text-white font-bold">📣 Comparte el proyecto</p>
        <p className="text-gray-500 text-sm">Más ciudadanos vigilando = más presión para la transparencia.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm border border-gray-700 transition-colors"
          >
            {copied ? "¡Copiado!" : "📋 Copiar enlace"}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Esta IA vigila la corrupción en Chile 🇨🇱 #transparencia")}&url=${encodeURIComponent(PROJECT_URL)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-sky-900 hover:bg-sky-800 text-sky-300 rounded-lg text-sm border border-sky-800 transition-colors"
          >
            𝕏 Compartir
          </a>
        </div>
      </section>
    </div>
  );
}
