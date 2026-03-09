import { CLOUD_DEVICE_ID_STORAGE_KEY } from "./constants";

const generateDeviceId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

export const getOrCreateCloudDeviceId = (): string => {
  if (typeof window === "undefined") {
    return "server-device";
  }
  const storage = window.localStorage;
  const existing = storage.getItem(CLOUD_DEVICE_ID_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  const next = generateDeviceId();
  storage.setItem(CLOUD_DEVICE_ID_STORAGE_KEY, next);
  return next;
};

