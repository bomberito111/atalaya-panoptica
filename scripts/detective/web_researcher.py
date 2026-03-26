"""
ATALAYA PANÓPTICA — Investigador Web del Detective
Antes de confirmar una anomalía, el Detective busca en internet para:
1. Verificar que el caso existe y tiene respaldo periodístico
2. Encontrar evidencia adicional
3. Verificar que las URLs de evidencia son válidas (HTTP 200)
4. Detectar si la entidad tiene casos RECIENTES (no históricos)
5. Notar si la entidad ya no está activa (fallecida, empresa disuelta, etc.)
"""

import logging
import urllib.parse
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from scripts.utils.rate_limiter import SCRAPER_LIMITER, polite_sleep

logger = logging.getLogger(__name__)

# ── Entidades fallecidas conocidas (Chile) ─────────────────────────────────

DECEASED_ENTITIES: dict[str, dict] = {
    "Sebastián Piñera": {
        "deceased": True,
        "date": "2024-02-06",
        "note": "Falleció en accidente helicóptero Lago Ranco",
    },
    "Sebastian Piñera": {
        "deceased": True,
        "date": "2024-02-06",
        "note": "Falleció en accidente helicóptero Lago Ranco",
    },
}

# ── Headers para evitar bloqueos básicos ───────────────────────────────────

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; AtalayaPanoptica/1.0; "
        "+https://github.com/atalaya-panoptica)"
    ),
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
}

# URL base de DuckDuckGo HTML (sin JS)
_DDG_HTML = "https://html.duckduckgo.com/html/"

# Sitios chilenos de noticias que se priorizan en los resultados
_CHILEAN_NEWS_DOMAINS = {
    "biobio.cl",
    "emol.com",
    "latercera.com",
    "elmostrador.cl",
    "ciper.cl",
    "cooperativa.cl",
    "t13.cl",
    "meganoticias.cl",
    "24horas.cl",
    "df.cl",
    "diariofinanciero.cl",
}


# ── Funciones públicas ─────────────────────────────────────────────────────


