-- Compliance & Governance module (ADR-0004; docs/architecture/COMPLIANCE_GOVERNANCE_IMPLEMENTATION_PLAN.md)
--
-- Purely additive. New platform tables (rules, guidance, holidays), new
-- company-scoped tables, one private storage bucket, and service-role RPCs.
-- No existing table, column, policy or function is changed.
--
-- Access model:
--  * Platform content tables: RLS on, NO policies. Rule conditions never
--    reach the browser; the edge function reads them with the service role.
--  * Company tables: RLS on, SELECT for the company's owners and admins only
--    (is_admin_of), no write policies. Every write goes through the
--    `compliance` edge function and compliance_apply_plan (service role).
--  * compliance-evidence bucket: private, no storage.objects policies. Files
--    move only through short-lived signed URLs issued by the edge function.

-- ── Platform content ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compliance_authorities (
  code text PRIMARY KEY,
  name text NOT NULL,
  country_code text NOT NULL,
  website text
);

CREATE TABLE IF NOT EXISTS public.compliance_categories (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.compliance_industries (
  code text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.compliance_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('published', 'retired')),
  reviewed boolean NOT NULL DEFAULT false,
  country_code text NOT NULL,
  category_code text NOT NULL REFERENCES public.compliance_categories(code),
  industry_code text REFERENCES public.compliance_industries(code),
  authority_code text NOT NULL REFERENCES public.compliance_authorities(code),
  title text NOT NULL,
  summary text NOT NULL,
  condition jsonb NOT NULL,
  schedule jsonb NOT NULL,
  evidence jsonb NOT NULL,
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  reminder_offsets int[] NOT NULL DEFAULT '{}',
  effective_from date NOT NULL,
  effective_to date,
  provenance jsonb NOT NULL,
  review_due date NOT NULL,
  checksum text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, version)
);

CREATE TABLE IF NOT EXISTS public.compliance_guidance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id uuid NOT NULL UNIQUE REFERENCES public.compliance_rule_versions(id),
  content jsonb NOT NULL,
  checksum text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_public_holidays (
  country_code text NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (country_code, holiday_date)
);

-- A published version is immutable: a change is a new version. Only
-- retirement (status, effective_to) may be recorded on an existing row.
CREATE OR REPLACE FUNCTION public.compliance_rule_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A published compliance rule version cannot be deleted; retire it instead.';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'effective_to') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'effective_to') THEN
    RAISE EXCEPTION 'Compliance rule % v% is published and cannot change; publish a new version.', OLD.rule_code, OLD.version;
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'A retired compliance rule version cannot be reinstated; publish a new version.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compliance_rule_versions_immutable ON public.compliance_rule_versions;
CREATE TRIGGER compliance_rule_versions_immutable
  BEFORE UPDATE OR DELETE ON public.compliance_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.compliance_rule_version_immutable();

CREATE OR REPLACE FUNCTION public.compliance_guidance_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Published compliance guidance cannot change; publish a new rule version.';
END;
$$;

DROP TRIGGER IF EXISTS compliance_guidance_versions_immutable ON public.compliance_guidance_versions;
CREATE TRIGGER compliance_guidance_versions_immutable
  BEFORE UPDATE OR DELETE ON public.compliance_guidance_versions
  FOR EACH ROW EXECUTE FUNCTION public.compliance_guidance_immutable();

-- ── Company-scoped tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compliance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  questionnaire_version int NOT NULL,
  revision int NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  fact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  completed_by uuid,
  updated_by uuid,
  last_evaluated_at timestamptz,
  state_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_revision int NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('profile_save', 'manual', 'scheduler', 'action')),
  rule_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id uuid,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_obligations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  rule_version_id uuid NOT NULL REFERENCES public.compliance_rule_versions(id),
  applicability text NOT NULL CHECK (applicability IN ('applicable', 'not_applicable', 'needs_information')),
  evaluated_applicability text NOT NULL CHECK (evaluated_applicability IN ('applicable', 'not_applicable', 'needs_information')),
  missing_facts text[] NOT NULL DEFAULT '{}',
  override_not_applicable boolean NOT NULL DEFAULT false,
  override_reason text,
  override_by uuid,
  override_at timestamptz,
  override_facts_hash text,
  override_conflict boolean NOT NULL DEFAULT false,
  responsible_user_id uuid,
  reminder_offsets int[] NOT NULL DEFAULT '{}',
  tracking_from date,
  retired boolean NOT NULL DEFAULT false,
  why jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, rule_code),
  CHECK (NOT override_not_applicable OR override_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.compliance_obligation_cycles (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.compliance_obligations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('filing', 'term', 'once')),
  period_key text NOT NULL,
  opens_on date,
  due_date date,
  valid_from date,
  expiry_date date,
  status text NOT NULL CHECK (status IN ('not_started', 'in_progress', 'evidence_submitted', 'action_required', 'completed', 'cancelled')),
  time_signal text NOT NULL DEFAULT 'none' CHECK (time_signal IN ('none', 'due_soon', 'overdue', 'expired')),
  rule_version_id uuid NOT NULL REFERENCES public.compliance_rule_versions(id),
  completed_at timestamptz,
  completed_by uuid,
  completion_note text,
  why jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, period_key),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (expiry_date IS NULL OR valid_from IS NULL OR expiry_date > valid_from)
);

