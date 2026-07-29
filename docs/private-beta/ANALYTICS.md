# Private Beta Product Analytics

Instrumentation for onboarding funnel, usage milestones, errors, and journey timing.

## Setup

1. Apply migration `20260729160000_product_analytics_beta.sql`
2. Deploy edge function `product-analytics`
3. Set secrets:
   - `BETA_ANALYTICS_ALLOWLIST` — comma-separated emails for dashboard access
4. Set frontend env:
   - `VITE_BETA_ANALYTICS_ALLOWLIST` — same emails (for route guard)
   - `VITE_PRODUCT_ANALYTICS_ENABLED=true` (default on; set `false` to disable)

## Dashboard

**Route:** `/admin/beta-analytics` (allowlisted emails only)

## Event catalogue

| Category | Events |
|----------|--------|
| Auth | `auth.registration`, `auth.login`, `auth.logout` |
| Company | `company.created`, `company.switched` |
| Setup | `setup.started`, `setup.financial_year_configured`, `setup.coa_generated`, `setup.tax_configured`, `setup.opening_balances_completed`, `setup.accounting_ready`, `setup.validation_failed`, `setup.step_viewed`, `setup.abandoned` |
| Usage | `usage.first_customer`, `usage.first_supplier`, `usage.first_invoice`, `usage.first_bill`, `usage.first_journal`, `usage.first_trial_balance`, `usage.first_financial_statements` |
| Journey | `journey.step_completed`, `journey.dropoff` |
| Error | `error.frontend_exception`, `error.api_failure`, `error.validation_failure`, `error.permission_failure` |

## Storage

Events append to `product_analytics_events` (RLS: insert own rows only; read via edge function service role).
