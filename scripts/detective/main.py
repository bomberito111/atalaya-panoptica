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
from dateutil import parser as dateutil_parser

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
from scripts.detective.web_researcher import enrich_anomaly_context
from scripts.detective.post_generator import maybe_generate_and_save_post
from scripts.detective.investigador import run as investigador_run
from scripts.utils.supabase_client import get_client as _db


def normalize_event_date(raw: str) -> str:
    """
    Normaliza cualquier formato de fecha a YYYY-MM-DD.
    Maneja: RFC 2822 (RSS feeds), ISO 8601, formatos en español, timestamps, etc.
    Ej: "Thu, 14 Mar 2024 10:30:00 GMT" → "2024-03-14"
        "2025-01-20T15:00:00Z"          → "2025-01-20"
    Returns "" si no puede parsear.
    """
    if not raw or not isinstance(raw, str):
        return ""
    raw = raw.strip()
    if not raw or len(raw) < 4:
        return ""
    # Ya está en formato YYYY-MM-DD
    if len(raw) >= 10 and raw[4:5] == "-" and raw[7:8] == "-":
        return raw[:10]
    try:
        parsed = dateutil_parser.parse(raw, ignoretz=True)
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        # Último recurso: tomar los primeros 10 caracteres si parecen fecha
        return raw[:10] if len(raw) >= 10 else ""


def process_item(item: dict) -> bool:
    """
    Procesa un único ítem de la cola.

    Returns:
        True si procesó exitosamente, False si hubo error.
    """
    item_id = item["id"]
    source = item.get("source", "")
    text = item.get("raw_text", "")
    metadata = item.get("raw_metadata", {}) or {}
    source_url = item.get("source_url")

    # Extraer y NORMALIZAR la fecha real del evento a YYYY-MM-DD
    # Prioridad: fecha del contrato/licitación > fecha publicación RSS > fecha creación ítem
    raw_date = (
        metadata.get("fecha")              # Mercado Público: fecha licitación
        or metadata.get("published")       # RSS feeds (RFC 2822: "Thu, 14 Mar 2024...")
        or metadata.get("fecha_publicacion")
        or metadata.get("date")
        or ""
    )
    event_date = normalize_event_date(raw_date) or item.get("created_at", "")[:10]

    logger.info(f"Procesando ítem {item_id} [{source}]: {source_url or 'sin URL'} | fecha_evento={event_date or 'N/A'}")

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
            event_date=event_date,   # Fecha real del hecho, no de detección
        )

        # ── Paso 4b: Verificar anomalías en internet ────────────────────────
        # Para cada anomalía detectada, el web researcher busca cobertura
        # periodística real, verifica URLs de evidencia y detecta si las
        # entidades están activas o fallecidas (ej: Piñera murió Feb 2024).
        # Si el contexto web cambia la confianza, actualiza el registro.
        if anomaly_ids:
            all_entity_names: list[str] = (
                [p.get("nombre", "") for p in entities.get("personas", []) if p.get("nombre")]
                + [e.get("nombre", "") for e in entities.get("empresas", []) if e.get("nombre")]
            )
            try:
                web_ctx = enrich_anomaly_context(
                    entity_names=all_entity_names[:4],
                    anomaly_type="corrupción",
                    existing_evidence_url=source_url,
                )
                adj = web_ctx.get("confidence_adjustment", 0.0)
                if adj != 0.0 and anomaly_ids:
                    # Aplicar ajuste de confianza a la primera anomalía detectada
                    row = _db().table("anomalies").select("confidence").eq("id", anomaly_ids[0]).single().execute()
                    if row.data:
                        new_conf = max(0.0, min(1.0, float(row.data["confidence"]) + adj))
                        _db().table("anomalies").update({"confidence": new_conf}).eq("id", anomaly_ids[0]).execute()
                        logger.info(f"  Confianza ajustada {adj:+.2f} → {new_conf:.2f} (fuentes web: {len(web_ctx.get('sources', []))})")

                # Registrar estado de entidades fallecidas en metadata de anomalías
                deceased = {
                    name: info
                    for name, info in web_ctx.get("entity_statuses", {}).items()
                    if not info.get("active")
                }
                if deceased:
                    logger.warning(f"  Entidades inactivas/fallecidas detectadas: {list(deceased.keys())}")
            except Exception as web_err:
                logger.warning(f"  Web researcher falló (no crítico): {web_err}")

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

        # ── Paso 7: Generar post IA si confianza ≥ 85 % ────────────────────
        # Carga el registro actualizado de la anomalía para usar la confianza
        # ajustada por el web researcher antes de decidir si publicar.
        if anomaly_ids:
            try:
                row = _db().table("anomalies").select("*").eq("id", anomaly_ids[0]).single().execute()
                if row.data and float(row.data.get("confidence", 0)) >= 0.85:
                    post_id = maybe_generate_and_save_post(row.data)
                    if post_id:
                        logger.info(f"  Post IA generado: {post_id}")
            except Exception as post_err:
                logger.warning(f"  Post generator falló (no crítico): {post_err}")

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

    # ── Investigador Automático ────────────────────────────────────────────────
    # Después de procesar la cola, investigar las anomalías más importantes en profundidad
    if processed > 0:
        try:
            max_investigar = int(os.environ.get("MAX_INVESTIGACIONES_POR_RUN", "2"))
            informes = investigador_run(max_anomalias=max_investigar)
            logger.info(f"Investigador automático: {informes} informes generados")
        except Exception as inv_err:
            logger.warning(f"Investigador automático falló (no crítico): {inv_err}")

    # Exit code non-zero si hubo errores (para notificación en GitHub Actions)
    if errors > 0 and processed == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
