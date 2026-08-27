---
type: Integration Plan
title: SOMA knowledge MCP and PDF pipeline plan
description: Safe integration plan for curated knowledge, MCP retrieval and asynchronous document processing.
tags: [soma, mcp, knowledge, pdf, rag, documents]
status: draft
generated: { by: human:product-soma, at: 2026-08-11T00:00:00Z }
sources:
  - id: okf-bundle
    resource: index.md
    title: SOMA OKF knowledge bundle
  - id: architecture-plan
    resource: SOMA-ARCHITECTURE-PLAN-2026-08-11.md
    title: SOMA architecture plan
---

# Knowledge sources

The first knowledge corpus should be the OKF bundle in this directory. It is
appropriate for architectural decisions, product definitions, policies,
assumptions and provenance. It is not a replacement for invoice tables or a
transactional database.

The current API hardening keeps MCP disabled by default and rejects write-like
tools even when their names appear in the configured allowlist. The OKF
knowledge gateway described below is still a future read-only adapter; it has
not been connected to the public agent.

Recommended source classes:

| Source | Use | Trust rule |
| --- | --- | --- |
| SOMA OKF docs | Architecture, requirements and policies | Surface `status`, `generated` and `sources` |
| SQLite/Postgres | Invoice totals, users and job state | Numeric source of truth |
| Official regulations | Normative context | Store URL, retrieval date and jurisdiction |
| Verified cost tables | Parametric estimates | Version and review date required |
| Supplier documents | Commercial references | Never treat as universal prices |
| Graphify graph | Developer navigation only | Never expose as financial truth |

# MCPs to integrate

## 1. Read-only OKF knowledge MCP

Expose a small local gateway rather than attaching a generic filesystem MCP to
the agent. Minimum operations:

- `search_concepts(query, tags, status, limit)`;
- `get_concept(concept_id)`;
- `list_sources(concept_id)`;
- `get_freshness(concept_id)`.

The gateway must reject path traversal, limit result size, return concept IDs
and sources, and never execute code from a document.

## 2. Official documentation MCP

The existing LangChain documentation MCP can remain development-only. It must
be behind `MCP_ENABLED`, use an explicit tool allowlist, have timeouts and be
excluded from financial or administrative prompts.

## 3. Regulatory and local knowledge connectors

Add these only when the jurisdiction and authoritative sources are defined:

- planning and construction regulations;
- local cost index and official statistics;
- approved supplier or quotation repository.

Prefer scheduled ingestion into OKF or database tables over live unrestricted
web browsing at answer time.

## 4. Graphify MCP

Keep Graphify MCP as a developer tool for code navigation. Do not connect it to
the public sales agent or let it read production document storage.

# PDF and document processing

## Why it cannot be a Vercel request

PDF extraction and OCR can exceed function duration, request body limits and
ephemeral disk guarantees. A Vercel function must not hold the browser request
open while it downloads, OCRs, embeds and indexes a large document.

## Recommended flow

```text
Browser
  -> POST /api/documents/upload
  <- 202 { job_id, upload_url }

Object storage <- PDF upload
API persists job: received
Queue          <- document_id
Worker         -> download, hash, extract text, OCR if needed
Worker         -> validate fields and persist invoice records
Worker         -> chunk/index knowledge, persist citations
Worker         -> job status: indexed or needs_review

Browser -> GET /api/documents/jobs/{job_id}
```

## Initial worker choices

- Text PDFs: PyMuPDF or pdfplumber.
- Scanned PDFs: OCRmyPDF/Tesseract or a managed OCR service.
- Validation: Pydantic schemas plus deterministic totals and tax checks.
- Storage: S3-compatible bucket or Google Cloud Storage.
- Queue: Cloud Tasks, Redis queue or a managed job queue.
- Retrieval: lexical search first; add Chroma or pgvector after relevance tests.

## Required document states

`received -> extracting -> validated -> indexed`.

Failure transitions are `extracting -> failed` and `validated -> needs_review`.
Every transition records timestamp, error code, attempt number and actor.

## Security requirements

- Verify content type and magic bytes; never trust the filename.
- Limit size, page count, extraction time and decompressed output.
- Store hashes to deduplicate uploads.
- Scan files before processing and isolate OCR workers.
- Treat PDF text as untrusted prompt content.
- Do not let extracted text invoke SQL, shell, filesystem or write-capable MCPs.
