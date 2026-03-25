"""
ATALAYA PANÓPTICA — Cazador de Bots
Detecta granjas de bots y comportamiento inauténtico coordinado en RRSS.
Analiza patrones de frecuencia, horarios, vocabulario y coordinación.
"""

import logging
from scripts.detective.groq_client import chat_json
from scripts.utils.supabase_client import insert

logger = logging.getLogger(__name__)

BOT_SYSTEM = """Eres un experto en ciberseguridad y análisis de redes sociales.
Detectas campañas de desinformación, granjas de bots y manipulación política digital.
Responde SIEMPRE en JSON válido."""

BOT_PROMPT = """Analiza este contenido de redes sociales y determina si hay señales de comportamiento inauténtico coordinado (CIB) o granjas de bots.

CONTENIDO A ANALIZAR:
{text}

METADATOS:
{metadata}

Busca específicamente:
1. REPETICIÓN: ¿El mismo mensaje se replica idéntico o casi idéntico?
2. HORARIOS SOSPECHOSOS: ¿Se publica en horarios atípicos (madrugada, mismo segundo)?
3. VOCABULARIO COORDINADO: ¿Hashtags, frases o términos que se replican exactamente?
4. AUSENCIA DE PERSONALIDAD: ¿Las cuentas parecen automatizadas o sin historia previa?
5. AMPLIFICACIÓN ARTIFICIAL: ¿El contenido viraliza más rápido de lo orgánicamente posible?
6. NARRATIVA POLÍTICA: ¿La campaña beneficia a un actor político específico?

Responde en JSON:
{{
  "es_bot_o_cib": true/false,
  "confianza": 0.0-1.0,
  "tipo_amenaza": "bot_farm/coordinated_inauthentic/astroturfing/narrative_hijacking/organico",
  "narrativa_detectada": "¿Qué mensaje o agenda promueve esta actividad?",
  "actor_beneficiado": "¿Quién se beneficia políticamente? (o 'Indeterminado')",
  "plataforma": "twitter_x/facebook/instagram/tiktok/multiple",
  "evidencia": {{
    "patrones_detectados": ["patron1", "patron2"],
    "vocabulario_repetido": ["hashtag1", "frase1"],
    "estimacion_cuentas_involucradas": 0,
    "ventana_temporal": "descripción del período de actividad sospechosa"
  }},
  "recomendacion": "Qué debería investigar a continuación"
}}
"""


def analyze_for_bots(
    text: str,
    metadata: dict = None,
    anomaly_id: str = None,
) -> list[str]:
    """
    Analiza texto de RRSS en busca de bots y CIB.

    Returns:
        Lista de UUIDs de manipulation_alerts creadas.
    """
    is_social = any(
        kw in (metadata or {}).get("source", "").lower()
        for kw in ["twitter", "facebook", "instagram", "tiktok"]
    )

    if not is_social:
        return []

    prompt = BOT_PROMPT.format(
        text=text[:3000],
        metadata=str(metadata or {}),
    )

    result = chat_json(prompt, system=BOT_SYSTEM, max_tokens=1000, temperature=0.1)

    if not result or not result.get("es_bot_o_cib"):
        return []

    confianza = float(result.get("confianza", 0))
    if confianza < 0.50:
        return []

    alert = {
        "alert_type": result.get("tipo_amenaza", "coordinated_inauthentic"),
        "narrative": result.get("narrativa_detectada", ""),
        "platform": result.get("plataforma", "multiple"),
        "evidence": result.get("evidencia", {}),
        "official_data": {"actor_beneficiado": result.get("actor_beneficiado", "")},
        "confidence": confianza,
        "is_public": True,
        "anomaly_id": anomaly_id,
    }

    try:
        inserted = insert("manipulation_alerts", alert)
        alert_id = inserted[0]["id"]
        logger.info(
            f"ALERTA BOT: [{result.get('tipo_amenaza')}] "
            f"confianza={confianza:.0%} — {result.get('narrativa_detectada', '')[:80]}"
        )
        return [alert_id]
    except Exception as e:
        logger.error(f"Error guardando alerta de bot: {e}")
        return []
