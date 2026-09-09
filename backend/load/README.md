# AgentPro Load & Capacity Validation

This directory contains controlled load-test scenarios for AgentPro.

## Safety model

Load tests are divided into two categories:

1. Read-only / non-destructive scenarios.
2. Destructive or state-changing scenarios.

Destructive scenarios must never run against the production AgentPro API.

The production hostname currently protected by the test harness is:

- `agentpro-api-izi3.onrender.com`

A destructive scenario must require:

`AGENTPRO_ALLOW_DESTRUCTIVE=true`

and must also reject known production hosts.

## First validation stages

1. Smoke: 1-5 virtual users.
2. Baseline: 10 virtual users.
3. Warm load: 25 virtual users.
4. Initial load: 50 virtual users.
5. First capacity gate: 100 virtual users.

Higher stages are introduced only after correctness and observability are proven:

- 500
- 1,000
- 5,000
- 10,000

## Initial latency objectives

For lightweight API operations:

- p50 < 250 ms
- p95 < 500 ms
- p99 < 1,000 ms
- HTTP failure rate < 1%

These are initial engineering gates, not permanent SLOs.

Endpoint-specific budgets will be established from measured baselines.

## Running the smoke test

Example against a local AgentPro API:

`AGENTPRO_BASE_URL=http://127.0.0.1:3000 k6 run backend/load/k6/smoke.js`

Do not run financial, payment, notification-producing, or other state-changing workloads against production.

## Metrics required for capacity validation

- request rate
- HTTP error rate
- p50 latency
- p95 latency
- p99 latency
- PostgreSQL pool total/idle/waiting connections
- Redis health and latency
- Node process memory
- event-loop lag
- outbox pending depth
- oldest pending outbox age
- dead-letter count
- outbox throughput
- worker failure/retry rate
