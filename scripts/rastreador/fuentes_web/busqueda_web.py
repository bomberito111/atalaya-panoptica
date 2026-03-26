"""
ATALAYA PANÓPTICA — Scraper: Búsqueda Web Ampliada
Rastrea toda la internet relacionada con Chile: DuckDuckGo, Reddit, Google News RSS.
Sin API key requerida.
"""

import logging
import httpx
import feedparser
from urllib.parse import quote_plus
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep
from scripts.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

# Queries de búsqueda — Chile + corrupción + poder
SEARCH_QUERIES = [
    # ── Corrupción general ─────────────────────────────────────────────────
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
    # ── Casos específicos conocidos ────────────────────────────────────────
    "caso SQM financiamiento campaña Chile",
    "Pandora Papers Chile Piñera Dominga",
    "carabineros fondos reservados malversación",
    "caso PENTA UDI financiamiento ilegal",
    "Corpesca lobbying ley pesca Chile",
    "caso Convenios Chile 2023",
    "caso Democracia Viva Chile",
    "Fundación Democracia Viva Chile irregularidad",
    # ── Medios y comunicaciones ────────────────────────────────────────────
    "El Mercurio Edwards dictadura Chile",
    "concentración medios Chile propietario",
    "pauta gubernamental publicidad medios Chile",
    # ── Poder económico ────────────────────────────────────────────────────
    "Luksic Chile empresa política lobby",
    "Matte empresa política Chile influencia",
    "Angelini grupo empresa política Chile",
    # ── Municipios y regiones ──────────────────────────────────────────────
    "alcalde Chile formalizado imputado 2024 2025",
    "municipio Chile sobreprecios contrato empresa",
    "concejal Chile irregularidad denuncia",
    # ── RRSS y desinformación ──────────────────────────────────────────────
    "fake news Chile desinformación gobierno",
    "bots Chile Twitter campaña política",
    "astroturfing Chile redes sociales",
    # ── Ministerios ───────────────────────────────────────────────────────
    "Ministerio Salud Chile licitación sobreprecios contrato",
    "Ministerio Educación Chile licitación irregularidad",
    "Ministerio Obras Públicas Chile contrato empresa irregular",
    "Ministerio Interior Chile contrato irregularidad empresa",
    "Ministerio Hacienda Chile empresa contrato lobby",
    "Ministerio Justicia Chile licitación empresa contrato",
    "Ministerio Defensa Chile contrato empresa irregular",
    "Ministerio Economía Chile licitación empresa sobreprecios",
    "Ministerio Vivienda Chile contrato empresa irregularidad",
    "Ministerio Agricultura Chile licitación empresa",
    "Ministerio Energía Chile contrato empresa irregular",
    "Ministerio Transportes Chile licitación empresa sobreprecios",
    "Ministerio Trabajo Chile contrato empresa irregularidad",
    "Ministerio Medio Ambiente Chile empresa sanción SMA",
    "Ministerio Cultura Chile FONDART irregularidad",
    "Ministerio Ciencia Chile FONDECYT irregularidad contrato",
    "Ministerio Deporte Chile licitación empresa",
    "Ministerio Mujer Chile contrato empresa irregularidad",
    "Ministerio Pueblos Indígenas Chile licitación empresa",
    "Segpres Chile contrato empresa irregularidad",
    "Segegob Chile pauta publicitaria empresa",
    "Cancillería Chile Relaciones Exteriores contrato empresa",
    # ── Regiones — corrupción territorial ────────────────────────────────
    "corrupción Arica Parinacota Chile municipio",
    "corrupción Tarapacá Iquique Chile licitación",
    "corrupción Antofagasta Chile minería contrato empresa",
    "corrupción Atacama Copiapó Chile municipio licitación",
    "corrupción Coquimbo La Serena Chile municipio",
    "corrupción Valparaíso Chile municipio alcalde irregularidad",
    "corrupción Región Metropolitana Santiago Chile municipio",
    "corrupción O'Higgins Rancagua Chile municipio alcalde",
    "corrupción Maule Talca Chile municipio licitación",
    "corrupción Ñuble Chillán Chile municipio irregularidad",
    "corrupción Biobío Concepción Chile municipio contrato",
    "corrupción Araucanía Temuco Chile municipio irregularidad",
    "corrupción Los Ríos Valdivia Chile municipio licitación",
    "corrupción Los Lagos Puerto Montt Chile municipio",
    "corrupción Aysén Coyhaique Chile municipio contrato",
    "corrupción Magallanes Punta Arenas Chile municipio",
    # ── Hospitales y FONASA ────────────────────────────────────────────────
    "hospital Chile licitación sobreprecios empresa",
    "FONASA Chile contrato empresa irregularidad",
    "hospital público Chile irregularidad contrato proveedor",
    "FONASA Chile licitación sobreprecios médico",
    # ── Carabineros y Fuerzas Armadas ─────────────────────────────────────
    "Carabineros Chile contrato empresa irregularidad",
    "Carabineros Chile licitación sobreprecios empresa",
    "FFAA Chile licitación armas contrato irregular",
    "Ejército Chile contrato irregularidad empresa",
    "Armada Chile licitación empresa contrato irregular",
    "Fuerza Aérea Chile contrato empresa irregularidad",
    # ── Educación ─────────────────────────────────────────────────────────
    "municipio Chile sostenedor educación irregularidad contrato",
    "universidad Chile licitación irregularidad rector",
    "DAEM Chile sostenedor irregularidad contrato empresa",
    # ── Agua y recursos naturales ─────────────────────────────────────────
    "agua potable Chile empresa concesión contrato",
    "minería Chile concesión ambiental empresa irregular",
    "pesca Chile cuota empresa irregularidad",
    # ── Empresas del Estado ───────────────────────────────────────────────
    "CODELCO Chile irregularidad contrato empresa",
    "ENAP Chile licitación empresa sobreprecios",
    "EFE Chile contrato sobreprecios empresa",
    "Metro Chile licitación empresa contrato",
    "ENAMI Chile contrato empresa irregularidad",
    "BancoEstado Chile contrato empresa irregularidad",
    "CORFO Chile empresa subsidio irregularidad",
    "TVN Chile contrato empresa irregularidad",
    # ── Poder Judicial ────────────────────────────────────────────────────
    "juez Chile caso corrupción formalización",
    "fiscal Chile formalización político caso",
    "corrupción poder judicial Chile caso",
    # ── Municipios específicos ─────────────────────────────────────────────
    "municipio Santiago Chile contrato empresa irregularidad",
    "municipio Maipú Chile licitación sobreprecios",
    "municipio Las Condes Chile contrato empresa",
    "municipio Puente Alto Chile licitación empresa",
    "municipio La Florida Chile contrato irregularidad",
    "municipio Antofagasta Chile licitación empresa sobreprecios",
    "municipio Viña del Mar Chile contrato empresa",
    "municipio Valparaíso Chile licitación irregularidad",
    "municipio Concepción Chile contrato empresa",
    "municipio Temuco Chile licitación empresa sobreprecios",
    # ── Fondos públicos ────────────────────────────────────────────────────
    "FONDART Chile irregularidad fundación",
    "FONDECYT Chile irregularidad contrato",
    "Chile Compra irregularidad licitación empresa",
    "SENCE Chile empresa capacitación irregularidad",
    "FOSIS Chile empresa irregularidad contrato",
    # ── Partidos políticos ─────────────────────────────────────────────────
    "RN Renovación Nacional Chile financiamiento irregular empresa",
    "UDI Chile financiamiento ilegal empresa contrato",
    "PS Partido Socialista Chile financiamiento empresa irregular",
    "PPD Chile financiamiento irregular empresa",
    "Partido Comunista Chile financiamiento empresa",
    "Frente Amplio Chile financiamiento empresa irregular",
    "DC Democracia Cristiana Chile financiamiento empresa",
    "Evópoli Chile financiamiento empresa irregular",
    "Revolución Democrática Chile financiamiento empresa",
    "Convergencia Social Chile financiamiento empresa",
    # ── Medio ambiente ────────────────────────────────────────────────────
    "SMA Chile empresa sanción ambiental irregularidad",
    "CONAF Chile contrato empresa irregularidad",
    "SEA Chile empresa proyecto ambiental contrato",
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
    "FONASA", "hospital", "Carabineros", "Ejército", "FFAA",
    "CODELCO", "ENAP", "EFE", "Metro", "CORFO",
    "FONDART", "FONDECYT", "SENCE", "adjudicación", "contrato",
    "irregularidad", "malversación", "financiamiento", "partido",
    "diputado", "senador", "intendente", "gobernador",
]

