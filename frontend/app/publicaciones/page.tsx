"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Anomaly } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ViralPost {
  id: string;
  content_type: string;
  content_text: string;
  confidence: number;
  published: boolean;
  published_at: string | null;
  platform_url: string | null;
  created_at: string;
  trigger_anomaly: string | null;
}

interface PostWithAnomaly extends ViralPost {
  anomaly?: Anomaly;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  twitter_thread: { icon: "🐦", label: "Twitter Thread", color: "bg-sky-900/40 border-sky-700 text-sky-300" },
  tiktok: { icon: "📹", label: "TikTok", color: "bg-pink-900/40 border-pink-700 text-pink-300" },
  instagram: { icon: "📸", label: "Instagram", color: "bg-purple-900/40 border-purple-700 text-purple-300" },
  comunicado: { icon: "📰", label: "Comunicado", color: "bg-yellow-900/40 border-yellow-700 text-yellow-300" },
  tweet: { icon: "🐦", label: "Twitter Thread", color: "bg-sky-900/40 border-sky-700 text-sky-300" },
};

function getContentConfig(type: string) {
  return (
    CONTENT_TYPE_CONFIG[type.toLowerCase()] ?? {
      icon: "📄",
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      color: "bg-gray-800 border-gray-700 text-gray-400",
    }
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min${mins !== 1 ? "s" : ""}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? "es" : ""}`;
  return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) > 1 ? "s" : ""}`;
}

// ─── Tarjeta de publicación ───────────────────────────────────────────────────

