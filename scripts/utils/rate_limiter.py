"""
ATALAYA PANÓPTICA — Rate Limiter
Backoff exponencial y control de velocidad para scrapers y APIs externas.
"""

import time
import logging
import random
from functools import wraps
from collections import deque
from threading import Lock

logger = logging.getLogger(__name__)


class TokenBucket:
    """
    Algoritmo Token Bucket para rate limiting.
    Permite ráfagas controladas sin superar el límite promedio.
    """

    def __init__(self, rate: float, capacity: float):
        """
        Args:
            rate: tokens por segundo a reponer
            capacity: máximo de tokens acumulables (tamaño del bucket)
        """
        self.rate = rate
        self.capacity = capacity
        self._tokens = capacity
        self._last_refill = time.monotonic()
        self._lock = Lock()

    def consume(self, tokens: int = 1) -> float:
        """
        Consume tokens. Retorna segundos que esperó (0 si había suficiente).
        Bloquea hasta que haya tokens disponibles.
        """
        with self._lock:
            self._refill()
            wait_time = 0.0

            if self._tokens < tokens:
                deficit = tokens - self._tokens
                wait_time = deficit / self.rate
                time.sleep(wait_time)
                self._refill()

            self._tokens -= tokens
            return wait_time

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
        self._last_refill = now


# ── Rate limiters preconfigurados ─────────────────────────────────────────

# Groq free tier: 30 req/min → 0.5 req/seg, burst de 5
GROQ_LIMITER = TokenBucket(rate=0.4, capacity=5)

# Scrapers web: educados, máximo 1 req/seg por dominio
SCRAPER_LIMITER = TokenBucket(rate=0.5, capacity=3)

# Mercado Público API: conservador para no ser bloqueado
MERCADO_PUBLICO_LIMITER = TokenBucket(rate=0.3, capacity=2)


# ── Decoradores ────────────────────────────────────────────────────────────

def with_rate_limit(limiter: TokenBucket, tokens: int = 1):
    """Decorador que aplica rate limiting a una función."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            waited = limiter.consume(tokens)
            if waited > 0.1:
                logger.debug(f"{func.__name__}: esperó {waited:.1f}s por rate limit")
            return func(*args, **kwargs)
        return wrapper
    return decorator


def exponential_backoff(
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
):
    """
    Decorador de retry con backoff exponencial.
    Reintenta en errores de red y rate limits (429).
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise

                    delay = min(base_delay * (2 ** attempt), max_delay)
                    if jitter:
                        delay *= (0.5 + random.random())

                    logger.warning(
                        f"{func.__name__} falló (intento {attempt + 1}/{max_retries}): "
                        f"{type(e).__name__}: {e}. Reintentando en {delay:.1f}s..."
                    )
                    time.sleep(delay)
        return wrapper
    return decorator


def polite_sleep(min_sec: float = 1.0, max_sec: float = 3.0):
    """Pausa aleatoria entre peticiones para comportamiento humano."""
    time.sleep(random.uniform(min_sec, max_sec))
