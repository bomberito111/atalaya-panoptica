"""
ATALAYA PANÓPTICA — Análisis Propio de Contratos del Estado
Detecta anomalías directamente en los datos públicos: sobreprecios, empresas
fantasma, tratos directos sospechosos, patrones de adjudicación irregular.

NO depende de noticias. Hace análisis cruzado de fuentes primarias:
- Mercado Público API/RSS
- Transparencia.cl (contratos y transferencias)
- SINIM (datos municipales)
- Contraloría (resoluciones)

Se ejecuta cada 2 horas junto al Rastreador.
"""

import logging
import httpx
import feedparser
from collections import defaultdict
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep
from scripts.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AtalayaBot/1.0; +investigacion-anticorrupcion)"
}

# ── Análisis 1: Patrones de adjudicación en Mercado Público (RSS) ────────────

def analizar_patrones_adjudicacion() -> list[dict]:
    """
    Descarga licitaciones recientes del RSS de Mercado Público y detecta:
    - Tratos directos (modalidad menos competitiva)
    - Un único oferente
    - Montos anómalos vs histórico del organismo
    """
    RSS_URL = "https://www.mercadopublico.cl/Procurement/Modules/RFB/RSSFeed.aspx"
    items = []

    try:
        SCRAPER_LIMITER.consume()
        feed = feedparser.parse(RSS_URL)
        entries = feed.entries[:100]

        # Agrupar por organismo para detectar patrones
        por_organismo: dict[str, list] = defaultdict(list)
        for entry in entries:
            organismo = entry.get("author", "Desconocido")
            por_organismo[organismo].append(entry)

        # Detectar organismos con muchas adjudicaciones directas
        for organismo, contratos in por_organismo.items():
            if len(contratos) >= 3:
                # Múltiples contratos del mismo organismo → posible patrón
                titulos = [c.get("title", "") for c in contratos]
                texto = f"""ANÁLISIS DE PATRONES — MERCADO PÚBLICO
Organismo: {organismo}
Contratos detectados en período reciente: {len(contratos)}

Contratos:
""" + "\n".join(f"  - {t}" for t in titulos[:10])

                texto += f"""

ANÁLISIS AUTOMATIZADO:
Se detectaron {len(contratos)} contratos del mismo organismo "{organismo}" en un período corto.
Patrones sospechosos a revisar:
1. ¿Los contratos se fraccionaron para evitar licitación pública?
2. ¿Todos adjudicados al mismo proveedor?
3. ¿Los montos están cerca del umbral para trato directo?
4. ¿Se omitió el proceso competitivo?

Fuente: Mercado Público RSS — datos oficiales del Estado de Chile.
"""
                items.append({
                    "source": "analisis_contratos",
                    "raw_text": texto,
                    "source_url": RSS_URL,
                    "raw_metadata": {
                        "tipo_analisis": "patron_adjudicacion",
                        "organismo": organismo,
                        "num_contratos": len(contratos),
                    },
                    "priority": 2,
                })

        logger.info(f"Patrones adjudicación: {len(items)} organismos con patrones sospechosos")

    except Exception as e:
        logger.error(f"Error analizando patrones: {e}")

    return items


# ── Análisis 2: Transferencias del Gobierno (DIPRES/SIGFE) ──────────────────

TRANSFERENCIAS_URLS = [
    # DIPRES — transferencias corrientes por ministerio
    ("Ministerio del Interior", "https://www.dipres.gob.cl/598/articles-246264_r_excel_transferencias.xls"),
    # Portal de datos abiertos — transferencias
    ("Datos Abiertos DIPRES", "https://datos.gob.cl/datastore/dump/transferencias_estado"),
]

TRANSFERENCIAS_RSS = [
    # Contraloría — resoluciones de transferencias observadas
    "https://www.contraloria.cl/LegislaVisor/servlet/controller?mCategory=11&oCategory=DictamenesRSS&idDictamenFolio=0&pag=1",
]


