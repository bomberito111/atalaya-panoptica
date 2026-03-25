"""
ATALAYA PANÓPTICA — Queue Manager
Inserta ítems en investigation_queue con deduplicación por URL hash.
Usado por todos los scrapers del Rastreador.
"""

import logging
from typing import Optional
from datetime import datetime

from scripts.utils.supabase_client import insert, select_one
from scripts.utils.text_cleaner import url_hash, clean_text

logger = logging.getLogger(__name__)


def enqueue(
    source: str,
    raw_text: str,
    source_url: Optional[str] = None,
    raw_metadata: Optional[dict] = None,
    priority: int = 5,
) -> Optional[dict]:
    """
    Agrega un ítem a la cola de investigación.

    Args:
        source: Identificador de la fuente ('mercado_publico', 'contraloria', etc.)
        raw_text: Texto crudo extraído
        source_url: URL original del dato (para deduplicación)
        raw_metadata: Metadatos adicionales (fecha, autor, título)
        priority: 1=urgente, 10=baja prioridad

    Returns:
        dict con el ítem insertado, o None si era duplicado.
    """
    # Calcular hash para deduplicación
    hash_val = url_hash(source_url) if source_url else url_hash(raw_text[:200])

    # Verificar si ya existe
    existing = select_one(
        table="investigation_queue",
        filters={"source_hash": hash_val},
    )

    if existing:
        logger.debug(f"Duplicado ignorado: {source_url or source}")
        return None

    # Limpiar texto
    cleaned_text = clean_text(raw_text)
    if not cleaned_text.strip():
        logger.warning(f"Texto vacío ignorado: {source_url}")
        return None

    item = {
        "source": source,
        "source_url": source_url,
        "source_hash": hash_val,
        "raw_text": cleaned_text,
        "raw_metadata": raw_metadata or {},
        "priority": max(1, min(10, priority)),  # Clamp 1-10
        "status": "pending",
    }

    result = insert("investigation_queue", item)
    if result:
        logger.info(f"Encolado: [{source}] {source_url or 'sin URL'}")
        return result[0]

    return None


def enqueue_batch(items: list[dict]) -> tuple[int, int]:
    """
    Encola múltiples ítems. Retorna (insertados, duplicados).

    Cada dict debe tener: source, raw_text, y opcionalmente source_url, raw_metadata, priority.
    """
    inserted = 0
    duplicates = 0

    for item in items:
        result = enqueue(
            source=item["source"],
            raw_text=item["raw_text"],
            source_url=item.get("source_url"),
            raw_metadata=item.get("raw_metadata"),
            priority=item.get("priority", 5),
        )
        if result:
            inserted += 1
        else:
            duplicates += 1

    logger.info(f"Batch completado: {inserted} insertados, {duplicates} duplicados")
    return inserted, duplicates
