# 05 — Profitability Domain Certification

**Version:** 4.1.1  

---

## 1. Authority Split (Non-Negotiable)

| Authority | Owns |
|-----------|------|
| **Accounting (FROZEN)** | Recognised Revenue, GL Costs, Cash, AR/AP, Net Profit on financial statements, Revenue Recognition process |
| **EWM** | Operational intelligence: contract snapshot, operational costs, forecasts, operational margin, burn, resource burn |
| **Sales/Engagement** | Invoiced amounts, billable rates, billing workflow |

> Accounting remains the sole **financial** authority.  
> EWM owns **operational intelligence only**.

---

## 2. Metric Ownership Certificate

| Metric | Definition | Owner | EWM may |
|--------|------------|-------|---------|
| **Contract Value** | Awarded contract baseline (+ approved variations snapshot) | Commercial (Contract/Engagement) SoT; EWM snapshot | Display / use in forecasts |
| **Approved Variations** | Commercial change orders approved | Commercial SoT | Refresh snapshot only after commercial approve |
| **Recognised Revenue** | Revenue recognised in GL | **Accounting** | **Read/display only** |
| **Operational Costs** | Σ locked operational cost facts (labour + consumptions) | **EWM** | Own |
| **Forecast Cost** | Burn + remaining effort × blended operational rates (+ known consumptions) | **EWM** | Own |
| **Forecast Revenue** | Operational projection of billable/contract earn-out (not GL recognition) | **EWM** (ops signal) | Own as forecast only — must never be labelled “Recognised” |
| **Forecast Margin** | Forecast Revenue − Forecast Cost **or** Contract Value − Forecast Cost (policy choice, single formula per company) | **EWM** | Own operational forecast |
| **Profitability (Financial)** | Revenue − Expenses per Accounting | **Accounting** | Display GL project P&L alongside ops |
| **Profitability (Operational)** | Billable value − Operational Costs (and/or Contract − Forecast Cost) | **EWM** | Own operational view |

**Board ruling on dual views:** Command Centre **must label** “Recognised (Accounting)” vs “Operational / Forecast (EWM)” — never merge into one ambiguous “Profit”.

---

## 3. Invariants

1. EWM does not post revenue recognition journals.  
2. EWM does not recompute VAT/tax.  
3. Forecast engines consume Operational Cost rollups — Analytics does not recalculate cost math.  
4. Contract Value changes only via commercial approval → snapshot update.  
5. Unbilled completed work is operational/billing signal; not recognised revenue.

---

## 4. Events

| Event | Owner |
|-------|-------|
| `work.budget_at_risk` | EWM |
| `work.forecast_updated` | EWM |
| Invoice posted / revenue recognised | Accounting/Sales (existing) |

---

## 5. Certification Result

**PROFITABILITY DOMAIN CERTIFIED** with dual-authority labelling mandatory.
