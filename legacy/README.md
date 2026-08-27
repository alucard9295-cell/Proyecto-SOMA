# Legacy APU extractor

This directory preserves the previously working invoice extraction and APU
control plane so it can be compared and migrated into `api/` incrementally.

The legacy code is intentionally not imported by the current FastAPI app. The
most important migration target is `apu_extractor/extractor.py`, which contains
provider-specific PDF/XML parsers and the generic fallback.

Excluded from this branch are `.env` files, virtual environments, SQLite data,
generated reports, Chroma indexes and source invoice PDFs.
