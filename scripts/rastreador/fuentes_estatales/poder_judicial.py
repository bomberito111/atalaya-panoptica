"""
ATALAYA PANÓPTICA — Scraper: Poder Judicial
Extrae causas relacionadas con corrupción, malversación y cohecho.
URL: https://www.pjud.cl/
Buscador público: https://oficinajudicialvirtual.pjud.cl/
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

SEARCH_URL = "https://oficinajudicialvirtual.pjud.cl/indexN.php"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
    "Accept": "text/html,application/xhtml+xml",
}

# Delitos de corrupción según Código Penal chileno
DELITOS_CORRUPCION = [
    "cohecho",
    "malversación de caudales públicos",
    "fraude al fisco",
    "negociación incompatible",
    "tráfico de influencias",
    "soborno",
    "apropiación indebida",
]


def search_causas(delito: str, tribunal_tipo: str = "TOP") -> list[dict]:
    """
    Busca causas por tipo de delito en el buscador público del Poder Judicial.
    Nota: Este buscador requiere formulario POST con CAPTCHA en algunos casos.
    Implementación básica para causas públicas.
    """
    SCRAPER_LIMITER.consume()

    # El buscador público del PJUD requiere interacción con formularios
    # Esta implementación busca en la sección de estadísticas públicas
    stats_url = "https://www.pjud.cl/documents/396543/0/Estadísticas+criminales.pdf"

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            # Intentar API de causas públicas (cuando está disponible)
            resp = client.get(
                "https://oficinajudicialvirtual.pjud.cl/causas/causasCivil.php",
                params={"delito": delito, "formato": "json"},
            )

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    return data.get("causas", [])
                except Exception:
                    pass

    except httpx.HTTPError as e:
        logger.debug(f"Búsqueda PJUD no disponible para {delito}: {e}")

    return []


def run():
    """
    Entry point del scraper del Poder Judicial.
    Nota: Cobertura limitada por CAPTCHA; se amplía en Fase 8.
    """
    logger.info("Poder Judicial: buscando causas de corrupción...")
    logger.warning("Cobertura limitada — PJUD requiere autenticación para búsquedas avanzadas.")

    all_items = []

    for delito in DELITOS_CORRUPCION[:3]:  # Limitado en Fase 1
        causas = search_causas(delito)
        logger.info(f"  '{delito}': {len(causas)} causas encontradas")

        for causa in causas:
            all_items.append({
                "source": "poder_judicial",
                "raw_text": f"""PODER JUDICIAL — CAUSA PENAL
Delito: {delito}
RIT: {causa.get('rit', '')}
Tribunal: {causa.get('tribunal', '')}
Estado: {causa.get('estado', '')}
Imputado: {causa.get('imputado', '')}
""",
                "source_url": causa.get("url"),
                "raw_metadata": {"delito": delito, "rit": causa.get("rit")},
                "priority": 1,  # Máxima prioridad: proceso judicial activo
            })
        polite_sleep(3.0, 5.0)

    inserted, dupes = enqueue_batch(all_items) if all_items else (0, 0)
    logger.info(f"Poder Judicial completado: {inserted} nuevas (cobertura básica)")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
