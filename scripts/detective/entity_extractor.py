"""
ATALAYA PANÓPTICA — Extractor de Entidades
Usa Groq/Llama 3 para extraer personas, empresas, RUTs, montos y fechas del texto.
"""

import logging
from typing import Optional
from scripts.detective.groq_client import chat_json

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un extractor de entidades experto en documentos oficiales chilenos.
Tu tarea es identificar entidades nombradas con máxima precisión.
Responde SIEMPRE en JSON válido, sin texto adicional."""

EXTRACT_PROMPT = """Analiza el siguiente documento oficial chileno y extrae TODAS las entidades mencionadas.

DOCUMENTO:
{text}

Responde en este formato JSON exacto:
{{
  "personas": [
    {{
      "nombre": "Nombre Apellido",
      "rut": "12.345.678-9 o null",
      "cargo": "Ministro/Director/etc o null",
      "institucion": "Nombre institución o null",
      "rol_en_documento": "firmante/beneficiario/imputado/testigo/etc"
    }}
  ],
  "empresas": [
    {{
      "nombre": "Razón Social",
      "rut": "12.345.678-9 o null",
      "tipo": "SpA/SA/Ltda/etc o null",
      "rol_en_documento": "proveedor/adjudicatario/contratista/etc"
    }}
  ],
  "contratos": [
    {{
      "codigo": "código o ID del contrato",
      "monto_clp": 0,
      "descripcion": "descripción breve",
      "fecha": "AAAA-MM-DD o null",
      "estado": "adjudicado/en_proceso/anulado/etc"
    }}
  ],
  "instituciones": [
    {{
      "nombre": "Ministerio/Municipalidad/etc",
      "tipo": "ministerio/municipalidad/servicio/empresa_publica/etc"
    }}
  ],
  "montos": [
    {{
      "valor_clp": 0,
      "descripcion": "para qué es este monto",
      "tipo": "contrato/transferencia/multa/presupuesto/etc"
    }}
  ]
}}
"""


def extract_entities(text: str) -> Optional[dict]:
    """
    Extrae entidades de un texto usando Groq.

    Returns:
        Dict con claves: personas, empresas, contratos, instituciones, montos
    """
    if len(text) < 50:
        return None

    prompt = EXTRACT_PROMPT.format(text=text[:4000])  # Limitar contexto

    result = chat_json(prompt, system=SYSTEM_PROMPT, max_tokens=1500, temperature=0.0)

    if not result:
        logger.warning("No se pudieron extraer entidades")
        return None

    # Normalizar estructura por si Groq devuelve campos incompletos
    return {
        "personas": result.get("personas", []),
        "empresas": result.get("empresas", []),
        "contratos": result.get("contratos", []),
        "instituciones": result.get("instituciones", []),
        "montos": result.get("montos", []),
    }


RELATIONS_PROMPT = """Dado el siguiente documento y las entidades ya identificadas,
infiere las RELACIONES entre ellas.

DOCUMENTO:
{text}

ENTIDADES CONOCIDAS:
{entities_summary}

Responde en JSON:
{{
  "relaciones": [
    {{
      "sujeto": "Nombre de la entidad origen",
      "tipo_sujeto": "persona/empresa/institucion",
      "relacion": "firmó_contrato/es_socio_de/lobbió_a/financió_campaña/trabaja_en/es_familiar_de/adjudicó_a",
      "objeto": "Nombre de la entidad destino",
      "tipo_objeto": "persona/empresa/institucion/contrato",
      "evidencia": "Cita textual del documento que justifica esta relación",
      "confianza": 0.95
    }}
  ]
}}
"""


def extract_relations(text: str, entities: dict) -> list[dict]:
    """
    Infiere relaciones entre entidades usando Groq.

    Returns:
        Lista de relaciones como dicts.
    """
    if not entities:
        return []

    # Resumir entidades para el prompt
    summary_parts = []
    for persona in entities.get("personas", []):
        summary_parts.append(f"PERSONA: {persona['nombre']} ({persona.get('cargo', 'sin cargo')})")
    for empresa in entities.get("empresas", []):
        summary_parts.append(f"EMPRESA: {empresa['nombre']} - {empresa.get('rol_en_documento', '')}")
    for inst in entities.get("instituciones", []):
        summary_parts.append(f"INSTITUCIÓN: {inst['nombre']}")

    entities_summary = "\n".join(summary_parts[:20])

    prompt = RELATIONS_PROMPT.format(
        text=text[:3000],
        entities_summary=entities_summary,
    )

    result = chat_json(prompt, system=SYSTEM_PROMPT, max_tokens=1200, temperature=0.0)

    if not result:
        return []

    return result.get("relaciones", [])
