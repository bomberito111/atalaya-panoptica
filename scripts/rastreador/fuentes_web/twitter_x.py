"""
ATALAYA PANÓPTICA — Scraper: Twitter/X via Nitter
Extrae tweets públicos de políticos y sobre temas de corrupción.
Usa instancias públicas de Nitter (sin API key de X requerida).
"""

import logging
import random
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

# Instancias públicas de Nitter (rotar para distribuir carga)
NITTER_INSTANCES = [
    "https://nitter.poast.org",
    "https://nitter.privacydev.net",
    "https://nitter.net",
    "https://nitter.it",
    "https://nitter.nl",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ATALAYA-Bot/1.0; investigacion-publica)",
}

# Búsquedas relevantes para Chile
SEARCH_QUERIES = [
    "corrupción Chile",
    "licitación sobreprecios",
    "Contraloría Chile",
    "malversación fondos",
    "caso corrupción Chile",
    "lobby político Chile",
]

# Cuentas de políticos chilenos a monitorear (ejemplos)
POLITICAL_ACCOUNTS = [
    "GabrielBoric",
    "Carolina_Toha",
    "mario_desbordes",
    # Agregar más según relevancia
]


def get_random_instance() -> str:
    """Retorna una instancia Nitter aleatoria."""
    return random.choice(NITTER_INSTANCES)


def search_nitter(query: str, instance: str = None) -> list[dict]:
    """Busca tweets en Nitter."""
    if not instance:
        instance = get_random_instance()

    SCRAPER_LIMITER.consume()

    url = f"{instance}/search"
    params = {"q": query, "f": "tweets"}

    try:
        with httpx.Client(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return _parse_nitter_results(resp.text, instance)

    except httpx.HTTPError as e:
        logger.debug(f"Nitter {instance} no disponible: {e}")
        # Intentar con otra instancia
        for alt_instance in NITTER_INSTANCES:
            if alt_instance != instance:
                try:
                    resp = httpx.get(
                        f"{alt_instance}/search",
                        params=params,
                        headers=HEADERS,
                        timeout=15,
                    )
                    if resp.status_code == 200:
                        return _parse_nitter_results(resp.text, alt_instance)
                except Exception:
                    continue
        return []


def fetch_account_tweets(username: str, instance: str = None) -> list[dict]:
    """Extrae tweets recientes de una cuenta específica."""
    if not instance:
        instance = get_random_instance()

    SCRAPER_LIMITER.consume()

    try:
        with httpx.Client(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(f"{instance}/{username}")
            resp.raise_for_status()
            return _parse_nitter_results(resp.text, instance, username=username)
    except Exception as e:
        logger.debug(f"Error fetch {username}: {e}")
        return []


def _parse_nitter_results(html: str, instance: str, username: str = None) -> list[dict]:
    """Parsea resultados HTML de Nitter."""
    soup = BeautifulSoup(html, "lxml")
    tweets = []

    for tweet_div in soup.select(".timeline-item, .tweet-content"):
        try:
            content = tweet_div.select_one(".tweet-content, .content")
            author = tweet_div.select_one(".username, .fullname")
            date = tweet_div.select_one(".tweet-date a, time")
            link = tweet_div.select_one("a.tweet-link, .tweet-date a")

            text = content.get_text(strip=True) if content else ""
            if not text or len(text) < 10:
                continue

            tweet_url = ""
            if link and link.get("href"):
                href = link["href"]
                tweet_url = href if href.startswith("http") else f"https://twitter.com{href}"

            tweets.append({
                "text": text,
                "author": author.get_text(strip=True) if author else (username or ""),
                "date": date.get_text(strip=True) if date else "",
                "url": tweet_url,
            })

        except Exception as e:
            logger.debug(f"Error parseando tweet: {e}")

    return tweets[:20]  # Max 20 tweets por búsqueda


def tweet_to_text(tweet: dict, query: str = "") -> str:
    """Convierte tweet a texto para análisis IA."""
    return f"""PUBLICACIÓN EN TWITTER/X
Autor: {tweet.get('author', '')}
Fecha: {tweet.get('date', '')}
Búsqueda que lo encontró: {query}
Contenido: {tweet.get('text', '')}
URL original: {tweet.get('url', '')}
"""


def run():
    """Entry point del scraper de Twitter/X."""
    logger.info("Twitter/X (Nitter): iniciando scraping...")

    all_items = []

    # Búsquedas por palabras clave
    for query in SEARCH_QUERIES:
        tweets = search_nitter(query)
        logger.info(f"  '{query}': {len(tweets)} tweets")

        for tweet in tweets:
            all_items.append({
                "source": "twitter_x",
                "raw_text": tweet_to_text(tweet, query),
                "source_url": tweet.get("url"),
                "raw_metadata": {
                    "autor": tweet.get("author"),
                    "fecha": tweet.get("date"),
                    "query": query,
                    "plataforma": "twitter_x",
                },
                "priority": 4,
            })

        polite_sleep(2.0, 4.0)

    # Monitoreo de cuentas políticas
    for account in POLITICAL_ACCOUNTS:
        tweets = fetch_account_tweets(account)
        logger.info(f"  @{account}: {len(tweets)} tweets recientes")

        for tweet in tweets:
            all_items.append({
                "source": "twitter_x",
                "raw_text": tweet_to_text(tweet),
                "source_url": tweet.get("url"),
                "raw_metadata": {
                    "autor": tweet.get("author"),
                    "fecha": tweet.get("date"),
                    "cuenta_monitoreada": account,
                    "plataforma": "twitter_x",
                },
                "priority": 3,
            })

        polite_sleep(3.0, 5.0)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Twitter/X completado: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
