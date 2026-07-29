/** Product analytics event names — private beta instrumentation. */

export const AnalyticsEvents = {
  // Authentication
  AUTH_REGISTRATION: 'auth.registration',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',

  // Company
  COMPANY_CREATED: 'company.created',
  COMPANY_SWITCHED: 'company.switched',

  // Accounting setup
  SETUP_STARTED: 'setup.started',
  SETUP_FINANCIAL_YEAR_CONFIGURED: 'setup.financial_year_configured',
  SETUP_COA_GENERATED: 'setup.coa_generated',
  SETUP_TAX_CONFIGURED: 'setup.tax_configured',
  SETUP_OPENING_BALANCES_COMPLETED: 'setup.opening_balances_completed',
  SETUP_ACCOUNTING_READY: 'setup.accounting_ready',
  SETUP_VALIDATION_FAILED: 'setup.validation_failed',
  SETUP_STEP_VIEWED: 'setup.step_viewed',
  SETUP_ABANDONED: 'setup.abandoned',

  // Core usage (first-time variants prefixed usage.first_)
  USAGE_FIRST_CUSTOMER: 'usage.first_customer',
  USAGE_FIRST_SUPPLIER: 'usage.first_supplier',
  USAGE_FIRST_INVOICE: 'usage.first_invoice',
  USAGE_FIRST_BILL: 'usage.first_bill',
  USAGE_FIRST_JOURNAL: 'usage.first_journal',
  USAGE_FIRST_TRIAL_BALANCE: 'usage.first_trial_balance',
  USAGE_FIRST_FINANCIAL_STATEMENTS: 'usage.first_financial_statements',

  // Journey
  JOURNEY_STEP_COMPLETED: 'journey.step_completed',
  JOURNEY_DROPOFF: 'journey.dropoff',

  // Errors
  ERROR_FRONTEND_EXCEPTION: 'error.frontend_exception',
  ERROR_API_FAILURE: 'error.api_failure',
  ERROR_VALIDATION_FAILURE: 'error.validation_failure',
  ERROR_PERMISSION_FAILURE: 'error.permission_failure',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export type AnalyticsCategory = 'auth' | 'company' | 'setup' | 'usage' | 'journey' | 'error';

export const EVENT_CATEGORY: Record<string, AnalyticsCategory> = {
  'auth.': 'auth',
  'company.': 'company',
  'setup.': 'setup',
  'usage.': 'usage',
  'journey.': 'journey',
  'error.': 'error',
};

export function categoryForEvent(eventName: string): AnalyticsCategory {
  for (const [prefix, category] of Object.entries(EVENT_CATEGORY)) {
    if (eventName.startsWith(prefix)) return category;
  }
  return 'journey';
}
