import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(basePath = "/"): string {
  const trimmed = basePath.trim();

  if (trimmed === "" || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolveRuntimeMode(rawMode: string | undefined): "hybrid" | "serverless" {
  if (!rawMode) {
    return "serverless";
  }

  const normalized = rawMode.trim().toLowerCase();
  if (normalized === "hybrid" || normalized === "serverless") {
    return normalized;
  }

  throw new Error(`Unsupported VITE_RUNTIME_MODE: ${rawMode}`);
}

function validateBuildAssets(): void {
  const requiredAssets = [
    "bonus-ember-seal.svg",
    "bonus-wheel-seal.svg",
    "bonus-relic-seal.svg",
    "symbol-dragon.svg",
    "symbol-orb.svg",
    "symbol-scatter.svg",
    "symbol-wild.svg",
    "symbol-chest.svg",
    "symbol-rune.svg",
    "symbol-crown.svg"
  ];

  for (const assetName of requiredAssets) {
    const assetPath = path.resolve(__dirname, "public", "assets", "sprites", assetName);
    if (!fs.existsSync(assetPath)) {
      throw new Error(`Missing required sprite asset: ${assetPath}`);
    }
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = normalizeBasePath(env.VITE_BASE_PATH || "/");
  resolveRuntimeMode(env.VITE_RUNTIME_MODE);

  if (command === "build") {
    validateBuildAssets();
  }

  const buildId =
    env.VITE_BUILD_ID?.trim() || `${mode}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

  return {
    base,
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId)
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173
    },
    test: {
      globals: true,
      environment: "jsdom",
      include: ["tests/unit/**/*.test.ts", "tests/e2e/**/*.test.ts"]
    }
  };
});
