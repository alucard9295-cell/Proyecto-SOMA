---
type: Code Quality Review
title: SOMA Clean Code SOLID and KISS review
description: Baseline assessment of code quality principles and the changes needed before production document processing.
tags: [soma, clean-code, solid, kiss, testing]
status: draft
generated: { by: human:product-soma, at: 2026-08-11T00:00:00Z }
sources:
  - id: architecture-plan
    resource: SOMA-ARCHITECTURE-PLAN-2026-08-11.md
    title: Target architecture plan
---

# Executive result

The codebase is a good early-stage foundation, not yet a production document
platform. The most important improvement is separation of use cases from
transport and provider code. There is no reason to rewrite the application or
introduce microservices to achieve that.

The first hardening slice has since been applied and independently verified:
18 API tests pass, the frontend builds, undocumented UI routes are hidden,
MCP write-like tools are rejected, SQLite readiness is read-only, and audit
details redact sensitive keys. Remaining findings concern the future document
and provider boundaries, not a need to rewrite the current system.

| Area | Current level | Risk | Next action |
| --- | --- | --- | --- |
| KISS | Good in auth and simulator | Medium | Preserve deterministic rules; avoid premature services |
| Single responsibility | Partial | High | Split `agent.py` into application, provider and tool policy modules |
| Open/closed | Partial | Medium | Add provider strategies and extractor adapters |
| Liskov substitution | Not formalized | Medium | Define protocols and contract tests for adapters |
| Interface segregation | Weak around external tools | High | Expose small read-only knowledge interfaces |
| Dependency inversion | Partial | High | Inject repositories, model provider and MCP gateway |
| Testability | Good for current scope | Medium | Add route contracts, migrations and worker tests |
| Observability | Minimal | High | Add request IDs, job events, structured logs and metrics |

# Findings

## High priority

1. `api/src/soma_api/agent.py` owns scenario parsing, deterministic planning,
   LangGraph construction, model configuration, MCP loading and streaming.
   This violates Single Responsibility and makes provider changes expensive.
2. `api/src/soma_api/mcp.py` returns every tool exposed by the remote server.
   The docstring says read-only, but the code does not enforce a tool allowlist.
   Add a `ToolPolicy` that rejects unknown names and oversized results.
3. The UI advertises pipeline, RAG and Excel behavior while the API currently
   exposes only auth, summary, agent and simulation routes. This is a contract
   and clean-code problem because dead UI paths hide incomplete behavior.
4. Long PDF/OCR work must not run inside a Vercel function or a request handler.
   It needs a persisted job state and a retryable worker.

## Medium priority

1. `main.py` performs application composition through module globals. It works
   for the current deployment, but an application factory makes tests,
   migrations and worker reuse safer.
2. Database access is centralized in functions, which is acceptable now. Once
   invoice tables arrive, introduce repositories and transaction boundaries so
   SQL does not spread into routes and tools.
3. CORS and HTTP methods are broad (`allow_methods=["*"]`). Restrict methods,
   headers and origins in production configuration.
4. `extract_scenario` uses a small regex parser. Keep it as a fallback, but
   replace it with a typed extraction boundary when multiple locales and units
   are supported.
5. The in-memory rate limiter is correct for one process only. Use an edge/WAF
   or Redis when scaling replicas.

## What is already good

- Business calculations are deterministic and outside the LLM.
- Secrets stay in the API environment rather than `VITE_*` variables.
- Auth queries are parameterized and passwords are hashed.
- LangGraph has a safe fallback when no model key exists.
- The frontend/API boundary is documented and the API has focused tests.

# KISS rules for the next iteration

- One repository, one API, one worker process until scale proves otherwise.
- One canonical document state machine instead of flags spread across tables.
- One storage abstraction for PDFs, with local filesystem only in development.
- One retrieval interface regardless of Chroma, Postgres or local index.
- No LLM call for arithmetic, authorization, routing or validation.
- No MCP write tools in the production agent.

# Recommended tooling gates

Add these incrementally to CI, not all in one rewrite:

1. Ruff for Python formatting and linting.
2. Pyright or mypy for typed service and repository boundaries.
3. Bandit and dependency audit for Python packages.
4. ESLint for React code and accessibility checks for the control room.
5. Contract tests generated from the FastAPI OpenAPI schema.
6. Coverage thresholds for domain services, auth and document state transitions.

# Refactoring order

1. Extract `ModelProvider` and `KnowledgeGateway` protocols from `agent.py`.
2. Extract `ArchitecturePlanService` and keep `estimate_remodel` deterministic.
3. Add `MCPGateway` with an explicit read-only tool policy.
4. Introduce application factories and repository interfaces.
5. Add document services and worker boundaries only after their API contracts
   exist.
