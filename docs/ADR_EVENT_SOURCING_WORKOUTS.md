# ADR: Event Sourcing for Workouts

## Status
Proposed (not implemented in runtime).

## Context
Current workouts model is CRUD in relational tables and is sufficient for MVP.  
Potential future requirements:
- full audit trail of workout updates,
- replayable state for analytics,
- multi-writer conflict visibility (manual edits + imports + integrations).

## Decision
Do not migrate to Event Sourcing now.  
Adopt a trigger-based strategy: start implementation only when at least one trigger is met for two consecutive releases.

## Triggers to start implementation
1. **Audit/replay requirement**: product/legal requires immutable history of all workout mutations.
2. **Analytics requirement**: derived training features need event replay from raw domain changes.
3. **Multi-writer requirement**: frequent conflicts between manual, FIT, and external sync updates.

## Target event model (high level)
- Aggregate: `WorkoutAggregate`.
- Event types:
  - `WorkoutCreated`
  - `WorkoutUpdated`
  - `WorkoutDeleted`
  - `WorkoutImportedFromFit`
  - `WorkoutSyncedFromProvider`
- Event envelope:
  - `event_id`, `aggregate_id`, `event_type`, `version`,
  - `occurred_at`, `actor`, `source`,
  - `payload` (JSON), `metadata`.

## Migration strategy
1. Introduce append-only `workout_events` table in parallel with existing CRUD.
2. Dual-write on workout mutations (CRUD + event append).
3. Build projection worker to materialize current read model.
4. Compare projection with existing CRUD outputs in shadow mode.
5. Switch reads to projections behind feature flag.
6. Remove direct CRUD writes after parity window.

## Cost and risks
- Estimated effort: 20+ hours for first production-ready version.
- Risks:
  - increased operational complexity,
  - projection lag and eventual consistency handling,
  - migration bugs during dual-write period.

## Mitigations
- Idempotent event append keys.
- Replay tests in CI.
- Feature-flagged rollout and rollback to CRUD reads.
