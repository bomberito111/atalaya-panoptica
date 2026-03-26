"""
ATALAYA PANÓPTICA — Investigador Automático
Cuando el Detective detecta una anomalía, este módulo investiga más a fondo:
- Busca noticias adicionales sobre las entidades involucradas
- Consulta portales de transparencia (ChileCompra, SIAC, Contraloría)
- Genera un informe periodístico completo usando Groq/Llama3
- Encola el informe en investigation_queue con prioridad=1

Diseñado para ejecutarse DESPUÉS del Detective principal.
"""

import logging
import httpx
import feedparser
from urllib.parse import quote_plus
from scripts.utils.supabase_client import get_client
from scripts.detective.groq_client import chat_json
from scripts.rastreador.queue_manager import enqueue
from scripts.utils.rate_limiter import polite_sleep

logger = logging.getLogger(__name__)

INFORME_SYSTEM = """Eres un periodista de investigación especializado en corrupción del Estado chileno.
Tu trabajo es generar informes periodísticos completos y verificables, estilo «CIPER Chile» o «La Bot».
Debes citar fechas, montos, nombres reales y fuentes concretas. NUNCA inventes datos.
Responde SIEMPRE en JSON válido."""

INFORME_PROMPT = """Basándote en la anomalía detectada y el contexto adicional encontrado, genera un informe periodístico completo.

ANOMALÍA DETECTADA:
Tipo: {tipo}
Descripción: {descripcion}
Entidades involucradas: {entidades}
Evidencia original: {evidencia}
Fecha del hecho: {fecha_evento}
Fuente original: {source_url}

CONTEXTO ADICIONAL ENCONTRADO:
{contexto_adicional}

DATOS DE TRANSPARENCIA:
{datos_transparencia}

Genera el informe en JSON:
{{
  "titular": "Titular periodístico impactante (máx. 15 palabras)",
  "subtitular": "Subtítulo que explica el hallazgo central (1 oración)",
  "cuerpo_informe": "Informe completo de 3-5 párrafos. Primer párrafo: responde QUIÉN, QUÉ, CUÁNDO, CUÁNTO y DÓNDE. Segundo párrafo: antecedentes y contexto. Tercer párrafo: evidencia específica. Cuarto párrafo: implicancias y lo que falta investigar.",
  "entidades_clave": ["Nombre1", "Nombre2"],
  "montos_detectados": ["$X millones CLP por Y"],
  "fechas_clave": ["DD-MM-YYYY: evento"],
  "fuentes_adicionales": ["URL1", "URL2"],
  "confianza_informe": 0.0-1.0,
  "lineas_investigacion": ["Línea 1: qué debería revisar un fiscal", "Línea 2: qué pedir por transparencia"],
  "palabras_clave": ["keyword1", "keyword2"]
}}
IMPORTANTE: Solo incluye datos verificables de las fuentes proporcionadas. No inventes montos ni nombres.
"""


def buscar_en_google_news(query: str, max_results: int = 5) -> list[dict]:
    """Busca noticias adicionales sobre una entidad en Google News RSS."""
    try:
        dated_query = query + " Chile after:2024-01-01"
        encoded = quote_plus(dated_query)
        url = f"https://news.google.com/rss/search?q={encoded}&hl=es-CL&gl=CL&ceid=CL:es"
        headers = {"User-Agent": "Mozilla/5.0 (compatible; AtalayaBot/1.0)"}
        with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
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
        logger.warning(f"Google News error para '{query}': {e}")
        return []


def buscar_en_chilecompra(entidad: str, max_results: int = 5) -> list[dict]:
    """Consulta la API pública de ChileCompra para buscar contratos de una entidad."""
    try:
        url = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"
        params = {
            "busqueda": entidad,
            "estado": "adjudicada",
            "cantidad": max_results,
        }
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()
        contratos = []
        for licit in (data.get("Listado") or [])[:max_results]:
            contratos.append({
                "nombre": licit.get("Nombre", ""),
                "monto": licit.get("MontoEstimado", ""),
                "fecha": licit.get("FechaCierre", ""),
                "organismo": licit.get("NombreOrganismo", ""),
                "codigo": licit.get("CodigoExterno", ""),
                "url": f"https://www.mercadopublico.cl/Licitacion/Index/{licit.get('CodigoExterno', '')}",
            })
        return contratos
    except Exception as e:
        logger.warning(f"ChileCompra API error para '{entidad}': {e}")
        return []


