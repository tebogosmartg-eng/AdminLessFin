-- AdminLess Fin — ERP Phase 5: Enterprise Business Event Orchestrator
-- Business modules publish events. Subscribers react. Posting Engine unchanged.

-- ── Aggregate sequence (guaranteed ordering per entity) ─────────────────────

CREATE TABLE IF NOT EXISTS public.business_event_aggregates (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  aggregate_key text NOT NULL,
  last_sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, aggregate_key)
);

CREATE OR REPLACE FUNCTION public.business_event_next_sequence(
  p_company_id uuid,
  p_aggregate_key text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  INSERT INTO public.business_event_aggregates (company_id, aggregate_key, last_sequence)
  VALUES (p_company_id, p_aggregate_key, 1)
  ON CONFLICT (company_id, aggregate_key)
  DO UPDATE SET
    last_sequence = business_event_aggregates.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO v_seq;
  RETURN v_seq;
END;
$$;

-- ── Published business events ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  idempotency_key text NOT NULL,
  business_event text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'updated', 'approved', 'rejected', 'posted',
    'cancelled', 'closed', 'reversed', 'archived'
  )),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  aggregate_key text NOT NULL,
  sequence_number bigint NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  publisher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_module text NOT NULL CHECK (source_module IN (
    'sales', 'purchasing', 'inventory', 'payroll', 'assets', 'banking',
    'crm', 'projects', 'manufacturing', 'tax', 'workflow', 'accounting'
  )),
  correlation_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'published' CHECK (status IN (
    'published', 'processing', 'completed', 'partial', 'failed', 'dead_letter'
  )),
  accounting_impact boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key),
  UNIQUE (company_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_business_events_company_published
  ON public.business_events (company_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_events_aggregate_sequence
  ON public.business_events (company_id, aggregate_key, sequence_number);
CREATE INDEX IF NOT EXISTS idx_business_events_correlation
  ON public.business_events (company_id, correlation_id);
CREATE INDEX IF NOT EXISTS idx_business_events_status
  ON public.business_events (company_id, status, published_at DESC);

-- ── Subscriber registry ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_event_subscribers (
  subscriber_id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  handles_modules text[] NOT NULL DEFAULT '{}',
  handles_event_types text[] NOT NULL DEFAULT '{}',
  handles_accounting_impact boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.business_event_subscribers
  (subscriber_id, name, description, priority, handles_modules, handles_event_types, handles_accounting_impact)
VALUES
  ('accounting_rules_engine', 'Accounting Rules Engine', 'Generates journal entries from business events', 10, '{}', '{posted,approved,created}', true),
  ('policy_engine', 'Policy Engine', 'Evaluates accounting policies on events', 20, '{}', '{posted,approved,created}', true),
  ('notification_engine', 'Notification Engine', 'Dispatches user and system notifications', 30, '{}', '{}', NULL),
  ('audit_engine', 'Audit Engine', 'Records immutable audit trail entries', 40, '{}', '{}', NULL),
  ('analytics_engine', 'Analytics Engine', 'Feeds operational analytics pipelines', 50, '{}', '{}', NULL),
  ('workflow_engine', 'Workflow Engine', 'Advances workflow state machines', 60, '{}', '{approved,rejected,created}', NULL),
  ('ai_future', 'Future AI', 'Reserved AI insight subscriber', 90, '{}', '{}', NULL)
ON CONFLICT (subscriber_id) DO NOTHING;

-- ── Delivery audit (per subscriber execution) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_record_id uuid NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscriber_id text NOT NULL REFERENCES public.business_event_subscribers(subscriber_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'success', 'failed', 'skipped', 'dead_letter'
  )),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  duration_ms integer,
  retry_count integer NOT NULL DEFAULT 0,
  correlation_id text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_record_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_business_event_deliveries_company_created
  ON public.business_event_deliveries (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_event_deliveries_subscriber
  ON public.business_event_deliveries (company_id, subscriber_id, status);

-- ── Dead-letter queue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_event_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES public.business_event_deliveries(id) ON DELETE SET NULL,
  event_record_id uuid NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscriber_id text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  replayed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_event_dlq_company
  ON public.business_event_dead_letter (company_id, created_at DESC)
  WHERE replayed_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_event_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_event_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_event_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_event_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_events_select ON public.business_events
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY business_event_deliveries_select ON public.business_event_deliveries
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY business_event_dead_letter_select ON public.business_event_dead_letter
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY business_event_subscribers_select ON public.business_event_subscribers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY business_event_aggregates_select ON public.business_event_aggregates
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));
