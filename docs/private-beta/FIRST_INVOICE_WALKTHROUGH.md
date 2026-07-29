# First Invoice Walkthrough

**Prerequisites:** Accounting Ready, at least one customer, at least one tax rate.

---

## Steps

### 1. Confirm Accounting Ready

Dashboard should not show the amber Accounting Setup card. If it does, complete remaining steps at `/accounting-setup`.

### 2. Create a customer

1. Go to **Sales → Customers**
2. Click **New Customer**
3. Enter name, email, and address (minimum: name)
4. Save

### 3. Create the invoice

1. Go to **Sales → Invoices**
2. Click **New Invoice**
3. Select your customer
4. Set invoice date and due date
5. Add line items:
   - Description
   - Quantity and unit price
   - Tax rate (e.g. VAT 15%)
6. Review totals
7. Save

### 4. What happens on save

AdminLess Fin posts a journal entry automatically:

- **Debit** Trade Debtors (Accounts Receivable)  
- **Credit** Revenue account(s)  
- **Credit/Debit** VAT control (if tax applied)  

You do not need a manual journal for standard invoicing.

### 5. Verify

1. Open **Accounting → Trial Balance** — AR balance should reflect the invoice total  
2. Open **Reports → Financial Statements** — revenue appears on the Income Statement  
3. Return to **Invoices** — invoice appears in the list with posted status  

---

## Common issues

| Issue | Resolution |
|-------|------------|
| Invoices page shows setup guidance | Complete Accounting Setup |
| Tax rate missing on line | Add tax rate at Tax Rates, refresh setup |
| Customer not in dropdown | Create customer first at Customers |

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more.
