"""
ATALAYA PANÓPTICA — Scraper: SINIM
Sistema Nacional de Información Municipal — gastos e ingresos municipales.
URL: https://datos.sinim.gov.cl/
"""

import logging
import httpx
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER

logger = logging.getLogger(__name__)

API_URL = "https://datos.sinim.gov.cl/data/sinim"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0)"}

# Variables de gasto con mayor potencial de corrupción
VARIABLES_CRITICAS = [
    "GASTOS_BIENES_SERVICIOS",
    "GASTO_PERSONAL",
    "GASTOS_TRANSFERENCIAS",
    "INVERSION_REAL",
]


def fetch_sinim_data(variable: str, anio: int = 2023) -> list[dict]:
    """Obtiene datos SINIM para una variable e indicador."""
    SCRAPER_LIMITER.consume()

    params = {
        "variable": variable,
        "anio": anio,
        "formato": "json",
    }

    try:
        with httpx.Client(timeout=30, headers=HEADERS) as client:
            resp = client.get(API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else data.get("datos", [])
    except Exception as e:
        logger.error(f"Error SINIM {variable}: {e}")
        return []


def record_to_text(r: dict, variable: str) -> str:
    return f"""SINIM — DATO MUNICIPAL
Variable: {variable}
Municipio: {r.get('nombre_municipio', r.get('municipio', ''))}
Región: {r.get('region', '')}
Año: {r.get('anio', '')}
Valor: {r.get('valor', r.get('monto', ''))}
Código municipio: {r.get('codigo', '')}
"""


def run(anio: int = 2023):
    logger.info(f"SINIM: extrayendo datos municipales año {anio}...")

    all_items = []
    for variable in VARIABLES_CRITICAS:
        records = fetch_sinim_data(variable, anio)
        logger.info(f"  {variable}: {len(records)} municipios")

        for r in records:
            all_items.append({
                "source": "sinim",
                "raw_text": record_to_text(r, variable),
                "source_url": f"https://datos.sinim.gov.cl/data/sinim?variable={variable}&anio={anio}",
                "raw_metadata": {"variable": variable, "anio": anio, "municipio": r.get("nombre_municipio")},
                "priority": 5,
            })

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"SINIM completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