# Queries prioritarias para Google News RSS (las más importantes)
GOOGLE_NEWS_PRIORITY_QUERIES = [
    "corrupción Chile gobierno 2025",
    "caso Convenios Chile Democracia Viva",
    "licitación irregular Chile ministerio",
    "imputado Chile fraude funcionario",
    "Fiscalía Chile político formalización",
    "Contraloría Chile irregularidad dictamen",
    "CODELCO Chile irregularidad contrato",
    "Carabineros Chile contrato irregularidad",
    "hospital Chile FONASA licitación sobreprecios",
    "alcalde Chile imputado formalizado",
    "municipio Chile sobreprecios contrato",
    "Chile Compra irregularidad empresa",
    "Ministerio Chile contrato empresa escándalo",
    "lobby Chile congreso empresa",
    "financiamiento político Chile empresa ilegal",
    "SMA Chile empresa sanción ambiental",
    "caso corrupción Chile 2024 2025",
    "FONASA Chile contrato empresa irregular",
    "Ejército Chile contrato irregularidad",
    "CORFO Chile empresa subsidio irregular",
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


def search_bing_news_rss(query: str, max_results: int = 10) -> list[dict]:
    """Búsqueda Bing News RSS (sin API key, excelente cobertura de noticias chilenas)."""
    try:
        encoded_query = quote_plus(query)
        rss_url = (
            f"https://www.bing.com/news/search"
            f"?q={encoded_query}&format=rss&cc=CL&mkt=es-CL&setlang=es-CL"
        )
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AtalayaBot/1.0; +https://github.com/bomberito111/atalaya-panoptica)"
        }
        with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
            resp = client.get(rss_url)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        results = []
        for entry in feed.entries[:max_results]:
            results.append({
                "title": entry.get("title", ""),
                "url": entry.get("link", ""),
                "snippet": entry.get("summary", entry.get("title", "")),
                "published": entry.get("published", ""),
            })
        return results
    except Exception as e:
        logger.warning(f"Bing News RSS error para '{query}': {e}")
        return []


