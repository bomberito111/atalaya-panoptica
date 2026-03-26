"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, type Node, type Edge, type Anomaly, type Promesa } from "@/lib/supabase";

// ─── Tipos extendidos ─────────────────────────────────────────────────────────

interface EdgeWithNodes extends Edge {
  source: { canonical_name: string; node_type: string } | null;
  target: { canonical_name: string; node_type: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RELATION_LABELS: Record<string, string> = {
  conflicto_interes: "Conflicto de Interés",
  es_socio_de: "Socio/Accionista",
  lobbió_a: "Lobbying",
  lobbieo_a: "Lobbying",
  firmó_contrato: "Contrato firmado",
  firmo_contrato: "Contrato firmado",
  donó_a: "Donación política",
  dono_a: "Donación política",
  financió_a: "Financiamiento",
  financio_a: "Financiamiento",
  es_directivo_de: "Directivo",
  contrató_a: "Contratación",
  contrato_a: "Contratación",
  es_familiar_de: "Vínculo familiar",
  investigado_por: "Investigado por",
  sancionado_por: "Sancionado por",
};

function formatRelation(type: string): string {
  return RELATION_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const NODE_TYPE_LABELS: Record<string, string> = {
  persona: "Persona",
  empresa: "Empresa",
  contrato: "Contrato",
  institucion: "Institución",
  cuenta_social: "Cuenta Social",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  persona: "bg-blue-900/40 border-blue-700 text-blue-300",
  empresa: "bg-purple-900/40 border-purple-700 text-purple-300",
  contrato: "bg-yellow-900/40 border-yellow-700 text-yellow-300",
  institucion: "bg-teal-900/40 border-teal-700 text-teal-300",
  cuenta_social: "bg-pink-900/40 border-pink-700 text-pink-300",
};

function riskColor(score: number): string {
  if (score >= 0.7) return "bg-red-500";
  if (score >= 0.5) return "bg-orange-500";
  if (score >= 0.3) return "bg-yellow-400";
  return "bg-green-500";
}

function riskLabel(score: number): string {
  if (score >= 0.7) return "CRÍTICO";
  if (score >= 0.5) return "ALTO";
  if (score >= 0.3) return "MEDIO";
  return "BAJO";
}

function riskTextColor(score: number): string {
  if (score >= 0.7) return "text-red-400";
  if (score >= 0.5) return "text-orange-400";
  if (score >= 0.3) return "text-yellow-400";
  return "text-green-400";
}

const ANOMALY_TYPE_LABELS: Record<string, { icon: string; color: string; bg: string }> = {
  sobrecontratacion: { icon: "📋", color: "text-red-400", bg: "bg-red-900/20 border-red-800" },
  conflicto_interes: { icon: "⚠️", color: "text-orange-400", bg: "bg-orange-900/20 border-orange-800" },
  financiamiento_irregular: { icon: "💰", color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800" },
  lobby_no_declarado: { icon: "🤫", color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800" },
  contrato_directo_sospechoso: { icon: "📝", color: "text-red-400", bg: "bg-red-900/20 border-red-800" },
};

const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  cumplida: { label: "✅ Cumplida", color: "bg-green-900/40 border-green-700 text-green-300" },
  incumplida: { label: "❌ Incumplida", color: "bg-red-900/40 border-red-700 text-red-300" },
  parcial: { label: "⚠️ Parcialmente cumplida", color: "bg-yellow-900/40 border-yellow-700 text-yellow-300" },
  pendiente: { label: "⏳ Pendiente", color: "bg-gray-800 border-gray-700 text-gray-400" },
  sin_datos: { label: "❓ Sin datos", color: "bg-gray-800 border-gray-700 text-gray-500" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? "es" : ""}`;
  return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) > 1 ? "s" : ""}`;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function RiskGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const barColor = riskColor(score);
  const textColor = riskTextColor(score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Índice de Riesgo</span>
        <span className={`text-lg font-bold ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>0%</span>
        <span className={`font-semibold ${textColor}`}>{riskLabel(score)}</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function EdgeCard({ edge, currentId }: { edge: EdgeWithNodes; currentId: string }) {
  const isSource = edge.source_node_id === currentId;
  const other = isSource ? edge.target : edge.source;
  const otherId = isSource ? edge.target_node_id : edge.source_node_id;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
              {isSource ? "→" : "←"} {formatRelation(edge.relation_type)}
            </span>
            {other && (
              <span className={`text-xs px-2 py-0.5 border rounded ${NODE_TYPE_COLORS[other.node_type] ?? "bg-gray-800 border-gray-700 text-gray-400"}`}>
                {NODE_TYPE_LABELS[other.node_type] ?? other.node_type}
              </span>
            )}
          </div>
          {other ? (
            <Link
              href={`/entidad/${otherId}/`}
              className="text-white font-semibold mt-1 hover:text-blue-400 transition-colors block"
            >
              {other.canonical_name}
            </Link>
          ) : (
            <p className="text-gray-500 text-sm mt-1">Entidad desconocida</p>
          )}
        </div>
        <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(edge.detected_at)}</span>
      </div>

      {edge.evidence_text && (
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Evidencia</p>
          <p className="text-gray-300 text-sm leading-relaxed">{edge.evidence_text}</p>
        </div>
      )}

      {edge.evidence_url && (
        <a
          href={edge.evidence_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
        >
          🔗 Ver fuente
        </a>
      )}
    </div>
  );
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const cfg = ANOMALY_TYPE_LABELS[anomaly.anomaly_type] ?? {
    icon: "🔍",
    color: "text-gray-400",
    bg: "bg-gray-900/20 border-gray-800",
  };

  return (
    <div className={`border rounded-xl p-4 space-y-2 ${cfg.bg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{cfg.icon}</span>
          <span className={`text-sm font-semibold ${cfg.color}`}>
            {anomaly.anomaly_type.replace(/_/g, " ").toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-yellow-400">{Math.round(anomaly.confidence * 100)}% confianza</span>
          <span className="text-xs text-gray-600">{timeAgo(anomaly.created_at)}</span>
        </div>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{anomaly.description}</p>
    </div>
  );
}

function PromesaCard({ promesa }: { promesa: Promesa }) {
  const verdict = promesa.verdict ?? "sin_datos";
  const vCfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.sin_datos;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <span className={`text-xs px-2 py-1 border rounded font-medium ${vCfg.color}`}>
          {vCfg.label}
        </span>
        {promesa.promise_date && (
          <span className="text-xs text-gray-600 flex-shrink-0">
            {new Date(promesa.promise_date).toLocaleDateString("es-CL")}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Promesa</p>
        <p className="text-white text-sm leading-relaxed">{promesa.promise_text}</p>
        {promesa.promise_source && (
          <p className="text-xs text-gray-600">Fuente: {promesa.promise_source}</p>
        )}
      </div>

      {promesa.reality_text && (
        <div className="space-y-1 border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Realidad</p>
          <p className="text-gray-300 text-sm leading-relaxed">{promesa.reality_text}</p>
          {promesa.reality_source && (
            <p className="text-xs text-gray-600">Fuente: {promesa.reality_source}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EntidadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [node, setNode] = useState<Node | null>(null);
  const [edges, setEdges] = useState<EdgeWithNodes[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [promises, setPromises] = useState<Promesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchAll() {
      setLoading(true);
      setNotFound(false);

      const [nodeRes, edgesRes, anomaliesRes, promisesRes] = await Promise.all([
        supabase.from("nodes").select("*").eq("id", id).single(),
        supabase
          .from("edges")
          .select(
            "*, source:source_node_id(canonical_name, node_type), target:target_node_id(canonical_name, node_type)"
          )
          .or(`source_node_id.eq.${id},target_node_id.eq.${id}`),
        supabase.from("anomalies").select("*").contains("entities", [id]),
        supabase.from("promises_vs_reality").select("*").eq("politician_id", id),
      ]);

      if (nodeRes.error || !nodeRes.data) {
        setNotFound(true);
      } else {
        setNode(nodeRes.data as Node);
      }

      setEdges((edgesRes.data as EdgeWithNodes[]) ?? []);
      setAnomalies((anomaliesRes.data as Anomaly[]) ?? []);
      setPromises((promisesRes.data as Promesa[]) ?? []);
      setLoading(false);
    }

    fetchAll();
  }, [id]);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Cargando entidad...</p>
        </div>
      </div>
    );
  }

  // ─── Not found ────────────────────────────────────────────────────────────
  if (notFound || !node) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-5xl">🔍</p>
        <h1 className="text-2xl font-bold text-white">Entidad no encontrada</h1>
        <p className="text-gray-500">No existe ningún nodo con el ID proporcionado.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/red-corrupcion/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors">
            ← Red de Corrupción
          </Link>
          <Link href="/grafo/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            🕸️ Grafo
          </Link>
        </div>
      </div>
    );
  }

  const meta = node.metadata as Record<string, string | number | boolean | null>;
  const isDeceased =
    Boolean(meta?.deceased) ||
    node.canonical_name.toLowerCase().includes("piñera") ||
    node.canonical_name.toLowerCase().includes("pinera");

  const metaFields = [
    { key: "cargo", label: "Cargo" },
    { key: "partido", label: "Partido" },
    { key: "sector", label: "Sector" },
    { key: "rut", label: "RUT" },
    { key: "rubro", label: "Rubro" },
    { key: "pais", label: "País" },
    { key: "region", label: "Región" },
  ] as const;

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">

      {/* ── 1. Hero header ──────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6 sm:p-8">
        <div className="space-y-4">
          {/* Type badge + risk label */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 border rounded-full ${NODE_TYPE_COLORS[node.node_type] ?? "bg-gray-800 border-gray-700 text-gray-400"}`}>
              {NODE_TYPE_LABELS[node.node_type] ?? node.node_type}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              node.risk_score >= 0.7 ? "bg-red-500 text-white" :
              node.risk_score >= 0.5 ? "bg-orange-500 text-white" :
              node.risk_score >= 0.3 ? "bg-yellow-400 text-black" :
              "bg-green-600 text-white"
            }`}>
              Riesgo {riskLabel(node.risk_score)}
            </span>
          </div>

          {/* Name */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            {node.canonical_name}
          </h1>

          {/* Risk bar */}
          <div className="max-w-sm">
            <RiskGauge score={node.risk_score} />
          </div>

          {/* Aliases */}
          {node.aliases && node.aliases.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-600 self-center">También conocido como:</span>
              {node.aliases.map((alias) => (
                <span key={alias} className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
                  {alias}
                </span>
              ))}
            </div>
          )}

          {/* Metadata fields */}
          {metaFields.some((f) => Boolean(meta?.[f.key])) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {metaFields.map(({ key, label }) =>
                meta?.[key] ? (
                  <div key={key} className="bg-gray-800/60 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-600 uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-gray-200 mt-0.5 truncate">{String(meta[key])}</p>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-4 text-xs text-gray-600 pt-1">
            <span>Registrado: {new Date(node.created_at).toLocaleDateString("es-CL")}</span>
            <span>Actualizado: {timeAgo(node.updated_at)}</span>
          </div>
        </div>
      </section>

      {/* ── 2. Nota de estado (deceased) ────────────────────────────────── */}
      {isDeceased && (
        <div className="flex items-start gap-3 bg-orange-950/40 border border-orange-700 rounded-xl px-5 py-4">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <p className="text-orange-200 text-sm leading-relaxed">
            Esta persona falleció el 6 de febrero de 2024. Los casos vinculados son procesos históricos en curso.
          </p>
        </div>
      )}

      {/* ── 3. Análisis de riesgo ────────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          🔎 Análisis de Riesgo
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 text-center space-y-1">
            <div className={`text-3xl font-bold ${riskTextColor(node.risk_score)}`}>
              {Math.round(node.risk_score * 100)}%
            </div>
            <div className="text-xs text-gray-500">Índice de riesgo calculado</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center space-y-1">
            <div className="text-3xl font-bold text-white">{edges.length}</div>
            <div className="text-xs text-gray-500">Relaciones detectadas</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center space-y-1">
            <div className="text-3xl font-bold text-yellow-400">{anomalies.length}</div>
            <div className="text-xs text-gray-500">Anomalías vinculadas</div>
          </div>
        </div>
        {anomalies.length > 0 && (
          <div className="bg-gray-800/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="text-xs text-gray-400">
              Primera anomalía detectada: {new Date(anomalies[anomalies.length - 1].created_at).toLocaleDateString("es-CL")}
            </p>
          </div>
        )}
      </section>

      {/* ── 4. Relaciones detectadas ─────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          🕸️ Relaciones Detectadas ({edges.length})
        </h2>
        {edges.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600">
            No se han detectado relaciones para esta entidad.
          </div>
        ) : (
          <div className="space-y-3">
            {edges.map((edge) => (
              <EdgeCard key={edge.id} edge={edge} currentId={id} />
            ))}
          </div>
        )}
      </section>

      {/* ── 5. Anomalías vinculadas ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          🚨 Anomalías Vinculadas ({anomalies.length})
        </h2>
        {anomalies.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600">
            No hay anomalías detectadas para esta entidad.
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((a) => (
              <AnomalyCard key={a.id} anomaly={a} />
            ))}
          </div>
        )}
      </section>

      {/* ── 6. Promesas vs Realidad ──────────────────────────────────────── */}
      {promises.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            ⚖️ Promesas vs Realidad ({promises.length})
          </h2>
          <div className="space-y-3">
            {promises.map((p) => (
              <PromesaCard key={p.id} promesa={p} />
            ))}
          </div>
        </section>
      )}

      {/* ── 7. Footer navigation ────────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-gray-500 text-sm text-center sm:text-left">
          Datos actualizados automáticamente desde fuentes públicas del Estado chileno.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Link
            href="/red-corrupcion/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            ← Red de Corrupción
          </Link>
          <Link
            href="/grafo/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🕸️ Ver en Grafo
          </Link>
        </div>
      </section>

    </div>
  );
}
