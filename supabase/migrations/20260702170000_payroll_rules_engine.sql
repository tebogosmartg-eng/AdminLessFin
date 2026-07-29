-- Payroll Rules Engine V3: configurable calculation rules, tax config, company/run overrides

-- ---------------------------------------------------------------------------
-- Rule catalogue (platform-wide definitions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_rule_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'earning', 'statutory', 'benefit', 'deduction', 'employer_contribution', 'custom'
  )),
  enabled_by_default boolean NOT NULL DEFAULT true,
  company_configurable boolean NOT NULL DEFAULT true,
  employee_configurable boolean NOT NULL DEFAULT false,
  calculation_order integer NOT NULL,
  employee_contribution boolean NOT NULL DEFAULT false,
  employer_contribution boolean NOT NULL DEFAULT false,
  taxable_impact text NOT NULL DEFAULT 'none' CHECK (taxable_impact IN (
    'none', 'taxable', 'pre_tax_deduction', 'post_tax_deduction', 'reduces_taxable'
  )),
  accounting_impact text NOT NULL DEFAULT 'none' CHECK (accounting_impact IN (
    'none', 'wages', 'employee_deduction', 'employer_expense', 'employer_liability'
  )),
  version text NOT NULL DEFAULT '1.0.0',
  effective_from date NOT NULL DEFAULT '2025-03-01',
  effective_to date,
  description text,
  payslip_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tax year configuration (PAYE brackets, rebates, medical credits)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_tax_year_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_label text NOT NULL,
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  country_code text NOT NULL DEFAULT 'ZA',
  brackets jsonb NOT NULL,
  rebates jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_credits jsonb NOT NULL DEFAULT '{}'::jsonb,
  uif_ceiling_monthly numeric,
  sdl_rate numeric,
  uif_rate numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, tax_year_label)
);

-- ---------------------------------------------------------------------------
-- Company payroll rule settings (defaults for all runs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_payroll_rule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_id text NOT NULL REFERENCES payroll_rule_catalog(id),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (company_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_company_payroll_rule_settings_company
  ON company_payroll_rule_settings(company_id);

-- ---------------------------------------------------------------------------
-- Employee-level rule overrides (pension %, medical aid, garnishee, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_payroll_rule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rule_id text NOT NULL REFERENCES payroll_rule_catalog(id),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_rule_settings_employee
  ON employee_payroll_rule_settings(employee_id);

-- ---------------------------------------------------------------------------
-- Payroll run rule overrides (inherits company defaults, editable per run)
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS rule_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_rule_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_tax_year_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_payroll_rule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payroll_rule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_rule_catalog_select ON payroll_rule_catalog
  FOR SELECT USING (true);

CREATE POLICY payroll_tax_year_config_select ON payroll_tax_year_config
  FOR SELECT USING (true);

CREATE POLICY company_payroll_rule_settings_select ON company_payroll_rule_settings
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY company_payroll_rule_settings_mutate ON company_payroll_rule_settings
  FOR ALL USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY employee_payroll_rule_settings_select ON employee_payroll_rule_settings
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY employee_payroll_rule_settings_mutate ON employee_payroll_rule_settings
  FOR ALL USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Seed rule catalogue
-- ---------------------------------------------------------------------------
INSERT INTO payroll_rule_catalog (
  id, name, category, enabled_by_default, company_configurable, employee_configurable,
  calculation_order, employee_contribution, employer_contribution,
  taxable_impact, accounting_impact, version, effective_from, payslip_label, description
) VALUES
  ('basic_salary', 'Basic Salary', 'earning', true, false, false,
   10, false, false, 'taxable', 'wages', '1.0.0', '2025-03-01', 'Basic Salary',
   'Base remuneration from employee salary record'),
  ('paye', 'PAYE', 'statutory', true, true, false,
   100, true, false, 'none', 'employee_deduction', '1.0.0', '2025-03-01', 'PAYE',
   'Pay-As-You-Earn income tax'),
  ('uif', 'UIF (Employee)', 'statutory', true, true, false,
   110, true, false, 'none', 'employee_deduction', '1.0.0', '2025-03-01', 'UIF',
   'Unemployment Insurance Fund — employee contribution'),
  ('uif_employer', 'UIF (Employer)', 'statutory', true, true, false,
   111, false, true, 'none', 'employer_liability', '1.0.0', '2025-03-01', 'UIF Employer',
   'Unemployment Insurance Fund — employer contribution'),
  ('sdl', 'SDL', 'statutory', true, true, false,
   112, false, true, 'none', 'employer_expense', '1.0.0', '2025-03-01', 'SDL',
   'Skills Development Levy'),
  ('pension', 'Pension Fund', 'benefit', false, true, true,
   50, true, false, 'pre_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Pension',
   'Employee pension fund contribution'),
  ('provident_fund', 'Provident Fund', 'benefit', false, true, true,
   51, true, false, 'pre_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Provident Fund',
   'Employee provident fund contribution'),
  ('medical_aid', 'Medical Aid', 'benefit', false, true, true,
   52, true, false, 'pre_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Medical Aid',
   'Medical aid scheme contribution'),
  ('union_fees', 'Union Fees', 'deduction', false, true, true,
   120, true, false, 'post_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Union Fees',
   'Trade union membership fees'),
  ('garnishee', 'Garnishee Order', 'deduction', false, true, true,
   130, true, false, 'post_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Garnishee Order',
   'Court-ordered salary deduction'),
  ('custom_deduction', 'Custom Deduction', 'custom', false, true, true,
   140, true, false, 'post_tax_deduction', 'employee_deduction', '1.0.0', '2025-03-01', 'Custom Deduction',
   'Company-defined employee deduction'),
  ('custom_employer_contribution', 'Custom Employer Contribution', 'custom', false, true, true,
   113, false, true, 'none', 'employer_expense', '1.0.0', '2025-03-01', 'Custom Employer Contribution',
   'Company-defined employer contribution')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed 2025/2026 SA tax year (data-driven — update annually without engine changes)
-- ---------------------------------------------------------------------------
INSERT INTO payroll_tax_year_config (
  tax_year_label, effective_from, effective_to, country_code,
  brackets, rebates, medical_credits, uif_ceiling_monthly, sdl_rate, uif_rate
) VALUES (
  '2025/2026',
  '2025-03-01',
  '2026-02-28',
  'ZA',
  '[
    {"from": 0, "to": 237100, "rate": 0.18, "base": 0},
    {"from": 237100, "to": 370500, "rate": 0.26, "base": 42678},
    {"from": 370500, "to": 512800, "rate": 0.31, "base": 77362},
    {"from": 512800, "to": 673000, "rate": 0.36, "base": 121475},
    {"from": 673000, "to": 857900, "rate": 0.39, "base": 179147},
    {"from": 857900, "to": 1817000, "rate": 0.41, "base": 251258},
    {"from": 1817000, "to": null, "rate": 0.45, "base": 644489}
  ]'::jsonb,
  '{"primary": 17235, "secondary": 9444, "tertiary": 3145}'::jsonb,
  '{"main_member": 364, "first_dependant": 364, "additional_dependant": 246}'::jsonb,
  17712,
  0.01,
  0.01
)
ON CONFLICT (country_code, tax_year_label) DO NOTHING;
