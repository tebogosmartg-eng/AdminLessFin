-- Isolated PostgreSQL fixture. Tests execute the real posting_engine_submit
-- definition and new migration; only context/period/policy dependencies are
-- controlled here. This is not a rehearsal of the entire Supabase schema.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
  $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE TABLE companies (id uuid PRIMARY KEY);
CREATE TABLE company_users (company_id uuid, user_id uuid, role text);
CREATE TABLE financial_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, status text, start_date date);
CREATE TABLE chart_of_accounts (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, name text, is_active boolean DEFAULT true,
  posting_blocked boolean DEFAULT false, control_account boolean DEFAULT false,
  allow_manual_posting boolean DEFAULT true, requires_dimension boolean DEFAULT false
);
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, entry_date date, description text,
  invoice_id uuid, vendor_id uuid, customer_id uuid, journal_number text, attachment_url text, bill_id uuid,
  rule_id uuid, rule_version integer, business_event text, generated_by uuid, generated_at timestamptz,
  financial_year_id uuid, accounting_period_id uuid
);
CREATE TABLE journal_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_entry_id uuid REFERENCES journal_entries,
  account_id uuid REFERENCES chart_of_accounts, type text, amount numeric, project_id uuid,
  dimensions jsonb, description text, quantity numeric, unit_price numeric
);
CREATE TABLE journal_entry_item_tax_rates (journal_entry_item_id uuid, tax_rate_id uuid);
CREATE TABLE posting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idempotency_key text, module text,
  document_type text, document_id uuid, reference text, description text, currency text, exchange_rate numeric,
  source text, created_by uuid, status text, rule_id uuid, rule_version integer, business_event text,
  generated_by uuid, generated_at timestamptz, journal_entry_id uuid, journal_number text,
  financial_year_id uuid, accounting_period_id uuid, warnings jsonb, committed_at timestamptz,
  UNIQUE(company_id, idempotency_key)
);
CREATE TABLE recurring_journal_entries (
  id uuid PRIMARY KEY, company_id uuid, description text, frequency text,
  next_run_date date, start_date date, end_date date
);
CREATE TABLE recurring_journal_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recurring_journal_entry_id uuid
    REFERENCES recurring_journal_entries ON DELETE CASCADE,
  account_id uuid, type text, amount numeric
);
CREATE TABLE fixed_assets (
  id uuid PRIMARY KEY, company_id uuid, status text, depreciation_method text, useful_life_years numeric,
  depreciation_expense_account_id uuid, accumulated_depreciation_account_id uuid,
  purchase_cost numeric, residual_value numeric, accumulated_depreciation numeric,
  last_depreciation_date date, purchase_date date, asset_code text, description text,
  depreciation_ytd numeric DEFAULT 0, depreciation_ytd_year integer, updated_at timestamptz
);
CREATE FUNCTION resolve_erp_context(uuid, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION posting_engine_next_journal_number(uuid) RETURNS text LANGUAGE sql AS
  $$ SELECT 'JE-' || gen_random_uuid()::text $$;
CREATE FUNCTION assert_period_open(uuid, date) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.closed_period', true) = 'true' THEN RAISE EXCEPTION 'Closed financial year'; END IF;
END $$;
CREATE FUNCTION accounting_policy_evaluate_posting(uuid, text, jsonb, text, text, jsonb, uuid, uuid, text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"blocking":false,"warnings":[]}'::jsonb $$;

-- Inject failures AFTER the posting engine has started writing.
CREATE FUNCTION test_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_' || TG_TABLE_NAME, true) = 'true' THEN
    RAISE EXCEPTION 'Injected failure on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fail_lines BEFORE INSERT ON journal_entry_items FOR EACH ROW EXECUTE FUNCTION test_fail_write();
CREATE TRIGGER fail_asset BEFORE UPDATE ON fixed_assets FOR EACH ROW EXECUTE FUNCTION test_fail_write();
CREATE TRIGGER fail_schedule BEFORE UPDATE ON recurring_journal_entries FOR EACH ROW EXECUTE FUNCTION test_fail_write();
