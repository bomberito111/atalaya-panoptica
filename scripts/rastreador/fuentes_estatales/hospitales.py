"""
ATALAYA PANÓPTICA — Scraper: Hospitales y FONASA
Extrae licitaciones de hospitales públicos y FONASA via Mercado Público API.
"""

import logging
import httpx
from datetime import datetime, timedelta
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import MERCADO_PUBLICO_LIMITER, SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

BASE_URL = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"

# 30 hospitales públicos mayores de Chile
HOSPITALES_CHILE = [
    "Hospital San Borja Arriarán",
    "Hospital San José",
    "Hospital del Salvador",
    "Hospital Barros Luco Trudeau",
    "Hospital Sótero del Río",
    "Hospital de Niños Roberto del Río",
    "Hospital Exequiel González Cortés",
    "Hospital Luis Calvo Mackenna",
    "Hospital de la Florida",
    "Hospital San Juan de Dios",
    "Hospital Padre Hurtado",
    "Hospital El Carmen de Maipú",
    "Hospital Félix Bulnes",
    "Hospital de Quilicura",
    "Hospital Parroquial de San Bernardo",
    "Hospital Regional de Antofagasta",
    "Hospital Regional de Iquique",
    "Hospital Regional de Valparaíso",
    "Hospital Carlos Van Buren",
    "Hospital Regional de Rancagua",
    "Hospital Regional de Talca",
    "Hospital Regional de Concepción",
    "Hospital Guillermo Grant Benavente",
    "Hospital Regional de Temuco",
    "Hospital Hernán Henríquez Aravena",
    "Hospital Regional de Valdivia",
    "Hospital Puerto Montt",
    "Hospital Regional de Coyhaique",
    "Hospital Regional de Punta Arenas",
    "Hospital de Curicó",
]

# Términos de búsqueda para detectar irregularidades en hospitales
HOSPITAL_SEARCH_TERMS = [
    "FONASA",
    "hospital",
    "servicio salud",
    "fármaco",
    "insumo médico",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
    "Accept-Language": "es-CL,es;q=0.9",
}


def fetch_licitaciones_organismo(nombre_organismo: str, fecha_desde: str, fecha_hasta: str) -> list[dict]:
    """
    Busca licitaciones en Mercado Público por nombre de organismo.
    Retorna lista de licitaciones encontradas.
    """
    params = {
        "fecha": fecha_desde,
        "fechaFin": fecha_hasta,
        "estado": "todos",
        "pagina": 1,
    }

    licitaciones = []
    with httpx.Client(timeout=30) as client:
        for page in range(1, 4):  # Máximo 3 páginas por organismo
            MERCADO_PUBLICO_LIMITER.consume()
            params["pagina"] = page
            try:
                resp = client.get(BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                items = data.get("Listado", [])
                if not items:
                    break

                # Filtrar por organismo (nombre parcial)
                nombre_lower = nombre_organismo.lower()
                filtered = [
                    it for it in items
                    if nombre_lower in (it.get("NombreOrganismo", "") or "").lower()
                ]
                licitaciones.extend(filtered)

                if len(items) < 1000:
                    break
                polite_sleep(1.0, 2.0)

            except httpx.HTTPError as e:
                logger.error(f"Error HTTP Mercado Público ({nombre_organismo}): {e}")
                break

    return licitaciones


def fetch_licitaciones_keyword(keyword: str, fecha_desde: str, fecha_hasta: str) -> list[dict]:
    """
    Busca licitaciones por keyword en nombre/descripción.
    Filtra resultados que contengan el keyword en el nombre del organismo o licitación.
    """
    params = {
        "fecha": fecha_desde,
        "fechaFin": fecha_hasta,
        "estado": "todos",
        "pagina": 1,
    }

    licitaciones = []
    with httpx.Client(timeout=30) as client:
        MERCADO_PUBLICO_LIMITER.consume()
        try:
            resp = client.get(BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("Listado", [])

            kw_lower = keyword.lower()
            for it in items:
                organismo = (it.get("NombreOrganismo", "") or "").lower()
                nombre = (it.get("Nombre", "") or "").lower()
                if kw_lower in organismo or kw_lower in nombre:
                    licitaciones.append(it)

        except httpx.HTTPError as e:
            logger.error(f"Error HTTP Mercado Público (keyword={keyword}): {e}")

    return licitaciones


def licitacion_hospital_to_text(lic: dict, contexto: str) -> str:
    """Convierte licitación de hospital/FONASA a texto enriquecido para análisis IA."""
    return f"""LICITACIÓN PÚBLICA — SALUD / {contexto.upper()}
Código: {lic.get('CodigoExterno', 'N/A')}
Nombre: {lic.get('Nombre', '')}
Estado: {lic.get('Estado', '')}
Organismo: {lic.get('NombreOrganismo', '')}
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


def hospital_investigation_item(hospital_name: str) -> dict:
    """
    Genera ítem de cola de investigación para un hospital específico.
    Marca para análisis de patrones de contratación.
    """
    return {
        "source": "hospitales_chile",
        "raw_text": (
            f"INVESTIGACIÓN HOSPITAL PÚBLICO CHILENO\n"
            f"Hospital: {hospital_name}\n"
            f"Motivo: Revisión de patrones de contratación, licitaciones y proveedores recurrentes.\n"
            f"Buscar: sobreprecios en insumos médicos, medicamentos, servicios; proveedores "
            f"relacionados con directivos; licitaciones declaradas desiertas y luego adjudicadas "
            f"por trato directo; concentración de contratos en pocas empresas.\n"
        ),
        "source_url": f"https://www.mercadopublico.cl/Procurement/Modules/RFB/SearchBaseden.aspx?q={hospital_name.replace(' ', '+')}",
        "raw_metadata": {
            "hospital": hospital_name,
            "tipo": "investigacion_patrones",
        },
        "priority": 3,
    }


def run(days_back: int = 7):
    """Entry point del scraper de hospitales y FONASA."""
    logger.info("Hospitales/FONASA: extrayendo licitaciones del sector salud...")

    fecha_hasta = datetime.now()
    fecha_desde = fecha_hasta - timedelta(days=days_back)
    fecha_desde_str = fecha_desde.strftime("%d-%m-%Y")
    fecha_hasta_str = fecha_hasta.strftime("%d-%m-%Y")

    all_items = []

    # 1. Licitaciones de FONASA y hospitales por keywords
    for kw in HOSPITAL_SEARCH_TERMS:
        SCRAPER_LIMITER.consume()
        licitaciones = fetch_licitaciones_keyword(kw, fecha_desde_str, fecha_hasta_str)
        logger.info(f"  Keyword '{kw}': {len(licitaciones)} licitaciones")

        for lic in licitaciones:
            codigo = lic.get("CodigoExterno", "")
            url = f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={codigo}"
            all_items.append({
                "source": "hospitales_fonasa",
                "raw_text": licitacion_hospital_to_text(lic, kw),
                "source_url": url,
                "raw_metadata": {
                    "codigo": codigo,
                    "keyword": kw,
                    "organismo": lic.get("NombreOrganismo"),
                    "monto": lic.get("MontoEstimado"),
                    "fecha": lic.get("FechaPublicacion"),
                    "estado": lic.get("Estado"),
                },
                "priority": 2 if lic.get("MontoAdjudicado") else 4,
            })
        polite_sleep(2.0, 4.0)

    # 2. Enqueue ítems de investigación para cada hospital de la lista
    for hospital in HOSPITALES_CHILE:
        all_items.append(hospital_investigation_item(hospital))

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Hospitales/FONASA completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
