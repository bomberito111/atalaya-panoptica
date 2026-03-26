"""
ATALAYA PANÓPTICA — Scraper: Mercado Público
Extrae licitaciones públicas via API REST oficial de Mercado Público.
API docs: https://www.mercadopublico.cl/Procurement/Modules/RFB/Utils/AdvancedSearch.aspx

Requiere MERCADO_PUBLICO_TICKET (ticket de API gratuito — registrarse en mercadopublico.cl).
Si no está configurado, usa el feed RSS público como fallback.
"""

import os
import logging
import httpx
import feedparser
from datetime import datetime, timedelta
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import MERCADO_PUBLICO_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

BASE_URL = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"
RSS_URL = "https://www.mercadopublico.cl/Procurement/Modules/RFB/RSSFeed.aspx"

TICKET = os.environ.get("MERCADO_PUBLICO_TICKET", "")

# Tipos de licitación de mayor riesgo (montos altos)
HIGH_RISK_TYPES = ["L1", "LE", "LP", "LQ", "LR"]  # Licitaciones públicas grandes


def fetch_licitaciones_rss() -> list[dict]:
    """Fallback: obtiene licitaciones recientes via RSS público (sin ticket)."""
    try:
        feed = feedparser.parse(RSS_URL)
        items = []
        for entry in feed.entries[:50]:
            items.append({
                "CodigoExterno": entry.get("id", ""),
                "Nombre": entry.get("title", ""),
                "Estado": "publicada",
                "NombreOrganismo": entry.get("author", ""),
                "Descripcion": entry.get("summary", ""),
                "FechaPublicacion": entry.get("published", ""),
                "link": entry.get("link", ""),
            })
        logger.info(f"RSS Mercado Público: {len(items)} licitaciones (sin ticket)")
        return items
    except Exception as e:
        logger.warning(f"RSS Mercado Público falló: {e}")
        return []


def fetch_licitaciones(fecha_desde: str, fecha_hasta: str, tipo: str = "L1") -> list[dict]:
    """
    Consulta licitaciones entre dos fechas via API (requiere ticket).
    Sin ticket: devuelve lista vacía silenciosamente.

    Args:
        fecha_desde: Formato DD-MM-AAAA
        fecha_hasta: Formato DD-MM-AAAA
        tipo: Tipo de licitación (L1=grandes, LE=pequeñas, etc.)

    Returns:
        Lista de licitaciones como dicts
    """
    if not TICKET:
        return []  # Sin ticket la API devuelve 400 — saltar silenciosamente

    params = {
        "ticket": TICKET,
        "fecha": fecha_desde,
        "fechaFin": fecha_hasta,
        "tipo": tipo,
        "estado": "todos",
        "pagina": 1,
    }

    licitaciones = []

    with httpx.Client(timeout=30) as client:
        while True:
            MERCADO_PUBLICO_LIMITER.consume()
            try:
                resp = client.get(BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

                items = data.get("Listado", [])
                if not items:
                    break

                licitaciones.extend(items)
                logger.info(f"Página {params['pagina']}: {len(items)} licitaciones")

                # Paginación
                if len(items) < 1000:  # API retorna max 1000 por página
                    break
                params["pagina"] += 1
                polite_sleep(1.0, 2.0)

            except httpx.HTTPError as e:
                logger.error(f"Error HTTP Mercado Público: {e}")
                break

    return licitaciones


def licitacion_to_text(lic: dict) -> str:
    """Convierte una licitación a texto enriquecido para análisis IA."""
    return f"""LICITACIÓN PÚBLICA
Código: {lic.get('CodigoExterno', 'N/A')}
Nombre: {lic.get('Nombre', '')}
Estado: {lic.get('Estado', '')}
Organismo: {lic.get('Nombre', '')} — {lic.get('NombreOrganismo', '')}
Unidad: {lic.get('NombreUnidad', '')}
Tipo: {lic.get('Tipo', '')}
Monto estimado: {lic.get('MontoEstimado', 'No indicado')}
Fecha publicación: {lic.get('FechaPublicacion', '')}
Fecha cierre: {lic.get('FechaCierre', '')}
Descripción: {lic.get('Descripcion', '')}
Adjudicatario: {lic.get('NombreAdjudicatario', 'Sin adjudicar')}
RUT Adjudicatario: {lic.get('RutAdjudicatario', '')}
Monto adjudicado: {lic.get('MontoAdjudicado', '')}
"""


def run(days_back: int = 1):
    """
    Entry point del scraper de Mercado Público.
    Con ticket: usa API REST con filtros por fecha/tipo.
    Sin ticket: usa RSS feed público como fallback.
    """
    if not TICKET:
        logger.warning("MERCADO_PUBLICO_TICKET no configurado — usando RSS feed como fallback")
        rss_items = fetch_licitaciones_rss()
        all_items = []
        for lic in rss_items:
            url = lic.get("link") or f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={lic.get('CodigoExterno', '')}"
            all_items.append({
                "source": "mercado_publico",
                "raw_text": licitacion_to_text(lic),
                "source_url": url,
                "raw_metadata": {"tipo": "RSS", "organismo": lic.get("NombreOrganismo"), "fecha": lic.get("FechaPublicacion")},
                "priority": 4,
            })
        inserted, dupes = enqueue_batch(all_items)
        logger.info(f"Mercado Público RSS: {inserted} nuevas, {dupes} duplicadas")
        return

    fecha_hasta = datetime.now()
    fecha_desde = fecha_hasta - timedelta(days=days_back)

    fecha_desde_str = fecha_desde.strftime("%d-%m-%Y")
    fecha_hasta_str = fecha_hasta.strftime("%d-%m-%Y")

    logger.info(f"Mercado Público: buscando licitaciones {fecha_desde_str} → {fecha_hasta_str}")

    all_items = []

    for tipo in HIGH_RISK_TYPES:
        licitaciones = fetch_licitaciones(fecha_desde_str, fecha_hasta_str, tipo)
        logger.info(f"  Tipo {tipo}: {len(licitaciones)} licitaciones")

        for lic in licitaciones:
            codigo = lic.get("CodigoExterno", "")
            url = f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={codigo}"

            all_items.append({
                "source": "mercado_publico",
                "raw_text": licitacion_to_text(lic),
                "source_url": url,
                "raw_metadata": {
                    "codigo": codigo,
                    "tipo": tipo,
                    "estado": lic.get("Estado"),
                    "organismo": lic.get("NombreOrganismo"),
                    "monto": lic.get("MontoEstimado"),
                    "fecha": lic.get("FechaPublicacion"),
                },
                "priority": 2 if lic.get("MontoAdjudicado") else 4,
            })

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Mercado Público completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run(days_back=1)
