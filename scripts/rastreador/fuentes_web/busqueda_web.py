"""
ATALAYA PANÓPTICA — Scraper: Búsqueda Web Ampliada
Rastrea toda la internet relacionada con Chile: DuckDuckGo, Reddit, foros, YouTube (títulos).
Sin API key requerida.
"""

import logging
import httpx
import json
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep
from scripts.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

# Queries de búsqueda — Chile + corrupción + poder
SEARCH_QUERIES = [
    # Corrupción general
    "corrupción Chile gobierno 2024 2025",
    "licitación irregular Chile empresa contrato",
    "imputado Chile fraude millones pesos",
    "caso judicial Chile ministro alcalde senador",
    "Contraloría dictamen Chile irregular informe",
    "Fiscalía formalización Chile político funcionario",
    "sobreprecios Chile contrato público licitación",
    "conflicto interés Chile funcionario empresa",
    "financiamiento político ilegal Chile empresa",
    "lobby Chile ministerio contrato irregularidad",
    "escándalo Chile municipio alcalde concejal",
    "lobby Chile congreso senado diputado",
    "desvío fondos Chile municipalidad cuenta",
    "colusión empresas Chile SII investigación",
    "caso corrupción Chile 2025 nuevo",
    # Casos específicos conocidos
    "caso SQM financiamiento campaña Chile",
    "Pandora Papers Chile Piñera Dominga",
    "carabineros fondos reservados malversación",
    "caso PENTA UDI financiamiento ilegal",
    "Corpesca lobbying ley pesca Chile",
    # Medios bajo sospecha
    "El Mercurio Edwards dictadura Chile",
    "concentración medios Chile propietario",
    "pauta gubernamental publicidad medios Chile",
    # Poder económico
    "Luksic Chile empresa política lobby",
    "Matte empresa política Chile influencia",
    "Angelini grupo empresa política Chile",
    # Municipios y regiones
    "alcalde Chile formalizado imputado 2024 2025",
    "municipio Chile sobreprecios contrato empresa",
    "concejal Chile irregularidad denuncia",
    # RRSS y desinformación
    "fake news Chile desinformación gobierno",
    "bots Chile Twitter campaña política",
    "astroturfing Chile redes sociales",
]

REDDIT_SUBREDDITS = [
    "r/chile",
    "r/ChileLibre",
    "r/economia",
    "r/LaPoliticaChilena",
]

REDDIT_KEYWORDS = [
    "corrupción", "licitación", "político", "gobierno", "ministerio",
    "alcalde", "municipio", "fraude", "sobreprecios", "lobby",
    "escándalo", "imputado", "Contraloría", "Fiscalía", "empresa",
]


def search_duckduckgo(query: str, max_results: int = 10) -> list[dict]:
    """Búsqueda en DuckDuckGo Instant Answer API (sin API key)."""
    try:
        params = {
            "q": query,
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        }
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get("https://api.duckduckgo.com/", params=params)
            data = resp.json()

        results = []
        # RelatedTopics
        for topic in data.get("RelatedTopics", [])[:max_results]:
            if isinstance(topic, dict) and topic.get("Text"):
                results.append({
                    "title": topic.get("Text", "")[:200],
                    "url": topic.get("FirstURL", ""),
                    "snippet": topic.get("Text", ""),
                })
        return results
    except Exception as e:
        logger.warning(f"DuckDuckGo error para '{query}': {e}")
        return []


