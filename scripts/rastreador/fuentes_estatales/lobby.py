"""
ATALAYA PANÓPTICA — Scraper: Registro de Lobby
Extrae audiencias y reuniones del Registro de Lobby chileno.
URL: https://www.lobbying.cl/
API pública disponible en JSON.
"""

import logging
import httpx
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

BASE_URL = "https://www.lobbying.cl/public/listado_audiencias.php"
API_URL = "https://www.lobbying.cl/cgi_AudienciasBuscar/index.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
}


def fetch_audiencias(page: int = 1, por_pagina: int = 50) -> list[dict]:
    """Obtiene audiencias del Registro de Lobby."""
    SCRAPER_LIMITER.consume()

    params = {
        "pagina": page,
        "cantidad": por_pagina,
        "formato": "json",
    }

    try:
        with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(API_URL, params=params)
            resp.raise_for_status()

            try:
                return resp.json().get("audiencias", resp.json() if isinstance(resp.json(), list) else [])
            except Exception:
                logger.warning("Respuesta de lobby.cl no es JSON, intentando HTML")
                return []

    except httpx.HTTPError as e:
        logger.error(f"Error HTTP Lobby: {e}")
        return []


def audiencia_to_text(a: dict) -> str:
    """Convierte audiencia a texto para análisis IA."""
    return f"""REGISTRO DE LOBBY — AUDIENCIA OFICIAL
Fecha: {a.get('fecha', a.get('FechaAudiencia', ''))}
Sujeto pasivo (funcionario): {a.get('sujeto_pasivo', a.get('NombreSujetoPasivo', ''))}
Cargo: {a.get('cargo', a.get('CargoSujetoPasivo', ''))}
Institución: {a.get('institucion', a.get('NombreInstitucion', ''))}
Solicitante (lobbista): {a.get('solicitante', a.get('NombreSolicitante', ''))}
RUT solicitante: {a.get('rut_solicitante', '')}
Materia tratada: {a.get('materia', a.get('Materia', ''))}
Lugar: {a.get('lugar', '')}
Resultado: {a.get('resultado', '')}
"""


def run(max_pages: int = 10):
    """Entry point del scraper de Lobby."""
    logger.info("Registro de Lobby: extrayendo audiencias...")

    all_items = []

    for page in range(1, max_pages + 1):
        audiencias = fetch_audiencias(page)

        if not audiencias:
            logger.info(f"  Página {page}: sin datos, deteniendo")
            break

        logger.info(f"  Página {page}: {len(audiencias)} audiencias")

        for a in audiencias:
            audiencia_id = a.get("id", a.get("IdAudiencia", ""))
            url = f"https://www.lobbying.cl/public/detalle_audiencia.php?id={audiencia_id}" if audiencia_id else None

            all_items.append({
                "source": "lobby",
                "raw_text": audiencia_to_text(a),
                "source_url": url,
                "raw_metadata": {
                    "id": audiencia_id,
                    "fecha": a.get("fecha", a.get("FechaAudiencia")),
                    "institucion": a.get("institucion", a.get("NombreInstitucion")),
                    "sujeto_pasivo": a.get("sujeto_pasivo", a.get("NombreSujetoPasivo")),
                },
                "priority": 3,  # Alta: relaciones directas político-privado
            })

        polite_sleep(1.5, 3.0)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Lobby completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
