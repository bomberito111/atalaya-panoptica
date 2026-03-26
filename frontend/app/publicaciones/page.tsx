"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Anomaly } from "@/lib/supabase";

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

const CONTENT_TYPE_CONFIG: Record<string, { icon: string; label: string; badgeClass: string }> = {
  twitter_thread: { icon: "🐦", label: "Twitter Thread", badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200" },
  tiktok:         { icon: "📹", label: "TikTok",         badgeClass: "bg-red-50 text-red-700 border border-red-200" },
  instagram:      { icon: "📸", label: "Instagram",      badgeClass: "bg-yellow-50 text-yellow-700 border border-yellow-200" },
  comunicado:     { icon: "📰", label: "Comunicado",     badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]" },
  tweet:          { icon: "🐦", label: "Tweet",          badgeClass: "bg-blue-50 text-[#213E76] border border-blue-200" },
};

function getContentConfig(type: string) {
  return (
    CONTENT_TYPE_CONFIG[type.toLowerCase()] ?? {
      icon: "📄",
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      badgeClass: "bg-gray-50 text-[#8090A6] border border-[#ECECEC]",
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
    <div className="bg-white border border-[#ECECEC] rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#ECECEC]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 border rounded-full ${cfg.badgeClass}`}>
            {cfg.icon} {cfg.label}
          </span>
          {post.published ? (
            <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full">
              ✅ Publicado
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full">
              ⏳ Pendiente de publicación
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            post.confidence >= 0.9
              ? "bg-red-50 text-red-700 border border-red-200"
              : post.confidence >= 0.85
              ? "bg-orange-50 text-orange-700 border border-orange-200"
              : "bg-yellow-50 text-yellow-700 border border-yellow-200"
          }`}>
            {confidencePct}% confianza
          </span>
        </div>
        <span className="text-xs text-[#8090A6] flex-shrink-0">{timeAgo(post.created_at)}</span>
      </div>

      {/* Tweet-style content */}
      <div className="px-4 py-4 space-y-3">
        <div className="bg-[#F5F5F5] border border-[#ECECEC] rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#213E76] flex items-center justify-center text-sm flex-shrink-0 text-white">
              🕵️
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-[#1B212C]">Atalaya Panóptica</span>
                <span className="text-xs text-[#8090A6]">@atalaya_cl</span>
              </div>
              <p className="text-[#1B212C] text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
                {displayText}
              </p>
              {isTruncated && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-[#213E76] hover:underline mt-2 font-semibold"
                >
                  {expanded ? "Ver menos" : "Ver más"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Anomaly link */}
        {post.trigger_anomaly && (
          <div className="flex items-center gap-2 text-xs text-[#8090A6] bg-[#F5F5F5] border border-[#ECECEC] rounded-lg px-3 py-2">
            <span className="text-[#E00911]">🔗</span>
            <span>Generado a partir de anomalía</span>
            <span className="font-mono text-[#8090A6] truncate">{post.trigger_anomaly}</span>
          </div>
        )}

        {/* Anomaly details */}
        {post.anomaly && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
            <p className="text-xs text-red-700 font-semibold uppercase tracking-wide">
              Anomalía: {post.anomaly.anomaly_type.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-red-800 leading-relaxed line-clamp-2">
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
            className="inline-flex items-center gap-1 text-xs text-[#213E76] hover:underline font-semibold"
          >
            🐦 Ver en Twitter/X
          </a>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#ECECEC] bg-[#F5F5F5]">
        <div className="flex items-center gap-1 text-xs text-[#8090A6]">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Generado por IA
        </div>
        <button
          onClick={handleCopy}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            copied
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-white hover:bg-[#F5F5F5] border-[#ECECEC] text-[#1B212C]"
          }`}
        >
          {copied ? "✅ Copiado" : "📋 Copiar texto"}
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white border border-[#ECECEC] rounded-lg p-8 sm:p-12 text-center space-y-6 shadow-sm">
      <div className="text-6xl">🤖</div>
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-[#1B212C]">El sistema está trabajando</h3>
        <p className="text-[#8090A6] max-w-md mx-auto leading-relaxed text-sm">
          La IA genera publicaciones automáticamente cuando detecta anomalías con{" "}
          <span className="text-[#E00911] font-semibold">≥85% de confianza</span>. Aparecerán aquí
          antes de ser publicadas en Twitter/X.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
        <div className="bg-[#F5F5F5] border border-[#ECECEC] rounded-lg p-4 space-y-1">
          <div className="text-2xl">🔍</div>
          <p className="text-xs text-[#8090A6]">El radar monitorea licitaciones, lobbies y contratos</p>
        </div>
        <div className="bg-[#F5F5F5] border border-[#ECECEC] rounded-lg p-4 space-y-1">
          <div className="text-2xl">⚡</div>
          <p className="text-xs text-[#8090A6]">Cuando la confianza supera 85%, se genera un post</p>
        </div>
        <div className="bg-[#F5F5F5] border border-[#ECECEC] rounded-lg p-4 space-y-1">
          <div className="text-2xl">📢</div>
          <p className="text-xs text-[#8090A6]">El post aparece aquí para revisión antes de publicar</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-[#8090A6]">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Sistema activo — monitoreando fuentes públicas chilenas
      </div>
    </div>
  );
}

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
    <div className="space-y-6 pb-12">

      {/* Section header */}
      <div className="bg-[#213E76] text-white px-4 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between">
        <span>📢 Publicaciones Generadas por IA</span>
        {liveCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-normal normal-case tracking-normal">
              {liveCount} nueva{liveCount !== 1 ? "s" : ""} en vivo
            </span>
          </div>
        )}
      </div>

      {/* Subtitle */}
      <div>
        <p className="text-[#8090A6] text-sm leading-relaxed">
          Cuando el sistema detecta una anomalía con{" "}
          <span className="text-[#E00911] font-semibold">≥85% de confianza</span>, genera
          automáticamente un post listo para publicar en Twitter/X con evidencia.
        </p>
      </div>

      {/* Pending banner */}
      {!loading && pendingCount > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <span className="text-xl flex-shrink-0">⏳</span>
          <div>
            <p className="text-yellow-800 font-semibold text-sm">
              {pendingCount} publicación{pendingCount !== 1 ? "es" : ""} pendiente{pendingCount !== 1 ? "s" : ""}
            </p>
            <p className="text-yellow-700 text-xs mt-0.5">
              El sistema las revisará antes de publicar en Twitter/X. El umbral de confianza mínimo es ≥85%.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      {!loading && posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#1B212C]">{posts.length}</div>
            <div className="text-xs text-[#8090A6] mt-1">Total generados</div>
          </div>
          <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-green-700">{publishedCount}</div>
            <div className="text-xs text-[#8090A6] mt-1">Publicados</div>
          </div>
          <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-yellow-700">{pendingCount}</div>
            <div className="text-xs text-[#8090A6] mt-1">Pendientes</div>
          </div>
          <div className="bg-white border border-[#ECECEC] rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#213E76]">{avgConfidence}%</div>
            <div className="text-xs text-[#8090A6] mt-1">Confianza media</div>
          </div>
        </div>
      )}

      {/* Live indicator */}
      {!loading && posts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#8090A6]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Conectado a Supabase Realtime — publicaciones en tiempo real
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#213E76] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[#8090A6] text-sm">Cargando publicaciones...</p>
          </div>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[#1B212C]">
            Publicaciones recientes ({posts.length})
          </h2>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* CTA */}
      <section className="bg-white border border-[#ECECEC] rounded-lg p-6 text-center space-y-3 shadow-sm">
        <p className="text-[#8090A6] text-sm">
          El sistema de IA analiza fuentes públicas del Estado chileno continuamente. Las anomalías
          con alta confianza generan posts de denuncia automáticamente.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/radar/"
            className="px-4 py-2 bg-white hover:bg-[#F5F5F5] border border-[#213E76] text-[#213E76] rounded-lg text-sm font-semibold transition-colors"
          >
            📡 Radar de Anomalías
          </Link>
          <Link
            href="/red-corrupcion/"
            className="px-4 py-2 bg-[#E00911] hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            🕵️ Red de Corrupción
          </Link>
        </div>
      </section>
    </div>
  );
}
