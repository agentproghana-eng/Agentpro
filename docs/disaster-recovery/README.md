# AgentPro Disaster Recovery Runbook

## Objectives

AgentPro production recovery objectives are:

- Recovery Point Objective (RPO): **5 minutes or less**
- Recovery Time Objective (RTO): **30 minutes or less**

These objectives apply to the primary PostgreSQL transaction database.

## Production database

- Provider: Render PostgreSQL
- Database: `agentpro-postgres`
- Region: Frankfurt
- PostgreSQL: 16
- Role: Primary
- Storage: 1 GB
- High availability: Not enabled
- Read replicas: None

Render's paid PostgreSQL instances use continuous point-in-time recovery
(PITR).

PITR is the primary short-window recovery mechanism.

Logical exports are a secondary portable recovery mechanism and must also be
downloaded off-platform periodically.

## RPO interpretation

The RPO describes the maximum acceptable amount of committed database data
lost during recovery.

AgentPro targets an RPO of no more than five minutes.

Render continuously archives paid PostgreSQL databases for PITR. Render
currently prevents selecting a recovery point less than approximately ten
minutes old.

That restriction is treated as a recovery-point availability delay, not as
ten minutes of accepted data loss.

For example, after an incident at 12:00, AgentPro may need to wait until a
desired 11:59 recovery point becomes selectable. The resulting wait counts
against RTO.

The selected recovery point should normally be immediately before the
destructive event and should remain within the five-minute RPO objective.

## RTO interpretation

The RTO measures elapsed time from declaration of a recoverable incident
until a validated AgentPro service can safely resume.

Target: 30 minutes or less.

The RTO includes:

1. incident declaration
2. selecting a valid recovery point
3. PITR availability delay if applicable
4. creation of the recovery database
5. current schema migrations
6. backend configuration/cutover
7. health verification
8. authentication verification
9. transaction/balance reconciliation
10. reopening service

## Recovery decision

Prefer PITR for:

- accidental DELETE or UPDATE
- destructive migration
- application data corruption
- operator error
- recent logical corruption

Prefer the newest verified logical export when:

- PITR is unavailable
- portability away from Render is required
- a longer-term historical recovery point is needed

Never restore a drill directly over the production database.

## PITR procedure

1. Declare the incident and record the suspected corruption time.
2. Stop or restrict writes if continuing writes could worsen corruption.
3. Open the Render database Recovery page.
4. Select a recovery point immediately before the incident.
5. Restore into a new Render PostgreSQL instance.
6. Do not delete or overwrite the original database.
7. Validate schema and critical data on the recovery database.
8. Run current AgentPro migrations if required.
9. Point an isolated AgentPro backend at the recovery database.
10. Verify `/health`.
11. Authenticate using a known recovery-test account.
12. Verify transactions, balances, subscriptions and business ownership.
13. Reconcile key counts and transaction identifiers.
14. Only after validation, update the production backend database connection.
15. Deploy/restart the backend.
16. Verify production health and critical workflows.
17. Reopen normal traffic.
18. Preserve the original database until post-incident reconciliation is
    complete.

## Required data checks

At minimum verify:

- users
- branches
- transactions
- personal transactions
- subscriptions
- personal subscriptions
- audit logs
- cash balances
- SIM wallet balances
- float movements
- business ownership
- transaction references
- payment records
- outbox events

Financial identifiers must not be duplicated by recovery.

## Recovery safety rules

- Never test restores over production.
- Never delete the source database before the recovery copy is validated.
- Never run destructive repair SQL before creating or identifying a valid
  recovery point.
- Do not reuse production write traffic during a drill.
- Preserve recovery timestamps and checksums.
- Record every completed recovery exercise.

## Logical backup validation

Each retained logical export should have:

- filename
- creation timestamp
- SHA-256
- gzip/archive integrity result
- `pg_restore -l` result
- restore drill date
- restored table count
- application boot result

Logical exports supplement PITR; they do not replace continuous recovery.

## Drill cadence

Perform:

- logical restore validation at least quarterly
- application-level restore validation at least quarterly
- PITR recovery exercise at least quarterly
- an additional recovery drill after material database architecture changes
