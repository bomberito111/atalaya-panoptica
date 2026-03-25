"""
ATALAYA PANÓPTICA — Scraper: Medios de Comunicación Investigados
Investiga a los propios medios de comunicación chilenos como posibles
sujetos de corrupción: estructuras de propiedad, vínculos con el poder
político y económico, pauta gubernamental y puerta giratoria.

Este módulo NO usa a los medios como fuentes de noticias, sino como
objetos de investigación en sí mismos.
"""

import logging
from datetime import datetime

from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep
from scripts.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

# ── Datos de propiedad de medios chilenos (bootstrap hardcodeado) ──────────
#
# Fuentes de referencia:
#   - Reportes CIPER Chile sobre concentración mediática
#   - Registro de Accionistas SUSESO / CMF
#   - Declaraciones de interés y patrimonio (SIAPER)
#   - Investigaciones académicas FUCATEL / ONG Derechos Digitales

MEDIOS_CHILE = {
    "El Mercurio": {
        "propietario": "Agustín Edwards Eastman / Familia Edwards",
        "grupo": "El Mercurio S.A.P.",
        "rut_empresa": "99.516.940-3",
        "tipo": "prensa_escrita",
        "descripcion": (
            "Principal diario conservador de Chile. Familia Edwards ha tenido "
            "históricas vinculaciones con gobiernos de derecha."
        ),
        "banderas_rojas": [
            "vínculos dictadura",
            "concentración medios",
            "financiamiento campaña",
        ],
    },
    "La Tercera": {
        "propietario": "Álvaro Saieh Bendeck",
        "grupo": "Copesa",
        "rut_empresa": "99.514.350-8",
        "tipo": "prensa_escrita",
        "descripcion": (
            "Segundo diario más leído. Álvaro Saieh es banquero y empresario "
            "con participación en banco CorpBanca."
        ),
        "banderas_rojas": [
            "concentración bancaria",
            "conflicto interés financiero",
        ],
    },
    "Chilevisión": {
        "propietario": "Warner Bros. Discovery (anterior: Sebastián Piñera hasta 2010)",
        "grupo": "Warner Bros. Discovery",
        "rut_empresa": "91.237.000-K",
        "tipo": "television",
        "descripcion": (
            "Canal de TV. Fue propiedad de Piñera durante su presidencia, luego vendido."
        ),
        "banderas_rojas": [
            "puerta giratoria presidencial",
        ],
    },
    "Canal 13": {
        "propietario": "Luksic Group (Andrónico Luksic)",
        "grupo": "Andrónico Luksic Craig",
        "rut_empresa": "86.227.000-3",
        "tipo": "television",
        "descripcion": (
            "Canal histórico chileno. Grupo Luksic tiene intereses mineros, "
            "bancarios (BCI) y retail."
        ),
        "banderas_rojas": [
            "oligopolio empresarial",
            "lobby minero",
            "BCI",
        ],
    },
    "Mega": {
        "propietario": "Bethia Group (Familia Del Sol)",
        "grupo": "Bethia",
        "rut_empresa": "96.552.180-8",
        "tipo": "television",
        "descripcion": (
            "Canal de TV. Bethia tiene participación en Falabella y otros retail."
        ),
        "banderas_rojas": [
            "conflicto interés retail",
        ],
    },
    "BioBio Chile": {
        "propietario": "Tomás Mosciatti",
        "grupo": "Independiente",
        "rut_empresa": "76.XXX.XXX-X",
        "tipo": "digital_radio",
        "descripcion": (
            "Medio digital y radio masivo. Cobertura amplia pero con denuncias "
            "de condiciones laborales."
        ),
        "banderas_rojas": [
            "precariedad laboral periodistas",
        ],
    },
    "El Mostrador": {
        "propietario": "Fundación Heinrich Böll / inversores mixtos",
        "grupo": "Independiente",
        "rut_empresa": "XX.XXX.XXX-X",
        "tipo": "digital",
        "descripcion": (
            "Medio digital progresista fundado en 2000. Financiamiento mixto."
        ),
        "banderas_rojas": [],
    },
    "CIPER Chile": {
        "propietario": "ONG / Fondos académicos",
        "grupo": "Centro de Investigación Periodística",
        "rut_empresa": "XX.XXX.XXX-X",
        "tipo": "investigativo",
        "descripcion": "Periodismo de investigación sin fines de lucro.",
        "banderas_rojas": [],
    },
    "Emol / El Mercurio Online": {
        "propietario": "Familia Edwards / El Mercurio S.A.P.",
        "grupo": "El Mercurio S.A.P.",
        "rut_empresa": "99.516.940-3",
        "tipo": "digital",
        "descripcion": (
            "Versión digital de El Mercurio. Mismo grupo propietario."
        ),
        "banderas_rojas": [
            "concentración medios",
            "desinformación histórica",
        ],
    },
    "T13 (Tele13)": {
        "propietario": "El Mercurio S.A.P. (Familia Edwards)",
        "grupo": "El Mercurio S.A.P.",
        "rut_empresa": "99.516.940-3",
        "tipo": "television_digital",
        "descripcion": "Canal de noticias del grupo El Mercurio.",
        "banderas_rojas": [
            "concentración medios",
            "vínculos dictadura",
        ],
    },
    "La Segunda": {
        "propietario": "El Mercurio S.A.P. (Familia Edwards)",
        "grupo": "El Mercurio S.A.P.",
        "rut_empresa": "99.516.940-3",
        "tipo": "prensa_escrita",
        "descripcion": "Vespertino del grupo Edwards.",
        "banderas_rojas": [
            "concentración medios",
        ],
    },
    "DF (Diario Financiero)": {
        "propietario": "Grupo Claro (Ricardo Claro Valdés)",
        "grupo": "Grupo Claro",
        "rut_empresa": "XX.XXX.XXX-X",
        "tipo": "prensa_financiera",
        "descripcion": (
            "Diario económico/financiero. Grupo Claro tiene intereses navieros, "
            "eléctricos y financieros."
        ),
        "banderas_rojas": [
            "conflicto interés financiero",
            "lobby empresarial",
        ],
    },
    "24 Horas (TVN)": {
        "propietario": "Estado de Chile (Televisión Nacional)",
        "grupo": "Televisión Nacional de Chile",
        "rut_empresa": "XX.XXX.XXX-X",
        "tipo": "television_estatal",
        "descripcion": (
            "Canal estatal. En teoría independiente pero puede sufrir "
            "presiones gubernamentales."
        ),
        "banderas_rojas": [
            "presiones gubernamentales",
            "directorio político",
        ],
    },
}


