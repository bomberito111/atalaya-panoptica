"""
ATALAYA PANÓPTICA — Fix retroactivo de fechas
Actualiza anomalías existentes que tienen evidence.fecha_evento == null o ""
buscando la fecha real de publicación en la investigation_queue correspondiente.

Ejecutar UNA vez para arreglar datos históricos:
  python -m scripts.detective.fix_fechas

También puede ejecutarse periódicamente para arreglar items nuevos que
llegaron sin fecha antes de que el fix de normalize_event_date estuviera activo.
"""

import logging
import os
from dotenv import load_dotenv
from dateutil import parser as dateutil_parser
from scripts.utils.supabase_client import get_client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fix_fechas")


def normalize_date(raw: str) -> str:
    """Normaliza cualquier formato de fecha a YYYY-MM-DD."""
    if not raw or not isinstance(raw, str):
        return ""
    raw = raw.strip()
    if not raw or len(raw) < 4:
        return ""
    # Ya es YYYY-MM-DD
    if len(raw) >= 10 and raw[4:5] == "-" and raw[7:8] == "-":
        return raw[:10]
    try:
        return dateutil_parser.parse(raw, ignoretz=True).strftime("%Y-%m-%d")
    except Exception:
        return ""


def extract_date_from_text(text: str) -> str:
    """
    Intenta extraer una fecha del texto de la noticia.
    Busca patrones como:
    - "14 de marzo de 2024"
    - "14/03/2024"
    - "2024-03-14"
    - Palabras como "publicado el", "fecha:", etc.
    """
    import re

    # Meses en español
    MESES = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
        "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
        "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
        "ene": 1, "feb": 2, "mar": 3, "abr": 4,
        "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
    }

    # Buscar "DD de Mes de YYYY" o "DD Mes YYYY"
    pat = r'(\d{1,2})\s+de\s+(' + '|'.join(MESES.keys()) + r')\s+(?:de\s+)?(\d{4})'
    m = re.search(pat, text.lower())
    if m:
        try:
            d, mes_str, y = int(m.group(1)), m.group(2), int(m.group(3))
            mes = MESES.get(mes_str, 0)
            if mes and 2015 <= y <= 2026 and 1 <= d <= 31:
                return f"{y:04d}-{mes:02d}-{d:02d}"
        except Exception:
            pass

    # Buscar "Publicado: DD/MM/YYYY" o "DD/MM/YYYY"
    pat2 = r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})'
    for m2 in re.finditer(pat2, text):
        try:
            d, mo, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
            if 2015 <= y <= 2026 and 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{y:04d}-{mo:02d}-{d:02d}"
        except Exception:
            pass

    # Buscar ISO en texto
    pat3 = r'(\d{4}-\d{2}-\d{2})'
    m3 = re.search(pat3, text)
    if m3:
        return m3.group(1)

    return ""


