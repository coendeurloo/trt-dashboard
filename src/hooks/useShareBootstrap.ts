import { parseShareToken, ShareOptions } from "../share";
import { StoredAppData } from "../types";

export type ShareBootstrapStatus = "ready" | "resolving" | "error";

export interface ParsedSharedSnapshot {
  data: StoredAppData;
  generatedAt: string | null;
  options: ShareOptions;
}

export interface ShareBootstrapState {
  status: ShareBootstrapStatus;
  snapshot: ParsedSharedSnapshot | null;
  requestedShare: boolean;
  pendingCode: string | null;
  errorMessage: string;
}

export const SHORT_SHARE_CODE_PATTERN = /^[A-Za-z0-9]{8,24}$/;

export const prefersDutch = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /^nl/i.test(navigator.language ?? "");
};

export const shareBootstrapText = (nl: string, en: string): string => (prefersDutch() ? nl : en);

export const parseShortShareCodeFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/s\/([A-Za-z0-9]{8,24})\/?$/);
  if (!match?.[1]) {
    return null;
  }
  return match[1];
};

export const createInitialShareBootstrapState = (): ShareBootstrapState => {
  if (typeof window === "undefined") {
    return {
      status: "ready",
      snapshot: null,
      requestedShare: false,
      pendingCode: null,
      errorMessage: ""
    };
  }

  const params = new URLSearchParams(window.location.search);
  const legacyToken = (params.get("share") ?? "").trim();
  if (legacyToken) {
    const parsed = parseShareToken(legacyToken);
    if (parsed) {
      return {
        status: "ready",
        snapshot: parsed,
        requestedShare: true,
        pendingCode: null,
        errorMessage: ""
      };
    }
    return {
      status: "error",
      snapshot: null,
      requestedShare: true,
      pendingCode: null,
      errorMessage: shareBootstrapText(
        "Deze deellink is ongeldig of beschadigd. Vraag een nieuwe link.",
        "This share link is invalid or corrupted. Request a new link."
      )
    };
  }

  const queryCode = (params.get("s") ?? "").trim();
  const pathCode = parseShortShareCodeFromPath(window.location.pathname) ?? "";
  const code = queryCode || pathCode;
  if (!code) {
    return {
      status: "ready",
      snapshot: null,
      requestedShare: false,
      pendingCode: null,
      errorMessage: ""
    };
  }

  if (!SHORT_SHARE_CODE_PATTERN.test(code)) {
    return {
      status: "error",
      snapshot: null,
      requestedShare: true,
      pendingCode: null,
      errorMessage: shareBootstrapText(
        "Deze korte deellink is ongeldig. Vraag een nieuwe link.",
        "This short share link is invalid. Request a new link."
      )
    };
  }

  return {
    status: "resolving",
    snapshot: null,
    requestedShare: true,
    pendingCode: code,
    errorMessage: ""
  };
};
