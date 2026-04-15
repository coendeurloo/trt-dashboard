import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { attemptChunkRecovery, isLikelyChunkLoadError } from "./chunkRecovery";
import { initSentry } from "./monitoring/sentry";
import "./index.css";

initSentry();

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    if (!isLikelyChunkLoadError(preloadEvent.payload)) {
      return;
    }
    event.preventDefault();
    attemptChunkRecovery();
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!isLikelyChunkLoadError(event.reason)) {
      return;
    }
    event.preventDefault();
    attemptChunkRecovery();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
      <SpeedInsights />
    </ErrorBoundary>
  </React.StrictMode>
);
