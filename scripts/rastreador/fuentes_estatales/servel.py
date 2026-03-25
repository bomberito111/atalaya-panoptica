"""
ATALAYA PANÓPTICA — Scraper: SERVEL
Extrae datos de financiamiento electoral y declaraciones patrimoniales.
URL: https://www.servel.cl/
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

FINANCIAMIENTO_URL = "https://www.servel.cl/financiamiento-electoral/"
DECLARACIONES_URL = "https://www.servel.cl/declaraciones-juradas/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
}


def fetch_financiamiento_page() -> list[dict]:
    """Extrae aportes y gastos de campañas electorales."""
    SCRAPER_LIMITER.consume()

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(FINANCIAMIENTO_URL)
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, "lxml")
            items = []

            # Buscar links a informes de financiamiento
            links = soup.find_all("a", href=True)
            for link in links:
                href = link["href"]
                texto = link.get_text(strip=True)

                if any(kw in texto.lower() for kw in ["financiamiento", "aporte", "gasto", "campaña", "electoral"]):
                    if href.endswith((".pdf", ".xlsx", ".xls")):
                        # Solo referenciar, no descargar (regla Cero Multimedia)
                        items.append({
                            "titulo": texto,
                            "url": href if href.startswith("http") else f"https://www.servel.cl{href}",
                            "tipo": "documento_financiamiento",
                        })

            return items

    except httpx.HTTPError as e:
        logger.error(f"Error HTTP SERVEL: {e}")
        return []


def item_to_text(item: dict) -> str:
    """Convierte ítem SERVEL a texto para análisis IA."""
    return f"""SERVEL — FINANCIAMIENTO ELECTORAL
Tipo: {item.get('tipo', '')}
Título: {item.get('titulo', '')}
Período: {item.get('periodo', 'No especificado')}
Candidato/Partido: {item.get('candidato', item.get('partido', 'No especificado'))}
Monto aportado: {item.get('monto', 'Ver documento')}
Donante: {item.get('donante', 'Ver documento')}
RUT donante: {item.get('rut_donante', '')}
Fuente: {item.get('url', '')}
Nota: Documento de referencia en formato PDF/Excel — análisis de texto disponible en URL.
"""


def run():
    """Entry point del scraper de SERVEL."""
    logger.info("SERVEL: extrayendo datos de financiamiento electoral...")

    items = fetch_financiamiento_page()
    logger.info(f"  Encontrados {len(items)} documentos de financiamiento")

    queue_items = []
    for item in items:
        queue_items.append({
            "source": "servel",
            "raw_text": item_to_text(item),
            "source_url": item.get("url"),
            "raw_metadata": {
                "tipo": item.get("tipo"),
                "titulo": item.get("titulo"),
            },
            "priority": 2,
        })

    inserted, dupes = enqueue_batch(queue_items)
    logger.info(f"SERVEL completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
