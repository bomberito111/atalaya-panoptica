"""
ATALAYA PANÓPTICA — Scraper: Contraloría General de la República
Extrae resoluciones y dictámenes recientes via scraping de buscador público.
URL: https://www.contraloria.cl/
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

SEARCH_URL = "https://obtienearchivo.bcn.cl/obtienearchivo"
DICTAMENES_URL = "https://www.contraloria.cl/web/cgr/buscar-dictamenes"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
    "Accept-Language": "es-CL,es;q=0.9",
}

KEYWORDS = [
    "licitación", "contrato", "adjudicación", "gasto", "irregularidad",
    "malversación", "conflicto de interés", "subdirección", "municipalidad",
]


def fetch_dictamenes_recientes(page: int = 1) -> list[dict]:
    """Obtiene dictámenes recientes de la Contraloría."""
    SCRAPER_LIMITER.consume()

    params = {
        "p_p_id": "contraloriabuscardictamenes_WAR_contraloriabuscardictamenesportlet",
        "p_p_lifecycle": "2",
        "p_p_resource_id": "buscarDictamenes",
        "numeroPagina": page,
        "cantidadPorPagina": 20,
    }

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(DICTAMENES_URL, params=params)
            resp.raise_for_status()

            # Intentar parsear como JSON (API interna)
            try:
                data = resp.json()
                return data.get("dictamenes", data.get("results", []))
            except Exception:
                # Si no es JSON, parsear HTML
                soup = BeautifulSoup(resp.text, "lxml")
                return _parse_html_dictamenes(soup)

    except httpx.HTTPError as e:
        logger.error(f"Error HTTP Contraloría: {e}")
        return []


def _parse_html_dictamenes(soup: BeautifulSoup) -> list[dict]:
    """Parsea resultados HTML de búsqueda de dictámenes."""
    items = []
    results = soup.select(".resultado-dictamen, .dictamen-item, article.dictamen")

    for item in results:
        try:
            titulo = item.select_one("h2, h3, .titulo")
            fecha = item.select_one(".fecha, time")
            descripcion = item.select_one("p, .descripcion, .resumen")
            link = item.select_one("a[href]")

            items.append({
                "titulo": titulo.get_text(strip=True) if titulo else "",
                "fecha": fecha.get_text(strip=True) if fecha else "",
                "descripcion": descripcion.get_text(strip=True) if descripcion else "",
                "url": link["href"] if link else "",
            })
        except Exception as e:
            logger.debug(f"Error parseando dictamen: {e}")

    return items


def dictamen_to_text(d: dict) -> str:
    """Convierte dictamen a texto para análisis IA."""
    return f"""DICTAMEN CONTRALORÍA GENERAL DE LA REPÚBLICA
Título: {d.get('titulo', d.get('Titulo', ''))}
Fecha: {d.get('fecha', d.get('Fecha', ''))}
Número: {d.get('numero', d.get('Numero', ''))}
Organismo afectado: {d.get('organismo', d.get('Organismo', ''))}
Resumen: {d.get('descripcion', d.get('Resumen', d.get('texto', '')))}
"""


def run(max_pages: int = 5):
    """Entry point del scraper de Contraloría."""
    logger.info("Contraloría: extrayendo dictámenes recientes...")

    all_items = []

    for page in range(1, max_pages + 1):
        dictamenes = fetch_dictamenes_recientes(page)

        if not dictamenes:
            logger.info(f"  Página {page}: sin resultados, deteniendo")
            break

        logger.info(f"  Página {page}: {len(dictamenes)} dictámenes")

        for d in dictamenes:
            url = d.get("url", d.get("URL", d.get("enlace", "")))
            if url and not url.startswith("http"):
                url = f"https://www.contraloria.cl{url}"

            all_items.append({
                "source": "contraloria",
                "raw_text": dictamen_to_text(d),
                "source_url": url or None,
                "raw_metadata": {
                    "numero": d.get("numero", d.get("Numero")),
                    "fecha": d.get("fecha", d.get("Fecha")),
                    "organismo": d.get("organismo", d.get("Organismo")),
                },
                "priority": 2,  # Alta prioridad: fuente oficial de fiscalización
            })

        polite_sleep(2.0, 4.0)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Contraloría completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
