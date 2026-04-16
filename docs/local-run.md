# Local Run Guide

## Prerequisites
- Node.js 20.19+
- npm 10+
- PowerShell 5.1+

## Connected Local Stack

Use this mode when validating server-authoritative behavior:

- `npm run desktop:local`

URLs:
- Client: http://127.0.0.1:5173
- Server: http://127.0.0.1:4300

This path exercises signed server responses, replay guard, durable bonus sessions, queue replay, and bonus resume or claim routes.

## Demo Preview and Pages Parity

Use this mode when validating the optional static demo channel:

Install once:
- `npm install`

Demo desktop preview (build + local preview):
- `powershell -ExecutionPolicy Bypass -File .\run-desktop.ps1`

Demo mobile PWA preview on LAN (build + preview + phone URLs):
- `powershell -ExecutionPolicy Bypass -File .\run-mobile-pwa.ps1`

Publish GitHub Pages artifact and trigger deploy workflow:
- `npm run publish:pages`

## GitHub Pages Setup (One-Time)

1. In GitHub, go to Settings -> Pages.
2. Set Source to GitHub Actions.
3. Ensure Actions permission allows workflow runs for this repository.
4. Push your branch to `main` or `master`, or run `npm run publish:pages`.

Detailed demo-channel steps are in [serverless-pages.md](serverless-pages.md).

## Mobile PWA Dev (Legacy Dev Loop)

Dev server bound to LAN:
- `npm run mobile:pwa:dev`

Manual build + preview:
- `npm run mobile:pwa:build`
- `npm run mobile:pwa:preview`

On mobile (same Wi-Fi), open:
- `http://<your-computer-lan-ip>:4173`

Install as PWA:
- Android Chrome: menu -> Install app
- iOS Safari: Share -> Add to Home Screen

## Verification
- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run sim`
