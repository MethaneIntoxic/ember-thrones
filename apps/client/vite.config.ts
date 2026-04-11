import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
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
