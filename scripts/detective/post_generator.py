"""
ATALAYA PANÓPTICA — Generador de Posts para Twitter/X
Cuando se detecta una anomalía con confianza ≥ 0.85, genera automáticamente
un hilo de Twitter con evidencia y lo guarda en viral_content.
El hilo tiene rigor periodístico: cita fuentes, da contexto, incluye fechas.
"""

import logging
import uuid
from typing import Optional

from scripts.detective.groq_client import chat
from scripts.utils.supabase_client import get_client as get_supabase_service_client

logger = logging.getLogger(__name__)

# ── Umbral mínimo de confianza para generar post ───────────────────────────

CONFIDENCE_THRESHOLD = 0.85

# ── Prompt para el hilo de Twitter ────────────────────────────────────────

_THREAD_SYSTEM = (
    "Eres un periodista de investigación chileno riguroso y preciso. "
    "Redactas hilos de Twitter con rigor periodístico, sin sensacionalismo. "
    "Cada tweet debe ser autónomo pero parte de un relato coherente."
)

_THREAD_PROMPT_TEMPLATE = """\
Eres un periodista de investigación chileno riguroso. Basándote en esta anomalía detectada, escribe un HILO DE TWITTER (máximo 5 tweets, cada uno ≤ 280 caracteres).

REGLAS CRÍTICAS:
- Solo afirma lo que puedes respaldar con las fuentes dadas
- Incluye las fuentes reales (URLs) en el último tweet
- Usa lenguaje periodístico factual, no sensacionalista
- Menciona fechas precisas de los hechos
- Si el involucrado está fallecido, usa tiempo pasado y nota la fecha de fallecimiento
- NO uses emojis excesivos
- Termina con "🤖 Detectado por @AtalayaPanoptica - sistema IA anticorrupción Chile"

Anomalía: {description}
Tipo: {anomaly_type}
Confianza IA: {confidence_pct:.0f}%
Entidades: {entities}
Fuentes: {sources}
"""


# ── Funciones públicas ─────────────────────────────────────────────────────


def should_generate_post(confidence: float, anomaly_type: str) -> bool:
    """
    Determina si se debe generar un post de Twitter para esta anomalía.

    Args:
        confidence: Puntuación de confianza de la anomalía (0.0 – 1.0).
        anomaly_type: Tipo de anomalía detectada.

    Returns:
        True si la confianza supera el umbral mínimo (0.85).
    """
    qualifies = confidence >= CONFIDENCE_THRESHOLD
    logger.debug(
        f"should_generate_post: confianza={confidence:.2f}, "
        f"tipo={anomaly_type!r}, califica={qualifies}"
    )
    return qualifies


def generate_twitter_thread(
    anomaly: dict,
    entity_names: list[str],
    evidence_sources: list[str],
) -> Optional[str]:
    """
    Genera un hilo de Twitter usando Groq/Llama3.

    Args:
        anomaly: Dict de anomalía con al menos las claves
                 "description" (o "descripcion"), "tipo", "confianza".
        entity_names: Lista de entidades involucradas.
        evidence_sources: Lista de URLs de fuentes de evidencia.

    Returns:
        Texto del hilo generado, o None si Groq falla.
    """
    # Normalizar claves (compatibilidad con distintos schemas)
    description = (
        anomaly.get("description")
        or anomaly.get("descripcion")
        or anomaly.get("resumen")
        or "Anomalía de corrupción detectada"
    )
    anomaly_type = anomaly.get("tipo") or anomaly.get("anomaly_type") or "desconocido"
    confidence = float(anomaly.get("confianza") or anomaly.get("confidence") or 0.0)

    # Formatear fuentes: máximo 3 URLs para no exceder el tweet
    sources_text = (
        ", ".join(evidence_sources[:3]) if evidence_sources else "Sin fuentes externas"
    )
    entities_text = ", ".join(entity_names) if entity_names else "Entidad desconocida"

    prompt = _THREAD_PROMPT_TEMPLATE.format(
        description=description,
        anomaly_type=anomaly_type,
        confidence_pct=confidence * 100,
        entities=entities_text,
        sources=sources_text,
    )

    logger.info(
        f"Generando hilo Twitter para anomalía tipo={anomaly_type!r}, "
        f"confianza={confidence:.2f}, entidades={entities_text!r}"
    )

    thread_text = chat(
        prompt=prompt,
        system=_THREAD_SYSTEM,
        max_tokens=800,
        temperature=0.3,
    )

    if not thread_text:
        logger.error("Groq no devolvió contenido para el hilo de Twitter")
        return None

    logger.debug(f"Hilo generado: {len(thread_text)} caracteres")
    return thread_text


def save_post(
    content_text: str,
    anomaly_id: str,
    confidence: float,
) -> Optional[str]:
    """
    Guarda el hilo generado en la tabla viral_content de Supabase.

    Args:
        content_text: Texto completo del hilo de Twitter.
        anomaly_id: ID de la anomalía origen (UUID string).
        confidence: Puntuación de confianza de la anomalía.

    Returns:
        ID del nuevo registro en viral_content, o None si falla.
    """
    try:
        client = get_supabase_service_client()
    except Exception as exc:
        logger.error(f"No se pudo obtener cliente Supabase: {exc}")
        return None

    record = {
        "id": str(uuid.uuid4()),
        "anomaly_id": anomaly_id,
        "platform": "twitter",
        "content_text": content_text,
        "confidence": round(confidence, 4),
        "status": "pending",  # pendiente de revisión humana antes de publicar
    }

    try:
        response = client.table("viral_content").insert(record).execute()

        if response.data:
            new_id = response.data[0].get("id", record["id"])
            logger.info(
                f"Post guardado en viral_content: id={new_id}, "
                f"anomaly_id={anomaly_id}, confianza={confidence:.2f}"
            )
            return new_id

        logger.warning(f"Insert en viral_content no devolvió datos: {response}")
        return None

    except Exception as exc:
        logger.error(f"Error al guardar post en viral_content: {exc}")
        return None


# ── Función de alto nivel (orquestador) ───────────────────────────────────


def maybe_generate_and_save_post(
    anomaly: dict,
    entity_names: list[str],
    evidence_sources: list[str],
) -> Optional[str]:
    """
    Punto de entrada principal: evalúa si corresponde generar un post,
    lo genera con Groq y lo persiste en Supabase.

    Args:
        anomaly: Dict de anomalía (debe incluir "confianza"/"confidence" y "tipo").
        entity_names: Entidades involucradas en la anomalía.
        evidence_sources: URLs de evidencia.

    Returns:
        ID del post guardado, o None si no procede o falla.
    """
    confidence = float(anomaly.get("confianza") or anomaly.get("confidence") or 0.0)
    anomaly_type = anomaly.get("tipo") or anomaly.get("anomaly_type") or "desconocido"
    anomaly_id = str(anomaly.get("id") or uuid.uuid4())

    if not should_generate_post(confidence, anomaly_type):
        logger.debug(
            f"Confianza {confidence:.2f} < {CONFIDENCE_THRESHOLD} — "
            "no se genera post para esta anomalía"
        )
        return None

    thread_text = generate_twitter_thread(anomaly, entity_names, evidence_sources)
    if not thread_text:
        return None

    return save_post(thread_text, anomaly_id, confidence)
