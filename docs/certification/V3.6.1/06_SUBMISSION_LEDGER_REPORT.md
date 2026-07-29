# 06 — Submission Ledger Report

**Version:** 3.6.1

## 1. Purpose

Submission history is an **immutable audit ledger**, not a mutable status field alone.

## 2. In-memory + database

| Layer | Artefact |
|-------|----------|
| Runtime | `appendSubmissionLedgerEvent` / `listSubmissionLedgerEvents` |
| Database | `statutory_submission_ledger` (append-only RLS: SELECT + INSERT) |
| Immutability | `statutory_returns.content_hash`, `immutable`, mutation trigger |

Migration: `supabase/migrations/20260713100000_statutory_returns_hardening.sql`

## 3. Event types

`generated` · `validated` · `exported` · `submitted` · `accepted` · `rejected` · `superseded` · `regeneration_blocked`

## 4. Regeneration ban

`assertCanRegenerate` throws `REGENERATION_BLOCKED` when `immutable` or status ∈ {submitted, accepted}. Pipeline records `regeneration_blocked` ledger events.

## 5. Verdict

**CERTIFIED** — Immutable statutory snapshots + append-only submission ledger.
