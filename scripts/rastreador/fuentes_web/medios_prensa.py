"""
ATALAYA PANÓPTICA — Scraper: Medios de Prensa
Extrae noticias via RSS feeds de medios chilenos clave.
Sin API key. Sin descarga de imágenes/video.
"""

import logging
import feedparser
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

# RSS feeds de medios chilenos — cobertura amplia: prensa, radio, TV, digital, regional
RSS_FEEDS = {
    # --- Investigación y política ---
    "ciper":                "https://ciperchile.cl/feed/",
    "interferencia":        "https://interferencia.cl/feed/",
    "labot":                "https://www.labot.cl/feed/",
    "radio_uchile":         "https://radio.uchile.cl/feed/",

    # --- Medios nacionales generalistas ---
    "el_mostrador":         "https://www.elmostrador.cl/feed/",
    "la_tercera_politica":  "https://www.latercera.com/politica/feed/",
    "la_tercera":           "https://www.latercera.com/feed/",
    "emol_nacional":        "https://www.emol.com/rss/nacional.xml",
    "emol_economia":        "https://www.emol.com/rss/economia.xml",
    "biobio_nacional":      "https://www.biobiochile.cl/lista/categorias/nacional/feed",
    "biobio_politica":      "https://www.biobiochile.cl/lista/categorias/pais/politica/feed",
    "la_segunda":           "https://www.lasegunda.com/rss/",
    "cooperativa":          "https://www.cooperativa.cl/noticias/rss/categoria/pais.xml",
    "tele13":               "https://www.t13.cl/rss.xml",
    "24horas":              "https://www.24horas.cl/rss.xml",
    "meganoticias":         "https://www.meganoticias.cl/rss.xml",
    "df":                   "https://www.df.cl/rss.xml",

    # --- Medios digitales y alternativos ---
    "el_desconcierto":      "https://www.eldesconcierto.cl/feed/",
    "el_ciudadano":         "https://www.elciudadano.com/feed/",
    "resumen_chile":        "https://resumen.cl/feed/",
    "radio_zero":           "https://www.radiozero.cl/feed/",
    "pauta":                "https://www.pauta.cl/feed/",

    # --- Regionales (cubren corrupción municipal) ---
    "el_rancagüino":        "https://www.elrancaguino.cl/feed/",
    "la_discusion":         "https://www.ladiscusion.cl/feed/",
    "estrella_iquique":     "https://www.estrellaiquique.cl/feed/",

    # --- Economía y finanzas (contratos, licitaciones) ---
    "pulso":                "https://www.pulso.cl/rss.xml",
    "estrategia":           "https://www.estrategia.cl/rss.xml",

    # --- Internacional sobre Chile ---
    "bbc_espanol":          "https://feeds.bbci.co.uk/mundo/rss.xml",
    "reuters_latam":        "https://feeds.reuters.com/reuters/MXdomesticNews",
}

# Palabras clave — corrupción + poder + economía + sociedad
KEYWORDS_CORRUPCION = [
    # Corrupción directa
    "corrupción", "sobreprecios", "malversación", "cohecho", "fraude",
    "desvío de fondos", "colusión", "cartelización", "lavado de dinero",
    "nepotismo", "clientelismo", "tráfico de influencias",
    # Institucional
    "Contraloría", "Fiscalía", "imputado", "formalizado", "querella",
    "Ministerio Público", "SII", "PDI", "investigación penal",
    # Contratos y licitaciones
    "licitación", "adjudicación", "conflicto de interés", "lobby",
    "gasto público", "irregular", "puerta giratoria", "financiamiento político",
    "contrato público", "convenio marco", "trato directo",
    # Empresas y poder
    "multa", "sanción", "infracción", "directorio", "sociedad offshore",
    "paraíso fiscal", "triangulación", "facturas falsas",
    # Social y político
    "abusos", "montaje", "persecución política", "encubrimiento",
    "impunidad", "caso judicial", "procesado", "condenado",
    # Redes sociales y desinformación
    "bots", "fake news", "desinformación", "campaña sucia",
]


def is_relevant(entry: feedparser.FeedParserDict) -> bool:
    """Filtra entradas relevantes para investigación anticorrupción."""
    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    return any(kw.lower() in text for kw in KEYWORDS_CORRUPCION)


def entry_to_text(entry: feedparser.FeedParserDict, source_name: str) -> str:
    """Convierte entrada RSS a texto para análisis IA."""
    return f"""NOTICIA — {source_name.upper().replace('_', ' ')}
Título: {entry.get('title', '')}
Fecha: {entry.get('published', entry.get('updated', ''))}
Autor: {entry.get('author', 'No especificado')}
Resumen: {entry.get('summary', '')}
Link: {entry.get('link', '')}
"""


def run(all_news: bool = False):
    """
    Entry point del scraper de medios de prensa.

    Args:
        all_news: Si True, encola todas las noticias; si False, solo las relevantes.
    """
    logger.info("Medios de prensa: procesando RSS feeds...")

    all_items = []

    for source_name, feed_url in RSS_FEEDS.items():
        SCRAPER_LIMITER.consume()

        try:
            feed = feedparser.parse(feed_url)

            if feed.bozo:
                logger.warning(f"  {source_name}: feed malformado, continuando...")

            entries = feed.entries[:30]  # Max 30 noticias por fuente
            relevant = [e for e in entries if all_news or is_relevant(e)]

            logger.info(f"  {source_name}: {len(relevant)}/{len(entries)} noticias relevantes")

            for entry in relevant:
                all_items.append({
                    "source": f"prensa_{source_name}",
                    "raw_text": entry_to_text(entry, source_name),
                    "source_url": entry.get("link"),
                    "raw_metadata": {
                        "titulo": entry.get("title"),
                        "fecha": entry.get("published"),
                        "autor": entry.get("author"),
                        "medio": source_name,
                    },
                    "priority": 3,
                })

        except Exception as e:
            logger.error(f"  Error procesando {source_name}: {e}")

        polite_sleep(0.5, 1.5)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Medios prensa completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
