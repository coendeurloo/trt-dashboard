import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error local dev middleware plugin is implemented as plain JS.
import claudeProxyPlugin from "./scripts/vite-claude-proxy.mjs";

export default defineConfig({
  plugins: [react(), claudeProxyPlugin()]
});