def fix_anomaly_dates(batch_size: int = 100) -> tuple[int, int]:
    """
    Busca anomalías sin fecha de evento y las arregla.
    Returns: (arregladas, sin_fecha_disponible)
    """
    db = get_client()
    arregladas = 0
    sin_fecha = 0

    # 1. Obtener anomalías sin fecha_evento o con fecha vacía
    # Filtramos con evidence->>'fecha_evento' IS NULL
    logger.info("Buscando anomalías sin fecha de evento...")

    resp = db.table("anomalies").select("id, evidence, queue_item_id, created_at").eq("status", "activa").limit(batch_size * 3).execute()

    if not resp.data:
        logger.info("No hay anomalías para procesar")
        return 0, 0

    # Filtrar las que tienen fecha_evento vacía o nula
    sin_fecha_ev = [
        a for a in resp.data
        if not (a.get("evidence") or {}).get("fecha_evento")
    ]

    logger.info(f"Anomalías sin fecha_evento: {len(sin_fecha_ev)} de {len(resp.data)} totales")

    # Obtener todos los queue_item_ids únicos
    queue_ids = list({
        a["queue_item_id"]
        for a in sin_fecha_ev
        if a.get("queue_item_id")
    })

    # 2. Cargar los queue items en batch
    queue_map: dict[str, dict] = {}
    if queue_ids:
        # Supabase limita a ~100 en un in() — hacemos chunks
        for i in range(0, len(queue_ids), 50):
            chunk = queue_ids[i:i+50]
            qr = db.table("investigation_queue").select("id, raw_metadata, raw_text, created_at").in_("id", chunk).execute()
            for qi in (qr.data or []):
                queue_map[qi["id"]] = qi

    logger.info(f"Queue items encontrados: {len(queue_map)}")

    # 3. Para cada anomalía sin fecha, intentar encontrar la fecha real
    for anomalia in sin_fecha_ev[:batch_size]:
        aid = anomalia["id"]
        evidence = dict(anomalia.get("evidence") or {})
        queue_item_id = anomalia.get("queue_item_id")
        fallback_date = anomalia.get("created_at", "")[:10]  # día en que el Detective procesó

        fecha_encontrada = ""

        # Intento 1: buscar en raw_metadata del queue item
        if queue_item_id and queue_item_id in queue_map:
            qi = queue_map[queue_item_id]
            meta = qi.get("raw_metadata") or {}
            raw_date = (
                meta.get("published")
                or meta.get("fecha")
                or meta.get("fecha_publicacion")
                or meta.get("date")
                or ""
            )
            fecha_encontrada = normalize_date(str(raw_date)) if raw_date else ""

            # Intento 2: extraer del raw_text del queue item
            if not fecha_encontrada:
                raw_text = qi.get("raw_text", "") or ""
                fecha_encontrada = extract_date_from_text(raw_text)

        # Intento 3: extraer del texto de evidencia que ya tenemos
        if not fecha_encontrada:
            texto_ev = evidence.get("texto", "") or ""
            fecha_encontrada = extract_date_from_text(texto_ev)

        # Intento 4: extraer de la description de la anomalía
        if not fecha_encontrada:
            desc = anomalia.get("description", "") or ""
            fecha_encontrada = extract_date_from_text(desc)

        if fecha_encontrada:
            # Validar que no sea una fecha futura o muy antigua
            try:
                from datetime import datetime, date
                d = datetime.strptime(fecha_encontrada, "%Y-%m-%d").date()
                if date(2015, 1, 1) <= d <= date.today():
                    evidence["fecha_evento"] = fecha_encontrada
                    db.table("anomalies").update({"evidence": evidence}).eq("id", aid).execute()
                    logger.info(f"  ✅ {aid[:8]}… → fecha_evento = {fecha_encontrada}")
                    arregladas += 1
                else:
                    logger.warning(f"  ⏭ {aid[:8]}… fecha fuera de rango: {fecha_encontrada}")
                    sin_fecha += 1
            except Exception as e:
                logger.error(f"  ❌ {aid[:8]}… error: {e}")
                sin_fecha += 1
        else:
            # Sin fecha disponible — no usamos fallback para no mostrar fecha incorrecta
            # Marcamos explícitamente como None para que el frontend muestre "Fecha no disponible"
            evidence["fecha_evento"] = None
            db.table("anomalies").update({"evidence": evidence}).eq("id", aid).execute()
            logger.debug(f"  ⚪ {aid[:8]}… sin fecha encontrada (marcado explícitamente como null)")
            sin_fecha += 1

    return arregladas, sin_fecha


def run():
    logger.info("=== Fix retroactivo de fechas de eventos ===")
    arregladas, sin_fecha = fix_anomaly_dates(batch_size=200)
    logger.info(f"\nResultado: {arregladas} fechas arregladas, {sin_fecha} sin fecha disponible")
    return arregladas


if __name__ == "__main__":
    run()
