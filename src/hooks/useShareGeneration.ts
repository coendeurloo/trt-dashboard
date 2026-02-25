import { Dispatch, SetStateAction, useState } from "react";
import { buildShareSubsetData, buildShareToken, ShareOptions, SHARE_REPORT_CAP_SEQUENCE } from "../share";
import { createShortShareLink, ShareClientError } from "../shareClient";
import { StoredAppData } from "../types";
import { formatDate } from "../utils";

export type ShareGenerationStatus = "idle" | "loading" | "success" | "error";

export interface UseShareGenerationResult {
  shareOptions: ShareOptions;
  setShareOptions: Dispatch<SetStateAction<ShareOptions>>;
  shareLink: string;
  shareStatus: ShareGenerationStatus;
  shareMessage: string;
  shareIncludedReports: number | null;
  shareExpiresAt: string | null;
  generateShareLink: () => Promise<void>;
}

export interface UseShareGenerationParams {
  appData: StoredAppData;
  tr: (nl: string, en: string) => string;
}

export const useShareGeneration = ({ appData, tr }: UseShareGenerationParams): UseShareGenerationResult => {
  const [shareOptions, setShareOptions] = useState<ShareOptions>({
    hideNotes: false,
    hideProtocol: false,
    hideSymptoms: false
  });
  const [shareLink, setShareLink] = useState("");
  const [shareStatus, setShareStatus] = useState<ShareGenerationStatus>("idle");
  const [shareMessage, setShareMessage] = useState("");
  const [shareIncludedReports, setShareIncludedReports] = useState<number | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);

  const generateShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const host = window.location.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");

    setShareStatus("loading");
    setShareMessage(tr("Korte deellink wordt aangemaakt...", "Creating short share link..."));
    setShareLink("");
    setShareIncludedReports(null);
    setShareExpiresAt(null);

    let sawSnapshotTooLarge = false;
    for (const cap of SHARE_REPORT_CAP_SEQUENCE) {
      const subset = buildShareSubsetData(appData, cap);
      const token = buildShareToken(subset, shareOptions);
      if (!token) {
        continue;
      }

      const publishDirectShareLink = async (reason: "local" | "fallback") => {
        const shareUrl = `${window.location.origin}/?share=${encodeURIComponent(token)}`;
        const includedReports = subset.reports.length;
        setShareStatus("success");
        setShareLink(shareUrl);
        setShareIncludedReports(includedReports);
        setShareExpiresAt(null);
        setShareMessage(
          reason === "local"
            ? tr(
                `Lokale share-link klaar. Gedeeld: laatste ${includedReports} rapporten.`,
                `Local share link ready. Shared: latest ${includedReports} reports.`
              )
            : tr(
                `Fallback share-link klaar. Gedeeld: laatste ${includedReports} rapporten.`,
                `Fallback share link ready. Shared: latest ${includedReports} reports.`
              )
        );
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch {
          // Clipboard is optional; link is shown in UI.
        }
      };

      if (isLocalHost) {
        await publishDirectShareLink("local");
        return;
      }

      try {
        const response = await createShortShareLink(token);
        const includedReports = subset.reports.length;
        const expiresAt = response.expiresAt || null;
        const expiryLabel = expiresAt ? formatDate(expiresAt) : tr("ongeveer 30 dagen", "about 30 days");

        setShareStatus("success");
        setShareLink(response.shareUrl);
        setShareIncludedReports(includedReports);
        setShareExpiresAt(expiresAt);
        setShareMessage(
          tr(
            `Korte deellink klaar. Gedeeld: laatste ${includedReports} rapporten. Vervalt: ${expiryLabel}.`,
            `Short share link ready. Shared: latest ${includedReports} reports. Expires: ${expiryLabel}.`
          )
        );

        try {
          await navigator.clipboard.writeText(response.shareUrl);
        } catch {
          // Clipboard is optional; link is shown in UI.
        }
        return;
      } catch (error) {
        if (!(error instanceof ShareClientError) || error.code !== "SHARE_SNAPSHOT_TOO_LARGE") {
          await publishDirectShareLink("fallback");
          return;
        }
        sawSnapshotTooLarge = true;
        continue;
      }
    }

    if (sawSnapshotTooLarge) {
      setShareStatus("error");
      setShareMessage(
        tr(
          "Zelfs met 1 rapport is deze snapshot te groot voor delen. Verberg extra velden of probeer een kleinere dataset.",
          "Even with 1 report this snapshot is too large to share. Hide additional fields or use a smaller dataset."
        )
      );
      return;
    }

    setShareStatus("error");
    setShareMessage(tr("Korte deellink kon niet worden aangemaakt.", "Could not create a short share link."));
  };

  return {
    shareOptions,
    setShareOptions,
    shareLink,
    shareStatus,
    shareMessage,
    shareIncludedReports,
    shareExpiresAt,
    generateShareLink
  };
};
