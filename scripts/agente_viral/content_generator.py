"""
ATALAYA PANÓPTICA — Generador de Contenido Viral
Genera hilos periodísticos para X y guiones para TikTok a partir de anomalías.
Solo activa si confidence > 0.85.
"""

import logging
from scripts.detective.groq_client import chat
from scripts.utils.supabase_client import select, insert

logger = logging.getLogger(__name__)

TWITTER_SYSTEM = """Eres un periodista de investigación experto en corrupción chilena.
Escribes hilos virales en Twitter/X que informan y generan impacto ciudadano.
Usas lenguaje directo, datos concretos y llamadas a la acción."""

TWITTER_PROMPT = """Escribe un HILO DE TWITTER en español sobre esta anomalía detectada por ATALAYA.

ANOMALÍA:
Tipo: {anomaly_type}
Descripción: {description}
Confianza: {confidence:.0%}
Evidencia: {evidence}

REGLAS:
- Máximo 10 tweets
- Cada tweet separado por "---"
- Tweet 1: Gancho impactante con datos concretos
- Tweets 2-8: Desarrollo con evidencia y datos del Estado
- Tweet 9: Link a ATALAYA para ver el grafo completo
- Tweet 10: Llamada a la acción ciudadana
- Usa emojis estratégicamente (🔍 🚨 📊 🏛️ 💰)
- NO hagas afirmaciones sin evidencia; usa "según datos oficiales" cuando corresponda
- Incluye hashtags relevantes: #Corrupción #Chile #ATALAYA al final

Link a ATALAYA: https://atalaya-panoptica.vercel.app/grafo
"""

TIKTOK_SYSTEM = """Eres un creador de contenido periodístico para TikTok en Chile.
Explicas la corrupción de forma visual, simple y viralizante para audiencias jóvenes."""

TIKTOK_PROMPT = """Escribe un GUION PARA TIKTOK sobre esta investigación de ATALAYA.

ANOMALÍA:
Tipo: {anomaly_type}
Descripción: {description}
Confianza: {confidence:.0%}

FORMATO (guion para video de 60-90 segundos):
[HOOK 0-3s]: Frase de apertura impactante
[PROBLEMA 3-15s]: Qué pasó exactamente (simple y visual)
[DATOS 15-40s]: Los números y hechos concretos
[CONTEXTO 40-55s]: Por qué importa para los chilenos
[CTA 55-60s]: Sigue a ATALAYA, link en bio
---
TEXTO EN PANTALLA: (palabras clave que aparecen)
HASHTAGS: #Chile #Corrupcion #ATALAYA #Transparencia #DineroPublico
"""


def generate_twitter_thread(anomaly: dict) -> str:
    """Genera un hilo de Twitter sobre una anomalía."""
    prompt = TWITTER_PROMPT.format(
        anomaly_type=anomaly.get("anomaly_type", ""),
        description=anomaly.get("description", ""),
        confidence=float(anomaly.get("confidence", 0)),
        evidence=str(anomaly.get("evidence", {}))[:500],
    )
    return chat(prompt, system=TWITTER_SYSTEM, max_tokens=1500, temperature=0.7) or ""


def generate_tiktok_script(anomaly: dict) -> str:
    """Genera un guion de TikTok sobre una anomalía."""
    prompt = TIKTOK_PROMPT.format(
        anomaly_type=anomaly.get("anomaly_type", ""),
        description=anomaly.get("description", ""),
        confidence=float(anomaly.get("confidence", 0)),
    )
    return chat(prompt, system=TIKTOK_SYSTEM, max_tokens=800, temperature=0.7) or ""


def run(confidence_threshold: float = 0.85):
    """
    Busca anomalías de alta confianza sin contenido viral generado y crea el contenido.
    """
    import os
    threshold = float(os.environ.get("CONFIDENCE_THRESHOLD_VIRAL", str(confidence_threshold)))

    logger.info(f"Agente Viral: buscando anomalías con confianza > {threshold:.0%}...")

    # Anomalías que aún no tienen contenido viral generado
    # Consulta manual via SQL: anomalias con confidence > threshold sin entrada en viral_content
    try:
        from scripts.utils.supabase_client import db
        result = (
            db()
            .table("anomalies")
            .select("*")
            .gte("confidence", threshold)
            .eq("status", "activa")
            .execute()
        )
        anomalies = result.data
    except Exception as e:
        logger.error(f"Error consultando anomalías: {e}")
        return

    logger.info(f"  Encontradas {len(anomalies)} anomalías candidatas")
    generated = 0

    for anomaly in anomalies:
        anomaly_id = anomaly["id"]

        # Verificar si ya tiene contenido generado
        existing = select(
            "viral_content",
            filters={"trigger_anomaly": anomaly_id},
            limit=1,
        )
        if existing:
            continue

        # Generar hilo de Twitter
        thread_text = generate_twitter_thread(anomaly)
        if thread_text:
            try:
                insert("viral_content", {
                    "content_type": "twitter_thread",
                    "content_text": thread_text,
                    "trigger_anomaly": anomaly_id,
                    "confidence": float(anomaly.get("confidence", 0)),
                    "published": False,
                })
                logger.info(f"  Hilo X generado para anomalía {anomaly_id[:8]}")
                generated += 1
            except Exception as e:
                logger.error(f"Error guardando hilo: {e}")

        # Generar guion TikTok
        tiktok_text = generate_tiktok_script(anomaly)
        if tiktok_text:
            try:
                insert("viral_content", {
                    "content_type": "tiktok_script",
                    "content_text": tiktok_text,
                    "trigger_anomaly": anomaly_id,
                    "confidence": float(anomaly.get("confidence", 0)),
                    "published": False,
                })
                logger.info(f"  Guion TikTok generado para anomalía {anomaly_id[:8]}")
                generated += 1
            except Exception as e:
                logger.error(f"Error guardando guion: {e}")

    logger.info(f"Agente Viral completado: {generated} contenidos generados")
    return generated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
