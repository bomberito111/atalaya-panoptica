"""
ATALAYA PANÓPTICA — Publicador de Contenido Viral
Publica contenido generado en X (Twitter) via API OAuth 2.0.
Requiere X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET.
"""

import os
import logging
import datetime
from scripts.utils.supabase_client import select, update

logger = logging.getLogger(__name__)


def get_twitter_client():
    """Inicializa cliente de Twitter/X via tweepy."""
    try:
        import tweepy
    except ImportError:
        logger.error("tweepy no está instalado. Agregar a requirements.txt: tweepy==4.14.0")
        return None

    api_key = os.environ.get("X_API_KEY")
    api_secret = os.environ.get("X_API_SECRET")
    access_token = os.environ.get("X_ACCESS_TOKEN")
    access_secret = os.environ.get("X_ACCESS_TOKEN_SECRET")

    if not all([api_key, api_secret, access_token, access_secret]):
        logger.warning("Credenciales de X no configuradas. Publicación omitida.")
        return None

    auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_secret)
    return tweepy.API(auth, wait_on_rate_limit=True)


def publish_thread(content_text: str, api) -> list[str]:
    """
    Publica un hilo de tweets en X.
    Los tweets están separados por '---' en content_text.

    Returns:
        Lista de IDs de tweets publicados.
    """
    tweets = [t.strip() for t in content_text.split("---") if t.strip()]
    tweet_ids = []
    reply_to = None

    for i, tweet_text in enumerate(tweets):
        # Truncar a 280 caracteres
        if len(tweet_text) > 280:
            tweet_text = tweet_text[:277] + "..."

        try:
            if reply_to:
                response = api.create_tweet(
                    text=tweet_text,
                    in_reply_to_tweet_id=reply_to,
                )
            else:
                response = api.create_tweet(text=tweet_text)

            tweet_ids.append(response.data["id"])
            reply_to = response.data["id"]
            logger.info(f"  Tweet {i+1}/{len(tweets)} publicado: {tweet_ids[-1]}")

        except Exception as e:
            logger.error(f"Error publicando tweet {i+1}: {e}")
            break

    return tweet_ids


def run():
    """Publica contenido viral pendiente en X."""
    api = get_twitter_client()

    if not api:
        logger.info("Publicación en X deshabilitada (sin credenciales)")
        return 0

    # Obtener contenido no publicado de alta confianza
    pending = select(
        table="viral_content",
        filters={"published": False, "content_type": "twitter_thread"},
        limit=3,  # Máximo 3 hilos por ejecución
        order_by="created_at",
        ascending=True,
    )

    published_count = 0

    for content in pending:
        content_id = content["id"]
        tweet_ids = publish_thread(content["content_text"], api)

        if tweet_ids:
            first_tweet_url = f"https://twitter.com/i/web/status/{tweet_ids[0]}"
            update(
                "viral_content",
                data={
                    "published": True,
                    "published_at": datetime.datetime.utcnow().isoformat(),
                    "platform_url": first_tweet_url,
                },
                match={"id": content_id},
            )
            logger.info(f"Hilo publicado: {first_tweet_url}")
            published_count += 1

    logger.info(f"Agente Viral publicador: {published_count} hilos publicados en X")
    return published_count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