def buscar_contraloria(entidad: str, max_results: int = 5) -> list[dict]:
    """Busca resoluciones de Contraloría relacionadas con una entidad vía Google News."""
    query = f'Contraloría Chile "{entidad}" dictamen irregularidad'
    return buscar_en_google_news(query, max_results)


def buscar_siac(entidad: str) -> list[dict]:
    """Busca información en portales de transparencia vía Google News."""
    query = f'transparencia Chile "{entidad}" presupuesto gasto portal SIAC'
    return buscar_en_google_news(query, 3)


def investigar_anomalia(anomalia: dict) -> bool:
    """
    Investiga una anomalía a fondo y genera un informe periodístico.
    Retorna True si se generó y encoló un informe.
    """
    evidence = anomalia.get("evidence", {}) or {}
    entidades = evidence.get("entidades_nombradas", []) or []
    descripcion = anomalia.get("description", "")
    tipo = anomalia.get("anomaly_type", "conflicto_interes")
    fecha_evento = evidence.get("fecha_evento", "") or anomalia.get("created_at", "")[:10]
    source_url = evidence.get("source_url", "") or ""
    evidencia_original = evidence.get("texto", "") or ""

    if not entidades:
        logger.debug(f"Anomalía {anomalia['id']}: sin entidades nombradas, saltando")
        return False

    logger.info(f"Investigando anomalía {anomalia['id']}: {entidades[:3]}")

    # ── Recolectar contexto adicional ──────────────────────────────────────────
    noticias_adicionales = []
    datos_chilecompra = []
    datos_contraloria = []

    # Buscar noticias sobre las entidades más importantes
    for entidad in entidades[:3]:
        if len(entidad) < 4:
            continue
        polite_sleep(1.0, 2.0)
        noticias = buscar_en_google_news(f'"{entidad}" corrupción Chile irregularidad', 3)
        noticias_adicionales.extend(noticias)

        polite_sleep(0.5, 1.0)
        contratos = buscar_en_chilecompra(entidad, 3)
        datos_chilecompra.extend(contratos)

        polite_sleep(0.5, 1.0)
        resoluciones = buscar_contraloria(entidad, 2)
        datos_contraloria.extend(resoluciones)

    # Buscar por tema general de la anomalía
    polite_sleep(1.0, 2.0)
    tema_query = {
        "sobreprecio": "sobreprecios Chile licitación 2024 2025",
        "conflicto_interes": "conflicto interés Chile funcionario empresa 2024",
        "puerta_giratoria": "puerta giratoria Chile exfuncionario empresa 2024",
    }.get(tipo, "corrupción Chile 2024 2025")
    noticias_tema = buscar_en_google_news(tema_query, 3)
    noticias_adicionales.extend(noticias_tema)

    # ── Formatear contexto para el prompt ─────────────────────────────────────
    ctx_noticias = "\n".join([
        f"• [{r.get('published', '')}] {r.get('title', '')} — {r.get('url', '')}"
        for r in noticias_adicionales[:8]
    ]) or "Sin noticias adicionales encontradas."

    ctx_transparencia = ""
    if datos_chilecompra:
        ctx_transparencia += "CONTRATOS EN CHILECOMPRA:\n" + "\n".join([
            f"• {c.get('nombre', '')} | {c.get('organismo', '')} | ${c.get('monto', '')} | {c.get('fecha', '')} | {c.get('url', '')}"
            for c in datos_chilecompra[:5]
        ]) + "\n"
    if datos_contraloria:
        ctx_transparencia += "DICTÁMENES CONTRALORÍA:\n" + "\n".join([
            f"• {r.get('title', '')} — {r.get('url', '')}"
            for r in datos_contraloria[:4]
        ])
    if not ctx_transparencia:
        ctx_transparencia = "Sin datos de transparencia adicionales disponibles."

    # ── Generar informe con Groq ──────────────────────────────────────────────
    prompt = INFORME_PROMPT.format(
        tipo=tipo,
        descripcion=descripcion[:500],
        entidades=", ".join(entidades[:5]),
        evidencia=evidencia_original[:400],
        fecha_evento=fecha_evento,
        source_url=source_url,
        contexto_adicional=ctx_noticias[:1500],
        datos_transparencia=ctx_transparencia[:1000],
    )

    result = chat_json(prompt, system=INFORME_SYSTEM, max_tokens=2000, temperature=0.2)
    if not result or not result.get("titular"):
        logger.warning(f"Groq no generó informe para anomalía {anomalia['id']}")
        return False

    # ── Construir texto del informe para encolarlo ─────────────────────────────
    titular = result.get("titular", "Informe de investigación")
    subtitular = result.get("subtitular", "")
    cuerpo = result.get("cuerpo_informe", "")
    entidades_clave = result.get("entidades_clave", entidades)
    montos = result.get("montos_detectados", [])
    fechas = result.get("fechas_clave", [])
    fuentes = result.get("fuentes_adicionales", []) or []
    lineas = result.get("lineas_investigacion", [])
    confianza = float(result.get("confianza_informe", 0.6))

    raw_text = f"""INFORME DE INVESTIGACIÓN — ATALAYA PANÓPTICA
Tipo: {tipo}
Titular: {titular}
Subtitular: {subtitular}
Entidades: {', '.join(entidades_clave)}
Fecha del hecho: {fecha_evento}
Fuente original: {source_url}

{cuerpo}

MONTOS DETECTADOS: {'; '.join(montos) if montos else 'No cuantificado'}
FECHAS CLAVE: {'; '.join(fechas) if fechas else fecha_evento}
LÍNEAS DE INVESTIGACIÓN:
{chr(10).join(f'• {l}' for l in lineas)}

FUENTES ADICIONALES:
{chr(10).join(f'• {f}' for f in fuentes[:5])}
"""

    all_urls = [source_url] + [r.get("url", "") for r in noticias_adicionales[:3]]
    all_urls_clean = [u for u in all_urls if u]

    metadata = {
        "tipo": tipo,
        "anomalia_origen_id": anomalia["id"],
        "entidades": entidades_clave,
        "montos": montos,
        "fechas_clave": fechas,
        "confianza_informe": confianza,
        "fuentes_adicionales": all_urls_clean,
        "fecha_evento": fecha_evento,
        "palabras_clave": result.get("palabras_clave", []),
        "lineas_investigacion": lineas,
        "titular": titular,
        "subtitular": subtitular,
        # La fecha del hecho original (para que el Detective la use como event_date)
        "fecha": fecha_evento,
    }

    enqueued = enqueue(
        source="investigador_automatico",
        raw_text=raw_text,
        source_url=source_url or all_urls_clean[0] if all_urls_clean else None,
        raw_metadata=metadata,
        priority=1,  # Máxima prioridad — investigación profunda
    )

    if enqueued:
        logger.info(f"✅ Informe encolado para anomalía {anomalia['id']}: «{titular[:60]}»")
        return True
    else:
        logger.info(f"Informe duplicado (ya existe) para anomalía {anomalia['id']}")
        return False