def search_entity_news(
    entity_name: str,
    anomaly_type: str,
    max_results: int = 5,
) -> list[dict]:
    """
    Busca en DuckDuckGo HTML noticias sobre una entidad y un tipo de anomalía.

    Args:
        entity_name: Nombre de la persona o empresa a investigar.
        anomaly_type: Tipo de anomalía (ej. "sobreprecio", "conflicto de interés").
        max_results: Número máximo de resultados a retornar.

    Returns:
        Lista de dicts con claves {"title", "url", "snippet"}.
        Los resultados de dominios chilenos aparecen primero.
    """
    query = f'"{entity_name}" {anomaly_type} Chile'
    logger.info(f"Buscando noticias: {query!r}")

    SCRAPER_LIMITER.consume()
    polite_sleep(1.0, 2.5)

    try:
        with httpx.Client(headers=_HEADERS, follow_redirects=True, timeout=12) as client:
            response = client.post(
                _DDG_HTML,
                data={"q": query, "kl": "cl-es"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning(f"Error al buscar en DuckDuckGo: {exc}")
        return []

    results = _parse_ddg_html(response.text, max_results * 2)

    # Ordenar: primero los de dominios chilenos conocidos
    chilean = [r for r in results if _is_chilean_domain(r["url"])]
    others = [r for r in results if not _is_chilean_domain(r["url"])]
    ordered = (chilean + others)[:max_results]

    logger.debug(f"Resultados encontrados: {len(ordered)} (chilenos: {len(chilean)})")
    return ordered


def verify_url(url: str, timeout: int = 8) -> bool:
    """
    Verifica que una URL responde con HTTP 200, 301 o 302 (enlace válido).

    Args:
        url: URL a verificar.
        timeout: Segundos antes de dar timeout.

    Returns:
        True si la URL es accesible, False en caso contrario.
    """
    if not url or not url.startswith(("http://", "https://")):
        return False

    try:
        SCRAPER_LIMITER.consume()
        with httpx.Client(
            headers=_HEADERS,
            follow_redirects=False,
            timeout=timeout,
        ) as client:
            resp = client.head(url)
            valid = resp.status_code in (200, 301, 302, 303, 307, 308)
            logger.debug(f"verify_url {url} → {resp.status_code} ({'OK' if valid else 'FAIL'})")
            return valid
    except (httpx.TimeoutException, httpx.HTTPError, Exception) as exc:
        logger.debug(f"verify_url falló para {url}: {exc}")
        return False


def get_entity_status(entity_name: str) -> dict:
    """
    Determina si una entidad (persona o empresa) está activa o ya no existe.

    Primero consulta la lista hardcodeada de fallecidos. Si no está ahí,
    realiza una búsqueda web sobre fallecimiento o disolución.

    Args:
        entity_name: Nombre de la entidad.

    Returns:
        Dict con claves {"active": bool, "deceased": bool, "note": str}.
    """
    # 1. Revisar lista estática de fallecidos conocidos
    for key, info in DECEASED_ENTITIES.items():
        if key.lower() == entity_name.strip().lower():
            logger.info(f"Entidad '{entity_name}' encontrada en lista de fallecidos: {info['note']}")
            return {
                "active": False,
                "deceased": True,
                "note": f"{info['note']} ({info['date']})",
            }

    # 2. Búsqueda web sobre estado
    query = f'"{entity_name}" fallecido OR muerto OR disuelto OR cerrado'
    logger.debug(f"Buscando estado de entidad: {query!r}")

    SCRAPER_LIMITER.consume()
    polite_sleep(0.8, 2.0)

    try:
        with httpx.Client(headers=_HEADERS, follow_redirects=True, timeout=12) as client:
            response = client.post(
                _DDG_HTML,
                data={"q": query, "kl": "cl-es"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning(f"Error buscando estado de entidad '{entity_name}': {exc}")
        return {"active": True, "deceased": False, "note": "No se pudo verificar estado"}

    results = _parse_ddg_html(response.text, max_results=3)

    if not results:
        return {"active": True, "deceased": False, "note": "Sin resultados de estado"}

    # Analizar snippets en busca de palabras clave de inactividad
    inactivity_keywords = {"fallecido", "falleció", "muerto", "murió", "disuelto", "cerrado", "liquidado"}
    combined_text = " ".join(
        (r.get("title", "") + " " + r.get("snippet", "")).lower()
        for r in results
    )

    found_keywords = [kw for kw in inactivity_keywords if kw in combined_text]

    if found_keywords:
        deceased = any(kw in found_keywords for kw in {"fallecido", "falleció", "muerto", "murió"})
        note = f"Posiblemente inactivo (palabras detectadas: {', '.join(found_keywords)})"
        logger.info(f"Entidad '{entity_name}' posiblemente inactiva: {note}")
        return {"active": False, "deceased": deceased, "note": note}

    return {"active": True, "deceased": False, "note": "Sin indicios de inactividad"}


def enrich_anomaly_context(
    entity_names: list[str],
    anomaly_type: str,
    existing_evidence_url: Optional[str] = None,
) -> dict:
    """
    Enriquece el contexto de una anomalía con información web.

    Combina búsqueda de noticias, verificación de URL y estado de entidades
    para producir un contexto completo que el Detective puede usar para
    ajustar la confianza de la anomalía.

    Args:
        entity_names: Lista de nombres de entidades involucradas.
        anomaly_type: Tipo de anomalía detectada.
        existing_evidence_url: URL de evidencia ya conocida (opcional).

    Returns:
        Dict con:
            "verified": bool — si hay al menos una fuente corroborante,
            "sources": list[dict] — noticias encontradas,
            "entity_statuses": dict — estado de cada entidad,
            "confidence_adjustment": float — ajuste sugerido de confianza.
    """
    all_sources: list[dict] = []
    entity_statuses: dict[str, dict] = {}
    confidence_adjustment: float = 0.0

    # 1. Verificar URL de evidencia existente
    url_valid: Optional[bool] = None
    if existing_evidence_url:
        url_valid = verify_url(existing_evidence_url)
        if not url_valid:
            logger.warning(f"URL de evidencia inválida: {existing_evidence_url}")
            confidence_adjustment -= 0.2
        else:
            logger.debug(f"URL de evidencia válida: {existing_evidence_url}")

    # 2. Buscar noticias por cada entidad principal (máx. 2 para no spamear)
    primary_entities = entity_names[:2]
    for entity in primary_entities:
        news = search_entity_news(entity, anomaly_type, max_results=5)
        for item in news:
            # Evitar duplicados por URL
            if not any(s["url"] == item["url"] for s in all_sources):
                all_sources.append(item)

    # 3. Ajuste positivo si hay múltiples fuentes
    if len(all_sources) >= 3:
        confidence_adjustment += 0.1
        logger.debug(f"Ajuste +0.1 por {len(all_sources)} fuentes encontradas")

    # 4. Verificar estado de cada entidad
    for entity in entity_names:
        status = get_entity_status(entity)
        entity_statuses[entity] = status

    verified = len(all_sources) > 0 or url_valid is True

    result = {
        "verified": verified,
        "sources": all_sources,
        "entity_statuses": entity_statuses,
        "confidence_adjustment": round(confidence_adjustment, 2),
    }

    logger.info(
        f"Contexto enriquecido: verified={verified}, "
        f"fuentes={len(all_sources)}, "
        f"ajuste_confianza={confidence_adjustment:+.2f}"
    )
    return result


# ── Helpers internos ───────────────────────────────────────────────────────


def _parse_ddg_html(html: str, max_results: int = 10) -> list[dict]:
    """Extrae resultados de búsqueda del HTML de DuckDuckGo."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []

    for result_div in soup.select(".result__body"):
        if len(results) >= max_results:
            break

        title_tag = result_div.select_one(".result__title a")
        snippet_tag = result_div.select_one(".result__snippet")

        if not title_tag:
            continue

        title = title_tag.get_text(strip=True)
        raw_href = title_tag.get("href", "")
        url = _extract_ddg_url(raw_href)
        snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""

        if url and title:
            results.append({"title": title, "url": url, "snippet": snippet})

    return results


def _extract_ddg_url(href: str) -> str:
    """
    DuckDuckGo wraps links as //duckduckgo.com/l/?uddg=<encoded_url>.
    Extrae la URL real del parámetro 'uddg'.
    """
    if not href:
        return ""

    if href.startswith("//"):
        href = "https:" + href

    try:
        parsed = urllib.parse.urlparse(href)
        params = urllib.parse.parse_qs(parsed.query)
        uddg = params.get("uddg", [None])[0]
        if uddg:
            return urllib.parse.unquote(uddg)
    except Exception:
        pass

    # Si ya es una URL directa, devolverla tal cual
    if href.startswith("http"):
        return href

    return ""


def _is_chilean_domain(url: str) -> bool:
    """Retorna True si la URL pertenece a un medio chileno conocido."""
    try:
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        return any(host == domain or host.endswith("." + domain) for domain in _CHILEAN_NEWS_DOMAINS)
    except Exception:
        return False
