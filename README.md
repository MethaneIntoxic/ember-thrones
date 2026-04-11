# Ember Thrones

Ember Thrones is a local-only, dragon-themed slot game inspired by hold-and-respin style gameplay.

## Stack

- Client: Vite + React + TypeScript + PixiJS + GSAP + Howler
- Server: Fastify + SQLite + TypeScript
- Shared: Deterministic game domain, contracts, simulation

## Quick Start (Serverless First)

1. Install dependencies:
   - `npm install`
2. Run desktop preview (build + local PWA preview):
   - `powershell -ExecutionPolicy Bypass -File .\run-desktop.ps1`
3. Run mobile PWA preview on LAN (prints phone URLs):
   - `powershell -ExecutionPolicy Bypass -File .\run-mobile-pwa.ps1`
4. Publish to GitHub Pages:
   - `npm run publish:pages`

Pages setup + troubleshooting is documented in [docs/serverless-pages.md](docs/serverless-pages.md).
Local run variants (including full client + server) are in [docs/local-run.md](docs/local-run.md).

## Full Local Stack (Client + Server)

Use this when testing server-authoritative behavior:

1. Run client + server together:
   - `npm run desktop:local`
2. Build all workspaces:
   - `npm run build`
3. Run tests:
   - `npm run test`

## Project Layout

- apps/client: UI, animation, rendering, audio
- apps/server: API, persistence, signing, replay guard
- packages/shared: contracts, game math, feature engines
- docs: game design, math model, release checklist
