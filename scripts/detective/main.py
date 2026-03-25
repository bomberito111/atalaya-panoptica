"""
ATALAYA PANÓPTICA — El Detective (Entry Point)
Consumidor de la investigation_queue: toma un ítem pending, lo analiza con IA
y persiste los resultados en nodos, aristas, anomalías y alertas.

Diseñado para ejecutarse cada 5 minutos via GitHub Actions.
Procesa MAX_ITEMS_PER_RUN ítems por ejecución.
"""

import os
import sys
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("detective")

from scripts.utils.supabase_client import claim_pending_item, mark_item_done, mark_item_error
from scripts.detective.entity_extractor import extract_entities, extract_relations
from scripts.detective.graph_builder import process_entities_and_relations
from scripts.detective.anomaly_detector import detect_anomalies
from scripts.detective.bot_hunter import analyze_for_bots
from scripts.detective.fake_news_detector import check_claim


def process_item(item: dict) -> bool:
    """
    Procesa un único ítem de la cola.

    Returns:
        True si procesó exitosamente, False si hubo error.
    """
    item_id = item["id"]
    source = item.get("source", "")
    text = item.get("raw_text", "")
    metadata = item.get("raw_metadata", {})
    source_url = item.get("source_url")

    logger.info(f"Procesando ítem {item_id} [{source}]: {source_url or 'sin URL'}")

    try:
        # ── Paso 1: Extraer entidades ──────────────────────────────────────
        entities = extract_entities(text)

        if not entities:
            logger.warning(f"Sin entidades extraídas para {item_id}")
            mark_item_done(item_id)
            return True

        logger.info(
            f"  Entidades: {len(entities.get('personas', []))} personas, "
            f"{len(entities.get('empresas', []))} empresas, "
            f"{len(entities.get('contratos', []))} contratos"
        )

        # ── Paso 2: Inferir relaciones ─────────────────────────────────────
        relations = extract_relations(text, entities)
        logger.info(f"  Relaciones inferidas: {len(relations)}")

        # ── Paso 3: Construir grafo ────────────────────────────────────────
        graph_stats = process_entities_and_relations(
            entities=entities,
            relations=relations,
            source_url=source_url,
            queue_item_id=item_id,
        )

        # ── Paso 4: Detectar anomalías de corrupción ───────────────────────
        anomaly_ids = detect_anomalies(
            text=text,
            entities=entities,
            source_url=source_url,
            queue_item_id=item_id,
        )

        # ── Paso 5: Detección de bots (si es RRSS) ─────────────────────────
        bot_alert_ids = analyze_for_bots(
            text=text,
            metadata={**metadata, "source": source},
            anomaly_id=anomaly_ids[0] if anomaly_ids else None,
        )

        # ── Paso 6: Detección de fake news (si es RRSS o prensa) ──────────
        fakenews_alert_ids = check_claim(
            text=text,
            metadata={**metadata, "source": source},
            anomaly_id=anomaly_ids[0] if anomaly_ids else None,
        )

        # ── Marcar como completado ─────────────────────────────────────────
        mark_item_done(item_id)

        logger.info(
            f"✅ Ítem {item_id} completado: "
            f"{graph_stats['nodes_created']} nodos, "
            f"{graph_stats['edges_created']} aristas, "
            f"{len(anomaly_ids)} anomalías, "
            f"{len(bot_alert_ids) + len(fakenews_alert_ids)} alertas"
        )
        return True

    except Exception as e:
        logger.error(f"❌ Error procesando ítem {item_id}: {e}", exc_info=True)
        mark_item_error(item_id, str(e))
        return False


def main():
    """Procesa N ítems de la cola (según MAX_ITEMS_PER_RUN)."""
    max_items = int(os.environ.get("MAX_ITEMS_PER_RUN", "5"))
    logger.info(f"El Detective iniciando — procesará máximo {max_items} ítems")

    processed = 0
    errors = 0

    for i in range(max_items):
        item = claim_pending_item()

        if not item:
            logger.info(f"Cola vacía después de {processed} ítems procesados")
            break

        success = process_item(item)
        if success:
            processed += 1
        else:
            errors += 1

    logger.info(
        f"El Detective finalizado: {processed} exitosos, {errors} errores de {processed + errors} procesados"
    )

    # Exit code non-zero si hubo errores (para notificación en GitHub Actions)
    if errors > 0 and processed == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
