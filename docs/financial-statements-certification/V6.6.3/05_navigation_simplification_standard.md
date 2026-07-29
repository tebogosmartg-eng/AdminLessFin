# 5. Navigation Simplification Standard

**Version:** 6.6.3

## Platform sidebar (existing, preserved)

- Group: **Financial Statements**
- Entry: **Annual Financial Statements**
- Feature flags: `VITE_EFS_*` unchanged

## Engagement navigation (certified accountant sidebar)

Workspace navigation replaces software tabs with accountant sections:

1. Overview  
2. Information  
3. Financial Statements  
4. Supporting Schedules  
5. Notes & Disclosures  
6. Validation  
7. Review  
8. Publication  

Implementation: vertical engagement sidebar in `FinancialStatementsWorkspaceDashboard.tsx`.

## Developer tools

Internal Reporting Snapshot pipeline controls remain only in the collapsed **Advanced** area, gated by the existing internal persona / allowlist. They are not part of the accountant workflow.

## Label changes vs V6.6.2

| V6.6.2 | V6.6.3 |
|---|---|
| Working Papers (tab) | Supporting Schedules |
| Horizontal tab strip | Accountant sidebar |
| Overview widgets only | Continue Preparation + attention questions |
