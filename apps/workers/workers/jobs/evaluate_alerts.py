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
    "lt": lambda v, t: v < t,  "lte": lambda v, t: v <= t,
    "gt": lambda v, t: v > t,  "gte": lambda v, t: v >= t,
    "eq": lambda v, t: v == t,
}
WINDOW_TO_HOURS = {"1h": 1, "2h": 2, "6h": 6, "24h": 24}
VALID_METRICS = {"roas", "gmv", "ad_spend", "order_count", "impressions", "clicks"}


async def evaluate_condition(conn, tenant_id: str, shop_id: str | None, condition: dict) -> tuple[bool, float]:
    metric = condition.get("metric", "")
    if metric not in VALID_METRICS:
        logger.warning(f"Unknown metric in condition: {metric}")
        return False, 0.0

    operator = condition.get("operator", "gt")
    threshold = float(condition.get("threshold", 0))
    window_hours = WINDOW_TO_HOURS.get(condition.get("window", "1h"), 1)
    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).strftime("%Y-%m-%d %H:%M:%S")

    # Use ClickHouse HTTP query params (param_NAME) to avoid injection
    shop_filter = "AND shop_id = {shopId:String}" if shop_id else ""
    params: dict = {"tenantId": tenant_id, "since": since}
    if shop_id:
        params["shopId"] = shop_id

    if metric == "roas":
        rows = await ch_query(
            f"""SELECT sumIf(value, metric_name = 'gmv') AS gmv,
                       sumIf(value, metric_name = 'ad_spend') AS spend
                FROM ecomdash.metrics_local
                WHERE tenant_id = {{tenantId:String}} {shop_filter}
                  AND timestamp >= {{since:String}}
                FORMAT JSONEachRow""",
            params,
        )
        if not rows:
            return False, 0.0
        gmv = float(rows[0].get("gmv", 0))
        spend = float(rows[0].get("spend", 0))
        current_value = gmv / spend if spend > 0 else 0.0
    else:
        rows = await ch_query(
            f"""SELECT sum(value) AS total
                FROM ecomdash.metrics_local
                WHERE tenant_id = {{tenantId:String}} {shop_filter}
                  AND metric_name = {{metricName:String}}
                  AND timestamp >= {{since:String}}
                FORMAT JSONEachRow""",
            {**params, "metricName": metric},
        )
        current_value = float(rows[0].get("total", 0)) if rows else 0.0

    fn = OPERATOR_MAP.get(operator, lambda v, t: False)
    return fn(current_value, threshold), current_value


async def run_evaluate_alerts():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        # Use quoted PascalCase table/column names matching Prisma migration output
        rules = await conn.fetch(
            'SELECT id, "organizationId", "shopId", name, conditions, actions '
            'FROM "AlertRule" WHERE "isActive" = TRUE'
        )

        for rule in rules:
            conditions_cfg = json.loads(rule["conditions"])
            actions_cfg = json.loads(rule["actions"])
            conditions = conditions_cfg.get("conditions", [])
            logic = conditions_cfg.get("logic", "AND")

            results, current_values = [], {}
            for cond in conditions:
                triggered, value = await evaluate_condition(
                    conn, rule["organizationId"], rule["shopId"], cond
                )
                results.append(triggered)
                current_values[cond.get("metric", "")] = value

            overall_triggered = all(results) if logic == "AND" else any(results)

            existing = await conn.fetchrow(
                'SELECT id FROM "AlertInstance" WHERE "ruleId"=$1 AND state=\'FIRING\' '
                'ORDER BY "firedAt" DESC LIMIT 1',
                rule["id"],
            )

            if overall_triggered and not existing:
                instance_id = await conn.fetchval(
                    'INSERT INTO "AlertInstance" ("ruleId", "shopId", state, metadata, "firedAt") '
                    "VALUES ($1, $2, 'FIRING', $3::jsonb, NOW()) RETURNING id",
                    rule["id"], rule["shopId"], json.dumps(current_values),
                )
                await dispatch_notification(
                    actions_cfg.get("actions", []),
                    rule_name=rule["name"],
                    current_values=current_values,
                )
                logger.info(f"Alert FIRED: {rule['name']} (instance {instance_id})")

            elif not overall_triggered and existing:
                await conn.execute(
                    'UPDATE "AlertInstance" SET state=\'RESOLVED\', "resolvedAt"=NOW() WHERE id=$1',
                    existing["id"],
                )
                logger.info(f"Alert RESOLVED: {rule['name']}")
    finally:
        await conn.close()
