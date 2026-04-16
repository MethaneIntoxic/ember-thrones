/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_RUNTIME_MODE?: "hybrid" | "serverless";
	readonly VITE_API_BASE_URL?: string;
	readonly VITE_SSE_URL?: string;
	readonly VITE_BASE_PATH?: string;
	readonly VITE_BUILD_ID?: string;
}

declare const __APP_BUILD_ID__: string;
