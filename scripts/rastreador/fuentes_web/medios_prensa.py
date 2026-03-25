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

# RSS feeds de medios chilenos — priorizando investigación y política
RSS_FEEDS = {
    "ciper": "https://ciperchile.cl/feed/",
    "el_mostrador": "https://www.elmostrador.cl/feed/",
    "la_tercera_politica": "https://www.latercera.com/politica/feed/",
    "emol_nacional": "https://www.emol.com/rss/nacional.xml",
    "biobio_nacional": "https://www.biobiochile.cl/lista/categorias/nacional/feed",
    "la_segunda": "https://www.lasegunda.com/rss/",
    "radio_uchile": "https://radio.uchile.cl/feed/",
    "interferencia": "https://interferencia.cl/feed/",
}

# Palabras clave para filtrar noticias relevantes
KEYWORDS_CORRUPCION = [
    "corrupción", "licitación", "sobreprecios", "malversación",
    "cohecho", "lobby", "conflicto de interés", "fraude",
    "Contraloría", "fiscalía", "imputado", "formalizado",
    "gasto público", "adjudicación", "irregular", "desvío",
    "nepotismo", "puerta giratoria", "financiamiento político",
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
