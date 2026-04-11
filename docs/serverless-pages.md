# Serverless GitHub Pages Runbook

This is the default publish path for Ember Thrones.
It builds only the client PWA, deploys to GitHub Pages, and serves one sharable URL for desktop and mobile.

## 1) One-Time GitHub Setup

1. Open your repository on GitHub.
2. Go to Settings -> Pages.
3. Under Build and deployment, set Source to GitHub Actions.
4. Go to Settings -> Actions -> General and ensure workflows are allowed.
5. Confirm you can run Actions on your default branch (`main` or `master`).

## 2) Local Operator Commands

From repo root:

- Desktop local preview (build + local preview):
  - `powershell -ExecutionPolicy Bypass -File .\run-desktop.ps1`
- Mobile PWA preview on LAN (build + preview + phone URLs):
  - `powershell -ExecutionPolicy Bypass -File .\run-mobile-pwa.ps1`
- Publish to Pages (build + dispatch workflow):
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
3. Builds client app with `VITE_BASE_PATH=/<repo-name>/`.
4. Adds `.nojekyll` to output.
5. Uploads `apps/client/dist` and deploys with official Pages actions.

Triggers:
- Push to `main` or `master` when relevant project files change.
- Manual run via workflow dispatch.

## 4) First Publish Validation

After workflow succeeds:
1. Open Settings -> Pages and copy the site URL.
2. Load it on desktop and verify the game starts.
3. Load the same URL on mobile and install as PWA.
4. Re-open while offline to verify app-shell startup.

## 5) Troubleshooting

### 404 on JS/CSS assets after deploy
- Symptom: HTML loads but scripts/styles 404.
- Cause: incorrect base path for project-site hosting.
- Fix: ensure deploy workflow uses `VITE_BASE_PATH=/<repo-name>/` (already configured in `deploy.yml`).

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