CREATE TABLE IF NOT EXISTS public.compliance_cycle_events (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  obligation_id uuid REFERENCES public.compliance_obligations(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.compliance_obligation_cycles(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL,
  before jsonb,
  after jsonb,
  rule_version_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_evidence (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.compliance_obligations(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.compliance_obligation_cycles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('upload', 'reference')),
  title text NOT NULL,
  file_name text,
  storage_path text UNIQUE,
  mime_type text,
  size_bytes bigint,
  upload_status text NOT NULL DEFAULT 'stored' CHECK (upload_status IN ('pending', 'stored')),
  source_table text CHECK (source_table IN ('statutory_returns', 'asset_documents', 'bills', 'purchase_orders', 'loans')),
  source_id uuid,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  CHECK (kind <> 'upload' OR (storage_path IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL)),
  CHECK (kind <> 'reference' OR (source_table IS NOT NULL AND source_id IS NOT NULL)),
  CHECK (deleted_at IS NULL OR (deleted_by IS NOT NULL AND delete_reason IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.compliance_reminder_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.compliance_obligation_cycles(id) ON DELETE CASCADE,
  offset_days int NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app')),
  recipient_user_id uuid NOT NULL,
  notification_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, offset_days, channel, recipient_user_id)
);

-- Scheduler progress: one row per day, resumable by cursor.
CREATE TABLE IF NOT EXISTS public.compliance_scheduler_runs (
  run_date date PRIMARY KEY,
  cursor_company_id uuid,
  processed int NOT NULL DEFAULT 0,
  failures int NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS compliance_evaluation_runs_company ON public.compliance_evaluation_runs (company_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS compliance_obligations_company_applicability ON public.compliance_obligations (company_id, applicability);
CREATE INDEX IF NOT EXISTS compliance_cycles_company ON public.compliance_obligation_cycles (company_id);
CREATE INDEX IF NOT EXISTS compliance_cycles_company_due ON public.compliance_obligation_cycles (company_id, due_date);
CREATE INDEX IF NOT EXISTS compliance_cycles_company_expiry ON public.compliance_obligation_cycles (company_id, expiry_date);
CREATE INDEX IF NOT EXISTS compliance_cycle_events_cycle ON public.compliance_cycle_events (cycle_id, created_at);
CREATE INDEX IF NOT EXISTS compliance_cycle_events_obligation ON public.compliance_cycle_events (obligation_id, created_at);
CREATE INDEX IF NOT EXISTS compliance_cycle_events_company ON public.compliance_cycle_events (company_id);
CREATE INDEX IF NOT EXISTS compliance_evidence_cycle ON public.compliance_evidence (cycle_id);
CREATE INDEX IF NOT EXISTS compliance_evidence_company ON public.compliance_evidence (company_id);
CREATE INDEX IF NOT EXISTS compliance_reminder_dispatches_company ON public.compliance_reminder_dispatches (company_id);

-- History is append-only, and evidence is soft-deleted only. A delete that
-- cascades from the company itself (trigger depth > 1) is still allowed.
CREATE OR REPLACE FUNCTION public.compliance_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'compliance_cycle_events' THEN
    RAISE EXCEPTION 'Compliance history cannot be changed.';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Rows in % cannot be deleted.', TG_TABLE_NAME;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS compliance_cycle_events_append_only ON public.compliance_cycle_events;
CREATE TRIGGER compliance_cycle_events_append_only
  BEFORE UPDATE OR DELETE ON public.compliance_cycle_events
  FOR EACH ROW EXECUTE FUNCTION public.compliance_append_only();

DROP TRIGGER IF EXISTS compliance_evidence_no_delete ON public.compliance_evidence;
CREATE TRIGGER compliance_evidence_no_delete
  BEFORE DELETE ON public.compliance_evidence
  FOR EACH ROW EXECUTE FUNCTION public.compliance_append_only();

CREATE OR REPLACE FUNCTION public.compliance_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_profiles', 'compliance_obligations', 'compliance_obligation_cycles', 'compliance_evidence']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compliance_touch_updated_at()', t || '_touch', t);
    -- The generic audit trail (process_audit_log resolves company_id itself).
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR DELETE OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()', 'audit_' || t, t);
  END LOOP;
END;
$$;

-- ── Row-level security ─────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compliance_authorities', 'compliance_categories', 'compliance_industries', 'compliance_rule_versions',
    'compliance_guidance_versions', 'compliance_public_holidays', 'compliance_scheduler_runs',
    'compliance_profiles', 'compliance_evaluation_runs', 'compliance_obligations', 'compliance_obligation_cycles',
    'compliance_cycle_events', 'compliance_evidence', 'compliance_reminder_dispatches'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;

  -- Owners and admins may read their own company's rows; nobody else, and
  -- nobody writes through REST.
  FOREACH t IN ARRAY ARRAY[
    'compliance_profiles', 'compliance_evaluation_runs', 'compliance_obligations', 'compliance_obligation_cycles',
    'compliance_cycle_events', 'compliance_evidence', 'compliance_reminder_dispatches'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_of(company_id))',
      t || '_admin_select', t
    );
  END LOOP;
END;
$$;

-- ── Private evidence bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance-evidence',
  'compliance-evidence',
  false,
  20971520,
  ARRAY[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword', 'application/vnd.ms-excel', 'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Transactional writes (service role only) ───────────────────────────────

-- Applies one computed change set for a company in a single transaction.
-- p_expected_state is the profile's state_version the plan was computed
-- from; if anything else changed the company's compliance rows since, the
-- whole plan is refused (the edge function re-reads and retries), so two
-- concurrent evaluations can never interleave.
CREATE OR REPLACE FUNCTION public.compliance_apply_plan(
  p_company_id uuid,
  p_expected_state bigint,
  p_plan jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state bigint;
  v_profile jsonb := p_plan -> 'profile';
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'compliance_apply_plan: company required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('compliance:' || p_company_id::text, 0));

  SELECT state_version INTO v_state
  FROM public.compliance_profiles
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_state := 0;
    IF v_profile IS NULL THEN
      RAISE EXCEPTION 'compliance_profile_missing';
    END IF;
  END IF;

  IF v_state <> p_expected_state THEN
    RAISE EXCEPTION 'compliance_state_changed' USING ERRCODE = '40001';
  END IF;

  -- Every row in the plan must belong to this company.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'obligations', '[]'::jsonb)) e
    WHERE (e ->> 'company_id')::uuid IS DISTINCT FROM p_company_id
    UNION ALL
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'cycles', '[]'::jsonb)) e
    WHERE (e ->> 'company_id')::uuid IS DISTINCT FROM p_company_id
    UNION ALL
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'events', '[]'::jsonb)) e
    WHERE (e ->> 'company_id')::uuid IS DISTINCT FROM p_company_id
    UNION ALL
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'evidence', '[]'::jsonb)) e
    WHERE (e ->> 'company_id')::uuid IS DISTINCT FROM p_company_id
  ) THEN
    RAISE EXCEPTION 'compliance_apply_plan: a row does not belong to company %', p_company_id;
  END IF;

  IF v_profile IS NOT NULL THEN
    INSERT INTO public.compliance_profiles AS p (
      company_id, status, questionnaire_version, revision, answers, fact_snapshot,
      completed_at, completed_by, updated_by, last_evaluated_at, state_version
    )
    VALUES (
      p_company_id,
      COALESCE(v_profile ->> 'status', 'draft'),
      (v_profile ->> 'questionnaire_version')::int,
      COALESCE((v_profile ->> 'revision')::int, 0),
      COALESCE(v_profile -> 'answers', '{}'::jsonb),
      COALESCE(v_profile -> 'fact_snapshot', '{}'::jsonb),
      (v_profile ->> 'completed_at')::timestamptz,
      (v_profile ->> 'completed_by')::uuid,
      (v_profile ->> 'updated_by')::uuid,
      (v_profile ->> 'last_evaluated_at')::timestamptz,
      0
    )
    ON CONFLICT (company_id) DO UPDATE SET
      status = EXCLUDED.status,
      questionnaire_version = EXCLUDED.questionnaire_version,
      revision = EXCLUDED.revision,
      answers = EXCLUDED.answers,
      fact_snapshot = EXCLUDED.fact_snapshot,
      completed_at = EXCLUDED.completed_at,
      completed_by = EXCLUDED.completed_by,
      updated_by = EXCLUDED.updated_by,
      last_evaluated_at = COALESCE(EXCLUDED.last_evaluated_at, p.last_evaluated_at);
  END IF;

  INSERT INTO public.compliance_obligations AS o (
    id, company_id, rule_code, rule_version_id, applicability, evaluated_applicability, missing_facts,
    override_not_applicable, override_reason, override_by, override_at, override_facts_hash, override_conflict,
    responsible_user_id, reminder_offsets, tracking_from, retired, why
  )
  SELECT
    r.id, r.company_id, r.rule_code, r.rule_version_id, r.applicability, r.evaluated_applicability,
    COALESCE(r.missing_facts, '{}'), COALESCE(r.override_not_applicable, false), r.override_reason, r.override_by,
    r.override_at, r.override_facts_hash, COALESCE(r.override_conflict, false), r.responsible_user_id,
    COALESCE(r.reminder_offsets, '{}'), r.tracking_from, COALESCE(r.retired, false), COALESCE(r.why, '{}'::jsonb)
  FROM jsonb_populate_recordset(NULL::public.compliance_obligations, COALESCE(p_plan -> 'obligations', '[]'::jsonb)) r
  ON CONFLICT (id) DO UPDATE SET
    rule_version_id = EXCLUDED.rule_version_id,
    applicability = EXCLUDED.applicability,
    evaluated_applicability = EXCLUDED.evaluated_applicability,
    missing_facts = EXCLUDED.missing_facts,
    override_not_applicable = EXCLUDED.override_not_applicable,
    override_reason = EXCLUDED.override_reason,
    override_by = EXCLUDED.override_by,
    override_at = EXCLUDED.override_at,
    override_facts_hash = EXCLUDED.override_facts_hash,
    override_conflict = EXCLUDED.override_conflict,
    responsible_user_id = EXCLUDED.responsible_user_id,
    reminder_offsets = EXCLUDED.reminder_offsets,
    tracking_from = EXCLUDED.tracking_from,
    retired = EXCLUDED.retired,
    why = EXCLUDED.why
  WHERE o.company_id = p_company_id;

  -- A cycle may only hang off an obligation of the same company.
  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.compliance_obligation_cycles, COALESCE(p_plan -> 'cycles', '[]'::jsonb)) r
    LEFT JOIN public.compliance_obligations o ON o.id = r.obligation_id
    WHERE o.id IS NULL OR o.company_id <> p_company_id
  ) THEN
    RAISE EXCEPTION 'compliance_apply_plan: a cycle refers to an obligation of another company';
  END IF;

  INSERT INTO public.compliance_obligation_cycles AS c (
    id, company_id, obligation_id, kind, period_key, opens_on, due_date, valid_from, expiry_date, status,
    time_signal, rule_version_id, completed_at, completed_by, completion_note, why
  )
  SELECT
    r.id, r.company_id, r.obligation_id, r.kind, r.period_key, r.opens_on, r.due_date, r.valid_from,
    r.expiry_date, r.status, COALESCE(r.time_signal, 'none'), r.rule_version_id, r.completed_at, r.completed_by,
    r.completion_note, COALESCE(r.why, '{}'::jsonb)
  FROM jsonb_populate_recordset(NULL::public.compliance_obligation_cycles, COALESCE(p_plan -> 'cycles', '[]'::jsonb)) r
  ON CONFLICT (id) DO UPDATE SET
    opens_on = EXCLUDED.opens_on,
    due_date = EXCLUDED.due_date,
    valid_from = EXCLUDED.valid_from,
    expiry_date = EXCLUDED.expiry_date,
    status = EXCLUDED.status,
    time_signal = EXCLUDED.time_signal,
    rule_version_id = EXCLUDED.rule_version_id,
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    completion_note = EXCLUDED.completion_note,
    why = EXCLUDED.why
  WHERE c.company_id = p_company_id;

  INSERT INTO public.compliance_evidence AS ev (
    id, company_id, obligation_id, cycle_id, kind, title, file_name, storage_path, mime_type, size_bytes,
    upload_status, source_table, source_id, uploaded_by, deleted_at, deleted_by, delete_reason
  )
  SELECT
    r.id, r.company_id, r.obligation_id, r.cycle_id, r.kind, r.title, r.file_name, r.storage_path, r.mime_type,
    r.size_bytes, COALESCE(r.upload_status, 'stored'), r.source_table, r.source_id, r.uploaded_by, r.deleted_at,
    r.deleted_by, r.delete_reason
  FROM jsonb_populate_recordset(NULL::public.compliance_evidence, COALESCE(p_plan -> 'evidence', '[]'::jsonb)) r
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    upload_status = EXCLUDED.upload_status,
    deleted_at = EXCLUDED.deleted_at,
    deleted_by = EXCLUDED.deleted_by,
    delete_reason = EXCLUDED.delete_reason
  WHERE ev.company_id = p_company_id;

  INSERT INTO public.compliance_cycle_events (
    id, company_id, obligation_id, cycle_id, actor_user_id, event_type, before, after, rule_version_id, note
  )
  SELECT
    r.id, r.company_id, r.obligation_id, r.cycle_id, r.actor_user_id, r.event_type, r.before, r.after,
    r.rule_version_id, r.note
  FROM jsonb_populate_recordset(NULL::public.compliance_cycle_events, COALESCE(p_plan -> 'events', '[]'::jsonb)) r;

  IF p_plan ? 'run' THEN
    INSERT INTO public.compliance_evaluation_runs (
      company_id, profile_revision, trigger, rule_versions, applicable, needs_information, actor_user_id
    )
    VALUES (
      p_company_id,
      (p_plan -> 'run' ->> 'profile_revision')::int,
      p_plan -> 'run' ->> 'trigger',
      COALESCE(p_plan -> 'run' -> 'rule_versions', '[]'::jsonb),
      COALESCE(p_plan -> 'run' -> 'applicable', '[]'::jsonb),
      COALESCE(p_plan -> 'run' -> 'needs_information', '[]'::jsonb),
      (p_plan -> 'run' ->> 'actor_user_id')::uuid
    );
  END IF;

  UPDATE public.compliance_profiles
  SET state_version = state_version + 1
  WHERE company_id = p_company_id
  RETURNING state_version INTO v_state;

  RETURN v_state;
