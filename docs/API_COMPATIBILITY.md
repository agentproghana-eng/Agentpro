# AgentPro API Compatibility Policy

## Purpose

AgentPro mobile releases and backend deployments do not happen at the same
time for every user. The backend must therefore preserve a defined contract
for supported installed app versions.

A backend deployment must not accidentally make a recently supported
AgentPro Android release unusable.

## Version dimensions

AgentPro tracks four compatibility dimensions:

- `api_contract_version`
- `minimum_supported_app_version`
- `recommended_app_version`
- `forced_upgrade_below_version`

The mobile client sends:

- `X-AgentPro-App-Version`
- `X-AgentPro-App-Build`
- `X-AgentPro-Platform`
- `X-AgentPro-API-Version`

Clients that predate these headers are temporarily classified as
`LEGACY_SUPPORTED`.

## Compatibility states

### LEGACY_SUPPORTED

The request contains no AgentPro compatibility metadata.

This state exists only to protect already-installed clients during migration
to the formal policy. Missing metadata must not be treated as permanent
authorization to remain on an old application version.

### SUPPORTED

The app and API contract versions are currently supported.

### UPDATE_RECOMMENDED

The client remains supported, but a newer release is recommended.

Requests continue normally.

### UPDATE_REQUIRED

The app version is below a supported or forced-upgrade boundary.

Ordinary `/api/v1` requests return HTTP 426.

### API_INCOMPATIBLE

The client requests an API contract the backend does not support.

Ordinary `/api/v1` requests return HTTP 426.

### CLIENT_METADATA_INVALID

A client explicitly sends malformed or incomplete compatibility metadata.

The request returns HTTP 400.

## Compatibility discovery

`GET /api/v1/compatibility` is intentionally mounted before compatibility
enforcement.

It must remain reachable even when the requesting client itself is outdated
or API-incompatible.

## Release rules

### Patch releases

Patch releases must not make breaking API changes.

Examples:

- `2.0.0` to `2.0.1`
- security fixes
- bug fixes
- performance fixes

Existing supported request and response contracts must continue to work.

### Minor releases

Minor releases may add endpoints, optional request capabilities, or response
fields.

They must remain backward compatible with supported clients.

Examples:

- add a nullable or optional response field
- add a new endpoint
- introduce a new optional request property
- introduce a new capability behind server negotiation

A minor release must not silently change the meaning or type of an existing
field.

### Breaking API changes

A breaking API change requires a new API contract version.

Examples:

- removing a required response field
- changing a field type
- changing previously accepted values incompatibly
- changing authentication semantics incompatibly
- removing an endpoint still used by a supported client

Breaking changes must not be introduced solely by increasing the mobile app
version.

## Deprecation lifecycle

API removal follows this sequence:

1. Introduce the replacement.
2. Keep the existing contract working.
3. Release clients using the replacement.
4. Measure or otherwise establish that supported clients no longer require
   the old contract.
5. Deprecate the old contract.
6. Raise the minimum supported client boundary only when justified.
7. Remove the old contract in a later controlled deployment.

Never perform steps 1 and 7 in the same ordinary release.

## Database migration rules

Schema changes used by rolling application deployments must follow an
expand-and-contract approach.

### Expand

First deploy backward-compatible database changes.

Examples:

- add nullable columns
- add new tables
- add indexes safely
- add new enum values without removing old ones
- temporarily preserve old and new representations

Both old and new application code must be able to operate during this phase.

### Migrate

Backfill or transform data after the expanded schema is available.

Data migration must be restartable or otherwise safely recoverable.

### Contract

Remove obsolete columns, values, constraints, or compatibility code only
after all supported application versions no longer depend on them.

A destructive schema migration must never be deployed while a supported
mobile version still depends on the old schema behavior.

## Forced upgrades

Forced upgrades are exceptional.

Appropriate reasons include:

- a serious security vulnerability
- an incompatible API-contract retirement
- a regulatory or compliance requirement
- a corrupted or unsafe client behavior
- a backend change that cannot safely support the old client
- a critical transaction-integrity issue

A normal feature release is not sufficient reason for a forced upgrade.

The `forced_upgrade_below_version` boundary must therefore not automatically
move whenever a new AgentPro release ships.

## Support window

At minimum, the previously commercially supported AgentPro release should
normally continue working while a newer release rolls out.

The exact window may be extended when adoption is slow or shortened only for
a justified forced-upgrade event.

## Rollout sequence

For a normal compatible release:

1. Deploy backward-compatible backend/database changes.
2. Verify current production clients still work.
3. Release the new client.
4. Mark the newer client as recommended when appropriate.
5. Observe adoption and errors.
6. Retire old compatibility behavior only after the support policy permits it.

## Rollback

Compatibility policy changes must be independently reversible from database
destruction.

If a newly raised client boundary causes unexpected impact, the backend must
be capable of restoring support without requiring a database rollback.

## Testing requirements

Changes to compatibility behavior require automated coverage for:

- no-version legacy clients
- current supported clients
- recommended-update clients
- unsupported application versions
- unsupported API contract versions
- malformed explicit metadata
- accessibility of the compatibility discovery endpoint
- mobile handling of HTTP 426

CI is the authoritative Flutter analyzer/build environment when the local
development environment does not contain the pinned Flutter SDK.
