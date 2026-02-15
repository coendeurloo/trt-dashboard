import { useEffect, useState } from "react";
import { AppSettings, StoredAppData } from "../types";
import { loadAppData, saveAppData } from "../storage";

interface UseAppDataOptions {
  sharedData: StoredAppData | null;
  isShareMode: boolean;
}

export const useAppData = ({ sharedData, isShareMode }: UseAppDataOptions) => {
  const [appData, setAppData] = useState<StoredAppData>(() => (sharedData ? sharedData : loadAppData()));

  useEffect(() => {
    if (isShareMode) {
      return;
    }
    saveAppData(appData);
  }, [appData, isShareMode]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch
      }
    }));
  };

  return {
    appData,
    setAppData,
    updateSettings,
    isNl: appData.settings.language === "nl",
    samplingControlsEnabled: appData.settings.enableSamplingControls
  };
};

export default useAppData;
