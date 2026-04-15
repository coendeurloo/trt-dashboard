const CHUNK_RELOAD_GUARD_KEY = "labtracker_chunk_reload_attempted_v1";

const getErrorText = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message ?? "";
  }
  return String(value ?? "");
};

const getErrorStack = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack ?? "";
  }
  return "";
};

export const isLikelyChunkLoadError = (value: unknown): boolean => {
  const message = getErrorText(value).toLowerCase();
  const stack = getErrorStack(value).toLowerCase();

  if (!message && !stack) {
    return false;
  }

  if (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror")
  ) {
    return true;
  }

  // React can surface broken lazy imports as "undefined.default".
  if (
    message.includes("cannot read properties of undefined (reading 'default')") &&
    (stack.includes("react.production.min.js") || stack.includes("react-dom.production.min.js"))
  ) {
    return true;
  }

  return false;
};

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

export const attemptChunkRecovery = (): boolean => {
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

