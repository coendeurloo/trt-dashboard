import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error local dev middleware plugin is implemented as plain JS.
import claudeProxyPlugin from "./scripts/vite-claude-proxy.mjs";

export default defineConfig({
  plugins: [react(), claudeProxyPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("react-markdown") || id.includes("remark-breaks") || id.includes("/unified/") || id.includes("/remark-") || id.includes("/rehype-") || id.includes("/micromark")) {
            return "markdown";
          }
          if (id.includes("pdfjs-dist") || id.includes("tesseract.js") || id.includes("/src/pdfParsing")) {
            return "pdf-local";
          }
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("/victory-vendor/")) {
            return "charts";
          }
          if (id.includes("framer-motion") || id.includes("lucide-react")) {
            return "ui-motion";
          }
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react-core";
          }
          return undefined;
        }
      }
    }
  }
});
