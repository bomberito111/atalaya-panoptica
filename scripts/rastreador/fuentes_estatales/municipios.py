"""
ATALAYA PANÓPTICA — Scraper: Municipios de Chile
Rastrea contrataciones y licitaciones de los 346 municipios chilenos.
Prioriza los 50 más poblados y busca contratos de alto monto o patrones irregulares.
"""

import logging
import httpx
from datetime import datetime, timedelta
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import MERCADO_PUBLICO_LIMITER, SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

BASE_URL = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"

# Top 50 municipios por población — nombre y código SINIM
# Código SINIM usado en portales estatales chilenos
TOP_50_MUNICIPIOS = [
    {"nombre": "Puente Alto", "region": "Metropolitana", "codigo": "13110"},
    {"nombre": "Maipú", "region": "Metropolitana", "codigo": "13120"},
    {"nombre": "La Florida", "region": "Metropolitana", "codigo": "13110"},
    {"nombre": "Las Condes", "region": "Metropolitana", "codigo": "13114"},
    {"nombre": "Peñalolén", "region": "Metropolitana", "codigo": "13119"},
    {"nombre": "Santiago", "region": "Metropolitana", "codigo": "13101"},
    {"nombre": "San Bernardo", "region": "Metropolitana", "codigo": "13401"},
    {"nombre": "Antofagasta", "region": "Antofagasta", "codigo": "02101"},
    {"nombre": "Viña del Mar", "region": "Valparaíso", "codigo": "05109"},
    {"nombre": "Valparaíso", "region": "Valparaíso", "codigo": "05101"},
    {"nombre": "Concepción", "region": "Biobío", "codigo": "08101"},
    {"nombre": "Temuco", "region": "Araucanía", "codigo": "09101"},
    {"nombre": "Rancagua", "region": "O'Higgins", "codigo": "06101"},
    {"nombre": "Talca", "region": "Maule", "codigo": "07101"},
    {"nombre": "Arica", "region": "Arica y Parinacota", "codigo": "15101"},
    {"nombre": "Iquique", "region": "Tarapacá", "codigo": "01101"},
    {"nombre": "Puerto Montt", "region": "Los Lagos", "codigo": "10101"},
    {"nombre": "Coquimbo", "region": "Coquimbo", "codigo": "04101"},
    {"nombre": "La Serena", "region": "Coquimbo", "codigo": "04101"},
    {"nombre": "Osorno", "region": "Los Lagos", "codigo": "10301"},
    {"nombre": "Quilicura", "region": "Metropolitana", "codigo": "13122"},
    {"nombre": "La Pintana", "region": "Metropolitana", "codigo": "13113"},
    {"nombre": "El Bosque", "region": "Metropolitana", "codigo": "13105"},
    {"nombre": "Pudahuel", "region": "Metropolitana", "codigo": "13121"},
    {"nombre": "Cerro Navia", "region": "Metropolitana", "codigo": "13103"},
    {"nombre": "Lo Espejo", "region": "Metropolitana", "codigo": "13115"},
    {"nombre": "Lo Prado", "region": "Metropolitana", "codigo": "13116"},
    {"nombre": "Pedro Aguirre Cerda", "region": "Metropolitana", "codigo": "13118"},
    {"nombre": "San Ramón", "region": "Metropolitana", "codigo": "13131"},
    {"nombre": "Lo Barnechea", "region": "Metropolitana", "codigo": "13201"},
    {"nombre": "Providencia", "region": "Metropolitana", "codigo": "13120"},
    {"nombre": "Ñuñoa", "region": "Metropolitana", "codigo": "13117"},
    {"nombre": "Macul", "region": "Metropolitana", "codigo": "13117"},
    {"nombre": "San Miguel", "region": "Metropolitana", "codigo": "13126"},
    {"nombre": "Recoleta", "region": "Metropolitana", "codigo": "13123"},
    {"nombre": "Independencia", "region": "Metropolitana", "codigo": "13111"},
    {"nombre": "Quinta Normal", "region": "Metropolitana", "codigo": "13122"},
    {"nombre": "Estación Central", "region": "Metropolitana", "codigo": "13106"},
    {"nombre": "Huechuraba", "region": "Metropolitana", "codigo": "13109"},
    {"nombre": "Colina", "region": "Metropolitana", "codigo": "13301"},
    {"nombre": "Calama", "region": "Antofagasta", "codigo": "02201"},
    {"nombre": "Talcahuano", "region": "Biobío", "codigo": "08110"},
    {"nombre": "Coronel", "region": "Biobío", "codigo": "08102"},
    {"nombre": "Chillán", "region": "Ñuble", "codigo": "16101"},
    {"nombre": "Valdivia", "region": "Los Ríos", "codigo": "14101"},
    {"nombre": "Curicó", "region": "Maule", "codigo": "07301"},
    {"nombre": "Linares", "region": "Maule", "codigo": "07401"},
    {"nombre": "Los Ángeles", "region": "Biobío", "codigo": "08301"},
    {"nombre": "Punta Arenas", "region": "Magallanes", "codigo": "12101"},
    {"nombre": "Copiapó", "region": "Atacama", "codigo": "03101"},
]

MONTO_ALTO_CLP = 10_000_000  # 10 millones CLP — umbral de contratos de alto monto


