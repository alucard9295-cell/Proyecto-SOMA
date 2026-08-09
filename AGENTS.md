# SOMA React Frontend

## Scope

React/Vite SPA for the public SOMA landing page and the local operational
panel. The FastAPI control plane in `api/` remains the only backend boundary.

## Commands

- Install: `npm install`.
- Development: `npm run dev`.
- Production build: `npm run build`.
- Preview build: `npm run preview`.

## Architecture

- `src/App.jsx`: view routing and API-connected modules.
- `src/styles.css`: design tokens, responsive layout and animations.
- `src/assets/`: owned SVG assets and future project imagery.
- `VITE_API_BASE`: public backend URL only; never place secrets in frontend env. Local default is `http://127.0.0.1:8000`.
- The chat generation provider is selected in the UI, but Go credentials stay in the Python `.env`.

## Rules

- Keep business secrets in FastAPI, never in React.
- Treat the landing page as commercial and the panel as operational.
- Preserve accessible labels, keyboard actions and reduced-motion behavior.
- Use the design rules in `DESIGN.md` before adding components.
