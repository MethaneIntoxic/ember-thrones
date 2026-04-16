# GitHub Pages Demo Runbook

GitHub Pages is the optional demo and showcase channel for Ember Thrones.
It is not the canonical connected deployment.

The Pages artifact builds only the client PWA and runs in explicit demo mode:
- spins resolve locally,
- live events are unavailable,
- queue replay is unavailable,
- runtime disclosure must make those limits obvious in the UI.

## 1) One-Time GitHub Setup

1. Open your repository on GitHub.
2. Go to Settings -> Pages.
3. Under Build and deployment, set Source to GitHub Actions.
4. Go to Settings -> Actions -> General and ensure workflows are allowed.
5. Confirm you can run Actions on your default branch (`main` or `master`).

## 2) Local Operator Commands

From repo root:

- Demo desktop preview (build + local preview):
  - `powershell -ExecutionPolicy Bypass -File .\run-desktop.ps1`
- Demo mobile PWA preview on LAN (build + preview + phone URLs):
  - `powershell -ExecutionPolicy Bypass -File .\run-mobile-pwa.ps1`
- Publish the Pages demo (build + dispatch workflow):
  - `npm run publish:pages`

`publish:pages` runs `run-publish-pages.ps1`, which:
- installs dependencies,
- builds client assets,
- triggers `.github/workflows/deploy.yml` through GitHub CLI.

If you only want a local build and do not want to dispatch a workflow:
- `powershell -ExecutionPolicy Bypass -File .\run-publish-pages.ps1 -SkipDispatch`

## 3) Deployment Workflow Behavior

Workflow file:
- `.github/workflows/deploy.yml`

What it does:
1. Checks out the repository.
2. Installs dependencies with `npm ci`.
3. Resolves `VITE_BASE_PATH` dynamically:
  - project repo pages: `/<repo-name>/`
  - user/org pages repo (`<owner>.github.io`): `/`
4. Builds the client app using the resolved base path.
5. Adds SPA fallback file (`404.html`) by copying `index.html`.
6. Adds `.nojekyll` to output.
7. Uploads `apps/client/dist` and deploys with official Pages actions.

Triggers:
- Push to `main` or `master` when relevant project files change.
- Manual run via workflow dispatch.

## 4) Demo Runtime Expectations

After the Pages build loads, verify the release still behaves like a disclosed demo:

1. The UI clearly indicates demo or fallback runtime rather than implying a connected product.
2. Spins resolve locally without waiting for a server.
3. Live event messaging reports unavailable or demo behavior instead of connected status.
4. Offline queue messaging never implies replay will occur on Pages.
5. Bonus overlays still render, but resumability expectations remain scoped to the connected app.

## 5) First Publish Validation

After workflow succeeds:
1. Open Settings -> Pages and copy the site URL.
2. Load it on desktop and verify the game starts.
3. Verify the runtime disclosure matches demo behavior.
4. Load the same URL on mobile and install as PWA.
5. Re-open while offline to verify app-shell startup.

## 6) Troubleshooting

### 404 on JS/CSS assets after deploy
- Symptom: HTML loads but scripts/styles 404.
- Cause: incorrect base path for the repository type.
- Fix: ensure deploy workflow resolves base path dynamically:
  - `/<repo-name>/` for project pages
  - `/` for user/org pages (`<owner>.github.io`)

### 404 when refreshing non-root route
- Symptom: opening a deep client route directly returns 404.
- Fix: deploy artifact includes `404.html` fallback copied from `index.html`.

### Pages demo is mistaken for the connected product
- Symptom: users expect live sync, replay, or resumable authoritative bonus behavior.
- Fix:
  1. Verify the runtime disclosure is visible in the UI.
  2. Verify the Pages release notes describe the build as demo or showcase mode.
  3. Use the connected deployment or local stack for authoritative QA.

### Workflow cannot deploy to Pages
- Symptom: deploy step fails with permissions errors.
- Fix:
  1. Verify Pages Source is GitHub Actions.
  2. Verify workflow permissions include `pages: write` and `id-token: write`.

### `npm run publish:pages` fails locally
- Symptom: script errors before dispatch.
- Fix:
  1. Run `npm install`.
  2. Ensure GitHub CLI is installed: `gh --version`.
  3. Authenticate: `gh auth login`.
  4. Re-run `npm run publish:pages`.

### App looks stale after a new deploy
- Symptom: old UI/assets still appear.
- Fix:
  1. Hard refresh (Ctrl+F5).
  2. If installed as PWA, close and relaunch.
  3. If needed, clear site data/service worker in browser settings.

### Need to validate bonus resume, queue replay, or live events
- Symptom: QA scope requires authoritative server behavior.
- Fix: do not use Pages for that test. Run the connected local stack from [local-run.md](local-run.md).
