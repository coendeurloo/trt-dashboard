import { AlertTriangle, Cloud, CloudOff, HardDrive } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";

interface CloudSyncConflictModalProps {
  open: boolean;
  language: AppLanguage;
  conflictDetected: boolean;
  isBusy: boolean;
  onUseCloudCopy: () => void;
  onReplaceCloudWithLocal: () => void;
  onUseLocalOnly: () => void;
}

const CloudSyncConflictModal = ({
  open,
  language,
  conflictDetected,
  isBusy,
  onUseCloudCopy,
  onReplaceCloudWithLocal,
  onUseLocalOnly
}: CloudSyncConflictModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (!open) {
    return null;
  }

  return (
    <div className="app-modal-overlay z-[91]" role="dialog" aria-modal="true">
      <div className="app-modal-shell w-full max-w-2xl border-cyan-500/30 bg-slate-900 p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-200" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {tr("Kies welke versie je wilt gebruiken", "Choose which version to use")}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {conflictDetected
                ? tr(
                    "Dit apparaat en de cloud zijn allebei gewijzigd. Kies welke versie leidend moet zijn.",
                    "This device and the cloud were both changed. Choose which version should be treated as the source of truth."
                  )
                : tr(
                    "Je lokale data en clouddata verschillen van elkaar. Kies welke versie je wilt behouden.",
                    "Your local data and cloud data are different. Choose which version you want to keep."
                  )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-cyan-500/35 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-cyan-200" />
              <p className="text-sm font-semibold text-cyan-100">{tr("Gebruik cloudkopie", "Use cloud copy")}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {tr(
                "Aanbevolen als je op een ander apparaat al verder bent gegaan. Deze versie wordt lokaal geladen.",
                "Recommended if you already continued on another device. This version will be loaded locally."
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-rose-200" />
              <p className="text-sm font-semibold text-rose-100">{tr("Gebruik dit apparaat", "Use this device")}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {tr(
                "Gebruik dit alleen als deze lokale versie de juiste is. De cloud wordt dan overschreven.",
                "Use this only if the local version is the correct one. The cloud will be overwritten."
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onUseLocalOnly}
            disabled={isBusy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
          >
            <CloudOff className="h-4 w-4" />
            {tr("Lokaal-only voor nu", "Local-only for now")}
          </button>
          <button
            type="button"
            onClick={onUseCloudCopy}
            disabled={isBusy}
            className="rounded-md border border-cyan-500/45 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
          >
            {tr("Gebruik cloudkopie", "Use cloud copy")}
          </button>
          <button
            type="button"
            onClick={onReplaceCloudWithLocal}
            disabled={isBusy}
            className="rounded-md border border-rose-500/45 bg-rose-500/15 px-3 py-1.5 text-sm text-rose-100 disabled:opacity-50"
          >
            {tr("Vervang cloud met lokaal", "Replace cloud with local")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloudSyncConflictModal;
