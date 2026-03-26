"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { getNodes, getEdges, getAnomalies, getEventDate, type Node, type Edge, type Anomaly } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CanvasTransform { x: number; y: number; scale: number }
interface NodePosition { id: string; x: number; y: number }
interface DragState {
  nodeId: string | null;
  startMouseX: number; startMouseY: number;
  startNodeX: number; startNodeY: number;
}

interface RedCorrupcion {
  id: string;           // "red-0", "red-1", ...
  name: string;         // "Red SQM (12 nodos)"
  anchorName: string;   // nombre del nodo más riesgoso (= nombre del caso)
  nodeIds: Set<string>;
  maxRisk: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_EMOJI: Record<string, string> = {
  persona: "🧑", empresa: "🏢", institucion: "🏛", contrato: "📄", cuenta_social: "📱",
};

const RELATION_COLORS: Record<string, string> = {
  conflicto_interes: "rgba(220,38,38,0.8)",
  firmó_contrato:    "rgba(234,88,12,0.8)",
  firmo_contrato:    "rgba(234,88,12,0.8)",
  financió_a:        "rgba(202,138,4,0.8)",
  financio_a:        "rgba(202,138,4,0.8)",
  lobbió_a:          "rgba(147,51,234,0.8)",
  lobibo_a:          "rgba(147,51,234,0.8)",
  asociado_a:        "rgba(6,182,212,0.8)",
  default:           "rgba(107,114,128,0.6)",
};

const NODE_WIDTH  = 160;
const NODE_HEIGHT = 108;
const INITIAL_SCALE = 0.9;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function getNodeRotation(id: string): number {
  return ((hashString(id) % 9) - 4) * 0.85;
}

function truncateName(name: string, maxLen = 24): string {
  return name.length <= maxLen ? name : name.slice(0, maxLen - 1) + "…";
}

function getEdgeColor(type: string): string {
  const k = type.toLowerCase().replace(/\s+/g, "_");
  return RELATION_COLORS[k] ?? RELATION_COLORS.default;
}

// ── Find connected components (union-find) ────────────────────────────────────

function findConnectedComponents(nodes: Node[], edges: Edge[]): RedCorrupcion[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const n of nodes) parent.set(n.id, n.id);
  for (const e of edges) {
    if (parent.has(e.source_node_id) && parent.has(e.target_node_id)) {
      union(e.source_node_id, e.target_node_id);
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const root = find(n.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n.id);
  }

  const nodeById = new Map<string, Node>(nodes.map((n) => [n.id, n]));

  // Convert to RedCorrupcion, sorted by max risk desc
  const reds: RedCorrupcion[] = [];
  let idx = 0;
  for (const [, ids] of groups) {
    if (ids.length < 2) continue; // skip isolated nodes
    const members = ids.map((id) => nodeById.get(id)!).filter(Boolean);
    const anchor = members.reduce((a, b) => (b.risk_score > a.risk_score ? b : a));
    reds.push({
      id: `red-${idx++}`,
      name: `${anchor.canonical_name.slice(0, 28)} (${ids.length} entidades)`,
      anchorName: anchor.canonical_name,
      nodeIds: new Set(ids),
      maxRisk: anchor.risk_score,
    });
  }

  // Sort by maxRisk desc
  reds.sort((a, b) => b.maxRisk - a.maxRisk);

  // Add "isolated" group for lonely nodes
  const allInReds = new Set(reds.flatMap((r) => [...r.nodeIds]));
  const isolated = nodes.filter((n) => !allInReds.has(n.id));
  if (isolated.length > 0) {
    reds.push({
      id: "red-isolated",
      name: `Nodos sin conexión (${isolated.length})`,
      anchorName: "Sin conexiones",
      nodeIds: new Set(isolated.map((n) => n.id)),
      maxRisk: 0,
    });
  }

  return reds;
}

// ── Layout for a single network ────────────────────────────────────────────────

function layoutNetwork(networkNodes: Node[]): Map<string, NodePosition> {
  const map = new Map<string, NodePosition>();
  if (networkNodes.length === 0) return map;

  const sorted = [...networkNodes].sort((a, b) => b.risk_score - a.risk_score);
  map.set(sorted[0].id, { id: sorted[0].id, x: 0, y: 0 });

  const rings = [
    { radius: 300, max: 8 },
    { radius: 570, max: 16 },
    { radius: 850, max: 32 },
    { radius: 1100, max: 64 },
  ];

  let idx = 1;
  for (const ring of rings) {
    const count = Math.min(ring.max, sorted.length - idx);
    if (count <= 0) break;
    for (let i = 0; i < count && idx < sorted.length; i++, idx++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const jx = ((hashString(sorted[idx].id + "x") % 50) - 25);
      const jy = ((hashString(sorted[idx].id + "y") % 50) - 25);
      map.set(sorted[idx].id, {
        id: sorted[idx].id,
        x: Math.cos(angle) * ring.radius + jx,
        y: Math.sin(angle) * ring.radius + jy,
      });
    }
  }
  return map;
}

// ── NodeCard component ─────────────────────────────────────────────────────────

function NodeCard({
  node, pos, isSelected, isHighlighted,
  onMouseDown, onClick,
}: {
  node: Node; pos: NodePosition; isSelected: boolean; isHighlighted: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (n: Node) => void;
}) {
  const rot   = getNodeRotation(node.id);
  const pct   = Math.round(node.risk_score * 100);
  const hi    = node.risk_score > 0.7;
  const emoji = NODE_EMOJI[node.node_type] ?? "❓";
  // Fecha del evento real (de la noticia/contrato), no cuándo se añadió a la DB
  const eventDate = node.metadata?.fecha_publicacion as string | undefined
    || node.metadata?.fecha as string | undefined
    || node.created_at;
  const date = new Date(eventDate).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "2-digit" });

  return (
    <div
      data-node-card="1"
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onClick={() => onClick(node)}
      style={{
        position: "absolute",
        left: pos.x - NODE_WIDTH / 2,
        top: pos.y - NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        transform: `rotate(${rot}deg)`,
        cursor: "grab",
        userSelect: "none",
        zIndex: isSelected ? 200 : isHighlighted ? 50 : 1,
        opacity: isHighlighted || isSelected || !isHighlighted ? 1 : 0.45,
        transition: "opacity 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Pushpin */}
      <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", fontSize: 20, zIndex: 10, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}>📌</div>

      {/* Card */}
      <div style={{
        backgroundColor: hi ? "#fff8f8" : "#fffef4",
        border: isSelected ? "2px solid #3b82f6" : hi ? "1.5px solid #fca5a5" : "1px solid #d6c9a0",
        borderRadius: 7,
        padding: "10px 10px 8px",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(59,130,246,0.35), 0 6px 20px rgba(0,0,0,0.3)"
          : hi
          ? "2px 3px 10px rgba(220,38,38,0.18), 2px 3px 8px rgba(0,0,0,0.2)"
          : "2px 3px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.8)",
        marginTop: 10,
        minHeight: NODE_HEIGHT - 10,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 5 }}>
          <span style={{ fontSize: 16, lineHeight: 1.2, flexShrink: 0 }}>{emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1c1917", lineHeight: 1.3, wordBreak: "break-word", fontFamily: "system-ui, sans-serif" }}>
            {truncateName(node.canonical_name)}
          </span>
        </div>
        <div style={{ fontSize: 8.5, color: "#9ca3af", marginBottom: 3, fontFamily: "monospace" }}>
          {node.node_type} · {date}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: "#78716c", fontFamily: "monospace" }}>riesgo</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: hi ? "#dc2626" : node.risk_score > 0.4 ? "#d97706" : "#6b7280", fontFamily: "monospace" }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, backgroundColor: hi ? "#dc2626" : node.risk_score > 0.4 ? "#f59e0b" : "#22c55e", transition: "width 0.3s" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Full SidePanel ─────────────────────────────────────────────────────────────

function SidePanel({
  node, edges, allNodes, anomalies, onClose,
}: {
  node: Node; edges: Edge[]; allNodes: Node[]; anomalies: Anomaly[]; onClose: () => void;
}) {
  const relatedEdges = edges.filter((e) => e.source_node_id === node.id || e.target_node_id === node.id);
  const nodeAnoms    = anomalies.filter((a) => a.entities.includes(node.id) || a.entities.includes(node.canonical_name));
  const nodeById     = new Map<string, Node>(allNodes.map((n) => [n.id, n]));
  const riskPct      = Math.round(node.risk_score * 100);
  const hi           = node.risk_score > 0.7;
  const emoji        = NODE_EMOJI[node.node_type] ?? "❓";

  return (
    <div style={{
      position: "fixed", right: 0, top: 64, bottom: 0,
      width: "min(420px, 100vw)",
      backgroundColor: "#0f172a",
      borderLeft: "1px solid #1e293b",
      zIndex: 1000,
      display: "flex", flexDirection: "column",
      boxShadow: "-12px 0 40px rgba(0,0,0,0.6)",
      fontFamily: "system-ui, sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1e293b", flexShrink: 0, backgroundColor: hi ? "#1c0a0a" : "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22 }}>{emoji}</span>
              <span style={{ fontSize: 11, backgroundColor: "#1e293b", color: "#94a3b8", padding: "2px 8px", borderRadius: 4 }}>
                {node.node_type}
              </span>
              {hi && <span style={{ fontSize: 10, backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🚨 ALTO RIESGO</span>}
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", margin: 0, lineHeight: 1.3, wordBreak: "break-word" }}>
              {node.canonical_name}
            </h2>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
              Detectado: {new Date(node.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
              {" · "}Actualizado: {new Date(node.updated_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#1e293b", border: "none", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "6px 10px", flexShrink: 0 }}>×</button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {/* Risk bar */}
        <div style={{ backgroundColor: hi ? "#450a0a" : "#1e293b", border: `1px solid ${hi ? "#7f1d1d" : "#334155"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Nivel de Riesgo</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: hi ? "#f87171" : node.risk_score > 0.4 ? "#fbbf24" : "#4ade80", fontFamily: "monospace" }}>{riskPct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, backgroundColor: "#334155", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${riskPct}%`, borderRadius: 5, backgroundColor: hi ? "#dc2626" : node.risk_score > 0.4 ? "#f59e0b" : "#22c55e", transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>
            {hi ? "⚠️ Riesgo alto — múltiples señales de alerta detectadas" : riskPct > 40 ? "Riesgo moderado — bajo monitoreo activo" : "Riesgo bajo — sin alertas graves"}
          </div>
        </div>

        {/* RUT / aliases */}
        {node.rut && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>RUT: </span>
            <span style={{ fontSize: 11, color: "#cbd5e1", fontFamily: "monospace", fontWeight: 600 }}>{node.rut}</span>
          </div>
        )}
        {node.aliases && node.aliases.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 5px" }}>También conocido como:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {node.aliases.map((alias, i) => (
                <span key={i} style={{ fontSize: 10, backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "2px 7px", color: "#94a3b8" }}>{alias}</span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {Object.keys(node.metadata).length > 0 && (
          <div style={{ marginBottom: 14, backgroundColor: "#1e293b", borderRadius: 7, padding: "10px 12px", border: "1px solid #334155" }}>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Datos del Estado</p>
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: "#64748b" }}>{k.replace(/_/g, " ")}: </span>
                <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{String(v).slice(0, 120)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Anomalías vinculadas */}
        {nodeAnoms.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f87171", margin: "0 0 8px", paddingBottom: 6, borderBottom: "1px solid #334155" }}>
              🚨 Anomalías detectadas ({nodeAnoms.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {nodeAnoms.map((an) => (
                <div key={an.id} style={{ backgroundColor: "#2d1111", border: "1px solid #7f1d1d", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>{an.anomaly_type.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, color: "#f87171", fontFamily: "monospace" }}>{Math.round(an.confidence * 100)}%</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#fca5a5", margin: 0, lineHeight: 1.4 }}>{an.description}</p>
                  <div style={{ fontSize: 9, color: "#64748b", marginTop: 4 }}>
                    📅 {getEventDate(an, { day: "numeric", month: "long", year: "numeric" })}
                    {typeof an.evidence?.fecha_evento === "string" && an.evidence.fecha_evento !== an.created_at.slice(0,10) && (
                      <span style={{ color: "#475569", marginLeft: 6 }}>(detectado: {new Date(an.created_at).toLocaleDateString("es-CL")})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relaciones */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px", paddingBottom: 6, borderBottom: "1px solid #334155" }}>
            🔗 Relaciones documentadas ({relatedEdges.length})
          </p>
          {relatedEdges.length === 0 ? (
            <p style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Sin relaciones documentadas</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {relatedEdges.map((edge) => {
                const isSource = edge.source_node_id === node.id;
                const otherId  = isSource ? edge.target_node_id : edge.source_node_id;
                const other    = nodeById.get(otherId);
                const color    = getEdgeColor(edge.relation_type);
                const detectedAt = edge.detected_at
                  ? new Date(edge.detected_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
                  : null;
                return (
                  <div key={edge.id} style={{ backgroundColor: "#1e293b", borderRadius: 7, padding: "8px 10px", border: "1px solid #334155" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{isSource ? "→" : "←"}</span>
                      <span style={{ fontSize: 10, color, fontWeight: 700, backgroundColor: `${color.replace("0.8", "0.1")}`, padding: "1px 6px", borderRadius: 3 }}>
                        {edge.relation_type.replace(/_/g, " ")}
                      </span>
                      {edge.weight > 1 && <span style={{ fontSize: 9, color: "#64748b" }}>peso: {edge.weight}</span>}
                    </div>
                    {other && (
                      <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600, marginBottom: 3 }}>
                        {NODE_EMOJI[other.node_type] ?? "❓"} {other.canonical_name}
                      </div>
                    )}
                    {edge.evidence_text && (
                      <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", lineHeight: 1.4, marginBottom: 3 }}>
                        "{edge.evidence_text.slice(0, 140)}"
                      </div>
                    )}
                    {detectedAt && (
                      <div style={{ fontSize: 9, color: "#475569" }}>Detectado: {detectedAt}</div>
                    )}
                    {edge.evidence_url && (
                      <a href={edge.evidence_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 10, color: "#60a5fa", textDecoration: "none", display: "block", marginTop: 3 }}>
                        📎 Ver evidencia →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", flexShrink: 0, backgroundColor: "#0f172a", display: "flex", gap: 8 }}>
        <Link href={`/entidad/${node.id}`} style={{ flex: 1, display: "block", textAlign: "center", backgroundColor: "#1d4ed8", color: "#fff", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          Ver perfil completo →
        </Link>
        <a href={`https://www.google.com/search?q=${encodeURIComponent(node.canonical_name + " Chile corrupción")}`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", backgroundColor: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", fontSize: 13, textDecoration: "none", flexShrink: 0 }}
          title="Buscar en Google">
          🔍
        </a>
      </div>
    </div>
  );
}

// ── Edge SVG layer ─────────────────────────────────────────────────────────────

function EdgeLayer({ edges, positions, visibleNodeIds, selectedNodeId }: {
  edges: Edge[]; positions: Map<string, NodePosition>; visibleNodeIds: Set<string>; selectedNodeId?: string;
}) {
  const vis = edges.filter((e) => visibleNodeIds.has(e.source_node_id) && visibleNodeIds.has(e.target_node_id));
  if (vis.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [, p] of positions) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  const pad = 500;
  const L = minX - pad, T = minY - pad, W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;

  const relatedToSelected = selectedNodeId
    ? new Set(edges.filter((e) => e.source_node_id === selectedNodeId || e.target_node_id === selectedNodeId).map((e) => e.id))
    : null;

  return (
    <svg style={{ position: "absolute", left: L, top: T, width: W, height: H, pointerEvents: "none", overflow: "visible" }} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        {Object.entries(RELATION_COLORS).filter(([k]) => k !== "default").map(([k, c]) => (
          <marker key={k} id={`arrow-${k.replace(/[^a-z0-9]/g, "")}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={c} />
          </marker>
        ))}
        <marker id="arrow-default" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill={RELATION_COLORS.default} />
        </marker>
      </defs>
      {vis.map((edge) => {
        const src = positions.get(edge.source_node_id);
        const tgt = positions.get(edge.target_node_id);
        if (!src || !tgt) return null;
        const x1 = src.x - L, y1 = src.y - T, x2 = tgt.x - L, y2 = tgt.y - T;
        const cx = (x1 + x2) / 2 + (y2 - y1) * 0.13;
        const cy = (y1 + y2) / 2 - (x2 - x1) * 0.13;
        const color = getEdgeColor(edge.relation_type);
        const isActive = relatedToSelected ? relatedToSelected.has(edge.id) : true;
        const normKey = edge.relation_type.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9]/g, "");
        const markerId = `arrow-${normKey}`;
        return (
          <path
            key={edge.id}
            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={isActive ? 2 : 0.8}
            strokeOpacity={isActive ? 1 : 0.3}
            strokeLinecap="round"
            markerEnd={isActive ? `url(#${markerId})` : undefined}
          />
        );
      })}
    </svg>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, backgroundColor: "rgba(15,23,42,0.9)", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", zIndex: 50, backdropFilter: "blur(8px)" }}>
      <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Leyenda</p>
      {[
        { color: "#3b82f6", label: "Persona" },
        { color: "#f59e0b", label: "Empresa" },
        { color: "#8b5cf6", label: "Institución" },
        { color: "#10b981", label: "Contrato" },
        { color: "#06b6d4", label: "Cuenta Social" },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
        </div>
      ))}
      <div style={{ marginTop: 6, borderTop: "1px solid #334155", paddingTop: 6 }}>
        {[
          { color: "rgba(220,38,38,0.8)", label: "Conflicto interés" },
          { color: "rgba(234,88,12,0.8)", label: "Contratos" },
          { color: "rgba(202,138,4,0.8)", label: "Financió a" },
          { color: "rgba(147,51,234,0.8)", label: "Lobby" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <div style={{ width: 18, height: 2, backgroundColor: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ParedPage() {
  const [allNodes, setAllNodes]   = useState<Node[]>([]);
  const [allEdges, setAllEdges]   = useState<Edge[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading]     = useState(true);

  const [reds, setReds]         = useState<RedCorrupcion[]>([]);
  const [currentRedIdx, setCurrentRedIdx] = useState(0);
  const [showNetSelector, setShowNetSelector] = useState(false);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [search, setSearch]             = useState("");

  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: INITIAL_SCALE });
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());

  const containerRef     = useRef<HTMLDivElement>(null);
  const isPanningRef     = useRef(false);
  const panStartRef      = useRef({ mouseX: 0, mouseY: 0, tx: 0, ty: 0 });
  const isDraggingRef    = useRef(false);
  const nodeDragRef      = useRef<DragState>({ nodeId: null, startMouseX: 0, startMouseY: 0, startNodeX: 0, startNodeY: 0 });

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getNodes(200), getEdges(500), getAnomalies(0.5)])
      .then(([n, e, a]) => {
        setAllNodes(n);
        setAllEdges(e);
        setAnomalies(a);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Build networks ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (allNodes.length === 0) return;
    const r = findConnectedComponents(allNodes, allEdges);
    setReds(r);
    setCurrentRedIdx(0);
  }, [allNodes, allEdges]);

  // ── Layout current network ──────────────────────────────────────────────────

  const currentRed = reds[currentRedIdx] ?? null;
  const networkNodes = currentRed
    ? allNodes.filter((n) => currentRed.nodeIds.has(n.id))
    : [];

  useEffect(() => {
    if (networkNodes.length === 0) return;
    const map = layoutNetwork(networkNodes);
    setPositions(map);
    setSelectedNode(null);
    // Center view
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setTransform({ x: width / 2, y: height / 2, scale: INITIAL_SCALE });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRedIdx, reds]);

  // Center on load
  useEffect(() => {
    if (!containerRef.current || networkNodes.length === 0) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setTransform({ x: width / 2, y: height / 2, scale: INITIAL_SCALE });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // ── Filtered node IDs for current network (+ search) ────────────────────────

  const filteredNodes = networkNodes.filter((n) =>
    !search || n.canonical_name.toLowerCase().includes(search.toLowerCase()) || (n.rut && n.rut.includes(search))
  );
  const visibleIds = new Set(filteredNodes.map((n) => n.id));

  // ── Wheel zoom ──────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    setTransform((t) => {
      const newScale = Math.min(Math.max(t.scale * factor, 0.1), 5);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = newScale / t.scale;
      return { x: mx - ratio * (mx - t.x), y: my - ratio * (my - t.y), scale: newScale };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pan / Drag ──────────────────────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node-card]")) return;
    isPanningRef.current = true;
    panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingRef.current && nodeDragRef.current.nodeId) {
      const d = nodeDragRef.current;
      const dx = (e.clientX - d.startMouseX) / transform.scale;
      const dy = (e.clientY - d.startMouseY) / transform.scale;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(d.nodeId!, { id: d.nodeId!, x: d.startNodeX + dx, y: d.startNodeY + dy });
        return next;
      });
      return;
    }
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setTransform((t) => ({ ...t, x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy }));
    }
  }, [transform.scale]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current  = false;
    isDraggingRef.current = false;
    nodeDragRef.current.nodeId = null;
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const pos = positions.get(nodeId);
    if (!pos) return;
    isDraggingRef.current = true;
    nodeDragRef.current = { nodeId, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: pos.x, startNodeY: pos.y };
  }, [positions]);

  const handleNodeClick = useCallback((node: Node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  // ── Zoom controls ──────────────────────────────────────────────────────────

  const zoomIn    = () => setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.25, 5) }));
  const zoomOut   = () => setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.25, 0.1) }));
  const resetView = () => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setTransform({ x: width / 2, y: height / 2, scale: INITIAL_SCALE });
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "70vh", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40, animation: "spin 2s linear infinite" }}>🕵️</div>
        <div style={{ color: "#94a3b8" }}>Cargando mapa de corrupción…</div>
      </div>
    );
  }

  if (allNodes.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🕵️</div>
        <h2 style={{ color: "#f1f5f9", margin: 0 }}>El detective aún no ha mapeado entidades</h2>
        <p style={{ color: "#64748b", maxWidth: 400 }}>El sistema está procesando fuentes. Vuelve en unos minutos — el mapa se construirá automáticamente.</p>
      </div>
    );
  }

  const hasSidePanel = Boolean(selectedNode);

  return (
    <div style={{ position: "fixed", inset: "64px 0 0 0", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#0f172a" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "rgba(15,23,42,0.95)", borderBottom: "1px solid #1e293b", flexShrink: 0, flexWrap: "wrap", zIndex: 100, backdropFilter: "blur(8px)" }}>

        {/* Network selector */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowNetSelector((s) => !s)}
            style={{
              backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9",
              cursor: "pointer", fontSize: 12, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6, fontWeight: 600, maxWidth: 280, overflow: "hidden",
            }}
          >
            <span>🕸️</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentRed ? currentRed.name : "Sin redes"}
            </span>
            <span style={{ color: "#64748b", flexShrink: 0 }}>▾</span>
          </button>

          {showNetSelector && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4, minWidth: 320, maxWidth: 380,
              backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              zIndex: 999, maxHeight: 400, overflowY: "auto",
            }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #334155", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {reds.length} redes de corrupción detectadas
              </div>
              {reds.map((red, i) => (
                <button
                  key={red.id}
                  onClick={() => { setCurrentRedIdx(i); setShowNetSelector(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                    backgroundColor: i === currentRedIdx ? "#0f172a" : "transparent",
                    border: "none", borderBottom: "1px solid #0f172a", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: red.maxRisk > 0.7 ? "#ef4444" : red.maxRisk > 0.4 ? "#f59e0b" : "#64748b", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{red.name}</div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>Riesgo máx: {Math.round(red.maxRisk * 100)}%</div>
                  </div>
                  {i === currentRedIdx && <span style={{ color: "#3b82f6", fontSize: 14, flexShrink: 0 }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Prev / Next */}
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setCurrentRedIdx((i) => Math.max(0, i - 1))} disabled={currentRedIdx === 0}
            style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: currentRedIdx === 0 ? "#475569" : "#f1f5f9", cursor: currentRedIdx === 0 ? "not-allowed" : "pointer", padding: "6px 10px", fontSize: 14 }}>
            ‹
          </button>
          <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center", padding: "0 4px" }}>{currentRedIdx + 1}/{reds.length}</span>
          <button onClick={() => setCurrentRedIdx((i) => Math.min(reds.length - 1, i + 1))} disabled={currentRedIdx >= reds.length - 1}
            style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: currentRedIdx >= reds.length - 1 ? "#475569" : "#f1f5f9", cursor: currentRedIdx >= reds.length - 1 ? "not-allowed" : "pointer", padding: "6px 10px", fontSize: 14 }}>
            ›
          </button>
        </div>

        {/* Search */}
        <input
          type="text" placeholder="Buscar en esta red…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9", fontSize: 12, padding: "6px 10px", outline: "none", minWidth: 160, flex: 1, maxWidth: 240 }}
        />

        {/* Zoom */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {[
            { label: "−", action: zoomOut },
            { label: "⌂", action: resetView },
            { label: "+", action: zoomIn },
          ].map(({ label, action }) => (
            <button key={label} onClick={action}
              style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9", cursor: "pointer", padding: "6px 10px", fontSize: 13, fontWeight: 700 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Stats badge */}
        <div style={{ fontSize: 10, color: "#64748b", flexShrink: 0, display: "flex", gap: 8 }}>
          <span style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "3px 7px" }}>
            {filteredNodes.length} nodos
          </span>
          <span style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "3px 7px" }}>
            {allEdges.filter((e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id)).length} vínculos
          </span>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => setShowNetSelector(false)}
        style={{
          flex: 1, overflow: "hidden", position: "relative", cursor: "crosshair",
          marginRight: hasSidePanel ? "min(420px, 100vw)" : 0,
          transition: "margin-right 0.25s ease",
          background: `
            #c8a87a
            repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px),
            repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px)
          `,
        }}
      >
        {/* Infinite canvas transform container */}
        <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>

          {/* Edge layer */}
          <EdgeLayer
            edges={allEdges}
            positions={positions}
            visibleNodeIds={visibleIds}
            selectedNodeId={selectedNode?.id}
          />

          {/* Node cards */}
          {filteredNodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            return (
              <NodeCard
                key={node.id}
                node={node}
                pos={pos}
                isSelected={selectedNode?.id === node.id}
                isHighlighted={
                  !selectedNode ||
                  selectedNode.id === node.id ||
                  allEdges.some((e) => (e.source_node_id === selectedNode.id && e.target_node_id === node.id) || (e.target_node_id === selectedNode.id && e.source_node_id === node.id))
                }
                onMouseDown={handleNodeMouseDown}
                onClick={handleNodeClick}
              />
            );
          })}
        </div>

        {/* Legend */}
        <Legend />

        {/* Network title overlay */}
        {currentRed && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", backgroundColor: "rgba(15,23,42,0.85)", border: "1px solid #334155", borderRadius: 20, padding: "6px 16px", backdropFilter: "blur(8px)", textAlign: "center", zIndex: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
              🕸️ Red: <span style={{ color: "#f1f5f9" }}>{currentRed.anchorName}</span>
              {currentRed.maxRisk > 0.7 && <span style={{ color: "#f87171", marginLeft: 8 }}>🚨 ALTO RIESGO</span>}
            </span>
          </div>
        )}
      </div>

      {/* ── Side panel ── */}
      {selectedNode && (
        <SidePanel
          node={selectedNode}
          edges={allEdges}
          allNodes={allNodes}
          anomalies={anomalies}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
