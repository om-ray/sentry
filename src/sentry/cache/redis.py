from typing import Any, List, Optional, Tuple

from sentry.utils import json
from sentry.utils.redis import get_cluster_from_options, redis_clusters

from .base import BaseCache


class ValueTooLarge(Exception):
    pass


class CommonRedisCache(BaseCache):
    key_expire = 60 * 60  # 1 hour
    max_size = 50 * 1024 * 1024  # 50MB

    def __init__(self, client, **options):
        self.client = client
        BaseCache.__init__(self, **options)

    def set(self, key, value, timeout, version=None, raw=False):
        processed_key, processed_value = self._prepare_set(key, value, version, raw)
        if timeout:
            self.client.setex(processed_key, int(timeout), processed_value)
        else:
            self.client.set(processed_key, processed_value)

        self._mark_transaction("set")

    def multi_set(
        self,
        payload: Tuple[str, Any],
        timeout: int,
        version: Optional[str] = None,
        raw: bool = False,
    ) -> None:
        """Set multiple keys in Redis with an expiry."""
        payload_iterator = iter(
            self._prepare_set(key, value, version, raw) for key, value in payload
        )

        pipeline = self.client.pipeline()
        for key, value in payload_iterator:
            if timeout:
                pipeline.setex(key, int(timeout), value)
            else:
                # In clustered environments mset does not work.  So we pipeline it.  Do we need
                # to support mset for self-hosted?
                pipeline.set(key, value)
        pipeline.execute()

        self._mark_transaction("multi_set")

    def _prepare_set(
        self,
        key: str,
        value: Any,
        version: Optional[str],
        raw: bool,
    ) -> Tuple[str, Any]:
        processed_key = self.make_key(key, version=version)
        processed_value = json.dumps(value) if not raw else value
        if len(processed_value) > self.max_size:
            raise ValueTooLarge(f"Cache key too large: {key!r} {len(processed_value)!r}")

        return processed_key, processed_value

    def delete(self, key, version=None):
        key = self.make_key(key, version=version)
        self.client.delete(key)

        self._mark_transaction("delete")

    def multi_delete(self, keys, version=None):
        formatted_keys = [self.make_key(key, version=version) for key in keys]
        self.client.delete(formatted_keys, version)

        self._mark_transaction("multi_delete")

    def get(self, key, version=None, raw=False):
        key = self.make_key(key, version=version)
        result = self.client.get(key)
        if result is not None and not raw:
            result = json.loads(result)

        self._mark_transaction("get")

        return result

    def multi_get(self, keys: List[str], version: Optional[str] = None, raw: bool = False):
        """Fetch multiple keys from Redis."""
        formatted_keys: List[str] = [self.make_key(key, version=version) for key in keys]
        results: List[Optional[bytes]] = self.client.mget(formatted_keys)

        if raw:
            formatted_results = [result.decode("utf-8") if result else None for result in results]
        else:
            formatted_results = [json.loads(result) if result else None for result in results]

        self._mark_transaction("mget")
        return formatted_results


class RbCache(CommonRedisCache):
    def __init__(self, **options):
        cluster, options = get_cluster_from_options("SENTRY_CACHE_OPTIONS", options)
        client = cluster.get_routing_client()
        CommonRedisCache.__init__(self, client, **options)


# Confusing legacy name for RbCache.  We don't actually have a pure redis cache
RedisCache = RbCache


class RedisClusterCache(CommonRedisCache):
    def __init__(self, cluster_id, **options):
        client = redis_clusters.get(cluster_id)
        CommonRedisCache.__init__(self, client=client, **options)