function PostCard({ post }: { post: PostWithAnomaly }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const cfg = getContentConfig(post.content_type);
  const MAX_CHARS = 280;
  const isTruncated = post.content_text.length > MAX_CHARS;
  const displayText =
    expanded || !isTruncated
      ? post.content_text
      : post.content_text.slice(0, MAX_CHARS) + "…";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(post.content_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text manually
    }
  }

  const confidencePct = Math.round(post.confidence * 100);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 border rounded-full ${cfg.color}`}>
            {cfg.icon} {cfg.label}
          </span>
          {post.published ? (
            <span className="text-xs font-medium px-2.5 py-1 bg-green-900/40 border border-green-700 text-green-300 rounded-full">
              ✅ Publicado
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 bg-orange-900/40 border border-orange-700 text-orange-300 rounded-full">
              ⏳ Pendiente de publicación
            </span>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            post.confidence >= 0.9
              ? "text-red-400 bg-red-900/30"
              : post.confidence >= 0.85
              ? "text-orange-400 bg-orange-900/30"
              : "text-yellow-400 bg-yellow-900/30"
          }`}>
            {confidencePct}% confianza
          </span>
        </div>
        <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(post.created_at)}</span>
      </div>

      {/* Tweet-style content */}
      <div className="px-5 py-4 space-y-3">
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm flex-shrink-0">
              🕵️
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white">Atalaya Panóptica</span>
                <span className="text-xs text-gray-600">@atalaya_cl</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
                {displayText}
              </p>
              {isTruncated && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-blue-400 hover:underline mt-2"
                >
                  {expanded ? "Ver menos" : "Ver más"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Anomaly link */}
        {post.trigger_anomaly && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2">
            <span className="text-orange-400">🔗</span>
            <span>Generado a partir de anomalía</span>
            <span className="font-mono text-gray-600 truncate">{post.trigger_anomaly}</span>
          </div>
        )}

        {/* Anomaly details if fetched */}
        {post.anomaly && (
          <div className="bg-red-950/20 border border-red-900/40 rounded-lg px-3 py-2 space-y-1">
            <p className="text-xs text-red-400 font-semibold uppercase tracking-wide">
              Anomalía: {post.anomaly.anomaly_type.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
              {post.anomaly.description}
            </p>
          </div>
        )}

        {/* Platform URL */}
        {post.published && post.platform_url && (
          <a
            href={post.platform_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            🐦 Ver en Twitter/X
          </a>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 bg-gray-950/30">
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Generado por IA
        </div>
        <button
          onClick={handleCopy}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            copied
              ? "bg-green-900/60 border border-green-700 text-green-300"
              : "bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300"
          }`}
        >
          {copied ? "✅ Copiado" : "📋 Copiar texto"}
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-12 text-center space-y-6">
      <div className="text-6xl">🤖</div>
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-white">El sistema está trabajando</h3>
        <p className="text-gray-400 max-w-md mx-auto leading-relaxed text-sm">
          La IA genera publicaciones automáticamente cuando detecta anomalías con{" "}
          <span className="text-yellow-400 font-semibold">≥85% de confianza</span>. Aparecerán aquí
          antes de ser publicadas en Twitter/X.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
        <div className="bg-gray-800/60 rounded-xl p-4 space-y-1">
          <div className="text-2xl">🔍</div>
          <p className="text-xs text-gray-500">El radar monitorea licitaciones, lobbies y contratos</p>
        </div>
        <div className="bg-gray-800/60 rounded-xl p-4 space-y-1">
          <div className="text-2xl">⚡</div>
          <p className="text-xs text-gray-500">Cuando la confianza supera 85%, se genera un post</p>
        </div>
        <div className="bg-gray-800/60 rounded-xl p-4 space-y-1">
          <div className="text-2xl">📢</div>
          <p className="text-xs text-gray-500">El post aparece aquí para revisión antes de publicar</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Sistema activo — monitoreando fuentes públicas chilenas
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PublicacionesPage() {
  const [posts, setPosts] = useState<PostWithAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    async function fetchPosts() {
      const { data: viralData, error } = await supabase
        .from("viral_content")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching viral_content:", error);
        setLoading(false);
        return;
      }

      const rawPosts = (viralData ?? []) as ViralPost[];

      // Fetch related anomalies for posts that have trigger_anomaly
      const anomalyIds = rawPosts
        .map((p) => p.trigger_anomaly)
        .filter((id): id is string => Boolean(id));

      let anomalyMap: Record<string, Anomaly> = {};
      if (anomalyIds.length > 0) {
        const { data: anomalyData } = await supabase
          .from("anomalies")
          .select("*")
          .in("id", anomalyIds);

        for (const a of (anomalyData ?? []) as Anomaly[]) {
          anomalyMap[a.id] = a;
        }
      }

      const enriched: PostWithAnomaly[] = rawPosts.map((p) => ({
        ...p,
        anomaly: p.trigger_anomaly ? anomalyMap[p.trigger_anomaly] : undefined,
      }));

      setPosts(enriched);
      setLoading(false);
    }

    fetchPosts();

    // Realtime subscription for new posts
    const channel = supabase
      .channel("viral_content_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "viral_content" },
        (payload) => {
          const newPost = payload.new as ViralPost;
          setPosts((prev) => [{ ...newPost }, ...prev.slice(0, 49)]);
          setLiveCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const publishedCount = posts.filter((p) => p.published).length;
  const pendingCount = posts.filter((p) => !p.published).length;
  const avgConfidence =
    posts.length > 0
      ? Math.round((posts.reduce((acc, p) => acc + p.confidence, 0) / posts.length) * 100)
      : 0;

  return (
    <div className="space-y-8 pb-12">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/20 p-6 sm:p-10">
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📢</span>
            <span className="text-xs font-mono text-sky-400 uppercase tracking-widest">
              Publicaciones IA — Twitter/X
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Publicaciones Generadas por IA
          </h1>
          <p className="text-gray-400 leading-relaxed text-sm max-w-2xl">
            Cuando el sistema detecta una anomalía con{" "}
            <span className="text-yellow-400 font-semibold">≥85% de confianza</span>, genera
            automáticamente un post listo para publicar en Twitter/X con evidencia. Los posts
            aparecen aquí para revisión antes de ser publicados.
          </p>
        </div>

        {liveCount > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">
              {liveCount} nueva{liveCount !== 1 ? "s" : ""} en vivo
            </span>
          </div>
        )}
      </section>

      {/* ── Pending banner (only when there are pending posts) ────────────── */}
      {!loading && pendingCount > 0 && (
        <div className="flex items-start gap-3 bg-orange-950/40 border border-orange-700 rounded-xl px-5 py-4">
          <span className="text-xl flex-shrink-0">⏳</span>
          <div>
            <p className="text-orange-200 font-semibold text-sm">
              {pendingCount} publicación{pendingCount !== 1 ? "es" : ""} pendiente{pendingCount !== 1 ? "s" : ""}
            </p>
            <p className="text-orange-300/70 text-xs mt-0.5">
              El sistema las revisará antes de publicar en Twitter/X. El umbral de confianza mínimo es ≥85%.
            </p>
          </div>
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {!loading && posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{posts.length}</div>
            <div className="text-xs text-gray-500 mt-1">Total generados</div>
          </div>
          <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{publishedCount}</div>
            <div className="text-xs text-green-600 mt-1">Publicados</div>
          </div>
          <div className="bg-orange-900/20 border border-orange-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{pendingCount}</div>
            <div className="text-xs text-orange-600 mt-1">Pendientes</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{avgConfidence}%</div>
            <div className="text-xs text-yellow-600 mt-1">Confianza media</div>
          </div>
        </div>
      )}

      {/* ── Live indicator ────────────────────────────────────────────────── */}
      {!loading && posts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Conectado a Supabase Realtime — publicaciones en tiempo real
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm">Cargando publicaciones...</p>
          </div>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Publicaciones recientes ({posts.length})
          </h2>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
        <p className="text-gray-400 text-sm">
          El sistema de IA analiza fuentes públicas del Estado chileno continuamente. Las anomalías
          con alta confianza generan posts de denuncia automáticamente.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/radar/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            📡 Radar de Anomalías
          </Link>
          <Link
            href="/red-corrupcion/"
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🕵️ Red de Corrupción
          </Link>
        </div>
      </section>

    </div>
  );
}
