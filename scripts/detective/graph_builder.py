"""
ATALAYA PANÓPTICA — Constructor de Grafo
Crea y actualiza nodos y aristas en Supabase a partir de entidades y relaciones.
Implementa UPSERT para evitar duplicados y actualizar risk_score.
"""

import logging
from typing import Optional
from scripts.utils.supabase_client import upsert, insert, select_one
from scripts.utils.text_cleaner import normalize_name, normalize_rut

logger = logging.getLogger(__name__)

# Mapeo de tipos de entidad a node_type en BD
ENTITY_TYPE_MAP = {
    "persona": "persona",
    "empresa": "empresa",
    "contrato": "contrato",
    "institucion": "institucion",
    "cuenta_social": "cuenta_social",
}

# Mapeo de relaciones del extractor a relation_type en BD
RELATION_TYPE_MAP = {
    "firmó_contrato": "firmó_contrato",
    "es_socio_de": "es_socio_de",
    "lobbió_a": "lobbió_a",
    "financió_campaña": "financió_campaña",
    "trabaja_en": "trabaja_en",
    "es_familiar_de": "es_familiar_de",
    "adjudicó_a": "adjudicó_a",
    "es_director_de": "es_director_de",
    "recibió_transferencia": "recibió_transferencia",
}


def upsert_node(
    node_type: str,
    canonical_name: str,
    rut: str = None,
    aliases: list[str] = None,
    metadata: dict = None,
    risk_score_increment: float = 0.0,
) -> Optional[str]:
    """
    Crea o actualiza un nodo en el grafo.

    Returns:
        UUID del nodo, o None si falla.
    """
    canonical_name = normalize_name(canonical_name)
    if not canonical_name:
        return None

    rut_normalized = normalize_rut(rut) if rut else None

    # Buscar nodo existente por RUT o nombre+tipo
    existing = None
    if rut_normalized:
        existing = select_one("nodes", filters={"rut": rut_normalized})
    if not existing:
        existing = select_one(
            "nodes",
            filters={"node_type": node_type, "canonical_name": canonical_name},
        )

    if existing:
        # Actualizar risk_score y aliases
        new_score = min(1.0, existing.get("risk_score", 0.0) + risk_score_increment)
        new_aliases = list(set((existing.get("aliases") or []) + (aliases or [])))

        try:
            result = upsert(
                "nodes",
                {
                    "id": existing["id"],
                    "risk_score": new_score,
                    "aliases": new_aliases,
                    "metadata": {**(existing.get("metadata") or {}), **(metadata or {})},
                },
                on_conflict="id",
            )
            return existing["id"]
        except Exception as e:
            logger.error(f"Error actualizando nodo {canonical_name}: {e}")
            return existing["id"]

    # Crear nuevo nodo
    node_data = {
        "node_type": node_type,
        "canonical_name": canonical_name,
        "rut": rut_normalized,
        "aliases": aliases or [],
        "metadata": metadata or {},
        "risk_score": risk_score_increment,
    }

    try:
        result = insert("nodes", node_data)
        node_id = result[0]["id"]
        logger.info(f"Nuevo nodo: [{node_type}] {canonical_name}")
        return node_id
    except Exception as e:
        logger.error(f"Error creando nodo {canonical_name}: {e}")
        return None


def upsert_edge(
    source_id: str,
    target_id: str,
    relation_type: str,
    evidence_url: str = None,
    evidence_text: str = None,
    weight: float = 1.0,
    queue_item_id: str = None,
) -> Optional[str]:
    """
    Crea una arista entre dos nodos.

    Returns:
        UUID de la arista, o None si falla.
    """
    if not source_id or not target_id:
        return None

    edge_data = {
        "source_node_id": source_id,
        "target_node_id": target_id,
        "relation_type": RELATION_TYPE_MAP.get(relation_type, relation_type),
        "weight": weight,
        "evidence_url": evidence_url,
        "evidence_text": (evidence_text or "")[:500],
        "queue_item_id": queue_item_id,
    }

    try:
        # UPSERT por unicidad source+target+relation_type
        result = upsert(
            "edges",
            edge_data,
            on_conflict="source_node_id,target_node_id,relation_type",
        )
        return result[0]["id"] if result else None
    except Exception as e:
        logger.warning(f"Edge ya existe o error: {e}")
        return None


