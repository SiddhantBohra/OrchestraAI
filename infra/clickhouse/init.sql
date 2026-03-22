-- ClickHouse initialization script for OrchestraAI

-- Create database
CREATE DATABASE IF NOT EXISTS orchestra_traces;

-- Traces table for storing all trace spans
CREATE TABLE IF NOT EXISTS orchestra_traces.traces
(
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    project_id String,
    agent_id Nullable(String),
    agent_name Nullable(String),
    type LowCardinality(String),
    name String,
    status LowCardinality(String),
    start_time DateTime64(3),
    end_time Nullable(DateTime64(3)),
    duration_ms Nullable(UInt32),
    model Nullable(String),
    input_tokens Nullable(UInt32),
    output_tokens Nullable(UInt32),
    total_tokens Nullable(UInt32),
    cost Nullable(Float64),
    latency_ms Nullable(UInt32),
    tool_name Nullable(String),
    tool_input Nullable(String),
    tool_output Nullable(String),
    error_message Nullable(String),
    error_type Nullable(String),
    input_preview Nullable(String),
    output_preview Nullable(String),
    metadata String DEFAULT '{}',
    created_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, start_time, trace_id, span_id)
TTL start_time + INTERVAL 90 DAY;

-- Aggregated metrics table for dashboards
CREATE TABLE IF NOT EXISTS orchestra_traces.metrics_daily
(
    project_id String,
    agent_id String,
    agent_name String,
    date Date,
    total_runs UInt32,
    successful_runs UInt32,
    failed_runs UInt32,
    total_tokens UInt64,
    total_cost Float64,
    avg_latency_ms Float64,
    p95_latency_ms Float64,
    model String,
    created_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, agent_id, date, model);

-- Materialized view for auto-aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS orchestra_traces.metrics_daily_mv
TO orchestra_traces.metrics_daily
AS SELECT
    project_id,
    agent_id,
    any(agent_name) as agent_name,
    toDate(start_time) as date,
    countIf(type = 'agent_run' AND status = 'success') as successful_runs,
    countIf(type = 'agent_run' AND status = 'error') as failed_runs,
    countIf(type = 'agent_run') as total_runs,
    sum(total_tokens) as total_tokens,
    sum(cost) as total_cost,
    avg(latency_ms) as avg_latency_ms,
    quantile(0.95)(latency_ms) as p95_latency_ms,
    model
FROM orchestra_traces.traces
WHERE type = 'llm_call' OR type = 'agent_run'
GROUP BY project_id, agent_id, date, model;

-- Index for faster lookups
ALTER TABLE orchestra_traces.traces ADD INDEX idx_type type TYPE set(100) GRANULARITY 1;
ALTER TABLE orchestra_traces.traces ADD INDEX idx_status status TYPE set(10) GRANULARITY 1;
ALTER TABLE orchestra_traces.traces ADD INDEX idx_agent_id agent_id TYPE bloom_filter() GRANULARITY 1;
