# Ember Thrones

Ember Thrones is a dragon-themed slot product with two explicit runtime channels:

- Connected app: server-authoritative spins, signed responses, durable bonus sessions, live event support, and replay-safe queue handling.
- GitHub Pages demo: a clearly disclosed showcase runtime with local spin resolution and no live sync or queue replay.

## Stack

- Client: Vite + React + TypeScript + PixiJS + Howler
- Server: Fastify + SQLite + TypeScript
- Shared: deterministic contracts, feature resolvers, and simulation gates

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run the connected local stack for authoritative behavior:
   - `npm run desktop:local`
3. Run the demo desktop preview (build + local PWA preview):
   - `powershell -ExecutionPolicy Bypass -File .\run-desktop.ps1`
4. Run the demo mobile PWA preview on LAN:
   - `powershell -ExecutionPolicy Bypass -File .\run-mobile-pwa.ps1`
5. Publish the GitHub Pages demo artifact:
   - `npm run publish:pages`

Connected and demo run modes are documented in [docs/local-run.md](docs/local-run.md).
Pages setup and troubleshooting are documented in [docs/serverless-pages.md](docs/serverless-pages.md).

## Verification

- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run sim`

## Project Layout

- apps/client: UI, runtime capability messaging, rendering, audio, and PWA shell
- apps/server: API, persistence, bonus session orchestration, signing, and replay guard
- packages/shared: contracts, deterministic feature engines, progression helpers, and simulation
- docs: design, runbooks, release gates, and operator notes
