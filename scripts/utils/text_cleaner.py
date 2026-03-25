"""
ATALAYA PANÓPTICA — Limpiador de Texto
Normalización de texto extraído: sin multimedia, sin ruido HTML,
normalización de RUTs y nombres chilenos.
"""

import re
import unicodedata
import hashlib
from typing import Optional


# ── Limpieza general ──────────────────────────────────────────────────────

def clean_text(raw: str, max_length: int = 8000) -> str:
    """
    Limpia texto crudo para enviar a Groq:
    - Elimina HTML/XML residual
    - Normaliza espacios y saltos de línea
    - Trunca a max_length caracteres (límite de contexto)
    """
    if not raw:
        return ""

    # Remover tags HTML
    text = re.sub(r"<[^>]+>", " ", raw)

    # Remover URLs (no son útiles para el análisis de texto)
    text = re.sub(r"https?://\S+", "[URL]", text)

    # Normalizar caracteres unicode (NFD → NFC)
    text = unicodedata.normalize("NFC", text)

    # Normalizar espacios
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    # Truncar respetando palabras completas
    if len(text) > max_length:
        text = text[:max_length].rsplit(" ", 1)[0] + "... [TRUNCADO]"

    return text


def normalize_name(name: str) -> str:
    """
    Normaliza nombres de personas/empresas para canonicalización:
    - Mayúsculas consistentes (Title Case)
    - Sin tildes para comparación interna
    - Sin caracteres especiales
    """
    if not name:
        return ""

    # Eliminar espacios extra
    name = " ".join(name.split())

    # Title case
    name = name.title()

    # Normalizar caracteres especiales (mantener eñe y acentos para display)
    return name.strip()


def normalize_rut(rut: str) -> Optional[str]:
    """
    Normaliza RUT chileno al formato estándar: 12.345.678-9
    Retorna None si el formato no es válido.
    """
    if not rut:
        return None

    # Eliminar todo excepto dígitos y K
    clean = re.sub(r"[^0-9kK]", "", rut.upper())

    if len(clean) < 2:
        return None

    body = clean[:-1]
    dv = clean[-1]

    # Validar dígito verificador
    if not _validate_rut_dv(body, dv):
        return None

    # Formatear con puntos y guión
    body_int = int(body)
    formatted = f"{body_int:,}".replace(",", ".")
    return f"{formatted}-{dv}"


def _validate_rut_dv(body: str, dv: str) -> bool:
    """Valida el dígito verificador de un RUT chileno."""
    try:
        n = int(body)
        s = 1
        m = 0
        while n:
            s = (s + n % 10 * (9 - m % 6)) % 11
            n //= 10
            m += 1
        expected_dv = "0" if s == 10 else str(s) if s != 0 else "K"
        return dv == expected_dv
    except (ValueError, ZeroDivisionError):
        return False


# ── Deduplicación ─────────────────────────────────────────────────────────

def url_hash(url: str) -> str:
    """
    Genera hash SHA-256 de una URL para deduplicación en investigation_queue.
    Normaliza la URL antes de hashear (quita parámetros de tracking).
    """
    # Eliminar parámetros de tracking comunes
    clean_url = re.sub(r"[?&](utm_\w+|fbclid|gclid|ref|source)=[^&]*", "", url)
    clean_url = clean_url.rstrip("?&")
    return hashlib.sha256(clean_url.encode("utf-8")).hexdigest()


def extract_amounts_clp(text: str) -> list[dict]:
    """
    Extrae montos en pesos chilenos del texto.
    Retorna lista de {'raw': str, 'amount': int, 'unit': str}
    """
    patterns = [
        # $1.234.567 o $1234567
        r"\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)",
        # 1.234.567 pesos / millones / miles
        r"(\d{1,3}(?:\.\d{3})+)\s*(pesos?|millones?|mil)",
        # MM$ o M$ (millones / miles de pesos)
        r"([\d,.]+)\s*(MM\$|M\$)",
    ]

    results = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            raw = match.group(0)
            try:
                num_str = re.sub(r"[.,](?=\d{3})", "", match.group(1))
                amount = int(float(num_str.replace(",", ".")))

                unit = "pesos"
                if len(match.groups()) > 1 and match.group(2):
                    unit = match.group(2).lower()
                    if "millon" in unit or "mm$" in unit:
                        amount *= 1_000_000
                    elif "mil" in unit or "m$" in unit:
                        amount *= 1_000

                results.append({"raw": raw, "amount": amount, "unit": "CLP"})
            except (ValueError, IndexError):
                continue

    return results


def extract_dates_cl(text: str) -> list[str]:
    """
    Extrae fechas en formato chileno (DD/MM/AAAA o variantes).
    Retorna lista de strings ISO 8601 (AAAA-MM-DD).
    """
    from datetime import datetime

    patterns = [
        (r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b", "%d/%m/%Y"),
        (r"\b(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\b", "texto"),
    ]

    months_es = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
        "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
        "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    }

    results = []

    # Patrón numérico
    for match in re.finditer(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b", text):
        try:
            d, m, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
            if 1 <= m <= 12 and 1 <= d <= 31 and 1900 <= y <= 2100:
                results.append(f"{y:04d}-{m:02d}-{d:02d}")
        except ValueError:
            continue

    # Patrón texto "15 de marzo de 2024"
    for match in re.finditer(
        r"\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b",
        text,
        re.IGNORECASE,
    ):
        try:
            d = int(match.group(1))
            m = months_es[match.group(2).lower()]
            y = int(match.group(3))
            results.append(f"{y:04d}-{m:02d}-{d:02d}")
        except (ValueError, KeyError):
            continue

    return list(set(results))
