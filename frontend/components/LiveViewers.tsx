"use client";

/**
 * LiveViewers — Contador de usuarios conectados en tiempo real
 * Usa Supabase Realtime Presence: cada pestaña abierta = 1 presencia.
 * Aparece como un badge flotante en la esquina inferior derecha.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ID único para esta sesión (no identificable, solo para presencia)
function randomSessionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function LiveViewers() {
  const [count, setCount] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sessionId = randomSessionId();

    const channel = supabase.channel("site-presence", {
      config: { presence: { key: sessionId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const n = Object.keys(state).length;
        setCount(n);
        setVisible(true);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            online_at: new Date().toISOString(),
            // No guardamos ningún dato identificable
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, []);

  // No mostrar hasta tener dato real
  if (!visible || count === null) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 7,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        border: "1px solid rgba(59,130,246,0.3)",
        borderRadius: 999,
        padding: "6px 14px 6px 10px",
        backdropFilter: "blur(10px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        fontSize: 13,
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
        cursor: "default",
        transition: "opacity 0.4s ease",
        opacity: visible ? 1 : 0,
      }}
      title="Personas viendo el sitio ahora mismo"
    >
      {/* Pulso verde animado */}
      <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundColor: "#22c55e",
            opacity: 0.75,
            animation: "atalaya-ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#16a34a",
          }}
        />
      </span>

      <span>
        <strong style={{ color: "#4ade80", fontWeight: 700 }}>{count}</strong>
        {" "}
        <span style={{ color: "#94a3b8" }}>
          {count === 1 ? "persona viendo esto" : "personas viendo esto"}
        </span>
      </span>

      {/* CSS para la animación ping */}
      <style>{`
        @keyframes atalaya-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
