"""
ATALAYA PANÓPTICA — Scraper: Ley de Transparencia
Extrae solicitudes y respuestas de transparencia activa/pasiva.
URL: https://www.portaltransparencia.cl/
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

PORTAL_URL = "https://www.portaltransparencia.cl/PortalPdT/directorio-de-organismos-regulados"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)"}


def fetch_transparencia_activa(organismo_url: str) -> list[dict]:
    """Extrae datos de transparencia activa de un organismo."""
    SCRAPER_LIMITER.consume()

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(organismo_url)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            items = []
            # Buscar tablas de contratos, transferencias, personal
            tables = soup.find_all("table")
            for table in tables[:3]:  # Limitar a primeras 3 tablas
                rows = table.find_all("tr")
                headers_row = rows[0].find_all(["th", "td"]) if rows else []
                col_names = [h.get_text(strip=True) for h in headers_row]

                for row in rows[1:6]:  # Max 5 filas por tabla
                    cells = row.find_all("td")
                    if cells:
                        row_data = dict(zip(col_names, [c.get_text(strip=True) for c in cells]))
                        items.append({
                            "datos": row_data,
                            "url": organismo_url,
                        })

            return items

    except httpx.HTTPError as e:
        logger.error(f"Error HTTP Transparencia: {e}")
        return []


def item_to_text(item: dict) -> str:
    datos = item.get("datos", {})
    datos_str = "\n".join(f"  {k}: {v}" for k, v in datos.items())
    return f"""LEY DE TRANSPARENCIA — DATO PUBLICADO
URL organismo: {item.get('url', '')}
Datos:
{datos_str}
"""


def run():
    """Entry point básico de Transparencia (organismos principales)."""
    logger.info("Transparencia: extrayendo datos de organismos prioritarios...")

    # Organismos de alta prioridad para anticorrupción
    organismos = [
        "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MH001&anio=2024",
        "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MI001&anio=2024",
        "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MOP01&anio=2024",
    ]

    all_items = []
    for url in organismos:
        items = fetch_transparencia_activa(url)
        for item in items:
            all_items.append({
                "source": "transparencia",
                "raw_text": item_to_text(item),
                "source_url": url,
                "raw_metadata": {"url_organismo": url},
                "priority": 3,
            })
        polite_sleep(2.0, 4.0)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Transparencia completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