def process_entities_and_relations(
    entities: dict,
    relations: list[dict],
    source_url: str = None,
    queue_item_id: str = None,
) -> dict:
    """
    Procesa entidades y relaciones del extractor y las persiste en Supabase.

    Returns:
        Dict con contadores: {nodes_created, nodes_updated, edges_created}
    """
    node_registry = {}  # nombre → UUID para construir aristas
    stats = {"nodes_created": 0, "nodes_updated": 0, "edges_created": 0}

    # Procesar personas
    for persona in entities.get("personas", []):
        nombre = persona.get("nombre", "")
        if not nombre:
            continue

        node_id = upsert_node(
            node_type="persona",
            canonical_name=nombre,
            rut=persona.get("rut"),
            metadata={
                "cargo": persona.get("cargo"),
                "institucion": persona.get("institucion"),
                "rol": persona.get("rol_en_documento"),
            },
        )
        if node_id:
            node_registry[nombre.lower()] = node_id
            stats["nodes_created"] += 1

    # Procesar empresas
    for empresa in entities.get("empresas", []):
        nombre = empresa.get("nombre", "")
        if not nombre:
            continue

        node_id = upsert_node(
            node_type="empresa",
            canonical_name=nombre,
            rut=empresa.get("rut"),
            metadata={
                "tipo": empresa.get("tipo"),
                "rol": empresa.get("rol_en_documento"),
            },
        )
        if node_id:
            node_registry[nombre.lower()] = node_id
            stats["nodes_created"] += 1

    # Procesar instituciones
    for inst in entities.get("instituciones", []):
        nombre = inst.get("nombre", "")
        if not nombre:
            continue

        node_id = upsert_node(
            node_type="institucion",
            canonical_name=nombre,
            metadata={"tipo": inst.get("tipo")},
        )
        if node_id:
            node_registry[nombre.lower()] = node_id

    # Procesar contratos
    for contrato in entities.get("contratos", []):
        codigo = contrato.get("codigo") or contrato.get("descripcion", "")[:50]
        if not codigo:
            continue

        node_id = upsert_node(
            node_type="contrato",
            canonical_name=codigo,
            metadata={
                "monto_clp": contrato.get("monto_clp"),
                "estado": contrato.get("estado"),
                "fecha": contrato.get("fecha"),
                "source_url": source_url,
            },
        )
        if node_id:
            node_registry[codigo.lower()] = node_id

    # Crear aristas entre nodos
    for rel in relations:
        sujeto = rel.get("sujeto", "").lower()
        objeto = rel.get("objeto", "").lower()
        relation_type = rel.get("relacion", "relacionado_con")
        confianza = rel.get("confianza", 0.5)

        source_id = node_registry.get(sujeto)
        target_id = node_registry.get(objeto)

        # Búsqueda fuzzy si no hay match exacto
        if not source_id:
            for key in node_registry:
                if sujeto[:8] in key or key[:8] in sujeto:
                    source_id = node_registry[key]
                    break

        if not target_id:
            for key in node_registry:
                if objeto[:8] in key or key[:8] in objeto:
                    target_id = node_registry[key]
                    break

        if source_id and target_id:
            edge_id = upsert_edge(
                source_id=source_id,
                target_id=target_id,
                relation_type=relation_type,
                evidence_url=source_url,
                evidence_text=rel.get("evidencia", ""),
                weight=confianza,
                queue_item_id=queue_item_id,
            )
            if edge_id:
                stats["edges_created"] += 1
        else:
            logger.debug(f"No se encontraron nodos para relación: {rel.get('sujeto')} → {rel.get('objeto')}")

    logger.info(
        f"Grafo actualizado: {stats['nodes_created']} nodos, {stats['edges_created']} aristas"
    )
    return stats
