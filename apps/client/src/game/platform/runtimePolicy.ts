export type ApiMode = "remote" | "fallback";

export type RuntimeMode = "hybrid" | "serverless";

export type RuntimeExperience = "connected" | "disconnected" | "demo";

export interface RuntimePolicyEnv {
  BASE_URL?: string;
  DEV?: boolean;
  VITE_RUNTIME_MODE?: string;
  VITE_API_BASE_URL?: string;
  VITE_SSE_URL?: string;
}

export interface RuntimeCapabilities {
  configuredMode: RuntimeMode;
  apiMode: ApiMode;
  experience: RuntimeExperience;
  label: "Connected" | "Disconnected" | "Demo";
  routePolicy: {
    basePath: string;
    basename: string;
    strategy: "browser";
  };
  network: {
    apiBaseUrl: string;
    healthUrl: string | null;
    sseUrl: string | null;
    canAttemptRemote: boolean;
    supportsLiveEvents: boolean;
  };
  offlineQueue: {
    supported: boolean;
    canReplayNow: boolean;
    mode: "syncable" | "local-only";
  };
  serviceWorker: {
    enabled: boolean;
    url: string;
    scope: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4300";

function readCurrentRuntimeEnv(): RuntimePolicyEnv {
  return {
    BASE_URL: import.meta.env.BASE_URL,
    DEV: import.meta.env.DEV,
    VITE_RUNTIME_MODE: import.meta.env.VITE_RUNTIME_MODE,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_SSE_URL: import.meta.env.VITE_SSE_URL
  };
}

export function normalizeBasePath(basePath = "/"): string {
  const trimmed = basePath.trim();

  if (trimmed === "" || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolveRouteBasename(basePath = "/"): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  return normalizedBasePath === "/" ? "/" : normalizedBasePath.slice(0, -1);
}

export function resolveRuntimeMode(rawMode?: string): RuntimeMode {
  return rawMode?.trim().toLowerCase() === "hybrid" ? "hybrid" : "serverless";
}

export function resolveRuntimeCapabilities(options: {
  env?: RuntimePolicyEnv;
  apiMode?: ApiMode;
} = {}): RuntimeCapabilities {
  const env = { ...readCurrentRuntimeEnv(), ...(options.env ?? {}) };
  const configuredMode = resolveRuntimeMode(env.VITE_RUNTIME_MODE);
  const apiMode = options.apiMode ?? "fallback";
  const basePath = normalizeBasePath(env.BASE_URL ?? "/");
  const basename = resolveRouteBasename(basePath);
  const apiBaseUrl = (env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const supportsRemote = configuredMode === "hybrid";

  const experience: RuntimeExperience = !supportsRemote
    ? "demo"
    : apiMode === "remote"
      ? "connected"
      : "disconnected";

  const label =
    experience === "connected"
      ? "Connected"
      : experience === "disconnected"
        ? "Disconnected"
        : "Demo";

  return {
    configuredMode,
    apiMode,
    experience,
    label,
    routePolicy: {
      basePath,
      basename,
      strategy: "browser"
    },
    network: {
      apiBaseUrl,
      healthUrl: supportsRemote ? `${apiBaseUrl}/health` : null,
      sseUrl: supportsRemote ? (env.VITE_SSE_URL ?? `${apiBaseUrl}/events`).replace(/\/$/, "") : null,
      canAttemptRemote: supportsRemote,
      supportsLiveEvents: supportsRemote
    },
    offlineQueue: {
      supported: supportsRemote,
      canReplayNow: supportsRemote && apiMode === "remote",
      mode: supportsRemote ? "syncable" : "local-only"
    },
    serviceWorker: {
      enabled: env.DEV !== true,
      url: `${basePath}sw.js`,
      scope: basePath
    }
  };
}