# 05 — Transmission Framework Report

**Version:** 3.6.1

## 1. Isolation

`src/statutory/returns/transmissionFramework.ts` accepts an **export artifact only**.

Providers:

| Id | Behaviour |
|----|-----------|
| `manual` | Records submission reference for operator portal filing |
| `sars_efiling_stub` | Registered, not live-enabled (returns ok:false with guidance) |

## 2. Rules

- Transmission never regenerates declarations.
- Successful manual transmit marks return submitted via ledger (`markReturnSubmitted`).
- Live SARS eFiling remains a future filing sprint.

## 3. Verdict

**CERTIFIED** — Transmission framework pluggable and isolated from export.
