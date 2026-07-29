-- Statutory Payroll Engine V3: historical 2024/2025 tax year (versioned, never overwritten)

INSERT INTO payroll_tax_year_config (
  tax_year_label, effective_from, effective_to, country_code,
  brackets, rebates, medical_credits, uif_ceiling_monthly, sdl_rate, uif_rate
) VALUES (
  '2024/2025',
  '2024-03-01',
  '2025-02-28',
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