def search_google_news_rss(query: str, max_results: int = 10) -> list[dict]:
    """
    Fetch Google News RSS feed para noticias chilenas.
    URL: https://news.google.com/rss/search?q={query}&hl=es-CL&gl=CL&ceid=CL:es
    Retorna lista de {title, url, snippet, published}.
    """
    try:
        encoded_query = quote_plus(query)
        rss_url = (
            f"https://news.google.com/rss/search"
            f"?q={encoded_query}&hl=es-CL&gl=CL&ceid=CL:es"
        )
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AtalayaBot/1.0; +https://github.com/bomberito111/atalaya-panoptica)"
        }
        with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
            resp = client.get(rss_url)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        results = []
        for entry in feed.entries[:max_results]:
            title = entry.get("title", "")
            url = entry.get("link", "")
            snippet = entry.get("summary", title)
            published = entry.get("published", "")
            results.append({
                "title": title,
                "url": url,
                "snippet": snippet,
                "published": published,
            })
        return results
    except Exception as e:
        logger.warning(f"Google News RSS error para '{query}': {e}")
        return []


def fetch_reddit_subreddit(subreddit: str, keyword: str, limit: int = 25) -> list[dict]:
    """Fetch posts de Reddit con keyword en subreddit (JSON API pública)."""
    try:
        headers = {
            "User-Agent": "AtalayaBot/1.0 (anticorrupcion Chile; contact: github.com/bomberito111)"
        }
        # URL-encode query manualmente para evitar errores ASCII con acentos
        q = quote_plus(f"{keyword} subreddit:{subreddit.replace('r/', '')}")
        url = f"https://www.reddit.com/search.json?q={q}&sort=new&limit={limit}&t=month"
        with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
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


def result_to_text_news(result: dict, query: str) -> str:
    return f"""GOOGLE NEWS RSS — CHILE
Consulta: {query}
Título: {result.get('title', '')}
URL: {result.get('url', '')}
Publicado: {result.get('published', '')}
Extracto: {clean_text(result.get('snippet', ''))}
"""


def run():
    """Entry point del scraper de búsqueda web ampliada."""
    logger.info("Búsqueda web: rastreando internet relacionada con Chile...")
    all_items = []

    # 1. Google News RSS — TODAS las queries de corrupción (no solo prioritarias)
    logger.info("Google News RSS: procesando todas las queries...")
    all_gnews_queries = list(dict.fromkeys(GOOGLE_NEWS_PRIORITY_QUERIES + SEARCH_QUERIES))
    for query in all_gnews_queries:
        SCRAPER_LIMITER.consume()
        results = search_google_news_rss(query, max_results=10)
        logger.info(f"  GNews '{query[:50]}...': {len(results)} resultados")

        for r in results:
            all_items.append({
                "source": "google_news_rss",
                "raw_text": result_to_text_news(r, query),
                "source_url": r.get("url") or f"https://news.google.com/search?q={query}",
                "raw_metadata": {
                    "query": query,
                    "titulo": r.get("title"),
                    "published": r.get("published"),
                    "motor": "google_news_rss",
                },
                "priority": 3,
            })
        polite_sleep(1.5, 3.0)

    # 2. Bing News RSS — mismas queries para mayor cobertura
    logger.info("Bing News RSS: procesando queries prioritarias...")
    for query in GOOGLE_NEWS_PRIORITY_QUERIES:  # Solo prioritarias para no duplicar
        SCRAPER_LIMITER.consume()
        results = search_bing_news_rss(query, max_results=10)
        logger.info(f"  Bing '{query[:50]}...': {len(results)} resultados")

        for r in results:
            all_items.append({
                "source": "bing_news_rss",
                "raw_text": result_to_text_news(r, query),
                "source_url": r.get("url") or f"https://www.bing.com/news/search?q={query}",
                "raw_metadata": {
                    "query": query,
                    "titulo": r.get("title"),
                    "published": r.get("published"),
                    "motor": "bing_news_rss",
                },
                "priority": 3,
            })
        polite_sleep(1.5, 3.0)

    # 3. Reddit — subreddits chilenos
    logger.info("Reddit: rastreando subreddits chilenos...")
    for subreddit in REDDIT_SUBREDDITS:
        for keyword in REDDIT_KEYWORDS:
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
