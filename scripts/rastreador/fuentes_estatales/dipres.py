"""
ATALAYA PANÓPTICA — Scraper: DIPRES
Dirección de Presupuestos — extrae datos de ejecución presupuestaria.
URL: https://www.dipres.gob.cl/
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

EJECUCION_URL = "https://www.dipres.gob.cl/598/w3-propertyvalue-15554.html"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)"}


def fetch_ejecucion_presupuestaria() -> list[dict]:
    """Extrae informes de ejecución presupuestaria mensual."""
    SCRAPER_LIMITER.consume()

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(EJECUCION_URL)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            items = []
            for link in soup.find_all("a", href=True):
                href = link["href"]
                texto = link.get_text(strip=True)

                if any(kw in texto.lower() for kw in ["ejecución", "presupuesto", "gasto", "informe"]):
                    url = href if href.startswith("http") else f"https://www.dipres.gob.cl{href}"
                    items.append({
                        "titulo": texto,
                        "url": url,
                    })

            return items[:20]  # Limitar a últimos 20 informes

    except httpx.HTTPError as e:
        logger.error(f"Error HTTP DIPRES: {e}")
        return []


def item_to_text(item: dict) -> str:
    return f"""DIPRES — EJECUCIÓN PRESUPUESTARIA
Título: {item.get('titulo', '')}
URL Informe: {item.get('url', '')}
Nota: Informe oficial de DIPRES sobre ejecución del presupuesto de la nación.
Requiere análisis de anomalías en patrones de gasto por institución.
"""


def run():
    logger.info("DIPRES: extrayendo informes de ejecución presupuestaria...")
    items = fetch_ejecucion_presupuestaria()
    logger.info(f"  Encontrados {len(items)} informes")

    queue_items = [
        {
            "source": "dipres",
            "raw_text": item_to_text(item),
            "source_url": item.get("url"),
            "raw_metadata": {"titulo": item.get("titulo")},
            "priority": 3,
        }
        for item in items
    ]

    inserted, dupes = enqueue_batch(queue_items)
    logger.info(f"DIPRES completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
