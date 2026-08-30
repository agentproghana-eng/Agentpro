# Intellicore Systems Web Platform

## Product boundaries

### Public corporate platform

- /
- /agentpro
- /solutions
- /community
- /business-hub
- /marketplace
- /about
- /partners
- /resources
- /security
- /contact

### Authentication

- /login
- /register
- /forgot-password
- /verify-account

### Authenticated AgentPro portal

- /hub
- /hub/community
- /hub/business

### Public business discovery

- /business/[business-slug]

## Experience boundaries

### Intellicore Systems

Corporate identity, solutions, partnerships, trust, resources and
future Intellicore products.

### AgentPro

Intellicore's flagship operating platform:
One App. Every Business.

### Community Hub

Authenticated professional and business collaboration environment.

### Business Hub

Private, role-aware operational workspace for businesses.

### Marketplace

Discovery-oriented environment connecting demand with businesses
and service providers.

Private Business Hub operational data must never become public
Marketplace data unless intentionally published through explicit,
backend-authorized profile controls.

## Authorization model

The browser must never be treated as an authorization boundary.

Every protected API request must be authorized by the AgentPro
backend against:

- authenticated user
- active session
- business context
- organization membership
- role
- resource ownership
- feature entitlement where applicable

Supported business-role concepts include:

- owner
- manager
- agent
- accountant
- employee
- administrator

## Location model

Location data should support:

- country
- region/state
- city
- area
- approximate coordinates
- service radius

Exact private residential coordinates must not be exposed publicly.

## Ghana-first, expansion-ready

Initial UX should work exceptionally well for:

- Ghanaian mobile users
- GHS
- Ghana phone numbers
- Ghana regions/cities/areas
- mobile-money-oriented businesses
- constrained or intermittent connectivity

Country-specific behavior must remain configurable so additional
markets can be added later.

## Security principles

- backend-enforced authorization
- secure session handling
- MFA for privileged access
- explicit business context
- least privilege
- auditability
- rate limiting
- privacy-conscious location handling
- no frontend secrets
- no unsupported security guarantees
