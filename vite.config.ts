import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// @ts-expect-error local dev middleware plugin is implemented as plain JS.
import claudeProxyPlugin from "./scripts/vite-claude-proxy.mjs";

export default defineConfig({
  cacheDir: ".vite-cache",
  plugins: [react(), claudeProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true
  },
  build: {
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
            return "app-analytics";
          }

          if (
            moduleId.includes("/src/hooks/useAnalysis") ||
            moduleId.includes("/src/aiAnalysis")
          ) {
            return "app-ai";
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
});