def fetch_licitaciones_municipio(nombre_municipio: str, fecha_desde: str, fecha_hasta: str) -> list[dict]:
    """
    Obtiene licitaciones de un municipio específico desde Mercado Público API.
    Filtra por nombre de organismo que contenga el nombre del municipio.
    """
    params = {
        "fecha": fecha_desde,
        "fechaFin": fecha_hasta,
        "estado": "todos",
        "pagina": 1,
    }

    licitaciones = []
    with httpx.Client(timeout=30) as client:
        for page in range(1, 3):  # Max 2 páginas por municipio para eficiencia
            MERCADO_PUBLICO_LIMITER.consume()
            params["pagina"] = page
            try:
                resp = client.get(BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                items = data.get("Listado", [])
                if not items:
                    break

                nombre_lower = nombre_municipio.lower()
                for it in items:
                    organismo = (it.get("NombreOrganismo", "") or "").lower()
                    # Municipios aparecen como "Municipalidad de X" o "I. Municipalidad de X"
                    if nombre_lower in organismo and (
                        "municipalidad" in organismo or "municipio" in organismo
                    ):
                        licitaciones.append(it)

                if len(items) < 1000:
                    break
                polite_sleep(1.0, 2.0)

            except httpx.HTTPError as e:
                logger.error(f"Error HTTP Mercado Público ({nombre_municipio}): {e}")
                break

    return licitaciones


def licitacion_municipio_to_text(lic: dict, municipio: str, region: str) -> str:
    """Convierte licitación municipal a texto enriquecido para análisis IA."""
    monto = lic.get("MontoEstimado") or lic.get("MontoAdjudicado") or "No indicado"
    return f"""LICITACIÓN MUNICIPAL — {municipio.upper()} ({region})
Código: {lic.get('CodigoExterno', 'N/A')}
Nombre: {lic.get('Nombre', '')}
Estado: {lic.get('Estado', '')}
Organismo: {lic.get('NombreOrganismo', '')}
Tipo: {lic.get('Tipo', '')}
Monto estimado: {monto}
Fecha publicación: {lic.get('FechaPublicacion', '')}
Fecha cierre: {lic.get('FechaCierre', '')}
Descripción: {lic.get('Descripcion', '')}
Adjudicatario: {lic.get('NombreAdjudicatario', 'Sin adjudicar')}
RUT Adjudicatario: {lic.get('RutAdjudicatario', '')}
Monto adjudicado: {lic.get('MontoAdjudicado', '')}
"""


def municipio_investigation_item(municipio: dict) -> dict:
    """
    Genera ítem de cola de investigación para análisis profundo de un municipio.
    Marca para revisión de contratistas recurrentes, presupuestos irregulares.
    """
    nombre = municipio["nombre"]
    region = municipio["region"]
    return {
        "source": "municipios_chile",
        "raw_text": (
            f"INVESTIGACIÓN MUNICIPIO CHILENO\n"
            f"Municipio: {nombre} (Región: {region})\n"
            f"Código SINIM: {municipio['codigo']}\n"
            f"Motivo: Análisis de patrones de contratación municipal. "
            f"Buscar: contratos superiores a $10.000.000 CLP, proveedores recurrentes con "
            f"vínculos a concejales o alcalde, licitaciones declaradas desiertas reiteradamente, "
            f"trato directo excesivo, servicios de consultoría sin licitación pública, "
            f"gastos inusuales en publicidad o eventos, contratos fraccionados para eludir montos.\n"
        ),
        "source_url": (
            f"https://www.mercadopublico.cl/Procurement/Modules/RFB/"
            f"SearchBaseden.aspx?q=municipalidad+{nombre.replace(' ', '+')}"
        ),
        "raw_metadata": {
            "municipio": nombre,
            "region": region,
            "codigo_sinim": municipio["codigo"],
            "tipo": "investigacion_municipio",
        },
        "priority": 4,
    }


def run(days_back: int = 7):
    """
    Entry point del scraper de municipios.
    Extrae licitaciones de los top 50 municipios y encola investigaciones.
    """
    logger.info("Municipios: extrayendo licitaciones de municipios chilenos...")

    fecha_hasta = datetime.now()
    fecha_desde = fecha_hasta - timedelta(days=days_back)
    fecha_desde_str = fecha_desde.strftime("%d-%m-%Y")
    fecha_hasta_str = fecha_hasta.strftime("%d-%m-%Y")

    all_items = []

    # 1. Licitaciones recientes de los top 50 municipios por población
    for municipio in TOP_50_MUNICIPIOS:
        nombre = municipio["nombre"]
        region = municipio["region"]

        SCRAPER_LIMITER.consume()
        licitaciones = fetch_licitaciones_municipio(nombre, fecha_desde_str, fecha_hasta_str)
        logger.info(f"  {nombre} ({region}): {len(licitaciones)} licitaciones")

        for lic in licitaciones:
            codigo = lic.get("CodigoExterno", "")
            url = f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={codigo}"

            # Determinar prioridad según monto
            monto_adj = lic.get("MontoAdjudicado")
            monto_est = lic.get("MontoEstimado")
            try:
                monto_val = float(str(monto_adj or monto_est or 0).replace(".", "").replace(",", "."))
            except (ValueError, TypeError):
                monto_val = 0

            priority = 2 if monto_val >= MONTO_ALTO_CLP else 5

            all_items.append({
                "source": "municipios_chile",
                "raw_text": licitacion_municipio_to_text(lic, nombre, region),
                "source_url": url,
                "raw_metadata": {
                    "codigo": codigo,
                    "municipio": nombre,
                    "region": region,
                    "organismo": lic.get("NombreOrganismo"),
                    "monto_estimado": monto_est,
                    "monto_adjudicado": monto_adj,
                    "fecha": lic.get("FechaPublicacion"),
                    "estado": lic.get("Estado"),
                },
                "priority": priority,
            })

        polite_sleep(2.0, 4.0)

    # 2. Enqueue ítems de investigación para cada municipio del top 50
    for municipio in TOP_50_MUNICIPIOS:
        all_items.append(municipio_investigation_item(municipio))

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Municipios completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
