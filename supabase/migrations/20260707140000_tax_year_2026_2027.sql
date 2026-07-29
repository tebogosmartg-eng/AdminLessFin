-- SARS 2026/2027 tax year (Budget 25 February 2026)

INSERT INTO payroll_tax_year_config (
  tax_year_label, effective_from, effective_to, country_code,
  brackets, rebates, medical_credits, uif_ceiling_monthly, sdl_rate, uif_rate
) VALUES (
  '2026/2027',
  '2026-03-01',
  '2027-02-28',
  'ZA',
  '[
    {"from": 0, "to": 245100, "rate": 0.18, "base": 0},
    {"from": 245100, "to": 383100, "rate": 0.26, "base": 44118},
    {"from": 383100, "to": 530200, "rate": 0.31, "base": 79998},
    {"from": 530200, "to": 695800, "rate": 0.36, "base": 125599},
    {"from": 695800, "to": 887000, "rate": 0.39, "base": 185215},
    {"from": 887000, "to": 1878600, "rate": 0.41, "base": 259783},
    {"from": 1878600, "to": null, "rate": 0.45, "base": 666339}
  ]'::jsonb,
  '{"primary": 17820, "secondary": 9765, "tertiary": 3249}'::jsonb,
  '{"main_member": 376, "first_dependant": 376, "additional_dependant": 254}'::jsonb,
  17712,
  0.01,
  0.01
)
ON CONFLICT (country_code, tax_year_label) DO NOTHING;