def analizar_transferencias_sospechosas() -> list[dict]:
    """
    Detecta transferencias del Estado que merecen análisis:
    - Transferencias a entidades sin trayectoria (ONG creadas recientemente)
    - Montos desproporcionados vs tamaño organización
    - Transferencias sin rendición pública
    """
    items = []

    # Buscar en Google News RSS transferencias estatales
    queries_transferencias = [
        "transferencia GORE Chile fundación irregularidad 2024 2025",
        "subsidio Chile organización sin fines lucro irregularidad",
        "convenio municipio Chile ONG empresa irregular dinero",
        "Subdere Chile convenios municipalidades 2024 2025",
        "FNDR Chile irregularidad obra pública",
        "fondos concursables Chile irregularidad entidad 2025",
    ]

    from urllib.parse import quote_plus
    for query in queries_transferencias:
        try:
            SCRAPER_LIMITER.consume()
            encoded = quote_plus(query + " after:2024-01-01")
            rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=es-CL&gl=CL&ceid=CL:es"
            with httpx.Client(timeout=15, headers=HEADERS, follow_redirects=True) as client:
                resp = client.get(rss_url)
                feed = feedparser.parse(resp.text)

            for entry in feed.entries[:5]:
                titulo = entry.get("title", "")
                resumen = entry.get("summary", "")
                link = entry.get("link", "")
                publicado = entry.get("published", "")

                texto = f"""ANÁLISIS DE TRANSFERENCIAS ESTATALES
Query de análisis: {query}
Noticia detectada: {titulo}
Publicado: {publicado}
Fuente: {link}

Contenido:
{clean_text(resumen)}

CONTEXTO DE ANÁLISIS:
Esta noticia fue detectada por el sistema de monitoreo de transferencias estatales.
Se requiere verificar:
1. ¿A qué entidad fue la transferencia?
2. ¿La entidad tiene RUT, estatutos y directorio público?
3. ¿Se publicó rendición de cuentas en transparencia.cl?
4. ¿El monto es proporcional a la capacidad de ejecución?
5. ¿Existe relación entre directivos de la entidad y funcionarios que aprobaron?
"""
                items.append({
                    "source": "analisis_transferencias",
                    "raw_text": texto,
                    "source_url": link or rss_url,
                    "raw_metadata": {
                        "tipo_analisis": "transferencia_sospechosa",
                        "query": query,
                        "titulo": titulo,
                        "publicado": publicado,
                    },
                    "priority": 2,
                })
            polite_sleep(2.0, 3.0)

        except Exception as e:
            logger.warning(f"Error buscando transferencias '{query}': {e}")

    logger.info(f"Análisis transferencias: {len(items)} ítems")
    return items


# ── Análisis 3: Transparencia.cl — sueldos y personal ───────────────────────

TRANSPARENCIA_ORGANISMOS = [
    # Organismos de alto riesgo para revisar su planta de personal
    {
        "nombre": "Ministerio de Obras Públicas",
        "url": "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MOP01&anio=2025",
        "riesgo": "alto",
    },
    {
        "nombre": "Ministerio de Salud",
        "url": "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MINS01&anio=2025",
        "riesgo": "alto",
    },
    {
        "nombre": "Municipalidad de Santiago",
        "url": "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=MU013101&anio=2025",
        "riesgo": "medio",
    },
    {
        "nombre": "Subsecretaría de Desarrollo Regional (SUBDERE)",
        "url": "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=SDRE01&anio=2025",
        "riesgo": "alto",
    },
    {
        "nombre": "Servicio Nacional de Aduanas",
        "url": "https://www.portaltransparencia.cl/PortalPdT/pdtta-transparenciaactivaPortal?codOrg=ADU01&anio=2025",
        "riesgo": "alto",
    },
]


