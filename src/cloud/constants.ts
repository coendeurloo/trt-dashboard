import { APP_SCHEMA_VERSION } from "../constants";

export const CLOUD_MODE_STORAGE_KEY = "labtracker-cloud-mode-enabled-v1";
export const CLOUD_SESSION_STORAGE_KEY = "labtracker-cloud-session-v1";
export const CLOUD_DEVICE_ID_STORAGE_KEY = "labtracker-cloud-device-id-v1";
export const CLOUD_PENDING_SIGNUP_CONSENT_STORAGE_KEY = "labtracker-cloud-pending-signup-consent-v1";
export const CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY = "labtracker-cloud-backup-prompt-dismissed-v1";
export const CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY = "labtracker-cloud-last-auth-email-v1";
export const CLOUD_PRIVACY_POLICY_VERSION = "2026-03-09";

export const CLOUD_SCHEMA_VERSION = APP_SCHEMA_VERSION;

export const getSupabaseUrl = (): string =>
  String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();

export const getSupabaseAnonKey = (): string =>
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = (): boolean =>
  Boolean(getSupabaseUrl() && getSupabaseAnonKey());