def run(max_anomalias: int = 3) -> int:
    """
    Entry point del Investigador Automático.
    Toma las anomalías recientes más importantes y las investiga en profundidad.
    Retorna el número de informes generados.
    """
    logger.info(f"Investigador Automático iniciando — max {max_anomalias} anomalías")

    db = get_client()

    # Obtener anomalías recientes con alta confianza que tengan entidades nombradas
    resp = (
        db.table("anomalies")
        .select("*")
        .eq("status", "activa")
        .gte("confidence", 0.70)
        .order("created_at", desc=True)
        .limit(max_anomalias * 3)  # Pedimos más para filtrar las que ya tienen informe
        .execute()
    )

    if not resp.data:
        logger.info("Sin anomalías disponibles para investigar")
        return 0

    # Filtrar las que tienen entidades nombradas
    candidatas = [
        a for a in resp.data
        if (a.get("evidence", {}) or {}).get("entidades_nombradas")
    ]

    if not candidatas:
        logger.info("Ninguna anomalía tiene entidades nombradas suficientes")
        return 0

    informes_generados = 0
    for anomalia in candidatas[:max_anomalias]:
        try:
            if investigar_anomalia(anomalia):
                informes_generados += 1
            polite_sleep(3.0, 5.0)  # Respetar rate limits de APIs externas
        except Exception as e:
            logger.error(f"Error investigando anomalía {anomalia.get('id')}: {e}", exc_info=True)

    logger.info(f"Investigador completado: {informes_generados} informes generados")
    return informes_generados


if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    run()
