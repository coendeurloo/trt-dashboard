import { useEffect, useState } from "react";
import { parseShareToken, ShareOptions } from "../share";
import { resolveShortShareCode, ShareClientError } from "../shareClient";
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

export interface UseShareBootstrapResult {
  shareBootstrap: ShareBootstrapState;
  sharedSnapshot: ParsedSharedSnapshot | null;
  isShareMode: boolean;
  isShareResolving: boolean;
  isShareBootstrapError: boolean;
}

export const useShareBootstrap = (): UseShareBootstrapResult => {
  const [shareBootstrap, setShareBootstrap] = useState<ShareBootstrapState>(() => createInitialShareBootstrapState());

  useEffect(() => {
    if (shareBootstrap.status !== "resolving" || !shareBootstrap.pendingCode) {
      return;
    }

    let canceled = false;

    const resolveShareCode = async () => {
      try {
        const resolved = await resolveShortShareCode(shareBootstrap.pendingCode ?? "");
        if (canceled) {
          return;
        }

        const parsed = parseShareToken(resolved.token);
        if (!parsed) {
          setShareBootstrap({
            status: "error",
            snapshot: null,
            requestedShare: true,
            pendingCode: null,
            errorMessage: shareBootstrapText(
              "Deze deellink kon niet worden gelezen. Vraag een nieuwe link.",
              "This share link could not be read. Request a new link."
            )
          });
          return;
        }

        setShareBootstrap({
          status: "ready",
          snapshot: parsed,
          requestedShare: true,
          pendingCode: null,
          errorMessage: ""
        });
      } catch (error) {
        if (canceled) {
          return;
        }

        let errorMessage = shareBootstrapText(
          "De deellink kon niet worden geopend. Probeer later opnieuw.",
          "The share link could not be opened. Please try again later."
        );

        if (error instanceof ShareClientError) {
          if (error.code === "SHARE_LINK_NOT_FOUND") {
            errorMessage = shareBootstrapText(
              "Deze deellink is verlopen of niet gevonden. Vraag een nieuwe link.",
              "This share link has expired or was not found. Request a new link."
            );
          } else if (error.code === "SHARE_PROXY_UNREACHABLE" || error.code === "SHARE_STORE_UNAVAILABLE") {
            errorMessage = shareBootstrapText(
              "De deellinkservice is tijdelijk niet bereikbaar. Probeer later opnieuw.",
              "The share-link service is temporarily unreachable. Please try again later."
            );
          }
        }

        setShareBootstrap({
          status: "error",
          snapshot: null,
          requestedShare: true,
          pendingCode: null,
          errorMessage
        });
      }
    };

    void resolveShareCode();

    return () => {
      canceled = true;
    };
  }, [shareBootstrap.pendingCode, shareBootstrap.status]);

  const sharedSnapshot = shareBootstrap.snapshot;
  const isShareMode = shareBootstrap.requestedShare;
  const isShareResolving = isShareMode && shareBootstrap.status === "resolving";
  const isShareBootstrapError = isShareMode && shareBootstrap.status === "error" && !sharedSnapshot;

  return {
    shareBootstrap,
    sharedSnapshot,
    isShareMode,
    isShareResolving,
    isShareBootstrapError
  };
};
