# Frontend to Backend Traceability Matrix (Phase A)

Date: 2026-07-02  
Purpose: Trace every major feature through UI -> query -> edge/RPC -> database -> UI refresh

| Feature | UI (routes/components) | React Query / State | Supabase call | Edge/RPC path | Primary data objects | UI refresh |
|---|---|---|---|---|---|---|
| Auth/session | `/auth`, `AuthContext`, `ProtectedRoute` | Context-managed session/profile/company state | `auth.getSession`, `onAuthStateChange`, `invoke('user-session')` | `user-session` function | profiles, company membership, active company | Auth listener + context state update + route redirect |
| Company switching | `CompanySwitcher`, settings flow | Context `refreshProfile()` | `invoke('settings', SWITCH_COMPANY)` | `settings` method dispatch | active company/profile linkage | Context refresh re-keys downstream queries by `activeCompany.id` |
| Customers | `/customers`, `/customers/:id`, `CustomerForm` | `['customers', companyId]`, detail keys | `invoke('customers', GET/GET_DETAILS/POST/PUT/DELETE)` | `customers` function | customers + related statement aggregates | `invalidateQueries(['customers', companyId])` |
| Vendors | `/vendors`, `/vendors/:id`, `VendorForm` | `['vendors', companyId]`, detail keys | `invoke('vendors', GET/GET_DETAILS/POST/PUT/DELETE)` | `vendors` function | vendors + AP statement aggregates | `invalidateQueries(['vendors', companyId])` |
| Invoices | `/invoices`, `/invoices/:id`, `InvoiceForm`, `InvoicePaymentForm` | `['invoices', companyId, filters]`, detail keys | `invoke('invoices', GET_ALL/GET_ONE/POST/PUT/VOID/...)`, `invoke('payments', RECORD_INVOICE_PAYMENT)` | `invoices` + `payments`; invoice RPCs | invoices, journal entries/items, numbering RPCs | invoice + journal query invalidation |
| Bills | `/bills`, `/pay-bills`, `BillForm`, `BillPaymentForm` | `['bills', companyId, filters]` | `invoke('bills', GET/POST/DELETE/VOID)`, `invoke('payments', RECORD_VENDOR_PAYMENT)` | `bills` + `payments`; bill RPC | bills, AP journal paths | bills + journal query invalidation |
| Quotes | `/quotes`, `/quotes/:id`, `QuoteForm` | `['quotes', companyId]`, detail keys | `invoke('quotes', GET_ALL/GET_ONE/POST/PUT/DELETE)` | `quotes` + quote-number RPC | quotes, quote items | quote list/detail invalidation |
| AR/AP payments | `/receive-payments`, dialogs/forms | AR/AP balance query keys | `invoke('payments', GET_AR_BALANCES/GET_AP_BALANCES/RECORD_*)` | `payments` + payment RPCs | customer/vendor balances, settlement entries | balances and related financial queries invalidated |
| Products/inventory | `/products`, `ProductForm`, `InventoryAdjustmentDialog` | `['products', companyId]` | `invoke('products', GET/POST/PUT/DELETE/ADJUST_QUANTITY)` | `products` function | products, inventory transactions | product and financial query invalidation |
| Projects/timesheets | `/projects`, `/projects/:id`, `/time-tracking` | `['projects', companyId]`, `['timesheets', companyId]`, detail keys | `invoke('projects', CRUD + milestone methods)`, `invoke('timesheets', CRUD)` | `projects` + `timesheets` | projects, milestones, timesheets | project/timesheet query invalidation |
| Expense claims | `/expense-claims`, `ExpenseClaimForm`, reimburse dialog | claim list/detail keys | `invoke('expense-claims', GET/POST/PUT/APPROVE/REIMBURSE/DELETE)` | `expense-claims` function | claims, claim items, reimbursement journals | claims and journal queries invalidated |
| Journal entries | `/journal-entries`, `JournalEntryForm` | `['journal_entries', companyId]` | `invoke('journal-entries', GET/POST/PUT/DELETE)` | `journal-entries` function | journal entries/items | journal query invalidation |
| Payroll | `/employees`, `/payroll-runs`, `/payroll-runs/:id`, `/payroll-reports` | employee/payroll run/report keys | `invoke('employees', CRUD)`, `invoke('payroll', run methods)`, `invoke('send-payslip-email')` | `employees` + `payroll` + RPCs | employees, runs, payslips, payroll journals | payroll and journal query invalidation |
| Loans | `/loans`, `/loans/:id`, forms | `['loans', companyId]`, loan detail key | `invoke('loans', GET_ALL/GET_ONE/POST/PUT/RECORD_PAYMENT)` + direct `from('loans').update(...)` | `loans` + RPCs | loans, amortization schedule, payment entries | loan detail + journal invalidation |
| Fixed assets | `/fixed-assets`, `/fixed-assets/:id`, `/asset-categories` | fixed-asset/category query keys | `invoke('fixed-assets', GET_ALL/GET_ONE/POST/DISPOSE)`, `invoke('asset-categories', CRUD)` | `fixed-assets`, `asset-categories`, disposal RPC | assets, categories, disposal journals | asset/category query invalidation |
| Budgets | `/budgets`, `BudgetForm` | `['budgets_with_activity', companyId]` | `invoke('budgets', GET_ALL/POST/PUT/DELETE)` | `budgets` + budget activity RPC | budgets and activity aggregates | budget query invalidation |
| Dashboard/reports | `/`, `/reports`, `/financial-statements`, comparative/valuation/tax/profitability pages | dashboard and report query keys | `invoke('dashboard-data')`, `invoke('reports', method variants)` | `dashboard-data` + `reports` + report RPC set | summary metrics, statements, aging, forecasts | query refetch on key/date/company changes |
| Settings/admin | `/settings` and settings components | team/audit/profile state keys | `invoke('settings', profile/company/team/audit methods)`, `invoke('invite-user')` | `settings` + `invite-user` | profiles, companies, company users, audit logs | profile refresh + settings query invalidation |
| File uploads | multiple forms + company/avatar components | mutation-local state + feature keys | `storage.from('attachments'/'avatars').upload/remove/getPublicUrl` | persisted via related feature edge methods | storage objects + linked URL fields | feature query invalidation after submit |
| Email flows | send dialogs + payslip detail | mutation-driven invalidation | `invoke('send-invoice-email'/'send-quote-email'/'send-po-email'/'send-statement-email'/'send-payslip-email')` | send-* edge functions | email payloads + status updates | entity detail/list query invalidation |

## Evidence Files

- Routing and guards: `src/router.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/AdminRoute.tsx`
- Query definitions: `src/lib/queries.ts`
- Auth/session/company switching: `src/contexts/AuthContext.tsx`, `src/components/CompanySwitcher.tsx`
- Edge function handlers: `supabase/functions/*/index.ts`
- Dashboard/report pages: `src/pages/Dashboard.tsx`, `src/pages/Reports.tsx`, `src/pages/FinancialStatements.tsx`