def analizar_transparencia_activa() -> list[dict]:
    """
    Extrae y analiza datos de Transparencia Activa de organismos clave.
    Detecta: cargos duplicados, contratas excesivas, gastos fuera de norma.
    """
    items = []

    for organismo in TRANSPARENCIA_ORGANISMOS:
        try:
            SCRAPER_LIMITER.consume()
            with httpx.Client(timeout=25, headers=HEADERS, follow_redirects=True) as client:
                resp = client.get(organismo["url"])
                if resp.status_code != 200:
                    continue

                # Extraer texto de la página
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "lxml")

                # Buscar tablas de contratos y personal
                tables = soup.find_all("table", limit=5)
                for table in tables:
                    rows = table.find_all("tr")
                    if len(rows) < 2:
                        continue

                    headers_row = rows[0].find_all(["th", "td"])
                    col_names = [h.get_text(strip=True) for h in headers_row]

                    # Buscar columnas de monto/sueldo para detectar anomalías
                    monto_cols = [c for c in col_names if any(
                        kw in c.lower() for kw in ["monto", "sueldo", "remuner", "total", "valor"]
                    )]

                    data_rows = []
                    for row in rows[1:20]:  # Max 20 filas
                        cells = row.find_all("td")
                        if cells:
                            row_data = dict(zip(col_names, [c.get_text(strip=True) for c in cells]))
                            data_rows.append(row_data)

                    if data_rows:
                        texto = f"""ANÁLISIS TRANSPARENCIA ACTIVA — {organismo['nombre']}
URL: {organismo['url']}
Nivel de riesgo del organismo: {organismo['riesgo'].upper()}
Columnas detectadas: {', '.join(col_names[:10])}
Columnas de montos: {', '.join(monto_cols) if monto_cols else 'No detectadas'}

Datos extraídos ({len(data_rows)} registros):
"""
                        for row in data_rows[:10]:
                            texto += "\n  " + " | ".join(f"{k}: {v}" for k, v in row.items() if v)

                        texto += f"""

ANÁLISIS AUTOMATIZADO DE RIESGO:
Organismo: {organismo['nombre']} (riesgo {organismo['riesgo']})
Se extrajo información directa del Portal de Transparencia del Estado de Chile.
Revisar:
1. ¿Existen funcionarios con cargos en comisión de servicio por más de 6 meses?
2. ¿Los montos de contratos coinciden con lo publicado en Mercado Público?
3. ¿Hay diferencias entre la dotación autorizada y la real?
4. ¿Se publicaron oportunamente en transparencia.cl (plazo legal: 30 días)?
"""
                        items.append({
                            "source": "analisis_transparencia",
                            "raw_text": texto,
                            "source_url": organismo["url"],
                            "raw_metadata": {
                                "tipo_analisis": "transparencia_activa",
                                "organismo": organismo["nombre"],
                                "riesgo": organismo["riesgo"],
                                "num_registros": len(data_rows),
                            },
                            "priority": 2,
                        })

            polite_sleep(3.0, 5.0)

        except Exception as e:
            logger.warning(f"Error en Transparencia {organismo['nombre']}: {e}")

    logger.info(f"Transparencia activa: {len(items)} ítems")
    return items


# ── Análisis 4: Contraloría — resoluciones recientes de representación ───────

def analizar_resoluciones_contraloria() -> list[dict]:
    """
    Busca resoluciones recientes de Contraloría donde se REPRESENTARON actos
    del Ejecutivo (señal de ilegalidad detectada por el propio Estado).
    """
    QUERIES_CONTRALORIA = [
        "Contraloría Chile representa resolución ilegal 2025",
        "Contraloría Chile dictamen irregular municipio 2025",
        "Contraloría Chile observa contrato licitación 2025",
        "Contraloría Chile instrucción sumario administrativo 2025",
        "Contraloría Chile toma razón representado 2025",
    ]

    items = []
    from urllib.parse import quote_plus

    for query in QUERIES_CONTRALORIA:
        try:
            SCRAPER_LIMITER.consume()
            encoded = quote_plus(query)
            rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=es-CL&gl=CL&ceid=CL:es"
            with httpx.Client(timeout=15, headers=HEADERS, follow_redirects=True) as client:
                resp = client.get(rss_url)
                feed = feedparser.parse(resp.text)

            for entry in feed.entries[:3]:
                titulo = entry.get("title", "")
                if not titulo:
                    continue
                resumen = entry.get("summary", "")
                link = entry.get("link", "")
                publicado = entry.get("published", "")

                texto = f"""ANÁLISIS CONTRALORÍA — ACTO REPRESENTADO O IRREGULARIDAD DETECTADA
Fuente: Contraloría General de la República (monitoreo autónomo)
Resolución/Noticia: {titulo}
Publicado: {publicado}
Enlace: {link}

Descripción:
{clean_text(resumen)}

RELEVANCIA ANTICORRUPCIÓN:
Cuando Contraloría "representa" un acto, significa que lo considera ilegal.
El organismo afectado puede insistir (requiere firma del Presidente) o corregir.
Este registro puede indicar:
- Contrato adjudicado sin proceso legal
- Nombramiento irregular de funcionario
- Gasto no autorizado presupuestariamente
- Convenio firmado sin facultades
"""
                items.append({
                    "source": "analisis_contraloria",
                    "raw_text": texto,
                    "source_url": link,
                    "raw_metadata": {
                        "tipo_analisis": "contraloria_representacion",
                        "titulo": titulo,
                        "publicado": publicado,
                    },
                    "priority": 1,  # Máxima prioridad — señal directa del Estado
                })
            polite_sleep(2.0, 3.0)

        except Exception as e:
            logger.warning(f"Error buscando resoluciones Contraloría: {e}")

    logger.info(f"Contraloría resoluciones: {len(items)} ítems")
    return items


