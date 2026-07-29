# RLS Policy Audit — Production Security Validation

**Date:** 2026-07-29  
**Project:** `zaulhnpohrgqqodvzhxp` (Smart Accounting)

## Summary

All audited tenant tables enforce **company membership** via RLS. Cross-tenant reads return **zero unauthorized rows**. The Sprint 1 "678 foreign rows" finding was a **certification harness false positive** caused by comparing against a single `company_id` while the E2E user legitimately belongs to **14 companies**.

## Policy Pattern

| Pattern | Usage |
|---|---|
| `is_company_member(company_id)` | chart_of_accounts, journal_entries, customers, vendors, invoices, bills, employees, payroll_runs |
| `company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid())` | bank_accounts and banking domain tables |
| Journal lines via parent | journal_entry_items → `is_company_member(journal_entries.company_id)` |
| Companies | SELECT where user in company_users; UPDATE where owner_id = auth.uid() |

## Table Audit

| Table | SELECT | INSERT | UPDATE | DELETE | Membership enforced |
|---|---|---|---|---|---|
| companies | ✓ (company_users join) | — | ✓ (owner_id) | — | ✓ |
| chart_of_accounts | ✓ (ALL policy) | ✓ | ✓ | ✓ | ✓ `is_company_member` |
| journal_entries | ✓ | ✓ | ✓ | ✓ | ✓ `is_company_member` |
| journal_entry_items | ✓ | ✓ | ✓ | ✓ | ✓ via parent JE |
| customers | ✓ | ✓ | ✓ | ✓ | ✓ |
| vendors (suppliers) | ✓ | ✓ | ✓ | ✓ | ✓ |
| invoices | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills | ✓ | ✓ | ✓ | ✓ | ✓ |
| employees | ✓ | ✓ | ✓ | ✓ | ✓ |
| bank_accounts | ✓ | ✓ | ✓ | ✓ | ✓ company_users IN |
| payroll_runs | ✓ | ✓ | ✓ | ✓ | ✓ |
| financial_statements | EFS workspace tables | ✓ | ✓ | ✓ | ✓ company_id IN company_users |

**Note:** `invoice_items` / `bill_items` are not standalone tables; line items are embedded JSON or separate line tables covered by parent RLS.

## Cross-Tenant Test Evidence

| Test | Result |
|---|---|
| E2E user memberships | 14 companies (authorized) |
| Rows outside memberships | **0** across all tenant tables |
| Probe company `377d1d8c…` (not a member) | **0 rows** returned from chart_of_accounts |
| Anon read chart_of_accounts | **permission denied** |
| Anon read invoices | **permission denied** |
| Anon read employees | **permission denied** |

## Conclusion

**No RLS policy changes required.** Policies correctly restrict access to company membership. Certification harness updated to validate membership-scoped reads instead of single-company isolation.
