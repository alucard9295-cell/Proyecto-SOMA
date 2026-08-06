# SOMA Frontend

React/Vite single-page application for the SOMA public architecture site and
administrative control room.

## Features

- Public commercial experience at `/ventas` and `/soma`.
- Administrative login, financial dashboard and invoice pipeline.
- Chroma/RAG queries and architectural assistant streaming through FastAPI.

## Local development

Install dependencies and start Vite:

```powershell
npm install
npm run dev
```

The frontend expects the FastAPI control plane at
`http://127.0.0.1:8767` by default. To use another API address, create a local
`.env` file with:

```text
VITE_API_BASE=https://api.example.com
```

The backend is maintained separately in

## Production build

```powershell
npm run build
npm run preview
```

Deploy the generated `dist/` directory to a static host. Configure the backend
URL at build time using `VITE_API_BASE`.

## Security

Never put provider credentials or API keys in this frontend or in `VITE_*`
variables. Keep them in the FastAPI backend environment. Do not commit `.env`,
`node_modules/` or `dist/`.
