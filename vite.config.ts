import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";
// @ts-expect-error local dev middleware plugin is implemented as plain JS.
import claudeProxyPlugin from "./scripts/vite-claude-proxy.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentryBuildEnabled =
    Boolean(env.SENTRY_AUTH_TOKEN) &&
    Boolean(env.SENTRY_ORG) &&
    Boolean(env.SENTRY_PROJECT);

  return {
    cacheDir: ".vite-cache",
    plugins: [
      react(),
      claudeProxyPlugin(),
      ...(sentryBuildEnabled
        ? [
            ...sentryVitePlugin({
              authToken: env.SENTRY_AUTH_TOKEN,
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              telemetry: false,
              sourcemaps: {
                filesToDeleteAfterUpload: ["dist/**/*.js.map", "dist/**/*.css.map"]
              },
              release: {
                name:
                  env.SENTRY_RELEASE ||
                  env.VITE_SENTRY_RELEASE ||
                  env.VERCEL_GIT_COMMIT_SHA ||
                  undefined
              }
            })
          ]
        : [])
    ],
    server: {
      host: "0.0.0.0",
      allowedHosts: true
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    build: {
      sourcemap: sentryBuildEnabled,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const moduleId = id.replace(/\\/g, "/");

            if (
              moduleId.includes("/src/locales/") ||
              moduleId.includes("/src/i18n")
            ) {
              return "app-i18n";
            }

            if (
              moduleId.includes("/src/analytics") ||
              moduleId.includes("/src/hooks/useDerivedData") ||
              moduleId.includes("/src/views/DashboardView")
            ) {
              return "app-analysis";
            }

            if (
              moduleId.includes("/src/hooks/useAnalysis") ||
              moduleId.includes("/src/aiAnalysis")
            ) {
              return "app-analysis";
            }

            if (
              moduleId.includes("react-markdown") ||
              moduleId.includes("remark-breaks") ||
              moduleId.includes("/unified/") ||
              moduleId.includes("/remark-") ||
              moduleId.includes("/rehype-") ||
              moduleId.includes("/micromark")
            ) {
              return "markdown";
            }
            if (moduleId.includes("pdfjs-dist") || moduleId.includes("tesseract.js") || moduleId.includes("/src/pdfParsing")) {
              return "pdf-local";
            }
            if (moduleId.includes("recharts") || moduleId.includes("/d3-") || moduleId.includes("/victory-vendor/")) {
              return "charts";
            }
            if (moduleId.includes("framer-motion") || moduleId.includes("lucide-react")) {
              return "ui-motion";
            }
            if (
              moduleId.includes("/node_modules/react/") ||
              moduleId.includes("/node_modules/react-dom/") ||
              moduleId.includes("/node_modules/scheduler/")
            ) {
              return "react-core";
            }
            return undefined;
          }
        }
      }
    }
  };
});
