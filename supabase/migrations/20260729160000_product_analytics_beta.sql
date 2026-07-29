-- AdminLess Fin — Private Beta Product Analytics (instrumentation only; no business logic)
-- Append-only event store for onboarding, usage, journey, and error insights.

CREATE TABLE IF NOT EXISTS public.product_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  event_category text NOT NULL
    CHECK (event_category IN ('auth', 'company', 'setup', 'usage', 'journey', 'error')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  session_id text,
  route text,
  module text,
  duration_ms integer,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_created_at
  ON public.product_analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_event_name
  ON public.product_analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_company_id
  ON public.product_analytics_events (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_user_id
  ON public.product_analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_category
  ON public.product_analytics_events (event_category, created_at DESC);

COMMENT ON TABLE public.product_analytics_events IS
  'Private beta product analytics — append-only instrumentation events. Not accounting data.';

ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own events only
DROP POLICY IF EXISTS product_analytics_events_insert ON public.product_analytics_events;
CREATE POLICY product_analytics_events_insert ON public.product_analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No direct SELECT for tenants — beta dashboard reads via service-role edge function
DROP POLICY IF EXISTS product_analytics_events_select ON public.product_analytics_events;
