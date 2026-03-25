"""
ATALAYA PANÓPTICA — Scraper: SII (Servicio de Impuestos Internos)
Extrae información pública de empresas: tipo, estado, representantes.
URL: https://zeus.sii.cl/cvc/stc/stc.html (consulta RUT)
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

CONSULTA_RUT_URL = "https://zeus.sii.cl/cvc_cgi/stc/getstc"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
    "Referer": "https://zeus.sii.cl/cvc/stc/stc.html",
}


def consultar_rut(rut: str) -> dict:
    """
    Consulta información pública de un RUT en el SII.

    Args:
        rut: RUT sin puntos ni guión (ej: '123456780')

    Returns:
        dict con nombre, actividad, región, estado
    """
    SCRAPER_LIMITER.consume()

    # Limpiar RUT
    rut_clean = rut.replace(".", "").replace("-", "")
    if len(rut_clean) < 2:
        return {}

    body = rut_clean[:-1]
    dv = rut_clean[-1].upper()

    try:
        with httpx.Client(timeout=20, headers=HEADERS) as client:
            resp = client.post(
                CONSULTA_RUT_URL,
                data={"RUT": body, "DV": dv, "PRG": "STC", "OPC": "NOR"},
            )
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            result = {"rut": rut}

            # Extraer nombre
            nombre = soup.find("span", {"id": "nombre"}) or soup.find("b", text=lambda t: t and "nombre" in t.lower())
            if nombre:
                result["nombre"] = nombre.get_text(strip=True)

            # Extraer actividad económica
            actividad = soup.find("span", {"id": "actividad"})
            if actividad:
                result["actividad"] = actividad.get_text(strip=True)

            # Extraer región
            region = soup.find("span", {"id": "region"})
            if region:
                result["region"] = region.get_text(strip=True)

            return result

    except httpx.HTTPError as e:
        logger.debug(f"Error consultando RUT {rut} en SII: {e}")
        return {"rut": rut, "error": str(e)}


def enrich_node_with_sii(rut: str) -> dict:
    """
    Enriquece la información de un nodo con datos del SII.
    Usado por el Detective para verificar empresas detectadas.
    """
    data = consultar_rut(rut)
    polite_sleep(1.0, 2.0)
    return data


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Prueba con RUT de ejemplo (Codelco)
    result = consultar_rut("61704000K")
    print(result)
