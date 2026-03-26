"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getNodes, getEdges, type Node, type Edge } from "@/lib/supabase";

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  persona: "#3b82f6",
  empresa: "#f59e0b",
  contrato: "#10b981",
  institucion: "#8b5cf6",
  cuenta_social: "#06b6d4",
};

const NODE_LABELS: Record<string, string> = {
  persona: "Persona",
  empresa: "Empresa",
  contrato: "Contrato",
  institucion: "Institución",
  cuenta_social: "Cuenta Social",
};

// ── Physics types ────────────────────────────────────────────────────────────

interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  label: string;
  node_type: string;
  risk_score: number;
}

// ── Node Card for side panel ─────────────────────────────────────────────────

function NodeCard({ node, edges }: { node: PhysicsNode; edges: Edge[] }) {
  const connected = edges.filter(
    (e) => e.source_node_id === node.id || e.target_node_id === node.id
  );
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div
          className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: node.color }}
        />
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm break-words">{node.label}</p>
          <p className="text-gray-500 text-xs">{NODE_LABELS[node.node_type] || node.node_type}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800 rounded-lg p-2">
          <p className="text-gray-500">Riesgo</p>
          <p
            className="font-bold text-base"
            style={{
              color:
                node.risk_score > 0.7
                  ? "#ef4444"
                  : node.risk_score > 0.4
                  ? "#f59e0b"
                  : "#6b7280",
            }}
          >
            {Math.round(node.risk_score * 100)}%
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-2">
          <p className="text-gray-500">Conexiones</p>
          <p className="font-bold text-base text-white">{connected.length}</p>
        </div>
      </div>
      {connected.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-1">Relaciones:</p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {connected.slice(0, 15).map((e) => (
              <li key={e.id} className="text-xs text-gray-400 font-mono truncate">
                {e.relation_type}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── List view (collapsed) ────────────────────────────────────────────────────

function NodeListView({ nodes }: { nodes: PhysicsNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-sm text-gray-400"
      >
        <span>📋 Vista de lista ({nodes.length} entidades)</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-950 divide-y divide-gray-800 max-h-64 overflow-y-auto">
          {nodes.map((n) => (
            <div key={n.id} className="px-4 py-2 flex items-center gap-3">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: n.color }}
              />
              <span className="text-gray-300 text-xs flex-1 truncate">{n.label}</span>
              <span
                className="text-xs font-mono"
                style={{
                  color:
                    n.risk_score > 0.7
                      ? "#ef4444"
                      : n.risk_score > 0.4
                      ? "#f59e0b"
                      : "#6b7280",
                }}
              >
                {Math.round(n.risk_score * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function GrafoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // Data
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  // Physics state (stored in refs to avoid re-render on every frame)
  const physicsNodesRef = useRef<PhysicsNode[]>([]);
  const ticksRef = useRef(0);

  // Interaction state (refs for animation loop)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragNodeRef = useRef<{ node: PhysicsNode; offsetX: number; offsetY: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // UI state
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<PhysicsNode | null>(null);

  // ── Build physics nodes from raw data ──────────────────────────────────────
  const buildPhysicsNodes = useCallback(
    (rawNodes: Node[], canvasWidth: number, canvasHeight: number): PhysicsNode[] => {
      return rawNodes.map((n) => ({
        id: n.id,
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: 8 + n.risk_score * 16, // 8–24px
        color: NODE_COLORS[n.node_type] || "#6b7280",
        label: n.canonical_name,
        node_type: n.node_type,
        risk_score: n.risk_score,
      }));
    },
    []
  );

  // ── Physics tick ───────────────────────────────────────────────────────────
  const runTick = useCallback((pNodes: PhysicsNode[], pEdges: Edge[], cx: number, cy: number) => {
    const k = 5000; // repulsion constant
    const spring = 0.002; // spring constant
    const gravity = 0.003; // center pull

    const len = pNodes.length;

    // 1. Repulsion
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const ni = pNodes[i];
        const nj = pNodes[j];
        const dx = ni.x - nj.x;
        const dy = ni.y - nj.y;
        const distSq = dx * dx + dy * dy + 1;
        const force = k / distSq;
        const fx = (dx / Math.sqrt(distSq)) * force;
        const fy = (dy / Math.sqrt(distSq)) * force;
        ni.vx += fx;
        ni.vy += fy;
        nj.vx -= fx;
        nj.vy -= fy;
      }
    }

    // Build id → index map for edge lookup
    const idxMap: Record<string, number> = {};
    for (let i = 0; i < len; i++) idxMap[pNodes[i].id] = i;

    // 2. Attraction (spring force for edges)
    for (const edge of pEdges) {
      const si = idxMap[edge.source_node_id];
      const ti = idxMap[edge.target_node_id];
      if (si === undefined || ti === undefined) continue;
      const ns = pNodes[si];
      const nt = pNodes[ti];
      const dx = nt.x - ns.x;
      const dy = nt.y - ns.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const targetLen = 120;
      const f = (dist - targetLen) * spring;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      ns.vx += fx;
      ns.vy += fy;
      nt.vx -= fx;
      nt.vy -= fy;
    }

    // 3. Center gravity + friction + update
    for (const n of pNodes) {
      n.vx += (cx - n.x) * gravity;
      n.vy += (cy - n.y) * gravity;
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
    }
  }, []);

  // ── Draw frame ─────────────────────────────────────────────────────────────
  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      pNodes: PhysicsNode[],
      pEdges: Edge[],
      t: { x: number; y: number; scale: number },
      highlight: string,
      filterType: string,
      tick: number
    ) => {
      const canvas = ctx.canvas;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      // Build id → node map
      const nodeMap: Record<string, PhysicsNode> = {};
      for (const n of pNodes) nodeMap[n.id] = n;

      // Determine visible nodes
      const visibleIds = new Set<string>();
      for (const n of pNodes) {
        const typeOk =
          filterType === "all" ||
          (filterType === "alto_riesgo" && n.risk_score > 0.7) ||
          n.node_type === filterType;
        if (typeOk) visibleIds.add(n.id);
      }

      // 1. Draw edges
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (const e of pEdges) {
        const ns = nodeMap[e.source_node_id];
        const nt = nodeMap[e.target_node_id];
        if (!ns || !nt) continue;
        if (!visibleIds.has(ns.id) || !visibleIds.has(nt.id)) continue;
        ctx.beginPath();
        ctx.strokeStyle = "#4b5563";
        ctx.moveTo(ns.x, ns.y);
        ctx.lineTo(nt.x, nt.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 2. Draw nodes
      for (const n of pNodes) {
        if (!visibleIds.has(n.id)) continue;

        const isHighlighted =
          highlight && n.label.toLowerCase().includes(highlight.toLowerCase());
        const isHighRisk = n.risk_score > 0.7;

        // Pulse glow for high-risk
        if (isHighRisk) {
          const pulse = 0.5 + 0.5 * Math.sin(tick * 0.07);
          const glowRadius = n.radius + 8 + pulse * 6;
          const grad = ctx.createRadialGradient(n.x, n.y, n.radius, n.x, n.y, glowRadius);
          grad.addColorStop(0, `rgba(239,68,68,${0.4 * pulse})`);
          grad.addColorStop(1, "rgba(239,68,68,0)");
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Highlight ring
        if (isHighlighted) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label (only draw if node is large enough or zoomed in)
        const scaledR = n.radius * t.scale;
        if (scaledR > 6) {
          ctx.fillStyle = "#f9fafb";
          ctx.font = `${Math.max(9, Math.min(13, n.radius))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const maxLen = Math.floor(n.radius * 1.8);
          const label =
            n.label.length > maxLen ? n.label.slice(0, maxLen) + "…" : n.label;
          ctx.fillText(label, n.x, n.y + n.radius + 10);
        }
      }

      ctx.restore();
    },
    []
  );

  // ── Animation loop ─────────────────────────────────────────────────────────
  const startAnimation = useCallback(
    (pNodes: PhysicsNode[], pEdges: Edge[], highlight: string, filterType: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      let tick = 0;
      function frame() {
        // Run physics if still settling
        if (tick < 200) {
          runTick(pNodes, pEdges, cx, cy);
        }
        tick++;
        ticksRef.current = tick;

        drawFrame(ctx!, pNodes, pEdges, transformRef.current, highlight, filterType, tick);
        animFrameRef.current = requestAnimationFrame(frame);
      }
      animFrameRef.current = requestAnimationFrame(frame);
    },
    [runTick, drawFrame]
  );

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    Promise.all([getNodes(200), getEdges(500)]).then(([n, e]) => {
      setNodes(n);
      setEdges(e);
      setLoading(false);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const pNodes = buildPhysicsNodes(n, canvas.width, canvas.height);
      physicsNodesRef.current = pNodes;
      ticksRef.current = 0;

      // Cancel previous animation
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      startAnimation(pNodes, e, search, filter);
    });
  }, [buildPhysicsNodes, startAnimation, search, filter]);

  // Initial load + 30s refresh
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => {
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run animation when filter/search changes (without re-fetching data)
  useEffect(() => {
    if (physicsNodesRef.current.length === 0) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    startAnimation(physicsNodesRef.current, edges, search, filter);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [filter, search, edges, startAnimation]);

  // ── Canvas resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = 600;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Pointer → canvas space ─────────────────────────────────────────────────
  const toCanvas = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = transformRef.current;
    const cx = (e.clientX - rect.left - t.x) / t.scale;
    const cy = (e.clientY - rect.top - t.y) / t.scale;
    return { cx, cy };
  };

  const hitTest = (cx: number, cy: number): PhysicsNode | null => {
    const pNodes = physicsNodesRef.current;
    for (let i = pNodes.length - 1; i >= 0; i--) {
      const n = pNodes[i];
      const dx = cx - n.x;
      const dy = cy - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius) return n;
    }
    return null;
  };

  // ── Mouse events ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const { cx, cy } = toCanvas(e);
    const hit = hitTest(cx, cy);
    if (hit) {
      dragNodeRef.current = { node: hit, offsetX: cx - hit.x, offsetY: cy - hit.y };
      setSelectedNode(hit);
    } else {
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transformRef.current.x,
        ty: transformRef.current.y,
      };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragNodeRef.current) {
      const { cx, cy } = toCanvas(e);
      const dn = dragNodeRef.current;
      dn.node.x = cx - dn.offsetX;
      dn.node.y = cy - dn.offsetY;
      dn.node.vx = 0;
      dn.node.vy = 0;
    } else if (panStartRef.current) {
      const ps = panStartRef.current;
      transformRef.current = {
        ...transformRef.current,
        x: ps.tx + (e.clientX - ps.x),
        y: ps.ty + (e.clientY - ps.y),
      };
    }
  };

  const onMouseUp = () => {
    dragNodeRef.current = null;
    panStartRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(5, t.scale * factor));
    transformRef.current = {
      x: mx - (mx - t.x) * (newScale / t.scale),
      y: my - (my - t.y) * (newScale / t.scale),
      scale: newScale,
    };
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const filteredPhysicsNodes = physicsNodesRef.current.filter((n) => {
    const typeOk =
      filter === "all" ||
      (filter === "alto_riesgo" && n.risk_score > 0.7) ||
      n.node_type === filter;
    return typeOk;
  });
  const highRiskCount = nodes.filter((n) => n.risk_score > 0.7).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">🕸️ Grafo de Corrupción</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Red interactiva de entidades detectadas. Arrastra nodos · Scroll para zoom · Clic para inspeccionar.
          Actualiza automáticamente cada 30 s.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-white">{nodes.length}</div>
          <div className="text-xs text-gray-500">Nodos</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-white">{edges.length}</div>
          <div className="text-xs text-gray-500">Relaciones</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-red-400">{highRiskCount}</div>
          <div className="text-xs text-gray-500">Alto riesgo</div>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 flex-1 min-w-48"
        />
        {[
          { value: "all", label: "Todos" },
          { value: "persona", label: "Personas" },
          { value: "empresa", label: "Empresas" },
          { value: "institucion", label: "Instituciones" },
          { value: "alto_riesgo", label: "🔴 Alto Riesgo" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-900 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Canvas + side panel */}
      <div className="flex gap-4">
        {/* Canvas container */}
        <div className="relative flex-1 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 600 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <span className="text-gray-500 text-sm">Cargando grafo...</span>
            </div>
          )}
          {!loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <p className="text-gray-500 text-center text-sm max-w-xs">
                El sistema está recopilando datos. Vuelve pronto.
              </p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ display: "block", width: "100%", height: "100%" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            className="cursor-crosshair"
          />

          {/* Legend overlay */}
          <div className="absolute top-3 left-3 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 space-y-1.5 text-xs pointer-events-none">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-gray-400">{NODE_LABELS[type] || type}</span>
              </div>
            ))}
            <div className="border-t border-gray-700 pt-1.5 mt-1.5 space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-75" />
                <span className="text-gray-400">Alto riesgo (&gt;70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full border border-yellow-400" />
                <span className="text-gray-400">Búsqueda activa</span>
              </div>
            </div>
          </div>

          {/* Edge count badge */}
          <div className="absolute bottom-3 left-3 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-500 pointer-events-none">
            {edges.length} conexiones dibujadas
          </div>
        </div>

        {/* Side panel */}
        {selectedNode && (
          <div className="w-64 flex-shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Detalle</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
              >
                ✕ Cerrar
              </button>
            </div>
            <NodeCard node={selectedNode} edges={edges} />
          </div>
        )}
      </div>

      {/* List view (collapsed) */}
      <NodeListView nodes={filteredPhysicsNodes} />
    </div>
  );
}
