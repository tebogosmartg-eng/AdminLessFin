# Private Beta Troubleshooting Guide

Quick answers for common onboarding and first-day issues.

---

## Accounting Setup

### Invoices, journals, or financial statements are blocked

**Cause:** Accounting Ready is false.  
**Fix:** Open `/accounting-setup`. Resolve pending steps. Click **Refresh** after each change.

### Tax step will not complete

**Cause:** No tax rates exist.  
**Fix:** Go to **Settings → Tax Rates** (or `/tax-rates`). Add at least one rate (e.g. Name: VAT, Rate: 15). Return to Accounting Setup and refresh.

### Chart of Accounts validation fails

**Cause:** Missing accounts or control accounts.  
**Fix:** Use **Generate Standard** on the CoA step. Do not delete mandatory control accounts (Trade Debtors, Trade Creditors, VAT, Bank, Retained Earnings).

### Opening balances step pending

**Cause:** Neither posted opening balances nor zero confirmation recorded.  
**Fix:** For a new company, click **Confirm opening balances are zero**. For migrations, post opening balances on bank accounts first.

---

## Transactions

### Bill save fails with an error

**Cause:** Accounting foundation incomplete (bills are accessible but posting is not).  
**Fix:** Complete Accounting Setup. A yellow banner on the Bills page indicates setup is in progress.

### Trial Balance is empty

**Cause:** No posted transactions yet.  
**Fix:** Create an invoice or bill after Accounting Ready. Refresh Trial Balance.

### Invoice totals look wrong

**Cause:** Tax rate not applied or journal embed issue.  
**Fix:** Ensure line items have a tax rate selected. Check Trial Balance for posted amounts.

---

## Navigation & terminology

| Term in UI | Meaning |
|------------|---------|
| Suppliers | Companies you buy from (route: `/vendors`) |
| Customers | Companies you sell to |
| Accounting Setup | Six-step foundation wizard |
| Accounting Ready | All validation rules passed |

---

## Getting help

1. In-app **Onboarding Guide** (`/onboarding-guide`)  
2. **User Manual** (`/manual`)  
3. Beta support contact (provided by your onboarding specialist)  
4. Security issues: security@adminless.com  

---

## Error messages

If you see an error with a **reference code** (correlation ID), note it when contacting support — it helps trace the issue in server logs.
