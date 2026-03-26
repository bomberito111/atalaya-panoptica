/**
 * ATALAYA PANÓPTICA — Cliente Supabase (Browser)
 * Usa ANON KEY (solo lectura pública) — NUNCA exponer SERVICE_KEY en el frontend.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Tipos de datos del sistema ──────────────────────────────────────────────

export interface Node {
  id: string;
  node_type: "persona" | "empresa" | "contrato" | "institucion" | "cuenta_social";
  canonical_name: string;
  rut: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  risk_score: number;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  weight: number;
  evidence_url: string | null;
  evidence_text: string | null;
  detected_at: string;
}

export interface Anomaly {
  id: string;
  anomaly_type: string;
  confidence: number;
  description: string;
  entities: string[];
  evidence: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface ManipulationAlert {
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

export interface ViralContent {
  id: string;
  content_type: string;
  content_text: string;
  confidence: number;
  published: boolean;
  published_at: string | null;
  platform_url: string | null;
  created_at: string;
}

export interface Promesa {
  id: string;
  politician_id: string;
  promise_text: string;
  promise_source: string | null;
  promise_date: string | null;
  reality_text: string | null;
  reality_source: string | null;
  verdict: "cumplida" | "incumplida" | "parcial" | "pendiente" | "sin_datos" | null;
  verified_at: string;
}

// ── Helper: fecha del evento real (no cuándo se detectó) ────────────────────

/**
 * Devuelve la fecha del hecho real (publicación, firma del contrato, etc.)
 * en vez de la fecha en que el Detective lo procesó.
 * La fecha real viene en evidence.fecha_evento (guardada por el Detective).
 */
export function getEventDate(
  item: { created_at: string; evidence?: Record<string, unknown> },
  options: { day?: "numeric"; month?: "short" | "long"; year?: "numeric" | "2-digit" } = { day: "numeric", month: "short", year: "numeric" }
): string {
  const raw = item.evidence?.fecha_evento as string | undefined;
  const dateStr = raw && raw.length >= 4 ? raw : item.created_at;
  try {
    return new Date(dateStr).toLocaleDateString("es-CL", options);
  } catch {
    return new Date(item.created_at).toLocaleDateString("es-CL", options);
  }
}

// ── Funciones de consulta ───────────────────────────────────────────────────

export async function getNodes(limit = 200): Promise<Node[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .order("risk_score", { ascending: false })
    .limit(limit);

  if (error) console.error("Error fetching nodes:", error);
  return data || [];
}

export async function getEdges(limit = 500): Promise<Edge[]> {
  const { data, error } = await supabase
    .from("edges")
    .select("*")
    .limit(limit);

  if (error) console.error("Error fetching edges:", error);
  return data || [];
}

export async function getAnomalies(minConfidence = 0.6): Promise<Anomaly[]> {
  const { data, error } = await supabase
    .from("anomalies")
    .select("*")
    .gte("confidence", minConfidence)
    .eq("status", "activa")
    .order("created_at", { ascending: false })  // Más recientes primero
    .limit(50);

  if (error) console.error("Error fetching anomalies:", error);
  return data || [];
}

export async function getManipulationAlerts(): Promise<ManipulationAlert[]> {
  const { data, error } = await supabase
    .from("manipulation_alerts")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) console.error("Error fetching alerts:", error);
  return data || [];
}

export async function getPromises(): Promise<Promesa[]> {
  const { data, error } = await supabase
    .from("promises_vs_reality")
    .select("*")
    .order("verified_at", { ascending: false })
    .limit(50);

  if (error) console.error("Error fetching promises:", error);
  return data || [];
}

export async function getStats(): Promise<{
  totalNodes: number;
  totalEdges: number;
  totalAnomalies: number;
  totalAlerts: number;
}> {
  const [nodesRes, edgesRes, anomaliesRes, alertsRes] = await Promise.all([
    supabase.from("nodes").select("id", { count: "exact", head: true }),
    supabase.from("edges").select("id", { count: "exact", head: true }),
    supabase.from("anomalies").select("id", { count: "exact", head: true }).eq("status", "activa"),
    supabase.from("manipulation_alerts").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalNodes: nodesRes.count || 0,
    totalEdges: edgesRes.count || 0,
    totalAnomalies: anomaliesRes.count || 0,
    totalAlerts: alertsRes.count || 0,
  };
}
