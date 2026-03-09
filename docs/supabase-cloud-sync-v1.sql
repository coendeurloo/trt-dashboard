-- Supabase SQL: Cloud replace RPC for LabTracker v3.1
-- Assumes schema from PLAN (1).md already exists.
-- Function purpose:
-- - Full replace write in a single transaction
-- - Revision check (optimistic concurrency)
-- - Atomic revision increment on success

CREATE OR REPLACE FUNCTION public.cloud_replace_user_data(
  p_user_id uuid,
  p_device_id text,
  p_expected_revision bigint,
  p_payload jsonb
)
RETURNS TABLE (new_revision bigint, last_synced_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_revision bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_REQUIRED';
  END IF;
  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'DEVICE_REQUIRED';
  END IF;

  INSERT INTO public.sync_state (user_id, device_id, last_revision, last_synced_at)
  VALUES (p_user_id, p_device_id, 0, NULL)
  ON CONFLICT (user_id, device_id) DO NOTHING;

  SELECT last_revision
    INTO v_current_revision
    FROM public.sync_state
   WHERE user_id = p_user_id
     AND device_id = p_device_id
   FOR UPDATE;

  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_current_revision THEN
    RAISE EXCEPTION 'REVISION_MISMATCH'
      USING ERRCODE = 'P0001',
            DETAIL = format('expected=%s current=%s', p_expected_revision, v_current_revision);
  END IF;

  UPDATE public.profiles
     SET settings = jsonb_build_object(
       'settings', COALESCE(p_payload->'settings', '{}'::jsonb),
       'markerAliasOverrides', COALESCE(p_payload->'markerAliasOverrides', '{}'::jsonb)
     ),
         schema_version = COALESCE((p_payload->>'schemaVersion')::integer, 6),
         updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.markers WHERE user_id = p_user_id;
  DELETE FROM public.lab_reports WHERE user_id = p_user_id;
  DELETE FROM public.protocols WHERE user_id = p_user_id;
  DELETE FROM public.supplement_timeline WHERE user_id = p_user_id;
  DELETE FROM public.check_ins WHERE user_id = p_user_id;

  INSERT INTO public.lab_reports (
    user_id,
    local_id,
    report_date,
    lab_name,
    source_filename,
    notes,
    is_baseline,
    annotations,
    extraction_metadata,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.report_date,
    row.lab_name,
    row.source_filename,
    row.notes,
    COALESCE(row.is_baseline, false),
    COALESCE(row.annotations, '{}'::jsonb),
    COALESCE(row.extraction_metadata, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_payload->'reports', '[]'::jsonb)) AS row(
    local_id text,
    report_date date,
    lab_name text,
    source_filename text,
    notes text,
    is_baseline boolean,
    annotations jsonb,
    extraction_metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  INSERT INTO public.markers (
    user_id,
    report_id,
    local_id,
    marker_name,
    canonical_name,
    value,
    value_text,
    unit,
    reference_low,
    reference_high,
    flag,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    reports.id,
    row.local_id,
    row.marker_name,
    row.canonical_name,
    row.value,
    row.value_text,
    row.unit,
    row.reference_low,
    row.reference_high,
    row.flag,
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_payload->'markers', '[]'::jsonb)) AS row(
    local_id text,
    report_local_id text,
    marker_name text,
    canonical_name text,
    value numeric,
    value_text text,
    unit text,
    reference_low numeric,
    reference_high numeric,
    flag text,
    created_at timestamptz,
    updated_at timestamptz
  )
  JOIN public.lab_reports reports
    ON reports.user_id = p_user_id
   AND reports.local_id = row.report_local_id;

  INSERT INTO public.protocols (
    user_id,
    local_id,
    name,
    description,
    start_date,
    end_date,
    is_active,
    details,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.name,
    row.description,
    row.start_date,
    row.end_date,
    COALESCE(row.is_active, true),
    COALESCE(row.details, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_payload->'protocols', '[]'::jsonb)) AS row(
    local_id text,
    name text,
    description text,
    start_date date,
    end_date date,
    is_active boolean,
    details jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  INSERT INTO public.supplement_timeline (
    user_id,
    local_id,
    supplement_name,
    dosage,
    start_date,
    end_date,
    notes,
    details,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.supplement_name,
    row.dosage,
    row.start_date,
    row.end_date,
    row.notes,
    COALESCE(row.details, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_payload->'supplements', '[]'::jsonb)) AS row(
    local_id text,
    supplement_name text,
    dosage text,
    start_date date,
    end_date date,
    notes text,
    details jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  INSERT INTO public.check_ins (
    user_id,
    local_id,
    check_in_date,
    data,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.check_in_date,
    COALESCE(row.data, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_payload->'checkIns', '[]'::jsonb)) AS row(
    local_id text,
    check_in_date date,
    data jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  UPDATE public.sync_state
     SET last_revision = v_current_revision + 1,
         last_synced_at = now()
   WHERE user_id = p_user_id
     AND device_id = p_device_id
  RETURNING last_revision, last_synced_at
       INTO new_revision, last_synced_at;

  RETURN NEXT;
END;
$$;

-- Incremental patch function (upserts + deletes per table)
CREATE OR REPLACE FUNCTION public.cloud_apply_incremental_patch(
  p_user_id uuid,
  p_device_id text,
  p_expected_revision bigint,
  p_patch jsonb
)
RETURNS TABLE (new_revision bigint, last_synced_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_revision bigint;
  v_settings_changed boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_REQUIRED';
  END IF;
  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'DEVICE_REQUIRED';
  END IF;

  INSERT INTO public.sync_state (user_id, device_id, last_revision, last_synced_at)
  VALUES (p_user_id, p_device_id, 0, NULL)
  ON CONFLICT (user_id, device_id) DO NOTHING;

  SELECT last_revision
    INTO v_current_revision
    FROM public.sync_state
   WHERE user_id = p_user_id
     AND device_id = p_device_id
   FOR UPDATE;

  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_current_revision THEN
    RAISE EXCEPTION 'REVISION_MISMATCH'
      USING ERRCODE = 'P0001',
            DETAIL = format('expected=%s current=%s', p_expected_revision, v_current_revision);
  END IF;

  v_settings_changed := COALESCE((p_patch->>'settingsChanged')::boolean, false);
  IF v_settings_changed THEN
    UPDATE public.profiles
       SET settings = jsonb_build_object(
         'settings', COALESCE(p_patch->'settings', '{}'::jsonb),
         'markerAliasOverrides', COALESCE(p_patch->'markerAliasOverrides', '{}'::jsonb)
       ),
           schema_version = COALESCE((p_patch->>'schemaVersion')::integer, 6),
           updated_at = now()
     WHERE id = p_user_id;
  END IF;

  DELETE FROM public.markers
   WHERE user_id = p_user_id
     AND local_id IN (
       SELECT value
         FROM jsonb_array_elements_text(
           COALESCE(p_patch->'markers'->'deleteLocalIds', '[]'::jsonb)
         ) value
     );

  DELETE FROM public.lab_reports
   WHERE user_id = p_user_id
     AND local_id IN (
       SELECT value
         FROM jsonb_array_elements_text(
           COALESCE(p_patch->'reports'->'deleteLocalIds', '[]'::jsonb)
         ) value
     );

  DELETE FROM public.protocols
   WHERE user_id = p_user_id
     AND local_id IN (
       SELECT value
         FROM jsonb_array_elements_text(
           COALESCE(p_patch->'protocols'->'deleteLocalIds', '[]'::jsonb)
         ) value
     );

  DELETE FROM public.supplement_timeline
   WHERE user_id = p_user_id
     AND local_id IN (
       SELECT value
         FROM jsonb_array_elements_text(
           COALESCE(p_patch->'supplements'->'deleteLocalIds', '[]'::jsonb)
         ) value
     );

  DELETE FROM public.check_ins
   WHERE user_id = p_user_id
     AND local_id IN (
       SELECT value
         FROM jsonb_array_elements_text(
           COALESCE(p_patch->'checkIns'->'deleteLocalIds', '[]'::jsonb)
         ) value
     );

  INSERT INTO public.lab_reports (
    user_id,
    local_id,
    report_date,
    lab_name,
    source_filename,
    notes,
    is_baseline,
    annotations,
    extraction_metadata,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.report_date,
    row.lab_name,
    row.source_filename,
    row.notes,
    COALESCE(row.is_baseline, false),
    COALESCE(row.annotations, '{}'::jsonb),
    COALESCE(row.extraction_metadata, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_patch->'reports'->'upserts', '[]'::jsonb)) AS row(
    local_id text,
    report_date date,
    lab_name text,
    source_filename text,
    notes text,
    is_baseline boolean,
    annotations jsonb,
    extraction_metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  ON CONFLICT (user_id, local_id) DO UPDATE
    SET report_date = EXCLUDED.report_date,
        lab_name = EXCLUDED.lab_name,
        source_filename = EXCLUDED.source_filename,
        notes = EXCLUDED.notes,
        is_baseline = EXCLUDED.is_baseline,
        annotations = EXCLUDED.annotations,
        extraction_metadata = EXCLUDED.extraction_metadata,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.markers (
    user_id,
    report_id,
    local_id,
    marker_name,
    canonical_name,
    value,
    value_text,
    unit,
    reference_low,
    reference_high,
    flag,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    reports.id,
    row.local_id,
    row.marker_name,
    row.canonical_name,
    row.value,
    row.value_text,
    row.unit,
    row.reference_low,
    row.reference_high,
    row.flag,
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_patch->'markers'->'upserts', '[]'::jsonb)) AS row(
    local_id text,
    report_local_id text,
    marker_name text,
    canonical_name text,
    value numeric,
    value_text text,
    unit text,
    reference_low numeric,
    reference_high numeric,
    flag text,
    created_at timestamptz,
    updated_at timestamptz
  )
  JOIN public.lab_reports reports
    ON reports.user_id = p_user_id
   AND reports.local_id = row.report_local_id
  ON CONFLICT (user_id, local_id) DO UPDATE
    SET report_id = EXCLUDED.report_id,
        marker_name = EXCLUDED.marker_name,
        canonical_name = EXCLUDED.canonical_name,
        value = EXCLUDED.value,
        value_text = EXCLUDED.value_text,
        unit = EXCLUDED.unit,
        reference_low = EXCLUDED.reference_low,
        reference_high = EXCLUDED.reference_high,
        flag = EXCLUDED.flag,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.protocols (
    user_id,
    local_id,
    name,
    description,
    start_date,
    end_date,
    is_active,
    details,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.name,
    row.description,
    row.start_date,
    row.end_date,
    COALESCE(row.is_active, true),
    COALESCE(row.details, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_patch->'protocols'->'upserts', '[]'::jsonb)) AS row(
    local_id text,
    name text,
    description text,
    start_date date,
    end_date date,
    is_active boolean,
    details jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  ON CONFLICT (user_id, local_id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        is_active = EXCLUDED.is_active,
        details = EXCLUDED.details,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.supplement_timeline (
    user_id,
    local_id,
    supplement_name,
    dosage,
    start_date,
    end_date,
    notes,
    details,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.supplement_name,
    row.dosage,
    row.start_date,
    row.end_date,
    row.notes,
    COALESCE(row.details, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_patch->'supplements'->'upserts', '[]'::jsonb)) AS row(
    local_id text,
    supplement_name text,
    dosage text,
    start_date date,
    end_date date,
    notes text,
    details jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  ON CONFLICT (user_id, local_id) DO UPDATE
    SET supplement_name = EXCLUDED.supplement_name,
        dosage = EXCLUDED.dosage,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        notes = EXCLUDED.notes,
        details = EXCLUDED.details,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.check_ins (
    user_id,
    local_id,
    check_in_date,
    data,
    created_at,
    updated_at
  )
  SELECT
    p_user_id,
    row.local_id,
    row.check_in_date,
    COALESCE(row.data, '{}'::jsonb),
    COALESCE(row.created_at, now()),
    COALESCE(row.updated_at, now())
  FROM jsonb_to_recordset(COALESCE(p_patch->'checkIns'->'upserts', '[]'::jsonb)) AS row(
    local_id text,
    check_in_date date,
    data jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  ON CONFLICT (user_id, local_id) DO UPDATE
    SET check_in_date = EXCLUDED.check_in_date,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at;

  UPDATE public.sync_state
     SET last_revision = v_current_revision + 1,
         last_synced_at = now()
   WHERE user_id = p_user_id
     AND device_id = p_device_id
  RETURNING last_revision, last_synced_at
       INTO new_revision, last_synced_at;

  RETURN NEXT;
END;
$$;
