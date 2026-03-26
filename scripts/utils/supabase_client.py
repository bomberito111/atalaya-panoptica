"""
ATALAYA PANÓPTICA — Cliente Supabase
Wrapper con retry logic para operaciones de base de datos.
Usa SUPABASE_SERVICE_KEY para escritura (service_role).
"""

import os
import logging
from typing import Any, Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Inicialización del cliente ──────────────────────────────────────────────

def get_client() -> Client:
    """Retorna cliente Supabase autenticado con service_role key."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        raise EnvironmentError(
            "Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_KEY"
        )

    return create_client(url, key)


# Instancia global (singleton)
_client: Optional[Client] = None

def db() -> Client:
    """Retorna la instancia singleton del cliente."""
    global _client
    if _client is None:
        _client = get_client()
    return _client


# ── Operaciones con retry ───────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
def insert(table: str, data: dict | list[dict]) -> list[dict]:
    """Inserta uno o múltiples registros. Retorna filas insertadas."""
    if isinstance(data, dict):
        data = [data]
    response = db().table(table).insert(data).execute()
    logger.debug(f"INSERT {table}: {len(response.data)} filas")
    return response.data


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def upsert(table: str, data: dict | list[dict], on_conflict: str = "id") -> list[dict]:
    """Upsert: inserta o actualiza si ya existe (por columna on_conflict)."""
    if isinstance(data, dict):
        data = [data]
    response = db().table(table).upsert(data, on_conflict=on_conflict).execute()
    logger.debug(f"UPSERT {table}: {len(response.data)} filas")
    return response.data


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def update(table: str, data: dict, match: dict) -> list[dict]:
    """Actualiza registros que coincidan con match."""
    query = db().table(table).update(data)
    for col, val in match.items():
        query = query.eq(col, val)
    response = query.execute()
    logger.debug(f"UPDATE {table}: {len(response.data)} filas")
    return response.data


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def select(
    table: str,
    columns: str = "*",
    filters: Optional[dict] = None,
    limit: int = 100,
    order_by: Optional[str] = None,
    ascending: bool = True,
) -> list[dict]:
    """Consulta registros con filtros opcionales."""
    query = db().table(table).select(columns)

    if filters:
        for col, val in filters.items():
            query = query.eq(col, val)

    if order_by:
        query = query.order(order_by, desc=not ascending)

    query = query.limit(limit)
    response = query.execute()
    return response.data


def select_one(
    table: str,
    columns: str = "*",
    filters: Optional[dict] = None,
    order_by: Optional[str] = None,
    ascending: bool = True,
) -> Optional[dict]:
    """Retorna un único registro o None."""
    results = select(table, columns, filters, limit=1, order_by=order_by, ascending=ascending)
    return results[0] if results else None


# ── Operaciones específicas de ATALAYA ─────────────────────────────────────

def claim_pending_item() -> Optional[dict]:
    """
    Toma el siguiente ítem pendiente de la cola y lo marca como 'processing'.
    Prioriza ítems recientes (últimas 72h) y de mayor prioridad.
    """
    client = db()
    # First try: items from last 72 hours, highest priority first
    import datetime
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(hours=72)).isoformat()

    resp = client.table("investigation_queue")\
        .select("*")\
        .eq("status", "pending")\
        .gte("created_at", cutoff)\
        .order("priority", desc=False)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()

    item = resp.data[0] if resp.data else None

    # Fallback: any pending item if no recent ones
    if not item:
        resp2 = client.table("investigation_queue")\
            .select("*")\
            .eq("status", "pending")\
            .order("priority", desc=False)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        item = resp2.data[0] if resp2.data else None

    if not item:
        return None

    # Marcamos como processing (CAS)
    updated = update(
        table="investigation_queue",
        data={"status": "processing"},
        match={"id": item["id"], "status": "pending"},
    )

    return updated[0] if updated else None


def mark_item_done(item_id: str) -> None:
    """Marca un ítem de la cola como completado."""
    import datetime
    update(
        table="investigation_queue",
        data={"status": "done", "processed_at": datetime.datetime.utcnow().isoformat()},
        match={"id": item_id},
    )


def mark_item_error(item_id: str, error_msg: str) -> None:
    """Marca un ítem como error y guarda el mensaje."""
    update(
        table="investigation_queue",
        data={"status": "error", "error_msg": error_msg[:500]},
        match={"id": item_id},
    )


# ── Test de conexión ────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        result = db().table("investigation_queue").select("id").limit(1).execute()
        print("✅ Conexión a Supabase exitosa")
        print(f"   Registros en investigation_queue: {len(result.data)}")
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
