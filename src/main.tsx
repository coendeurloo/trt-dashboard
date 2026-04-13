import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { initSentry } from "./monitoring/sentry";
import "./index.css";

initSentry();

const CHUNK_RELOAD_GUARD_KEY = "labtracker_chunk_reload_attempted_v1";

const readChunkReloadAttempted = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
  } catch {
    return false;
  }
};

const markChunkReloadAttempted = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
  } catch {
    // Ignore storage errors, recovery can still continue.
  }
};

const getErrorText = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message ?? "";
  }
  return String(value ?? "");
};

const isLikelyChunkLoadError = (value: unknown): boolean => {
  const message = getErrorText(value).toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror")
  );
};

const attemptChunkRecovery = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  if (readChunkReloadAttempted()) {
    return false;
  }
  markChunkReloadAttempted();
  window.location.reload();
  return true;
};

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