def search_duckduckgo_html(query: str, max_results: int = 10) -> list[dict]:
    """Búsqueda DuckDuckGo HTML (más resultados que la API JSON)."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AtalayaBot/1.0; +https://github.com/bomberito111/atalaya-panoptica)"
        }
        params = {"q": query, "kl": "cl-es", "kp": "-1"}
        with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
            resp = client.get("https://html.duckduckgo.com/html/", params=params)

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for result in soup.select(".result__body")[:max_results]:
            title_el = result.select_one(".result__title")
            snippet_el = result.select_one(".result__snippet")
            url_el = result.select_one(".result__url")
            if title_el:
                results.append({
                    "title": title_el.get_text(strip=True),
                    "url": url_el.get_text(strip=True) if url_el else "",
                    "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                })
        return results
    except Exception as e:
        logger.warning(f"DuckDuckGo HTML error para '{query}': {e}")
        return []


def fetch_reddit_subreddit(subreddit: str, keyword: str, limit: int = 25) -> list[dict]:
    """Fetch posts de Reddit con keyword en subreddit (JSON API pública)."""
    try:
        headers = {
            "User-Agent": "AtalayaBot/1.0 (anticorrupción Chile; contact: github.com/bomberito111)"
        }
        url = f"https://www.reddit.com/search.json"
        params = {
            "q": f"{keyword} subreddit:{subreddit.replace('r/', '')}",
            "sort": "new",
            "limit": limit,
            "t": "month",
        }
        with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
            resp = client.get(url, params=params)
            data = resp.json()

        posts = []
        for item in data.get("data", {}).get("children", []):
            post = item.get("data", {})
            if not post.get("title"):
                continue
            posts.append({
                "title": post.get("title", ""),
                "url": f"https://reddit.com{post.get('permalink', '')}",
                "snippet": post.get("selftext", "")[:500] or post.get("title", ""),
                "score": post.get("score", 0),
                "comments": post.get("num_comments", 0),
            })
        return posts
    except Exception as e:
        logger.warning(f"Reddit error {subreddit}/{keyword}: {e}")
        return []


def result_to_text(result: dict, source: str, query: str) -> str:
    return f"""BÚSQUEDA WEB — {source.upper()}
Consulta: {query}
Título: {result.get('title', '')}
URL: {result.get('url', '')}
Extracto: {clean_text(result.get('snippet', ''))}
"""


def run():
    """Entry point del scraper de búsqueda web ampliada."""
    logger.info("Búsqueda web: rastreando internet relacionada con Chile...")
    all_items = []

    # 1. DuckDuckGo — TODAS las queries de corrupción (max datos posible)
    for query in SEARCH_QUERIES:
        SCRAPER_LIMITER.consume()
        results = search_duckduckgo_html(query, max_results=15)
        logger.info(f"  DDG '{query[:40]}...': {len(results)} resultados")

        for r in results:
            all_items.append({
                "source": "busqueda_duckduckgo",
                "raw_text": result_to_text(r, "DuckDuckGo", query),
                "source_url": r.get("url") or f"https://duckduckgo.com/?q={query}",
                "raw_metadata": {
                    "query": query,
                    "titulo": r.get("title"),
                    "motor": "duckduckgo",
                },
                "priority": 4,
            })
        polite_sleep(1.5, 3.0)

    # 2. Reddit — subreddits chilenos
    for subreddit in REDDIT_SUBREDDITS:
        for keyword in REDDIT_KEYWORDS:  # Todas las keywords
            SCRAPER_LIMITER.consume()
            posts = fetch_reddit_subreddit(subreddit, keyword, limit=25)
            logger.info(f"  Reddit {subreddit}/{keyword}: {len(posts)} posts")

            for post in posts:
                if post.get("score", 0) < 5 and post.get("comments", 0) < 2:
                    continue  # Filtrar posts irrelevantes
                all_items.append({
                    "source": "reddit_chile",
                    "raw_text": result_to_text(post, f"Reddit {subreddit}", keyword),
                    "source_url": post.get("url"),
                    "raw_metadata": {
                        "subreddit": subreddit,
                        "keyword": keyword,
                        "score": post.get("score"),
                        "comments": post.get("comments"),
                    },
                    "priority": 5,
                })
            polite_sleep(2.0, 4.0)

    inserted, dupes = enqueue_batch(all_items)
    logger.info(f"Búsqueda web completada: {inserted} nuevas, {dupes} duplicadas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
