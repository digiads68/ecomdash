"""Evaluate alert rules against ClickHouse metrics and fire notifications."""
import logging
import os
import json
from datetime import datetime, timezone, timedelta
import asyncpg
from workers.clickhouse import query as ch_query
from workers.notifications.dispatcher import dispatch_notification

logger = logging.getLogger(__name__)

OPERATOR_MAP = {
    "lt": lambda v, t: v < t,
    "lte": lambda v, t: v <= t,
    "gt": lambda v, t: v > t,
    "gte": lambda v, t: v >= t,
    "eq": lambda v, t: v == t,
}

WINDOW_TO_HOURS = {"1h": 1, "2h": 2, "6h": 6, "24h": 24}


async def evaluate_condition(conn, tenant_id: str, shop_id: str | None, condition: dict) -> tuple[bool, float]:
    metric = condition["metric"]
    operator = condition["operator"]
    threshold = float(condition["threshold"])
    window_hours = WINDOW_TO_HOURS.get(condition.get("window", "1h"), 1)
    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).strftime("%Y-%m-%d %H:%M:%S")

    shop_filter = f"AND shop_id = '{shop_id}'" if shop_id else ""

    if metric == "roas":
        rows = await ch_query(
            f"""SELECT
                  sumIf(value, metric_name = 'gmv') AS gmv,
                  sumIf(value, metric_name = 'ad_spend') AS spend
                FROM ecomdash.metrics_local
                WHERE tenant_id = '{tenant_id}' {shop_filter}
                  AND timestamp >= '{since}'"""
        )
        if not rows:
            return False, 0.0
        gmv = rows[0].get("gmv", 0)
        spend = rows[0].get("spend", 0)
        current_value = (gmv / spend) if spend > 0 else 0.0
    else:
        rows = await ch_query(
            f"""SELECT sum(value) AS total
                FROM ecomdash.metrics_local
                WHERE tenant_id = '{tenant_id}' {shop_filter}
                  AND metric_name = '{metric}'
                  AND timestamp >= '{since}'"""
        )
        current_value = rows[0].get("total", 0.0) if rows else 0.0

    fn = OPERATOR_MAP.get(operator, lambda v, t: False)
    return fn(current_value, threshold), current_value


async def run_evaluate_alerts():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        rules = await conn.fetch(
            """SELECT ar.id, ar.organization_id, ar.shop_id, ar.name, ar.conditions, ar.actions
               FROM alert_rules ar
               WHERE ar.is_active = TRUE"""
        )

        for rule in rules:
            conditions_cfg = json.loads(rule["conditions"])
            actions_cfg = json.loads(rule["actions"])
            conditions = conditions_cfg.get("conditions", [])
            logic = conditions_cfg.get("logic", "AND")

            results = []
            current_values = {}
            for cond in conditions:
                triggered, value = await evaluate_condition(
                    conn, rule["organization_id"], rule["shop_id"], cond
                )
                results.append(triggered)
                current_values[cond["metric"]] = value

            overall_triggered = all(results) if logic == "AND" else any(results)

            # Check existing FIRING instance
            existing = await conn.fetchrow(
                """SELECT id FROM alert_instances
                   WHERE rule_id = $1 AND state = 'FIRING'
                   ORDER BY fired_at DESC LIMIT 1""",
                rule["id"],
            )

            if overall_triggered and not existing:
                # Fire new instance
                instance_id = await conn.fetchval(
                    """INSERT INTO alert_instances (rule_id, shop_id, state, metadata, fired_at)
                       VALUES ($1, $2, 'FIRING', $3::jsonb, NOW()) RETURNING id""",
                    rule["id"], rule["shop_id"], json.dumps(current_values),
                )
                await dispatch_notification(
                    actions_cfg.get("actions", []),
                    rule_name=rule["name"],
                    current_values=current_values,
                )
                logger.info(f"Alert FIRED: {rule['name']} (instance {instance_id})")

            elif not overall_triggered and existing:
                # Resolve
                await conn.execute(
                    "UPDATE alert_instances SET state='RESOLVED', resolved_at=NOW() WHERE id=$1",
                    existing["id"],
                )
                logger.info(f"Alert RESOLVED: {rule['name']}")
    finally:
        await conn.close()
