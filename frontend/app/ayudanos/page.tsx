"use client";

import { useState, useEffect } from "react";
import { supabase, getAnomalies, type Anomaly } from "@/lib/supabase";

const ANOMALY_LABELS: Record<string, string> = {
  sobreprecio: "Sobreprecio",
  conflicto_interes: "Conflicto de Interés",
  puerta_giratoria: "Puerta Giratoria",
  triangulacion: "Triangulación",
  nepotismo: "Nepotismo",
  irregular_procedimiento: "Procedimiento Irregular",
  bot_network: "Red de Bots",
  fake_news: "Fake News",
};

const ANOMALY_ICONS: Record<string, string> = {
  sobreprecio: "💰",
  conflicto_interes: "🤝",
  puerta_giratoria: "🚪",
  triangulacion: "🔺",
  nepotismo: "👨‍👩‍👧",
  irregular_procedimiento: "📋",
  bot_network: "🤖",
  fake_news: "📰",
};

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
  const TWITTER_TEXT = encodeURIComponent(
    "¿Sabías que hay una IA que vigila la corrupción en Chile gratis? 🇨🇱 @AtalayaCL #transparencia #Chile"
  );

  useEffect(() => {
    getAnomalies(0.5).then((anomalies) => {
      setRecentAnomalies(anomalies.slice(0, 5));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) return;

    setSubmitting(true);
    setError(null);

    const sourceHash = btoa(descripcion.slice(0, 100));
    const rawMetadata: Record<string, unknown> = {
      tipo,
      anonimo,
      submitted_at: new Date().toISOString(),
    };
    if (!anonimo && contacto.trim()) {
      rawMetadata.contacto = contacto.trim();
    }

    const { error: insertError } = await supabase.from("investigation_queue").insert({
      source: "ciudadano",
      raw_text: descripcion,
      source_url: urlEvidencia.trim() || null,
      priority: 1,
      status: "pending",
      raw_metadata: rawMetadata,
      source_hash: sourceHash,
    });

    setSubmitting(false);

    if (insertError) {
      setError(
        "Hubo un error al enviar tu denuncia. Por favor intenta de nuevo o contacta al equipo."
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
    <div className="space-y-12 pb-12 max-w-3xl mx-auto">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="text-center space-y-4 pt-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-white">
          🕵️ Ayúdanos a Vigilar
        </h1>
        <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          ¿Sabes de un caso de corrupción que no estamos cubriendo? Cuéntanos — de forma anónima
          si quieres.
        </p>
      </section>

      {/* ── Form / Success ────────────────────────────────────────────────────── */}
      {submitted ? (
        <section className="bg-green-950/40 border border-green-800 rounded-2xl p-8 text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-bold text-green-400">¡Gracias!</h2>
          <p className="text-gray-300 leading-relaxed max-w-lg mx-auto">
            Tu denuncia fue enviada al sistema. El Detective (IA) la analizará en los próximos
            minutos.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              {copied ? "¡Enlace copiado!" : "📋 Copiar enlace del proyecto"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${TWITTER_TEXT}&url=${encodeURIComponent(PROJECT_URL)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-sky-900 hover:bg-sky-800 text-sky-300 rounded-lg text-sm border border-sky-800 transition-colors"
            >
              𝕏 Compartir en Twitter
            </a>
            <button
              onClick={() => {
                setSubmitted(false);
                setDescripcion("");
                setUrlEvidencia("");
                setContacto("");
              }}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-400 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              Enviar otra denuncia
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">
                Tipo de irregularidad
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600"
              >
                <option>Sobreprecio en licitación</option>
                <option>Conflicto de interés</option>
                <option>Puerta giratoria</option>
                <option>Tráfico de influencias</option>
                <option>Nepotismo</option>
                <option>Malversación de fondos</option>
                <option>Otro</option>
              </select>
            </div>

            {/* Descripcion */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">
                Descripción del caso{" "}
                <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={5}
                placeholder="Describe el caso: ¿quién?, ¿cuándo?, ¿cómo?"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 resize-vertical"
              />
            </div>

            {/* URL evidencia */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">
                URL de evidencia{" "}
                <span className="text-gray-500">(opcional)</span>
              </label>
              <input
                type="url"
                value={urlEvidencia}
                onChange={(e) => setUrlEvidencia(e.target.value)}
                placeholder="URL de evidencia (noticia, documento oficial, etc.)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Anonimo */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonimo}
                  onChange={(e) => setAnonimo(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-300">Quiero mantener el anonimato</span>
              </label>

              {!anonimo && (
                <div className="space-y-1.5 pl-7">
                  <label className="block text-sm font-medium text-gray-300">
                    Contacto{" "}
                    <span className="text-gray-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={contacto}
                    onChange={(e) => setContacto(e.target.value)}
                    placeholder="Email o teléfono de contacto (opcional)"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !descripcion.trim()}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              {submitting ? "Enviando..." : "🔍 Enviar denuncia al sistema"}
            </button>
          </form>
        </section>
      )}

      {/* ── Por qué es seguro ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">🔒 ¿Por qué esto es seguro?</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            {
              icon: "🚫",
              title: "Sin metadatos personales",
              desc: "No guardamos IPs ni metadatos de tu dispositivo o conexión.",
            },
            {
              icon: "📂",
              title: "Código abierto",
              desc: (
                <>
                  El sistema es de{" "}
                  <a
                    href="https://github.com/bomberito111/atalaya-panoptica"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    código abierto en GitHub
                  </a>
                  . Puedes verificar cómo procesamos los datos.
                </>
              ),
            },
            {
              icon: "👤",
              title: "Anonimato real",
              desc: "Si marcas anónimo, no almacenamos ningún dato de contacto en la base de datos.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
            >
              <div className="text-2xl">{item.icon}</div>
              <p className="text-white text-sm font-medium">{item.title}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Casos recientes ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          🔍 Casos que ya estamos investigando
        </h2>
        {recentAnomalies.length === 0 ? (
          <p className="text-gray-600 text-sm">
            El sistema está procesando las primeras fuentes. Vuelve pronto.
          </p>
        ) : (
          <div className="space-y-2">
            {recentAnomalies.map((a) => (
              <div
                key={a.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3"
              >
                <span className="text-lg flex-shrink-0">
                  {ANOMALY_ICONS[a.anomaly_type] || "⚠️"}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-blue-400 uppercase bg-blue-950/40 border border-blue-900/40 px-2 py-0.5 rounded-full">
                      {ANOMALY_LABELS[a.anomaly_type] || a.anomaly_type}
                    </span>
                    <span className="text-xs text-gray-600">
                      {new Date(a.created_at).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                    {a.description.length > 160
                      ? a.description.slice(0, 160) + "…"
                      : a.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Compartir ────────────────────────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center space-y-4">
        <h2 className="text-lg font-semibold text-white">📣 Comparte el proyecto</h2>
        <p className="text-gray-500 text-sm">
          Más ciudadanos vigilando = más presión para la transparencia.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm border border-gray-700 transition-colors"
          >
            {copied ? "¡Copiado!" : "📋 Copiar enlace"}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${TWITTER_TEXT}&url=${encodeURIComponent(PROJECT_URL)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-sky-900 hover:bg-sky-800 text-sky-300 rounded-lg text-sm border border-sky-800 transition-colors"
          >
            𝕏 Compartir en Twitter/X
          </a>
        </div>
      </section>
    </div>
  );
}