END;
$$;

-- One reminder, exactly once: the dispatch record and the notification are
-- written together or not at all. Returns the notification id, or NULL when
-- this reminder was already sent.
CREATE OR REPLACE FUNCTION public.compliance_dispatch_reminder(
  p_company_id uuid,
  p_cycle_id uuid,
  p_offset_days int,
  p_recipient_user_id uuid,
  p_content text,
  p_link_to text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch uuid;
  v_notification text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.compliance_obligation_cycles
    WHERE id = p_cycle_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'compliance_dispatch_reminder: cycle not in company';
  END IF;

  -- Reminders go only to the company's owners and admins.
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE company_id = p_company_id AND user_id = p_recipient_user_id AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'compliance_dispatch_reminder: recipient is not an owner or admin';
  END IF;

  INSERT INTO public.compliance_reminder_dispatches (company_id, cycle_id, offset_days, channel, recipient_user_id)
  VALUES (p_company_id, p_cycle_id, p_offset_days, 'in_app', p_recipient_user_id)
  ON CONFLICT (cycle_id, offset_days, channel, recipient_user_id) DO NOTHING
  RETURNING id INTO v_dispatch;

  IF v_dispatch IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, company_id, content, link_to, is_read)
  VALUES (p_recipient_user_id, p_company_id, p_content, p_link_to, false)
  RETURNING id::text INTO v_notification;

  UPDATE public.compliance_reminder_dispatches SET notification_id = v_notification WHERE id = v_dispatch;
  RETURN v_notification;
END;
$$;

REVOKE ALL ON FUNCTION public.compliance_apply_plan(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_apply_plan(uuid, bigint, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.compliance_dispatch_reminder(uuid, uuid, int, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_dispatch_reminder(uuid, uuid, int, uuid, text, text) TO service_role;