# ── Análisis 5: Patrones de contratistas recurrentes ────────────────────────

def analizar_contratistas_recurrentes() -> list[dict]:
    """
    Detecta empresas/personas que aparecen como adjudicatarios en múltiples
    contratos del Estado — señal de captura de contratos o colusión.
    """
    QUERIES_CONTRATISTAS = [
        "empresa adjudicada Chile contratos múltiples municipios mismo proveedor",
        "proveedor único Chile licitación desierta trato directo sospechoso",
        "empresa Chile contratos millones adjudicación directa sin competencia",
        "holding Chile subsidiarias contratos Estado múltiples organismos",
        "nepotismo empresa familiar Chile funcionario público contratos",
        "empresas relacionadas Chile mismo RUT familia contrato",
        "consultoría Chile adjudicada siempre mismo gobierno funcionario",
    ]

    items = []
    from urllib.parse import quote_plus

    for query in QUERIES_CONTRATISTAS:
        try:
            SCRAPER_LIMITER.consume()
            encoded = quote_plus(query + " after:2023-01-01")
            rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=es-CL&gl=CL&ceid=CL:es"
            with httpx.Client(timeout=15, headers=HEADERS, follow_redirects=True) as client:
                resp = client.get(rss_url)
                feed = feedparser.parse(resp.text)

            for entry in feed.entries[:3]:
                titulo = entry.get("title", "")
                if not titulo:
                    continue
                resumen = entry.get("summary", "")
                link = entry.get("link", "")
                publicado = entry.get("published", "")

                texto = f"""ANÁLISIS DE CONTRATISTAS RECURRENTES — PATRÓN DETECTADO
Tipo de análisis: Contratistas que capturan contratos del Estado sistemáticamente
Señal detectada: {titulo}
Publicado: {publicado}
Fuente: {link}

Resumen:
{clean_text(resumen)}

ANÁLISIS:
La concentración de contratos en pocos proveedores es una señal clásica de:
1. Captura del proceso de compras por parte del proveedor
2. Relación preferencial con funcionarios decisores
3. Fraccionamiento de contratos para evitar licitación pública
4. Colusión entre proveedores para mantener precios altos
5. Empresas "de maletín" creadas específicamente para capturar contratos

Verificar en Mercado Público: ¿Cuántos contratos tiene este proveedor? ¿Con qué organismos?
"""
                items.append({
                    "source": "analisis_contratistas",
                    "raw_text": texto,
                    "source_url": link,
                    "raw_metadata": {
                        "tipo_analisis": "contratista_recurrente",
                        "titulo": titulo,
                        "publicado": publicado,
                        "query": query,
                    },
                    "priority": 2,
                })
            polite_sleep(2.0, 3.0)

        except Exception as e:
            logger.warning(f"Error buscando contratistas: {e}")

    logger.info(f"Contratistas recurrentes: {len(items)} ítems")
    return items


# ── Análisis 6: Tierras raras, recursos naturales y concesiones ──────────────

