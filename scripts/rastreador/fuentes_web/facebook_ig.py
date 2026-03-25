"""
ATALAYA PANÓPTICA — Scraper: Facebook e Instagram (páginas públicas)
Extrae publicaciones de páginas públicas de partidos políticos y funcionarios.
Sin login requerido — solo páginas públicas.
Nota: Meta aplica bloqueos agresivos; cobertura limitada sin API oficial.
"""

import logging
import httpx
from bs4 import BeautifulSoup
from scripts.rastreador.queue_manager import enqueue_batch
from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Accept-Language": "es-CL,es;q=0.8",
}

# Páginas públicas de partidos y organismos chilenos
FACEBOOK_PAGES = [
    # Formato: (nombre, url_publica)
    ("Partido Socialista Chile", "https://www.facebook.com/PartidoSocialistaChile"),
    ("UDI Chile", "https://www.facebook.com/udichile"),
    ("RN Chile", "https://www.facebook.com/renovacionnacional"),
    ("Frente Amplio", "https://www.facebook.com/FrenteAmplio.cl"),
]


def fetch_public_page(name: str, url: str) -> list[dict]:
    """
    Intenta extraer posts públicos de una página de Facebook.
    Limitado por protecciones de Meta.
    """
    SCRAPER_LIMITER.consume()

    try:
        # Usar versión móvil (más simple y scrappeable)
        mobile_url = url.replace("www.facebook.com", "m.facebook.com")

        with httpx.Client(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            resp = client.get(mobile_url)

            # Meta bloquea muchas peticiones con 302/login redirect
            if resp.url.path.startswith("/login") or "login" in str(resp.url):
                logger.debug(f"{name}: requiere login (página posiblemente privada)")
                return []

            soup = BeautifulSoup(resp.text, "lxml")
            posts = []

            # Estructura simplificada de posts en versión móvil
            for post_div in soup.select("div[data-ft], .story_body_container, ._5rgt"):
                text = post_div.get_text(separator=" ", strip=True)
                if text and len(text) > 30:
                    posts.append({
                        "text": text[:500],
                        "source_name": name,
                        "url": url,
                    })

            return posts[:10]

    except Exception as e:
        logger.debug(f"Error scraping {name}: {e}")
        return []


def post_to_text(post: dict) -> str:
    return f"""PUBLICACIÓN EN FACEBOOK/INSTAGRAM
Página: {post.get('source_name', '')}
Contenido: {post.get('text', '')}
URL página: {post.get('url', '')}
"""


def run():
    """Entry point del scraper de Facebook/Instagram."""
    logger.info("Facebook/Instagram: extrayendo publicaciones públicas...")
    logger.warning("Cobertura limitada por protecciones de Meta. Se recomienda integrar Graph API en Fase 4.")

    all_items = []

    for name, url in FACEBOOK_PAGES:
        posts = fetch_public_page(name, url)
        logger.info(f"  {name}: {len(posts)} posts")

        for post in posts:
            all_items.append({
                "source": "facebook",
                "raw_text": post_to_text(post),
                "source_url": url,
                "raw_metadata": {
                    "pagina": name,
                    "plataforma": "facebook",
                },
                "priority": 5,
            })

        polite_sleep(3.0, 6.0)  # Pausa larga para evitar bloqueos

    inserted, dupes = enqueue_batch(all_items) if all_items else (0, 0)
    logger.info(f"Facebook/Instagram completado: {inserted} nuevas")
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
