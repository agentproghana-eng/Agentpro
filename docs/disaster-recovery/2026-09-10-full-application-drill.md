# AgentPro Full Application Disaster Recovery Drill

Date: 10 September 2026

## Result

**PASS**

A Render PostgreSQL logical export was restored into a completely fresh
isolated PostgreSQL cluster. The restored database was then migrated using
the current AgentPro codebase and used to boot the current AgentPro backend.

Production was not modified.

## Source backup

Filename:

`2026-09-03T11_58Z.dir.tar.gz`

SHA-256:

`7bfaecd741b0fc88850067c868cc0aeab10229b88192b152a0297f8ed59d9593`

Integrity checks:

- SHA-256: PASS
- gzip integrity: PASS
- pg_restore catalogue: PASS

## Recovery environment

- Source: Render logical PostgreSQL export
- Restore target: Fresh local PostgreSQL cluster
- Local PostgreSQL version: 18.2
- Isolated PostgreSQL port: 55433
- Database: `agentpro_dr_test`
- Backend port: 3011
- Backend environment: `NODE_ENV=test`
- Production database touched: No

## Restore results

Fresh PostgreSQL cluster:

PASS

Fresh target database:

PASS

Database restore:

PASS

Restored public tables:

77

Restore duration:

1 second

## Pre-migration data

| Table | Rows |
|---|---:|
| users | 5 |
| transactions | 73 |
| personal_transactions | 110 |
| subscriptions | 2 |
| personal_subscriptions | 4 |
| branches | 2 |
| audit_logs | 649 |

## Current migration compatibility

The September 3 database was migrated using the September 10 AgentPro
codebase.

13 newer migrations, 107 through 119, were successfully applied.

Migration duration:

1 second

Critical row counts after migration:

| Table | Before | After |
|---|---:|---:|
| users | 5 | 5 |
| transactions | 73 | 73 |
| personal_transactions | 110 | 110 |
| subscriptions | 2 | 2 |
| personal_subscriptions | 4 | 4 |
| branches | 2 | 2 |
| audit_logs | 649 | 649 |

Result:

**Migration data preservation PASS**

## Application boot

Current AgentPro backend successfully booted against the restored database.

Health response reported:

- PostgreSQL: healthy
- Redis: unhealthy

Redis was intentionally pointed at an unavailable local port for isolation.
AgentPro correctly continued in reduced-functionality mode.

Backend boot duration:

8 seconds

API compatibility endpoint:

PASS

## Transaction integrity

Business transactions:

- total rows: 73
- distinct primary IDs: 73

Personal transactions:

- total rows: 110
- distinct primary IDs: 110

Result:

**No duplicate transaction primary IDs detected**

## Measured technical recovery time

- restore: 1 second
- migrations: 1 second
- backend boot: 8 seconds

Total technical recovery:

**10 seconds**

Target:

**RTO <= 30 minutes**

Result:

**PASS**

This technical measurement does not include human incident declaration,
PITR provisioning, DNS/configuration cutover or other operational delays.
Those must be included during a Render PITR exercise.

## Conclusions

The drill proved:

- the retained backup is usable
- a completely fresh PostgreSQL environment can accept the backup
- the current AgentPro migration chain works against the recovered database
- critical sampled records survive migration
- the current backend can boot against recovered data
- critical API requests work
- transaction primary keys remain unique
- technical restore and boot time is comfortably below the 30-minute target

## Remaining validation

A Render point-in-time recovery exercise is still required to validate:

- PITR workflow
- recovery-instance provisioning time
- selectable recovery-point behavior
- operational RTO
- RPO target selection
- backend cutover procedure


## Render PITR recovery validation

A separate Render PostgreSQL point-in-time recovery instance was created from
the production database.

Recovery database:

`agentpro-pitr-drill-20260910`

Production database:

`agentpro-postgres`

The production database remained available and was not replaced or modified.

### PITR recovered database state

The recovered Render database was validated directly over an encrypted
PostgreSQL connection.

Migration log entries:

123

Latest migration:

`119_ask_agentpro_monthly_budget.sql`

Public tables:

78

Critical recovered row counts:

| Table | Rows |
|---|---:|
| users | 7 |
| transactions | 74 |
| personal_transactions | 143 |
| subscriptions | 2 |
| personal_subscriptions | 6 |
| branches | 2 |
| audit_logs | 760 |

Transaction integrity:

- business transaction IDs: unique
- personal transaction IDs: unique

Results:

- PITR database creation: PASS
- PITR database availability: PASS
- recovered schema: PASS
- migration state: PASS
- critical data queryability: PASS
- transaction primary-key integrity: PASS
- production isolation: PASS

## Final DR assessment

AgentPro now has two independently validated recovery paths:

1. Render point-in-time recovery for recent production incidents.
2. Portable logical PostgreSQL exports for secondary/off-platform recovery.

The September 10 exercise proved that a historical logical export can be
restored into a fresh PostgreSQL environment, migrated using the current
AgentPro codebase and used to boot a healthy backend.

The Render PITR exercise separately proved that Render can create an
independent point-in-time copy of the production database and preserve the
current migration state and critical application data.

Recovery Time Objective:

**Target: <= 30 minutes**

Observed technical logical-restore recovery:

**10 seconds**

Result:

**PASS**

Recovery Point Objective:

**Target: <= 5 minutes**

Render PITR is the mechanism used to meet this target. The operational
procedure selects the latest safe recovery point immediately before a
destructive event. Render's delay before very recent timestamps become
selectable is treated as recovery availability time and therefore belongs
to RTO rather than accepted data loss.

Result:

**PITR recovery mechanism validated**

## Final status

**FULL DISASTER RECOVERY VALIDATION: PASS**