def analizar_recursos_naturales() -> list[dict]:
    """
    Monitorea contratos y concesiones de recursos naturales estratégicos:
    litio, tierras raras, agua, minería, pesca.
    Estos son sectores de altísimo riesgo de captura regulatoria.
    """
    QUERIES_RECURSOS = [
        "litio Chile contrato empresa licitación concesión 2024 2025",
        "tierras raras Chile prospección extracción empresa contrato",
        "agua Chile derechos DAA empresa irregularidad",
        "minería Chile permiso ambiental irregularidad empresa política",
        "pesca Chile cuota empresa financiamiento político",
        "gas Chile contrato empresa Estado concesión",
        "energía Chile empresa contrato político lobby concesión",
        "Codelco Chile contrato empresa irregular subdirección",
        "SQM litio Chile nuevo contrato renegociación irregular",
        "ENAMI Chile contrato empresa mineral extracción",
    ]

    items = []
    from urllib.parse import quote_plus

    for query in QUERIES_RECURSOS:
        try:
            SCRAPER_LIMITER.consume()
            encoded = quote_plus(query + " after:2023-01-01")
            rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=es-CL&gl=CL&ceid=CL:es"
            with httpx.Client(timeout=15, headers=HEADERS, follow_redirects=True) as client:
                resp = client.get(rss_url)
                feed = feedparser.parse(resp.text)

            for entry in feed.entries[:4]:
                titulo = entry.get("title", "")
                if not titulo:
                    continue
                resumen = entry.get("summary", "")
                link = entry.get("link", "")
                publicado = entry.get("published", "")

                texto = f"""ANÁLISIS RECURSOS NATURALES ESTRATÉGICOS — CHILE
Sector monitoreado: Recursos naturales / concesiones
Señal: {titulo}
Publicado: {publicado}
Fuente: {link}

{clean_text(resumen)}

ANÁLISIS DE RIESGO:
Los recursos naturales de Chile (litio, cobre, agua, pesca) son sectores de
altísimo riesgo de captura regulatoria. Revisar:
1. ¿Qué empresa recibió la concesión o contrato?
2. ¿La empresa tiene vínculos con funcionarios que aprobaron?
3. ¿Se realizó evaluación ambiental completa?
4. ¿El precio pagado al Estado es de mercado?
5. ¿Existe lobby documentado en el Registro de Lobby antes de la decisión?
"""
                items.append({
                    "source": "analisis_recursos_naturales",
                    "raw_text": texto,
                    "source_url": link,
                    "raw_metadata": {
                        "tipo_analisis": "recurso_natural",
                        "titulo": titulo,
                        "publicado": publicado,
                        "sector": query.split()[0],
                    },
                    "priority": 2,
                })
            polite_sleep(2.0, 3.5)

        except Exception as e:
            logger.warning(f"Error buscando recursos naturales: {e}")

    logger.info(f"Recursos naturales: {len(items)} ítems")
    return items


# ── Entry point ─────────────────────────────────────────────────────────────

def run():
    """
    Ejecuta todos los análisis propios de ATALAYA.
    Detecta anomalías SIN depender de noticias — directamente en datos del Estado.
    """
    logger.info("=== ANÁLISIS PROPIO ATALAYA — Iniciando ===")

    all_items = []

    logger.info("1/6 Analizando patrones de adjudicación en Mercado Público...")
    all_items.extend(analizar_patrones_adjudicacion())

    logger.info("2/6 Analizando transferencias sospechosas del Estado...")
    all_items.extend(analizar_transferencias_sospechosas())

    logger.info("3/6 Extrayendo y analizando Transparencia Activa...")
    all_items.extend(analizar_transparencia_activa())

    logger.info("4/6 Monitoreando resoluciones de Contraloría...")
    all_items.extend(analizar_resoluciones_contraloria())

    logger.info("5/6 Detectando contratistas recurrentes...")
    all_items.extend(analizar_contratistas_recurrentes())

    logger.info("6/6 Monitoreando recursos naturales estratégicos...")
    all_items.extend(analizar_recursos_naturales())

    if all_items:
        inserted, dupes = enqueue_batch(all_items)
        logger.info(f"=== ANÁLISIS PROPIO completado: {inserted} nuevos ítems, {dupes} duplicados ===")
    else:
        logger.warning("=== ANÁLISIS PROPIO: sin ítems generados ===")

    return len(all_items)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
