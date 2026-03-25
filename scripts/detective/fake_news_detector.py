"""
ATALAYA PANÓPTICA — Detector de Fake News
Cruza narrativas virales de RRSS con datos oficiales del Estado para validar o desmentir.
"""

import logging
from scripts.detective.groq_client import chat_json
from scripts.utils.supabase_client import insert, select

logger = logging.getLogger(__name__)

FAKENEWS_SYSTEM = """Eres un fact-checker experto en política y administración pública chilena.
Verificas afirmaciones comparándolas contra datos oficiales.
Responde SIEMPRE en JSON válido."""

FAKENEWS_PROMPT = """Analiza la siguiente afirmación viral y determina su veracidad cruzándola con datos oficiales.

AFIRMACIÓN VIRAL (de redes sociales):
{claim}

DATOS OFICIALES DISPONIBLES EN NUESTRA BASE DE DATOS:
{official_context}

Evalúa:
1. ¿La afirmación es verificable con datos públicos?
2. ¿Los datos oficiales la confirman, desmienten o son insuficientes?
3. ¿Es posible que la afirmación sea deliberadamente falsa (fake news) vs. un error?

Responde en JSON:
{{
  "es_fake_news": true/false/null,
  "confianza": 0.0-1.0,
  "veredicto": "verdadero/falso/parcialmente_verdadero/no_verificable/sin_datos",
  "explicacion": "Explicación clara y neutral de la verificación",
  "datos_oficiales_usados": ["fuente1", "fuente2"],
  "afirmacion_original": "copia exacta de la afirmación analizada",
  "dato_correcto": "cuál es la realidad según fuentes oficiales",
  "fuente_oficial": "URL o nombre de la fuente que desmiente/confirma",
  "es_deliberada": true/false,
  "actor_probable": "quién podría beneficiarse de esta desinformación (o 'Indeterminado')"
}}
"""


def check_claim(
    text: str,
    metadata: dict = None,
    anomaly_id: str = None,
) -> list[str]:
    """
    Verifica si el contenido de RRSS contiene afirmaciones falsas sobre el Estado.

    Returns:
        Lista de UUIDs de manipulation_alerts creadas.
    """
    is_social = any(
        kw in (metadata or {}).get("source", "").lower()
        for kw in ["twitter", "facebook", "instagram", "tiktok", "prensa"]
    )

    if not is_social:
        return []

    # Obtener contexto de datos oficiales de nuestra BD
    official_data = _get_official_context(text)

    prompt = FAKENEWS_PROMPT.format(
        claim=text[:2000],
        official_context=official_data,
    )

    result = chat_json(prompt, system=FAKENEWS_SYSTEM, max_tokens=1000, temperature=0.1)

    if not result:
        return []

    confianza = float(result.get("confianza", 0))
    es_fake = result.get("es_fake_news")

    # Solo alertar si detectamos fake news con suficiente confianza
    if not es_fake or confianza < 0.55:
        return []

    alert = {
        "alert_type": "fake_news",
        "narrative": result.get("afirmacion_original", text[:200]),
        "platform": (metadata or {}).get("plataforma", "multiple"),
        "evidence": {
            "veredicto": result.get("veredicto"),
            "explicacion": result.get("explicacion"),
            "es_deliberada": result.get("es_deliberada"),
            "actor_probable": result.get("actor_probable"),
        },
        "official_data": {
            "dato_correcto": result.get("dato_correcto"),
            "fuente": result.get("fuente_oficial"),
            "fuentes_usadas": result.get("datos_oficiales_usados", []),
        },
        "confidence": confianza,
        "is_public": True,
        "anomaly_id": anomaly_id,
    }

    try:
        inserted = insert("manipulation_alerts", alert)
        alert_id = inserted[0]["id"]
        logger.info(
            f"FAKE NEWS DETECTADA: veredicto={result.get('veredicto')} "
            f"confianza={confianza:.0%} — {text[:60]}"
        )
        return [alert_id]
    except Exception as e:
        logger.error(f"Error guardando alerta fake news: {e}")
        return []


def _get_official_context(text: str, max_results: int = 5) -> str:
    """
    Busca en nuestra BD datos oficiales que puedan verificar el texto.
    Retorna un resumen de texto para incluir en el prompt.
    """
    try:
        # Buscar en anomalías ya procesadas
        anomalies = select("anomalies", filters={"status": "activa"}, limit=max_results)
        context_parts = []

        for a in anomalies:
            context_parts.append(
                f"- Anomalía oficial detectada: {a.get('description', '')} "
                f"(confianza: {a.get('confidence', 0):.0%})"
            )

        if context_parts:
            return "\n".join(context_parts)

        return "No hay datos oficiales previos en la base de datos para esta verificación."

    except Exception as e:
        logger.debug(f"Error obteniendo contexto oficial: {e}")
        return "Base de datos de contexto no disponible."
