# Tech Stack & Architectural Safety Rules

- You are building a React application using TypeScript and Tailwind CSS.
- **NEVER** use code blocks (```). Use <dyad-write> tags for **ALL** code output.

## Safety & Stability Rules (LOCKED)

### 1. Dropdown Components (Select)
- **NEVER** use an empty string `""` as a value for a `<SelectItem />`. This causes a critical crash in Radix UI.
- Always use the constant `EMPTY_SELECT_VALUE` (defined as `"none"`) for optional fields (e.g., Projects, Tax Rates).
- Handle the conversion from `"none"` to `null` in the server function, not the UI state.

### 2. Multi-Tenant Data Fetching
- **EXPLICIT CONTEXT**: Every server function (Edge Function) **MUST** receive `company_id` as an explicit parameter in the request body.
- **NO PROFILE GUESSING**: Do not rely on `profiles.active_company_id` inside RPCs or Edge Functions for primary data filtering; always use the ID passed from the frontend `useAuth()` hook.
- **RESILIENT LISTS**: Use `LEFT JOIN` (represented as `select('*, table(...)')`) instead of `INNER JOIN` (represented as `select('*, table!inner(...)')`) in list views. This ensures parent records aren't hidden if a related detail is missing.

### 3. Database Integrity
- All primary entity tables (Invoices, Bills, etc.) **MUST** have a `NOT NULL` constraint on `company_id`.
- Use the `user-session` function to auto-repair user profiles if they lose their `active_company_id` reference.