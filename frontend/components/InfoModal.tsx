"use client";

import { useState } from "react";

export default function InfoModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Título clickeable en la navbar */}
      <button
        onClick={() => setOpen(true)}
        className="text-blue-400 text-xl font-bold font-mono tracking-tight hover:text-blue-300 transition-colors text-left"
        title="¿Qué es ATALAYA PANÓPTICA?"
      >
        ATALAYA <span className="text-gray-500 text-sm font-normal">PANÓPTICA</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl leading-none"
            >
              ×
            </button>

            <div className="space-y-5">
              {/* Título */}
              <div>
                <h2 className="text-2xl font-bold text-blue-400 font-mono">
                  🏛️ ATALAYA PANÓPTICA
                </h2>
                <p className="text-gray-500 text-sm mt-1">Sistema de IA Anticorrupción para Chile</p>
              </div>

              {/* ¿Por qué ese nombre? */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">¿Por qué ese nombre?</h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  <strong className="text-white">Atalaya</strong> es una torre de vigilancia desde la que se divisa todo el horizonte.{" "}
                  <strong className="text-white">Panóptica</strong> viene del Panóptico de Jeremy Bentham y el concepto de Michel Foucault:
                  un sistema donde todo puede ser observado desde un único punto. Aquí, ese punto eres tú — el ciudadano.
                </p>
              </section>

              {/* ¿Qué hace? */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">¿Qué hace?</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex gap-2"><span>🕸️</span><span><strong className="text-white">Grafo de poder</strong> — Mapea relaciones entre personas, empresas y contratos del Estado chileno.</span></li>
                  <li className="flex gap-2"><span>⚠️</span><span><strong className="text-white">Detección de anomalías</strong> — IA (Llama 3 / Groq) detecta sobreprecios, conflictos de interés y puerta giratoria.</span></li>
                  <li className="flex gap-2"><span>📡</span><span><strong className="text-white">Radar de manipulación</strong> — Detecta granjas de bots, fake news y narrativas coordinadas en redes sociales.</span></li>
                  <li className="flex gap-2"><span>⚖️</span><span><strong className="text-white">Muro de la realidad</strong> — Cruza promesas políticas con datos oficiales del Estado.</span></li>
                </ul>
              </section>

              {/* Inspiración */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Inspiración y tecnologías similares</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>🔍 <strong className="text-white">OCCRP Aleph</strong> — Motor de búsqueda de entidades para periodismo de investigación</li>
                  <li>📄 <strong className="text-white">IDB SmartReader</strong> — Extracción de entidades de documentos de licitaciones en América Latina</li>
                  <li>🌐 <strong className="text-white">OpenSanctions</strong> — Base de datos global de entidades sancionadas y políticamente expuestas</li>
                  <li>🇧🇷 <strong className="text-white">Operação Serenata de Amor</strong> — IA monitoreando gastos parlamentarios en Brasil</li>
                  <li>📊 <strong className="text-white">Open Contracting (OCDS)</strong> — Estándar internacional de datos de contratación pública</li>
                </ul>
              </section>

              {/* Cómo usar */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">¿Cómo usarla?</h3>
                <ol className="space-y-1 text-sm text-gray-300 list-decimal list-inside">
                  <li>El sistema corre <strong className="text-white">automáticamente</strong> — no necesitas hacer nada.</li>
                  <li>Cada 12 horas rastrea Mercado Público, Contraloría, Lobby, SERVEL y prensa.</li>
                  <li>Cada 5 minutos la IA analiza la cola y construye el grafo de corrupción.</li>
                  <li>El <strong className="text-white">Grafo</strong> muestra conexiones. Filtra por riesgo para ver los nodos más sospechosos.</li>
                  <li>El <strong className="text-white">Radar</strong> se actualiza en tiempo real vía Supabase Realtime.</li>
                  <li>El <strong className="text-white">Muro de la Realidad</strong> contrasta promesas con datos del Estado.</li>
                </ol>
              </section>

              {/* Stack */}
              <section className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600">
                  Stack: GitHub Actions + Supabase + Groq/Llama 3 + Next.js 14 · Costo: <strong className="text-green-500">$0</strong> · Código abierto 🇨🇱
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
