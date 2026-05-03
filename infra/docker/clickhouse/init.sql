CREATE DATABASE IF NOT EXISTS ecomdash;

CREATE TABLE IF NOT EXISTS ecomdash.metrics_local (
    tenant_id   String,
    shop_id     String,
    metric_name LowCardinality(String),
    timestamp   DateTime,
    value       Float64,
    dimensions  Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, shop_id, metric_name, timestamp)
TTL timestamp + INTERVAL 2 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS ecomdash.metrics_daily_mv
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, shop_id, metric_name, date) AS
SELECT
    tenant_id,
    shop_id,
    metric_name,
    toDate(timestamp) AS date,
    sum(value)        AS value_sum,
    count()           AS value_count
FROM ecomdash.metrics_local
GROUP BY tenant_id, shop_id, metric_name, date;
