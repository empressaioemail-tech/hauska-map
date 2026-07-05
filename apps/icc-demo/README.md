# Codex — ICC Model Codes Demo

A standalone Vite + React + TypeScript application for browsing the 2018 IBC and 2018 IPMC via ICC Code Connect.

## Environment Variables

### Required

- `RETRIEVAL_API_KEY` — Authorization token for the Hauska Retrieval API

### Optional

- `RETRIEVAL_API_URL` — Base URL for the retrieval API (defaults to `https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app`)

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Vercel Deployment

### Project Settings

- **Root Directory**: `apps/icc-demo`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables

Set the following in your Vercel project settings:

- `RETRIEVAL_API_KEY` (required)
- `RETRIEVAL_API_URL` (optional)

## Architecture

- **API Proxy** (`api/icc.ts`): Vercel serverless function that proxies requests to the Hauska Retrieval API, forcing `jurisdiction=icc-model-code` on all search queries
- **Frontend** (`src/`): React SPA with search interface and result cards
- **Routing** (`vercel.json`): SPA rewrite pattern that excludes `/api/*` routes
