"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { getNodes, getEdges, type Node, type Edge } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

interface DragState {
  nodeId: string | null;
  startMouseX: number;
  startMouseY: number;
  startNodeX: number;
  startNodeY: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_EMOJI: Record<string, string> = {
  persona: "🧑",
  empresa: "🏢",
  institucion: "🏛",
  contrato: "📄",
  cuenta_social: "📱",
};

const RELATION_COLORS: Record<string, string> = {
  conflicto_interes: "rgba(220, 38, 38, 0.75)",
  firmó_contrato: "rgba(234, 88, 12, 0.75)",
  firmo_contrato: "rgba(234, 88, 12, 0.75)",
  financió_a: "rgba(202, 138, 4, 0.75)",
  financio_a: "rgba(202, 138, 4, 0.75)",
  lobbió_a: "rgba(147, 51, 234, 0.75)",
  lobibo_a: "rgba(147, 51, 234, 0.75)",
  default: "rgba(107, 114, 128, 0.65)",
};

const NODE_TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "persona", label: "🧑 Personas" },
  { value: "empresa", label: "🏢 Empresas" },
  { value: "institucion", label: "🏛 Instituciones" },
  { value: "contrato", label: "📄 Contratos" },
  { value: "cuenta_social", label: "📱 Cuentas" },
];

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const INITIAL_SCALE = 0.8;
const MAX_NODES = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getNodeRotation(nodeId: string): number {
  const h = hashString(nodeId);
  // Range: -4 to +4 degrees
  return ((h % 9) - 4) * 0.8;
}

function computeRadialLayout(nodes: Node[]): NodePosition[] {
  if (nodes.length === 0) return [];

  const positions: NodePosition[] = [];
  const centerX = 0;
  const centerY = 0;

  if (nodes.length === 1) {
    positions.push({ id: nodes[0].id, x: centerX, y: centerY });
    return positions;
  }

  // Place highest-risk node in center, rest radially
  const sorted = [...nodes].sort((a, b) => b.risk_score - a.risk_score);

  // First node at center
  positions.push({ id: sorted[0].id, x: centerX, y: centerY });

  // Remaining nodes in concentric rings
  const ring1Count = Math.min(8, sorted.length - 1);
  const ring2Count = Math.min(16, sorted.length - 1 - ring1Count);
  const ring3Count = sorted.length - 1 - ring1Count - ring2Count;

  const rings = [
    { count: ring1Count, radius: 280 },
    { count: ring2Count, radius: 520 },
    { count: ring3Count, radius: 780 },
  ];

  let nodeIndex = 1;
  for (const ring of rings) {
    if (ring.count <= 0) continue;
    for (let i = 0; i < ring.count && nodeIndex < sorted.length; i++) {
      const angle = (i / ring.count) * 2 * Math.PI - Math.PI / 2;
      const jitterX = ((hashString(sorted[nodeIndex].id + "x") % 40) - 20);
      const jitterY = ((hashString(sorted[nodeIndex].id + "y") % 40) - 20);
      positions.push({
        id: sorted[nodeIndex].id,
        x: centerX + Math.cos(angle) * ring.radius + jitterX,
        y: centerY + Math.sin(angle) * ring.radius + jitterY,
      });
      nodeIndex++;
    }
  }

  return positions;
}

function getEdgeColor(relationType: string): string {
  const normalized = relationType.toLowerCase().replace(/\s+/g, "_");
  return RELATION_COLORS[normalized] ?? RELATION_COLORS.default;
}

function truncateName(name: string, maxLen = 22): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface NodeCardProps {
  node: Node;
  position: NodePosition;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onClick: (node: Node) => void;
}

