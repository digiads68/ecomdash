"""ClickHouse HTTP client (batch inserts via JSONEachRow)."""
import os
import json
import httpx

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "http://localhost:8123")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "ecomdash")


async def insert_metrics(rows: list[dict]) -> None:
    """Batch insert rows into ecomdash.metrics_local."""
    if not rows:
        return
    body = "\n".join(json.dumps(r) for r in rows)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CLICKHOUSE_HOST,
            params={
                "query": "INSERT INTO ecomdash.metrics_local FORMAT JSONEachRow",
                "database": CLICKHOUSE_DB,
            },
            content=body.encode(),
            headers={"Content-Type": "text/plain"},
        )
        resp.raise_for_status()


async def query(sql: str) -> list[dict]:
    """Execute a SELECT and return rows as dicts (JSONEachRow)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CLICKHOUSE_HOST,
            params={"database": CLICKHOUSE_DB, "default_format": "JSONEachRow"},
            content=(sql + " FORMAT JSONEachRow").encode(),
            headers={"Content-Type": "text/plain"},
        )
        resp.raise_for_status()
        lines = resp.text.strip().split("\n")
        return [json.loads(line) for line in lines if line.strip()]
