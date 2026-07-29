# 5. Approval Workflow

**Version:** 6.8.0

## Sequence

```
Checklist complete → Manager Approve → Partner Approve → Lock Period
```

## Enforced gates (server-side)

An approval is rejected unless:

1. **All mandatory reconciliations/checklist items are complete** — outstanding mandatory items block approval with a plain-language error.
2. **Critical validation issues are resolved** — open blocking/critical issues in the certified Validation Platform block approval.
3. **Partner approval requires prior manager approval.**
4. **Locked periods cannot be approved again.**

## Before Financial Statements generation the platform verifies

- All mandatory reconciliations complete ✔ (approval gate)
- Critical validation issues resolved ✔ (approval gate)
- Required approvals obtained ✔ (readiness model)
- Accounting period approved ✔ (period status ladder)
- Period lock status ✔ (surfaced in the Financial Statements wizard)

## Record keeping

Every approval stores role, decision, approver name, optional note, and timestamp in `efcp_close_approvals`; each decision is also written to the immutable Close History. Approving as manager or partner advances the period status ladder automatically (see Period Lock Model).

## Separation from EFS Review Workflow

The certified EFS pack review (manager/partner review of the AFS document) is untouched. Close approval is a **period-level accounting approval**; pack review remains a **statement-level document review**. No duplicated ownership.
