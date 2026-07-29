# 02 — Capacity Planning Report

**Module:** Enterprise Work Management — Capacity Engine  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Capacity Planning answers: *Can we deliver what we committed, with the people we have?*

Managers must see instantly:

- **Overallocated**
- **Underallocated**
- **Available**

---

## 2. Isolation

| Capacity Engine owns | Reads (does not own) | Never owns |
|----------------------|----------------------|------------|
| Weekly/daily capacity rules | HR leave records | Leave policy authoring |
| Booked vs available math | Public holiday calendars | Payroll calendars mutation |
| Forecast snapshots | Training schedules (HR/LMS) | Payslip hours |
| Heatmap facts | Employee active status | Identity / employee numbers |

---

## 3. Capacity Model Per Employee

For each employee × company × planning window:

| Measure | Definition |
|---------|------------|
| Weekly Capacity | Contracted weekly hours (or role default) |
| Daily Capacity | Derived or explicit daily profile |
| Leave | Hours unavailable (from HR) |
| Training | Hours reserved for training |
| Public Holidays | Country/region calendar overlay |
| Available Capacity | Weekly − leave − training − holidays |
| Booked Capacity | Sum of approved allocations + planned work |
| Planned Work | Soft bookings / tentative |
| Actual Work | Locked + approved time entries |
| Forecast | Planned + trend of actuals |
| Remaining Capacity | Available − Booked |

```
Available = Contracted − Leave − Training − PublicHolidays
Remaining = Available − Booked
Utilisation = Actual / Available   (period)
Allocation Ratio = Booked / Available
```

**Single calculation authority:** Capacity Engine. Analytics and Reports consume facts; they do not recompute capacity.

---

## 4. Allocation States

| State | Rule |
|-------|------|
| Available | Remaining > buffer threshold |
| Underallocated | Booked / Available < under_threshold (configurable) |
| Balanced | Within band |
| Overallocated | Booked > Available |
| Critical Overload | Booked > Available × critical_factor |

Thresholds are company-configurable; defaults shipped per industry template.

---

## 5. Planning Horizons

| Horizon | Use |
|---------|-----|
| Day | Daily standup / overload alerts |
| Week | Team planning |
| Month | Resource forecast |
| Quarter | Portfolio capacity vs OKRs |
| Year | Strategic headcount signal (read-only to HR) |

---

## 6. Data Structures (Logical)

- `ewm_capacity_profiles` — employee defaults (weekly hours, timezone, country)
- `ewm_capacity_overrides` — temporary adjustments
- `ewm_capacity_periods` — materialized period windows
- `ewm_capacity_facts` — immutable daily/weekly snapshots after lock
- `ewm_capacity_alerts` — overload / idle events for BOE + notifications

---

## 7. Multi-Country

- Holiday calendars resolved by `country_code` (+ optional region)
- Capacity profiles store country; company may operate multi-country employees
- No statutory payroll calendars mutated

---

## 8. Integration Points

| Source | Direction | Contract |
|--------|-----------|----------|
| HR leave | Inbound read | leave_days/hours by employee/date |
| Public holidays | Inbound adapter | calendar service |
| Resource allocations | Inbound | booked hours |
| Time entries | Inbound | actual hours |
| Analytics | Outbound facts | heatmap, idle, forecast |
| AI hooks | Outbound | overload / daily focus inputs |

---

## 9. Board Decision

**APPROVED.** Capacity Engine is a first-class isolated EWM subsystem and the sole authority for utilisation denominators.
