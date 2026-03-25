"use client";

import { useEffect, useState, useRef } from "react";
import { getNodes, getEdges, type Node, type Edge } from "@/lib/supabase";

const NODE_COLORS: Record<string, string> = {
  persona: "#3b82f6",
  empresa: "#f59e0b",
  contrato: "#10b981",
  institucion: "#8b5cf6",
  cuenta_social: "#06b6d4",
};

function NodeCard({ node }: { node: Node }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3">
      <div
        className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
        style={{ backgroundColor: NODE_COLORS[node.node_type] }}
      />
      <div className="min-w-0">
        <p className="text-white text-sm font-medium truncate">{node.canonical_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{node.node_type}</span>
          {node.rut && <span className="text-xs text-gray-600 font-mono">{node.rut}</span>}
          <span
            className="text-xs font-bold"
            style={{ color: node.risk_score > 0.7 ? "#ef4444" : node.risk_score > 0.4 ? "#f59e0b" : "#6b7280" }}
          >
            Riesgo: {Math.round(node.risk_score * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function GrafoPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([getNodes(300), getEdges(600)]).then(([n, e]) => {
      setNodes(n);
      setEdges(e);
      setLoading(false);
    });
  }, []);

  const filteredNodes = nodes.filter((n) => {
    const matchType = filter === "all" || n.node_type === filter;
    const matchSearch =
      !search ||
      n.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      (n.rut && n.rut.includes(search));
    return matchType && matchSearch;
  });

  const highRiskNodes = filteredNodes.filter((n) => n.risk_score >= 0.6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">🕸️ Grafo de Corrupción</h1>
        <p className="text-gray-400 mt-1">
          Red de entidades detectadas: políticos, empresas, contratos e instituciones conectadas por relaciones documentadas.
        </p>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o RUT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 flex-1 min-w-48"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
        >
          <option value="all">Todos los tipos</option>
          <option value="persona">Personas</option>
          <option value="empresa">Empresas</option>
          <option value="contrato">Contratos</option>
          <option value="institucion">Instituciones</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{filteredNodes.length}</div>
          <div className="text-xs text-gray-500">Nodos</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{edges.length}</div>
          <div className="text-xs text-gray-500">Relaciones</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{highRiskNodes.length}</div>
          <div className="text-xs text-gray-500">Alto riesgo (&gt;60%)</div>
        </div>
      </div>

      {/* Nota visualización */}
      <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 text-sm text-blue-300">
        💡 <strong>Nota:</strong> La visualización interactiva del grafo con Sigma.js se activa en la Fase 7 completa.
        Actualmente mostrando listado de entidades ordenadas por riesgo.
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-16">Cargando grafo...</div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-gray-600 text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          No hay entidades detectadas aún. El sistema está procesando fuentes.
        </div>
      ) : (
        <div>
          {highRiskNodes.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-red-400 mb-3">🚨 Entidades de Alto Riesgo</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {highRiskNodes.slice(0, 10).map((n) => <NodeCard key={n.id} node={n} />)}
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold text-white mb-3">
            Todas las Entidades ({filteredNodes.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredNodes.slice(0, 60).map((n) => <NodeCard key={n.id} node={n} />)}
          </div>
          {filteredNodes.length > 60 && (
            <p className="text-gray-600 text-sm text-center mt-4">
              Mostrando 60 de {filteredNodes.length} entidades
            </p>
          )}
        </div>
      )}
    </div>
  );
}
