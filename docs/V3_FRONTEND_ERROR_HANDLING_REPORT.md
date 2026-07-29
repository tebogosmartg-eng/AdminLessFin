# AdminLess Fin V3 — Frontend Error Handling Report

## Improvements

### 1. Platform Error Toast (`src/utils/toast.ts`)

`showPlatformError(cause, { onRetry })` displays:
- **What failed:** `businessMessage`
- **Why / what to do:** `recoverySuggestion`
- **Correlation ID:** always visible in description
- **Retry:** action button when `retryable: true`
- **Technical details:** `technicalMessage` in dev mode only

### 2. Query Layer Standardization

All `src/lib/queries.ts` invoke calls now use `parseFunctionResult()`:
- Checks transport-level `error`
- Checks in-body `{ error: string }`
- Prevents silent 200-with-error-body failures

### 3. AuthContext Hardening

- Fetch failures clear profile/companies/activeCompany
- Init and auth-state-change wrapped in try/catch/finally
- Errors logged and rethrown from `fetchUserAndCompanyData`

### 4. PayrollRunDetail

- `handleDownloadBankFile` — full try/catch + `showPlatformError` + retry
- Checks `persisted: false` before showing success
- `handleDownloadAllPayslips` — no silent `continue` on missing payslip detail

### 5. ErrorBoundary

- Removed generic "Oops! Something went wrong."
- Actionable message with refresh guidance

## Remaining Generic Toasts

~40 page/component mutation handlers still use `showError(error.message)`. These propagate messages but lack correlation ID and recovery suggestions. Recommended migration: replace `showError` with `showPlatformError` in mutation `onError` handlers.

## Developer Mode

Set via `import.meta.env.DEV` — technical messages included in toast description during development only.
