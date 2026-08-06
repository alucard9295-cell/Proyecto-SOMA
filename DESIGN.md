# SOMA React Design System

## Visual direction

Editorial architecture studio with operational clarity. The public experience
uses warm paper, graphite, terracotta and muted olive. It should feel like a
well-edited architecture dossier rather than a generic SaaS dashboard.

## Tokens

- `--paper`: `#F7F5EF`, warm canvas.
- `--card`: `#FFFEFA`, elevated surfaces.
- `--ink`: `#1D1D1A`, headings, navigation and primary actions.
- `--muted`: `#77756B`, supporting copy and metadata.
- `--terra`: `#C76649`, single action and editorial accent.
- `--olive`: `#68775D`, calm operational status.
- Borders: `#DEDBD1`, never pure black rules.

## Typography

- Display: Georgia or a restrained editorial serif.
- UI/body: system sans stack.
- Technical metadata: monospace, uppercase, compact.

## Components

- Primary buttons are graphite pills with terracotta hover.
- Cards use thin warm borders and very restrained shadows.
- Hero imagery uses diagrams, plans and assets from `src/assets`.
- Dashboard controls remain dense but not dark-mode by default.
- Animations reveal sections vertically and float architectural diagrams.
- Respect `prefers-reduced-motion`.

## Guardrails

- Do not call a project cohousing or cooperative housing without shared governance or ownership.
- Do not promise rent, ROI or permits; use potential and show assumptions.
- Keep commercial storytelling separate from administrative operations.
- Never expose API keys in React or `VITE_*` variables.
