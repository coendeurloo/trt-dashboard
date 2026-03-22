-- Supabase SQL: Admin Ops Cockpit v1 for LabTracker
-- Purpose:
-- - Store safe runtime feature flags (no secrets)
-- - Keep an immutable audit trail of admin config changes

CREATE TABLE IF NOT EXISTS public.admin_runtime_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  upstash_keepalive_enabled boolean NOT NULL DEFAULT true,
  cloud_signup_enabled boolean NOT NULL DEFAULT true,
  share_links_enabled boolean NOT NULL DEFAULT true,
  parser_improvement_enabled boolean NOT NULL DEFAULT true,
  ai_analysis_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid,
  updated_by_email text
);

CREATE OR REPLACE FUNCTION public.admin_runtime_config_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_runtime_config_touch_updated_at_trg ON public.admin_runtime_config;
CREATE TRIGGER admin_runtime_config_touch_updated_at_trg
BEFORE UPDATE ON public.admin_runtime_config
FOR EACH ROW
EXECUTE FUNCTION public.admin_runtime_config_touch_updated_at();

INSERT INTO public.admin_runtime_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  target text NOT NULL DEFAULT 'admin_runtime_config',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_email_idx
  ON public.admin_audit_log (actor_email);

ALTER TABLE public.admin_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No anon/auth read-write policies by design.
-- Access runs through server endpoints with service-role key.