# ── Formateo ───────────────────────────────────────────────────────────────

def medio_to_text(nombre: str, datos: dict) -> str:
    """
    Convierte la ficha de un medio a texto enriquecido para análisis IA.

    El texto está estructurado para facilitar la detección de patrones
    de conflicto de interés, concentración mediática y puerta giratoria.
    """
    banderas = datos.get("banderas_rojas", [])
    banderas_str = ", ".join(banderas) if banderas else "Ninguna registrada"

    return clean_text(f"""INVESTIGACIÓN MEDIOS — {nombre}
Propietario: {datos.get('propietario', '')}
Grupo empresarial: {datos.get('grupo', '')}
RUT empresa: {datos.get('rut_empresa', '')}
Tipo: {datos.get('tipo', '')}
Descripción: {datos.get('descripcion', '')}
Banderas rojas: {banderas_str}
""")


def _build_source_url(nombre: str, rut: str) -> str | None:
    """
    Construye una URL de referencia para el ítem.
    Usa la búsqueda de CMF (ex-SVS) si hay RUT conocido, de lo contrario
    devuelve una búsqueda genérica en el portal de Transparencia.
    """
    rut_limpio = rut.replace(".", "").replace("-", "").strip()

    # RUTs placeholder (incompletos en el dataset bootstrap) no son útiles
    if "X" in rut_limpio.upper():
        # URL de búsqueda genérica en el portal de transparencia
        nombre_encoded = nombre.replace(" ", "+")
        return (
            f"https://transparencia.gob.cl/personas-juridicas"
            f"?q={nombre_encoded}"
        )

    # URL directa al perfil empresarial en CMF
    return f"https://www.cmfchile.cl/institucional/mercados/entidad.php?rut={rut}"


# ── Entrada principal ──────────────────────────────────────────────────────

def run(solo_con_banderas: bool = False) -> int:
    """
    Entry point del scraper de medios investigados.

    Genera ítems de investigación a partir de la base de conocimiento
    MEDIOS_CHILE y los encola para análisis IA.

    Args:
        solo_con_banderas: Si es True, sólo encola medios que tengan al
            menos una bandera roja. Si es False (por defecto), encola todos.

    Returns:
        Número de ítems insertados en la cola.
    """
    logger.info(
        "Medios investigados: generando ítems de investigación "
        f"({'solo con banderas' if solo_con_banderas else 'todos'})..."
    )

    all_items = []
    fecha_analisis = datetime.now().strftime("%Y-%m-%d")

    for nombre, datos in MEDIOS_CHILE.items():
        banderas = datos.get("banderas_rojas", [])

        if solo_con_banderas and not banderas:
            logger.debug(f"  Omitiendo {nombre!r}: sin banderas rojas")
            continue

        texto = medio_to_text(nombre, datos)
        if not texto:
            logger.warning(f"  Texto vacío para {nombre!r}, omitiendo")
            continue

        source_url = _build_source_url(nombre, datos.get("rut_empresa", ""))

        all_items.append({
            "source": "medio_investigado",
            "raw_text": texto,
            "source_url": source_url,
            "raw_metadata": {
                "nombre_medio": nombre,
                "propietario": datos.get("propietario"),
                "grupo": datos.get("grupo"),
                "rut_empresa": datos.get("rut_empresa"),
                "tipo": datos.get("tipo"),
                "banderas_rojas": banderas,
                "fecha_analisis": fecha_analisis,
            },
            "priority": 2,  # Alta: conflictos estructurales de largo plazo
        })

        # Pausa educada entre construcción de ítems (no hay peticiones HTTP
        # en este scraper, pero respetamos el patrón del proyecto para
        # consistencia y por si se añaden llamadas externas en el futuro).
        SCRAPER_LIMITER.consume()

    logger.info(f"  {len(all_items)} medios preparados para encolar")

    if not all_items:
        logger.warning("No se generaron ítems. Verificar filtro solo_con_banderas.")
        return 0

    inserted, dupes = enqueue_batch(all_items)
    logger.info(
        f"Medios investigados completado: {inserted} nuevos, {dupes} duplicados"
    )
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
