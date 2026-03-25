"""
ATALAYA PANÓPTICA — Cliente Groq
Wrapper sobre el SDK de Groq con rate limiting y retry.
Modelo: llama-3.3-70b-versatile (free tier: 30 req/min, 6000 tokens/min)
"""

import os
import logging
import time
from typing import Optional
from groq import Groq, RateLimitError, APIError
from dotenv import load_dotenv
from scripts.utils.rate_limiter import GROQ_LIMITER

load_dotenv()

logger = logging.getLogger(__name__)

_client: Optional[Groq] = None

def get_groq_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError("GROQ_API_KEY no está configurada")
        _client = Groq(api_key=api_key)
    return _client


def chat(
    prompt: str,
    system: str = "Eres un investigador de datos experto en anticorrupción chilena.",
    model: str = None,
    max_tokens: int = 1024,
    temperature: float = 0.1,
    max_retries: int = 5,
) -> Optional[str]:
    """
    Envía un prompt a Groq y retorna la respuesta como string.

    Args:
        prompt: El mensaje del usuario
        system: Instrucciones del sistema (rol del modelo)
        model: Modelo a usar (default: env GROQ_MODEL o llama-3.3-70b-versatile)
        max_tokens: Máximo de tokens en la respuesta
        temperature: 0.0=determinístico, 1.0=creativo
        max_retries: Intentos ante rate limit

    Returns:
        Texto de la respuesta, o None si falla.
    """
    client = get_groq_client()
    model = model or os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

    for attempt in range(max_retries):
        # Aplicar rate limiting antes de cada llamada
        GROQ_LIMITER.consume()

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            )

            content = response.choices[0].message.content
            logger.debug(f"Groq OK: {len(content)} chars, model={model}")
            return content

        except RateLimitError as e:
            wait = 60 * (attempt + 1)  # Esperar más con cada intento
            logger.warning(f"Groq rate limit (intento {attempt + 1}/{max_retries}). Esperando {wait}s...")
            time.sleep(wait)

        except APIError as e:
            logger.error(f"Groq API error: {e}")
            if attempt == max_retries - 1:
                return None
            time.sleep(5 * (attempt + 1))

        except Exception as e:
            logger.error(f"Error inesperado en Groq: {e}")
            return None

    logger.error("Groq: máximo de reintentos alcanzado")
    return None


def chat_json(
    prompt: str,
    system: str = "Responde siempre con JSON válido.",
    **kwargs,
) -> Optional[dict]:
    """
    Como chat(), pero parsea la respuesta como JSON.
    El prompt debe instruir al modelo a responder en JSON.
    """
    import json
    import re

    response = chat(prompt, system=system, **kwargs)
    if not response:
        return None

    # Extraer bloque JSON si viene envuelto en markdown
    json_match = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", response, re.DOTALL)
    if json_match:
        response = json_match.group(1)

    # Intentar parsear directamente
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        # Intentar extraer el primer objeto JSON del texto
        json_match = re.search(r"(\{[^{}]*\}|\[[^\[\]]*\])", response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

    logger.warning(f"No se pudo parsear respuesta Groq como JSON: {response[:200]}")
    return None
