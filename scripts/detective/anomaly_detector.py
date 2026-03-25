"""
ATALAYA PANÓPTICA — Detector de Anomalías
Usa Groq para identificar sobreprecios, conflictos de interés y puerta giratoria.
"""

import logging
from typing import Optional
from scripts.detective.groq_client import chat_json
from scripts.utils.supabase_client import insert

logger = logging.getLogger(__name__)

ANOMALY_SYSTEM = """Eres un experto en anticorrupción del Estado chileno.
Analizas documentos oficiales en busca de irregularidades.
Responde SIEMPRE en JSON válido."""

ANOMALY_PROMPT = """Analiza el siguiente documento y determina si hay señales de corrupción o irregularidades.

DOCUMENTO:
{text}

CONTEXTO DE ENTIDADES DETECTADAS:
{entities_summary}

Evalúa específicamente:
1. SOBREPRECIOS: ¿El monto parece excesivo para el bien/servicio descrito?
2. CONFLICTO DE INTERÉS: ¿Hay funcionarios con relación a la empresa contratada?
3. PUERTA GIRATORIA: ¿Hay ex-funcionarios contratados por empresas que regulaban?
4. TRIANGULACIÓN: ¿Se usa una empresa intermediaria sin valor agregado aparente?
5. NEPOTISMO: ¿Hay contratación de familiares o allegados?
6. IRREGULARIDADES PROCEDIMENTALES: ¿El proceso licitatorio omitió pasos?

Responde en JSON:
{{
  "tiene_anomalia": true/false,
  "anomalias": [
    {{
      "tipo": "sobreprecio/conflicto_interes/puerta_giratoria/triangulacion/nepotismo/irregular_procedimiento",
      "confianza": 0.0-1.0,
      "descripcion": "Explicación clara en español de la anomalía detectada",
      "evidencia_textual": "Cita exacta del documento que sustenta",
      "entidades_involucradas": ["Nombre1", "Nombre2"],
      "recomendacion": "Qué debería investigar un periodista o fiscal"
    }}
  ],
  "riesgo_global": 0.0-1.0,
  "resumen": "Una oración que resume el hallazgo principal"
}}
"""


def detect_anomalies(
    text: str,
    entities: dict,
    source_url: str = None,
    queue_item_id: str = None,
) -> list[str]:
    """
    Analiza un texto en busca de anomalías de corrupción.

    Returns:
        Lista de UUIDs de anomalías creadas en Supabase.
    """
    # Resumir entidades para el prompt
    summary_parts = []
    for p in entities.get("personas", []):
        summary_parts.append(f"- Persona: {p['nombre']} ({p.get('cargo', 'sin cargo')}) en {p.get('institucion', 'N/A')}")
    for e in entities.get("empresas", []):
        summary_parts.append(f"- Empresa: {e['nombre']} (rol: {e.get('rol_en_documento', 'N/A')})")
    for m in entities.get("montos", []):
        summary_parts.append(f"- Monto: ${m.get('valor_clp', 0):,} CLP ({m.get('descripcion', '')})")

    entities_summary = "\n".join(summary_parts[:15])

    prompt = ANOMALY_PROMPT.format(text=text[:3500], entities_summary=entities_summary)

    result = chat_json(prompt, system=ANOMALY_SYSTEM, max_tokens=1500, temperature=0.1)

    if not result or not result.get("tiene_anomalia"):
        logger.debug("Sin anomalías detectadas")
        return []

    created_ids = []
    threshold = float(os.environ.get("CONFIDENCE_THRESHOLD_ANOMALY", "0.60"))

    for anomalia in result.get("anomalias", []):
        confianza = float(anomalia.get("confianza", 0))

        if confianza < threshold:
            logger.debug(f"Anomalía ignorada (confianza {confianza:.2f} < {threshold}): {anomalia.get('tipo')}")
            continue

        # Obtener IDs de nodos involucrados (simplificado)
        record = {
            "anomaly_type": anomalia.get("tipo", "conflicto_interes"),
            "confidence": confianza,
            "description": anomalia.get("descripcion", ""),
            "entities": [],  # Se podría resolver a UUIDs si se tiene el node_registry
            "evidence": {
                "texto": anomalia.get("evidencia_textual", ""),
                "recomendacion": anomalia.get("recomendacion", ""),
                "source_url": source_url,
                "entidades_nombradas": anomalia.get("entidades_involucradas", []),
            },
            "status": "activa",
            "queue_item_id": queue_item_id,
        }

        try:
            inserted = insert("anomalies", record)
            anomaly_id = inserted[0]["id"]
            created_ids.append(anomaly_id)
            logger.info(
                f"ANOMALÍA DETECTADA: [{anomalia.get('tipo')}] "
                f"confianza={confianza:.0%} — {anomalia.get('descripcion', '')[:80]}"
            )
        except Exception as e:
            logger.error(f"Error guardando anomalía: {e}")

    return created_ids


# Import os aquí para evitar circular (se usa en detect_anomalies)
import os
