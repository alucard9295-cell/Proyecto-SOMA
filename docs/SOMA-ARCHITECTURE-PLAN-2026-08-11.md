---
type: Architecture Plan
title: SOMA architecture plan 2026-08-11
description: Phased plan to evolve SOMA from its current control plane into a reliable document and knowledge product.
tags: [soma, architecture, roadmap, modular-monolith]
status: draft
generated: { by: human:product-soma, at: 2026-08-11T00:00:00Z }
sources:
  - id: current-architecture
    resource: SOMA.md
    title: Current SOMA architecture
  - id: product-requirements
    resource: SOMA-PRD.md
    title: SOMA PRD
---

# Goal

Deliver a reliable path from a document or architectural question to a
traceable answer, without allowing an LLM to become the source of financial
truth. The first target is a modular monolith with an asynchronous document
worker, not a collection of microservices.

# Current baseline

- React/Vite is the public site and administrative control room.
- FastAPI is the only backend boundary and already owns auth, JWT, SQLite,
  LangGraph, SSE and deterministic remodeling calculations.
- `api/src/soma_api/agent.py` currently mixes provider setup, graph creation,
  fallback behavior, scenario extraction, prompt-facing plan generation and
  tool definitions.
- The UI references invoice, RAG and Excel routes that are not implemented.
- SQLite is acceptable for local development and one small persistent instance,
  but not for a multi-replica or serverless deployment.

# Target shape

```text
React/Vercel
    |
    | HTTPS JSON + SSE
    v
FastAPI control plane
    |-- auth and session module
    |-- sales and deterministic calculation module
    |-- document API: upload, preview, job status
    |-- knowledge API: retrieval and citations
    |-- report API: exports and audit trail
    |-- agent application service
    |
    | ports/adapters
    |-- relational repository (SQLite now, Postgres later)
    |-- object storage for source PDFs
    |-- job queue
    |-- document worker
    |-- vector or graph index
    |-- read-only knowledge MCP clients
```

The API and worker may remain in the same repository and Python project while
they are deployed as different processes. A separate repository is not needed.

# Phase 0 implementation status

The first hardening slice is now implemented in the repository:

- UI actions for undocumented pipeline, RAG and Excel routes were removed.
- SQLite has versioned, idempotent migrations with `audit_events`.
- User persistence is behind a repository adapter.
- Login and authorization events are audited with sensitive-value redaction.
- MCP is disabled by default and enforces a read-only allowlist, timeout and
  bounded output.
- CORS is restricted, responses carry `X-Request-ID`, and `/ready` checks the
  migrated database without creating a missing file.

The remaining Phase 0 work is contract documentation for future document
endpoints and a production smoke test. PDF/OCR, RAG, PostgreSQL and a worker
remain intentionally outside this slice.

# Boundaries and responsibilities

| Boundary | Owns | Must not own |
| --- | --- | --- |
| React | Navigation, forms, rendering, SSE consumption | Secrets, SQL, financial rules |
| HTTP routes | Authentication, validation, status codes and serialization | Long business workflows |
| Application services | Use cases such as `process_document` or `ask_knowledge` | Framework-specific response objects |
| Domain modules | Invoice state, deterministic calculations, citation rules | LLM transport or HTTP |
| Repositories | Persistence queries and transactions | Prompt construction |
| Adapters | SQLite/Postgres, storage, MCP, LLM and vector clients | Product policy |
| Worker | OCR, parsing, indexing and retries | Browser sessions |

# Patterns to introduce

1. **Ports and adapters:** define small protocols for document storage,
   repositories, extraction, embeddings and model generation. Keep FastAPI,
   Chroma and MCP at the edge.
2. **Application service:** move each user flow into a service with one public
   method and a typed input/output. Routes become thin adapters.
3. **Repository:** introduce repositories when invoice tables are added. Keep
   SQL out of routes and agent tools.
4. **Strategy:** select local embeddings, Gemini or another provider through a
   provider strategy. Do not branch provider details throughout the API.
5. **Anti-corruption adapter:** wrap every external MCP with a local interface,
   timeout, tool allowlist and response normalization.
6. **State machine:** model document jobs as `received`, `extracting`,
   `validated`, `indexed`, `failed` and `needs_review`. Do not represent a
   long-running job with a single boolean.
7. **Outbox or job record:** persist the event that a document needs indexing
   before sending it to the queue, so retries do not lose work.

# Phased plan

## Phase 0: contracts and safety

- Remove or hide UI actions for routes that do not exist, or implement their
  contracts before presenting them as production features.
- Add OpenAPI request/response models for every planned route.
- Add a database migration mechanism and an audit table.
- Add structured request IDs, error codes and health/readiness checks.
- Restrict MCP tools with an explicit allowlist; never load every returned tool.

Acceptance: the frontend cannot call an undocumented route and every protected
route has an authorization test.

## Phase 1: document ingestion

- Add `documents`, `document_jobs`, `invoices`, `invoice_items` and `audit_events`.
- Upload PDFs to object storage, not the API container filesystem.
- Return a job ID immediately; expose `GET /api/documents/jobs/{id}`.
- Use a worker for extraction, validation and persistence.
- Keep preview synchronous only for small files with a strict timeout.

Acceptance: a failed PDF is visible, retryable and never silently becomes a
financial record.

## Phase 2: knowledge retrieval

- Make the OKF bundle the curated source for definitions, policies and
  architecture knowledge.
- Index chunks with source path, concept ID, checksum, status and citations.
- Keep SQLite/Postgres as the numerical source of truth.
- Start with deterministic lexical retrieval plus a local vector index; add
  embeddings only after measuring relevance and cost.

Acceptance: every answer exposes sources and never claims a figure that is not
present in a trusted record.

## Phase 3: agent and MCP hardening

- Separate `AgentService`, `ToolPolicy` and `ModelProvider`.
- Use MCP only for read-only, bounded knowledge retrieval.
- Add timeouts, maximum result size, origin validation, audit logs and failure
  fallback for every MCP call.
- Keep financial calculations as Python application services or SQL queries.

Acceptance: disabling MCP does not break login, calculations or document
processing; a malicious document cannot gain a write-capable tool.

## Phase 4: production deployment

- Deploy the Vite site to Vercel.
- Deploy FastAPI and the worker to a container platform with a persistent data
  strategy.
- Move from SQLite to managed Postgres when using multiple instances or a
  serverless container platform.
- Add object storage, queue, logs, metrics, backups and alerting.

Acceptance: a new deployment can be rolled back without losing documents or
database state.

# Monolith versus microservices decision

Stay with a modular monolith plus worker until at least two of these are true:

- document processing needs independent autoscaling;
- worker failures need isolation from user-facing requests;
- separate teams own billing, documents or knowledge;
- one module has a materially different release cadence;
- load or compliance requires independent data boundaries.

Splitting earlier would add network contracts, distributed tracing, retries,
authentication between services and operational cost without solving the
current missing endpoint contracts. The first useful split is a document worker,
not an auth service or an agent service.

# Definition of done

- API contract tests cover frontend calls.
- Unit tests cover domain calculations and document state transitions.
- Integration tests cover storage, queue, MCP policy and database migrations.
- End-to-end smoke test covers login, upload, job completion, query and export.
- CI runs formatting, linting, type checks, tests, frontend build and image scan.
- Production has backups, restore tests, rate limits and secret rotation.