function NodeCard({ node, position, isSelected, onMouseDown, onClick }: NodeCardProps) {
  const rotation = getNodeRotation(node.id);
  const riskPct = Math.round(node.risk_score * 100);
  const isHighRisk = node.risk_score > 0.7;
  const emoji = NODE_EMOJI[node.node_type] ?? "❓";

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onClick={() => onClick(node)}
      style={{
        position: "absolute",
        left: position.x - NODE_WIDTH / 2,
        top: position.y - NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        transform: `rotate(${rotation}deg)`,
        cursor: "grab",
        userSelect: "none",
        zIndex: isSelected ? 100 : 1,
      }}
    >
      {/* Pushpin */}
      <div
        style={{
          position: "absolute",
          top: -10,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 18,
          zIndex: 10,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
        }}
      >
        📌
      </div>

      {/* Card body */}
      <div
        style={{
          backgroundColor: isHighRisk ? "#fff8f8" : "#fffef5",
          border: isSelected
            ? "2px solid #3b82f6"
            : isHighRisk
            ? "1px solid #fca5a5"
            : "1px solid #d6c9a0",
          borderRadius: 6,
          padding: "10px 10px 8px",
          boxShadow: isSelected
            ? "0 0 0 2px rgba(59,130,246,0.4), 0 4px 12px rgba(0,0,0,0.25)"
            : "2px 3px 8px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.8)",
          marginTop: 8,
          minHeight: NODE_HEIGHT - 8,
        }}
      >
        {/* Type emoji + name */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 6 }}>
          <span style={{ fontSize: 16, lineHeight: 1.2, flexShrink: 0 }}>{emoji}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#1c1917",
              lineHeight: 1.3,
              wordBreak: "break-word",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {truncateName(node.canonical_name)}
          </span>
        </div>

        {/* Risk thermometer bar */}
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <span style={{ fontSize: 9, color: "#78716c", fontFamily: "monospace" }}>
              {node.node_type}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isHighRisk ? "#dc2626" : node.risk_score > 0.4 ? "#d97706" : "#6b7280",
                fontFamily: "monospace",
              }}
            >
              {riskPct}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${riskPct}%`,
                borderRadius: 2,
                backgroundColor: isHighRisk
                  ? "#dc2626"
                  : node.risk_score > 0.4
                  ? "#f59e0b"
                  : "#22c55e",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidePanelProps {
  node: Node;
  edges: Edge[];
  allNodes: Node[];
  onClose: () => void;
}

function SidePanel({ node, edges, allNodes, onClose }: SidePanelProps) {
  const relatedEdges = edges.filter(
    (e) => e.source_node_id === node.id || e.target_node_id === node.id
  );

  const getRelatedNode = (edge: Edge): Node | undefined => {
    const otherId =
      edge.source_node_id === node.id ? edge.target_node_id : edge.source_node_id;
    return allNodes.find((n) => n.id === otherId);
  };

  const riskPct = Math.round(node.risk_score * 100);
  const isHighRisk = node.risk_score > 0.7;
  const emoji = NODE_EMOJI[node.node_type] ?? "❓";

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 340,
        backgroundColor: "#111827",
        borderLeft: "1px solid #374151",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid #374151",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{emoji}</span>
            <span
              style={{
                fontSize: 12,
                backgroundColor: "#374151",
                color: "#9ca3af",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {node.node_type}
            </span>
          </div>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#f9fafb",
              margin: 0,
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {node.canonical_name}
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid #374151",
            borderRadius: 6,
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: 18,
            padding: "2px 8px",
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* Risk score */}
        <div
          style={{
            backgroundColor: isHighRisk ? "#450a0a" : "#1f2937",
            border: `1px solid ${isHighRisk ? "#7f1d1d" : "#374151"}`,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Nivel de Riesgo</span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: isHighRisk ? "#f87171" : node.risk_score > 0.4 ? "#fbbf24" : "#4ade80",
                fontFamily: "monospace",
              }}
            >
              {riskPct}%
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "#374151",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${riskPct}%`,
                borderRadius: 4,
                backgroundColor: isHighRisk ? "#dc2626" : node.risk_score > 0.4 ? "#f59e0b" : "#22c55e",
              }}
            />
          </div>
        </div>

        {/* Metadata */}
        {node.rut && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>RUT:</span>
            <span style={{ fontSize: 11, color: "#d1d5db", marginLeft: 6, fontFamily: "monospace" }}>
              {node.rut}
            </span>
          </div>
        )}

        {node.aliases && node.aliases.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>Alias:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {node.aliases.slice(0, 6).map((alias, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 4,
                    padding: "2px 6px",
                    color: "#9ca3af",
                  }}
                >
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata extras */}
        {Object.keys(node.metadata).length > 0 && (
          <div
            style={{
              marginBottom: 12,
              backgroundColor: "#1f2937",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11,
              color: "#9ca3af",
              border: "1px solid #374151",
            }}
          >
            {Object.entries(node.metadata)
              .slice(0, 5)
              .map(([k, v]) => (
                <div key={k} style={{ marginBottom: 3 }}>
                  <span style={{ color: "#6b7280" }}>{k}: </span>
                  <span style={{ color: "#d1d5db" }}>{String(v).slice(0, 60)}</span>
                </div>
              ))}
          </div>
        )}

        {/* Related edges */}
        <div style={{ marginBottom: 12 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#e5e7eb",
              margin: "0 0 8px",
              borderBottom: "1px solid #374151",
              paddingBottom: 6,
            }}
          >
            🔗 Relaciones ({relatedEdges.length})
          </p>
          {relatedEdges.length === 0 ? (
            <p style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
              Sin relaciones documentadas
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {relatedEdges.slice(0, 10).map((edge) => {
                const related = getRelatedNode(edge);
                const isSource = edge.source_node_id === node.id;
                return (
                  <div
                    key={edge.id}
                    style={{
                      backgroundColor: "#1f2937",
                      borderRadius: 6,
                      padding: "6px 8px",
                      border: "1px solid #374151",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ color: "#9ca3af", marginBottom: 2 }}>
                      {isSource ? "→" : "←"}{" "}
                      <span
                        style={{
                          color: getEdgeColor(edge.relation_type),
                          fontWeight: 600,
                        }}
                      >
                        {edge.relation_type}
                      </span>
                    </div>
                    {related && (
                      <div style={{ color: "#d1d5db", fontWeight: 500 }}>
                        {truncateName(related.canonical_name, 32)}
                      </div>
                    )}
                    {edge.evidence_text && (
                      <div
                        style={{
                          color: "#6b7280",
                          fontSize: 10,
                          marginTop: 2,
                          fontStyle: "italic",
                        }}
                      >
                        {edge.evidence_text.slice(0, 80)}
                      </div>
                    )}
                    {edge.evidence_url && (
                      <a
                        href={edge.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 10,
                          color: "#60a5fa",
                          textDecoration: "none",
                          display: "block",
                          marginTop: 2,
                        }}
                      >
                        Ver evidencia →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div style={{ fontSize: 10, color: "#4b5563", borderTop: "1px solid #374151", paddingTop: 8 }}>
          <div>Creado: {new Date(node.created_at).toLocaleDateString("es-CL")}</div>
          <div>Actualizado: {new Date(node.updated_at).toLocaleDateString("es-CL")}</div>
        </div>
      </div>

      {/* Footer: link to entity page */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #374151",
          flexShrink: 0,
        }}
      >
        <Link
          href={`/entidad/${node.id}`}
          style={{
            display: "block",
            textAlign: "center",
            backgroundColor: "#1d4ed8",
            color: "#fff",
            borderRadius: 8,
            padding: "10px",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Ver perfil completo →
        </Link>
      </div>
    </div>
  );
}

// ── Edge SVG layer ────────────────────────────────────────────────────────────

interface EdgeLayerProps {
  edges: Edge[];
  positions: Map<string, NodePosition>;
  visibleNodeIds: Set<string>;
}

function EdgeLayer({ edges, positions, visibleNodeIds }: EdgeLayerProps) {
  const visibleEdges = edges.filter(
    (e) => visibleNodeIds.has(e.source_node_id) && visibleNodeIds.has(e.target_node_id)
  );

  if (visibleEdges.length === 0) return null;

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [, pos] of positions) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }

  const padding = 400;
  const svgLeft = minX - padding;
  const svgTop = minY - padding;
  const svgWidth = maxX - minX + padding * 2;
  const svgHeight = maxY - minY + padding * 2;

  return (
    <svg
      style={{
        position: "absolute",
        left: svgLeft,
        top: svgTop,
        width: svgWidth,
        height: svgHeight,
        pointerEvents: "none",
        overflow: "visible",
      }}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    >
      {visibleEdges.map((edge) => {
        const src = positions.get(edge.source_node_id);
        const tgt = positions.get(edge.target_node_id);
        if (!src || !tgt) return null;

        const x1 = src.x - svgLeft;
        const y1 = src.y - svgTop;
        const x2 = tgt.x - svgLeft;
        const y2 = tgt.y - svgTop;

        // Quadratic bezier control point — slight curve for realism
        const cx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
        const cy = (y1 + y2) / 2 - (x2 - x1) * 0.12;

        const color = getEdgeColor(edge.relation_type);

        return (
          <path
            key={edge.id}
            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ParedPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Canvas state
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: INITIAL_SCALE });
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());

  // Drag state (canvas pan)
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, tx: 0, ty: 0 });

  // Node drag state
  const nodeDragRef = useRef<DragState>({
    nodeId: null,
    startMouseX: 0,
    startMouseY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });
  const isDraggingNodeRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getNodes(MAX_NODES), getEdges(500)])
      .then(([n, e]) => {
        setNodes(n);
        setEdges(e);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Compute radial layout once nodes loaded ────────────────────────────────

  useEffect(() => {
    if (nodes.length === 0) return;
    const layout = computeRadialLayout(nodes);
    const map = new Map<string, NodePosition>();
    for (const pos of layout) map.set(pos.id, pos);
    setPositions(map);
  }, [nodes]);

  // ── Center canvas on mount / resize ───────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setTransform({ x: width / 2, y: height / 2, scale: INITIAL_SCALE });
  }, [nodes]);

  // ── Mobile detection ───────────────────────────────────────────────────────

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Filtered node list ─────────────────────────────────────────────────────

  const filteredNodes = nodes
    .filter((n) => {
      const matchType = typeFilter === "all" || n.node_type === typeFilter;
      const matchSearch =
        !search ||
        n.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
        (n.rut && n.rut.includes(search));
      return matchType && matchSearch;
    })
    .slice(0, MAX_NODES);

  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

  // ── Zoom helpers ───────────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.25, 4) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.25, 0.15) }));
  }, []);

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setTransform({ x: width / 2, y: height / 2, scale: INITIAL_SCALE });
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => {
      const newScale = Math.min(Math.max(t.scale * factor, 0.15), 4);
      // Zoom toward cursor
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const ratio = newScale / t.scale;
      return {
        x: mouseX - ratio * (mouseX - t.x),
        y: mouseY - ratio * (mouseY - t.y),
        scale: newScale,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Canvas pan ─────────────────────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan if not clicking a node
    if ((e.target as HTMLElement).closest("[data-node-card]")) return;
    isPanningRef.current = true;
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingNodeRef.current && nodeDragRef.current.nodeId) {
      const drag = nodeDragRef.current;
      const dx = (e.clientX - drag.startMouseX) / transform.scale;
      const dy = (e.clientY - drag.startMouseY) / transform.scale;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(drag.nodeId!, {
          id: drag.nodeId!,
          x: drag.startNodeX + dx,
          y: drag.startNodeY + dy,
        });
        return next;
      });
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setTransform((t) => ({
        ...t,
        x: panStartRef.current.tx + dx,
        y: panStartRef.current.ty + dy,
      }));
    }
  }, [transform.scale]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    isDraggingNodeRef.current = false;
    nodeDragRef.current.nodeId = null;
  }, []);

  // ── Node drag start ────────────────────────────────────────────────────────

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const pos = positions.get(nodeId);
      if (!pos) return;
      isDraggingNodeRef.current = true;
      nodeDragRef.current = {
        nodeId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startNodeX: pos.x,
        startNodeY: pos.y,
      };
    },
    [positions]
  );

  // ── Node click ─────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: Node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  // ── Mobile list view ───────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", marginBottom: 4 }}>
          🧵 La Pared de la Corrupción
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>
          Vista simplificada para móvil — usa escritorio para el tablero interactivo
        </p>

        {loading && <p style={{ color: "#6b7280", textAlign: "center", padding: 32 }}>Cargando...</p>}
        {error && (
          <p style={{ color: "#f87171", textAlign: "center", padding: 16 }}>Error: {error}</p>
        )}

        {!loading && nodes.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b7280", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🕵️</div>
            <p>La pared está vacía — el sistema aún está recopilando datos</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nodes.slice(0, 50).map((node) => {
            const emoji = NODE_EMOJI[node.node_type] ?? "❓";
            const riskPct = Math.round(node.risk_score * 100);
            const isHighRisk = node.risk_score > 0.7;
            return (
              <Link
                key={node.id}
                href={`/entidad/${node.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: "#1f2937",
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: "1px solid #374151",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: 20 }}>{emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#f9fafb",
                      margin: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {node.canonical_name}
                  </p>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{node.node_type}</p>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: isHighRisk ? "#f87171" : "#fbbf24",
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                >
                  {riskPct}%
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop canvas view ────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        top: 64, // nav height
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#1a1a1a",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 52,
          backgroundColor: "rgba(17,24,39,0.95)",
          borderBottom: "1px solid #374151",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          flexShrink: 0,
          zIndex: 200,
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 800, color: "#f9fafb", marginRight: 4 }}>
          🧵 Pared
        </span>

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          title="Alejar"
          style={toolbarBtnStyle}
        >
          −
        </button>
        <span
          style={{
            fontSize: 12,
            color: "#9ca3af",
            fontFamily: "monospace",
            minWidth: 44,
            textAlign: "center",
          }}
        >
          {Math.round(transform.scale * 100)}%
        </span>
        <button onClick={zoomIn} title="Acercar" style={toolbarBtnStyle}>
          +
        </button>
        <button
          onClick={resetView}
          style={{ ...toolbarBtnStyle, fontSize: 11, padding: "4px 10px" }}
        >
          Reset
        </button>

        <div style={{ width: 1, height: 28, backgroundColor: "#374151", margin: "0 4px" }} />

        {/* Type filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          {NODE_TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              style={{
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 12,
                border: "1px solid",
                cursor: "pointer",
                fontWeight: typeFilter === f.value ? 700 : 400,
                backgroundColor: typeFilter === f.value ? "#1d4ed8" : "transparent",
                borderColor: typeFilter === f.value ? "#3b82f6" : "#4b5563",
                color: typeFilter === f.value ? "#fff" : "#9ca3af",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, backgroundColor: "#374151", margin: "0 4px" }} />

        {/* Search */}
        <input
          type="text"
          placeholder="Buscar entidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            color: "#f9fafb",
            outline: "none",
            width: 180,
          }}
        />

        {/* Node count */}
        <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>
          {filteredNodes.length} nodos · {edges.length} relaciones
        </span>

        {nodes.length >= MAX_NODES && (
          <span
            style={{
              fontSize: 11,
              color: "#fbbf24",
              backgroundColor: "#451a03",
              border: "1px solid #92400e",
              borderRadius: 4,
              padding: "2px 8px",
            }}
          >
            ⚠ Máx {MAX_NODES} nodos
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: isPanningRef.current ? "grabbing" : "grab",
          position: "relative",
          // Cork background
          backgroundColor: "#c8a87a",
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 0, transparent 50%)",
          backgroundSize: "8px 8px",
        }}
      >
        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(200,168,122,0.8)",
              zIndex: 500,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🕵️</div>
              <p style={{ color: "#78350f", fontWeight: 600 }}>Cargando la pared...</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 500,
            }}
          >
            <div
              style={{
                backgroundColor: "#450a0a",
                border: "1px solid #7f1d1d",
                borderRadius: 12,
                padding: "24px 32px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
              <p style={{ color: "#fca5a5", fontWeight: 600 }}>Error cargando datos</p>
              <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{error}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && nodes.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(255,254,245,0.9)",
                border: "2px dashed #d6c9a0",
                borderRadius: 16,
                padding: "40px 48px",
                textAlign: "center",
                maxWidth: 360,
                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🕵️</div>
              <p
                style={{
                  color: "#78350f",
                  fontWeight: 700,
                  fontSize: 16,
                  margin: "0 0 8px",
                }}
              >
                La pared está vacía
              </p>
              <p style={{ color: "#92400e", fontSize: 13, margin: 0 }}>
                El sistema aún está recopilando datos
              </p>
            </div>
          </div>
        )}

        {/* Transformed canvas */}
        {!loading && nodes.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transformOrigin: "0 0",
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          >
            {/* SVG edges layer */}
            <EdgeLayer
              edges={edges}
              positions={positions}
              visibleNodeIds={visibleNodeIds}
            />

            {/* Node cards */}
            {filteredNodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              return (
                <div key={node.id} data-node-card="true">
                  <NodeCard
                    node={node}
                    position={pos}
                    isSelected={selectedNode?.id === node.id}
                    onMouseDown={handleNodeMouseDown}
                    onClick={handleNodeClick}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      {selectedNode && (
        <SidePanel
          node={selectedNode}
          edges={edges}
          allNodes={nodes}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Legend strip */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          backgroundColor: "rgba(17,24,39,0.9)",
          border: "1px solid #374151",
          borderRadius: 8,
          padding: "8px 12px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          zIndex: 100,
          backdropFilter: "blur(6px)",
        }}
      >
        {Object.entries(RELATION_COLORS)
          .filter(([k]) => k !== "default")
          .map(([type, color]) => (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 20,
                  height: 2,
                  backgroundColor: color,
                  borderRadius: 1,
                }}
              />
              <span style={{ fontSize: 10, color: "#9ca3af" }}>
                {type.replace(/_/g, " ")}
              </span>
            </span>
          ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 20,
              height: 2,
              backgroundColor: RELATION_COLORS.default,
              borderRadius: 1,
            }}
          />
          <span style={{ fontSize: 10, color: "#9ca3af" }}>otros</span>
        </span>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const toolbarBtnStyle: React.CSSProperties = {
  backgroundColor: "#1f2937",
  border: "1px solid #4b5563",
  borderRadius: 6,
  color: "#e5e7eb",
  cursor: "pointer",
  fontSize: 16,
  padding: "3px 10px",
  lineHeight: 1.4,
  transition: "background-color 0.15s",
};
