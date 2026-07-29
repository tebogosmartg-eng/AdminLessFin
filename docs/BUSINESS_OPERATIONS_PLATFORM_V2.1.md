# AdminLess Fin V2.1 — Business Operations Platform

**Date:** 2026-07-02  
**Status:** Approved foundation → Platform orchestration layer  
**Predecessor:** [BUSINESS_LIFECYCLE_V2.md](./BUSINESS_LIFECYCLE_V2.md)

---

## Executive Summary

V2 established **what** lifecycles exist. V2.1 establishes **how** they execute as a unified Business Operations Platform.

The Business Operations Engine (BOE) is a **contract and orchestration layer** — not a rewrite. Edge functions remain executors. The accounting engine remains the financial source of truth. UI becomes a presentation layer for business processes.

**Implemented in this release:** BOE foundation (`src/lib/boe/`), lifecycle-grouped operations dashboard, enriched activity feed, calendar deep-link service, contextual chat via URL context, lifecycle badges on all primary detail pages.

---

## 1. Business Operations Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BUSINESS OPERATIONS PLATFORM                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Presentation Layer (React)                                              │
│  Workspaces · Detail Pages · Command Centre · Calendar · Chat            │
├─────────────────────────────────────────────────────────────────────────┤
│  Business Operations Engine (src/lib/boe/)                               │
│  Event Registry · Orchestration Pipeline · Next Action · Activity        │
├─────────────────────────────────────────────────────────────────────────┤
│  Shared Platform Services                                                │
│  Workflow · Document · Notification · Activity · Calendar · Audit · AI   │
├─────────────────────────────────────────────────────────────────────────┤
│  Execution Layer (Supabase Edge Functions) — UNCHANGED                     │
│  invoices · bills · payroll · payments · journal-entries · reports       │
├─────────────────────────────────────────────────────────────────────────┤
│  Accounting Engine (Journal-centric) — SOURCE OF TRUTH — UNCHANGED       │
│  journal_entries · journal_entry_items · RPCs                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Orchestration Pipeline (Permanent Execution Model)

Every business process follows:

```
Business Event
  → Workflow Engine
  → Business Rules Engine
  → Validation Engine
  → Approval Engine
  → Accounting Engine
  → Document Engine
  → Notification Engine
  → Activity Engine
  → Calendar Engine
  → AI Insights Engine
  → Reporting Engine
  → Dashboard Engine
  → Audit Engine
  → History
  → Next Business Action
```

**Registry:** `src/lib/boe/orchestration.ts`

---

## 2. Business Event Registry

Every user action maps to a registered event with full metadata.

| Event ID | Lifecycle | Stage | Accounting | Documents |
|----------|-----------|-------|------------|-----------|
| `quote.created` | Revenue | quote | No | quote |
| `quote.sent` | Revenue | approval | No | quote |
| `quote.approved` | Revenue | invoice | No | quote |
| `invoice.created` | Revenue | invoice | Yes | invoice |
| `invoice.sent` | Revenue | collections | No | invoice |
| `payment.received` | Revenue | payment | Yes | receipt |
| `purchase_order.created` | Procurement | purchase_order | No | purchase_order |
| `purchase_order.sent` | Procurement | approval | No | purchase_order |
| `bill.created` | Procurement | bill | Yes | bill |
| `bill.payment_made` | Procurement | payment | Yes | remittance |
| `payroll.run_created` | Payroll | preparation | No | — |
| `payroll.payslips_generated` | Payroll | validation | No | payslip |
| `payroll.approved` | Payroll | approval | No | — |
| `payroll.processed` | Payroll | processing | Yes | register, summary, bank file |
| `payroll.bank_file_generated` | Payroll | bank_file | No | bank_payment_file |
| `journal.posted` | Accounting | posting | Yes | journal |
| `asset.depreciated` | Fixed Assets | depreciate | Yes | depreciation_schedule |
| `period.closed` | Financial Close | lock | No | financial_statements |

**Registry:** `src/lib/boe/businessEvents.ts`

Each event declares: lifecycle, stage, permissions, accounting impact, documents produced, orchestration pipeline, suggested next events.

---

## 3. Shared Platform Services Architecture

| Service | Status | Implementation |
|---------|--------|----------------|
| Workflow | ✅ Active | `nextActionEngine.ts`, `*Workflow.ts` |
| Business Event | ✅ Active | `businessEvents.ts` |
| Approval | ⚠️ Partial | Payroll approve, expense claims |
| Document | ✅ Active | `payrollDocuments.ts`, print/email dialogs |
| Notification | ⚠️ Partial | `send-*` functions, NotificationBell |
| Activity | ✅ Active | `activityEngine.ts`, ActivityFeed |
| Calendar | ✅ Active | `calendar-events`, `calendarNavigation.ts` |
| Timeline | ⚠️ Partial | PayrollTimeline, payroll_audit_events |
| Search | ✅ Active | global-search, CommandMenu |
| Audit | ✅ Active | audit_logs, AuditLogViewer |
| Reporting | ✅ Active | reports edge function |
| Dashboard | ✅ Active | dashboard-data, OperationsActionPanel |
| AI | ⚠️ Partial | PayrollAiInsights, DashboardInsights |
| Permission | ✅ Active | AuthContext, AdminRoute, edge checks |
| History | ✅ Active | CustomerDetail, VendorDetail |

**Contracts:** `src/lib/boe/platformServices.ts`

---

## 4. Lifecycle Orchestration Matrix

| Lifecycle | Workflow | Events | Next Action | Activity | Calendar | Chat Context |
|-----------|----------|--------|-------------|----------|----------|--------------|
| Revenue | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Procurement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payroll | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Accounting | ⚠️ | ✅ | — | ✅ | — | ✅ |
| Fixed Assets | — | ✅ | — | ✅ | — | ✅ |
| Loans | — | — | — | — | — | ✅ |
| Projects | ⚠️ | — | — | ✅ | — | ✅ |
| Tax | — | — | — | — | ⚠️ | — |
| Financial Close | ⚠️ | ✅ | — | — | ✅ | — |

---

## 5. Cross-Module Integration Matrix

| From → To | Dashboard | Calendar | Chat | Activity | Search | Audit |
|-----------|-----------|----------|------|----------|--------|-------|
| Quote Detail | actions | due dates | ✅ Discuss | journal | ✅ | settings |
| Invoice Detail | actions | due dates | ✅ Discuss | journal | ✅ | settings |
| PO Detail | actions | — | ✅ Discuss | journal | ✅ | settings |
| Payroll Run | actions | pay dates | ✅ Discuss | audit_events | ✅ | settings |
| Journal Entry | activity | — | ✅ | ✅ | ✅ | ✅ |

---

## 6. Activity Engine Design

**Purpose:** Users always know what happened across the business.

**Data sources (no schema change):**
1. `journal_entries` — dashboard recent activity (primary)
2. `audit_logs` — settings audit viewer (future merge)
3. `payroll_audit_events` — payroll run detail

**Client enrichment:** `normalizeJournalActivity()` infers business event from journal description and attaches lifecycle badge.

**UI:** `ActivityFeed` component on Operations Command Centre.

**Future:** Dedicated `activity_feed` edge function aggregating all sources.

---

## 7. Calendar Evolution Design

**From:** Scheduling tool  
**To:** Operational Calendar

**Surfaces:** Invoice due dates, bill due dates, payroll pay dates, recurring invoices/bills, payroll review deadlines, expense claim deadlines.

**Deep links:** `calendarNavigation.ts` maps event type → lifecycle stage → route.

| Event Type | Route | Lifecycle Stage |
|------------|-------|-----------------|
| invoice | `/invoices/:id` | collections |
| bill | `/bills?highlight=:id` | payment |
| payroll | `/payroll-runs/:id` | processing |
| claim_deadline | `/expense-claims` | expenses |

---

## 8. Chat Evolution Design

**From:** Company-wide chat  
**To:** Contextual Collaboration

**Phase 1 (implemented):** URL-based context (`/chat?context=invoice&id=xxx&label=INV-001`). Context banner shows lifecycle badge and link back to record.

**Phase 2 (planned):** `messages.entity_type` + `entity_id` columns, threaded discussions per business object.

**Phase 3 (planned):** Mentions, attachments, approval requests, activity references.

**Rule:** Chat never exists without business context when opened from a record.

---

## 9. Dashboard Evolution Design

**From:** KPI dashboard  
**To:** Operations Command Centre

**Answers:**
- What requires attention? → `OperationsActionPanel` grouped by lifecycle
- What is overdue? → `DashboardInsights`
- What is blocked? → Action counts (draft invoices, open bills, draft payroll)
- What happened today? → `ActivityFeed` with lifecycle badges

**Title changed:** "Operations Command Centre"

---

## 10. AI Orchestration Design

**Principle:** AI is an advisor. AI never posts transactions. AI never bypasses approvals.

| Capability | Status | Implementation |
|------------|--------|----------------|
| Explain anomalies | ⚠️ | DashboardInsights |
| Predict risks | ⚠️ | PayrollAiInsights |
| Suggest next actions | ✅ | Next Action Engine |
| Summarise activity | 🔮 | Planned |
| Recommend approvals | 🔮 | Planned |
| Detect unusual trends | ⚠️ | DashboardInsights variance |
| Generate document drafts | 🔮 | Planned |

**Future:** AI recommendations reference `lifecycleId` + `stageId` from BOE context.

---

## 11. Incremental Implementation Roadmap

### ✅ Phase 1 — BOE Foundation (This Release)

| Item | Risk | Status |
|------|------|--------|
| `src/lib/boe/` module | None | ✅ |
| Business Event Registry | None | ✅ |
| Platform Services contracts | None | ✅ |
| Next Action Engine | None | ✅ |
| Activity Engine + ActivityFeed | None | ✅ |
| Calendar navigation service | None | ✅ |
| Contextual chat (URL params) | None | ✅ |
| Operations Command Centre dashboard | None | ✅ |
| Lifecycle badges on detail pages | None | ✅ |

### Phase 2 — Service Wiring (Next Sprint)

| Item | Business Value | Risk |
|------|----------------|------|
| Bill detail lifecycle + discuss | Procurement continuity | Low |
| Activity feed from audit_logs merge | Full business visibility | Low |
| Calendar: tax deadlines, year-end | Close lifecycle | Low |
| Command menu grouped by lifecycle | Discoverability | Low |
| Route-level lifecycle badge in Layout | Every screen identified | Low |

### Phase 3 — Workflow Engine

| Item | Business Value | Risk |
|------|----------------|------|
| Configurable approval chains | Segregation of duties | Medium |
| Entity-linked chat messages | True contextual collaboration | Medium (schema) |
| Period lock UI | Financial close | Medium |
| Global activity feed edge function | Unified event stream | Low |

### Phase 4 — Enterprise Orchestration

| Item | Business Value | Risk |
|------|----------------|------|
| Edge functions emit BOE events | True orchestration | Medium |
| AI copilot lifecycle-aware | Decision support | Low |
| Notification engine unification | Operational alerts | Medium |

---

## 12. Verification Report

### Quality Gates

| Gate | Status |
|------|--------|
| Production stability | ✅ Additive only |
| Accounting correctness | ✅ No posting logic changed |
| Auditability | ✅ Unchanged |
| Security / RLS | ✅ No schema changes |
| Edge Functions | ✅ Unchanged |
| Workflow continuity | ✅ Improved |
| Integration | ✅ Calendar, chat, dashboard connected |
| User guidance | ✅ Lifecycle badges + next actions |
| Operational visibility | ✅ Lifecycle-grouped actions + activity feed |

### Build Verification

```
npm run build — ✅ Passes
```

### Manual Test Checklist

- [ ] Dashboard shows "Operations Command Centre" with lifecycle-grouped actions
- [ ] Activity feed shows lifecycle badges on journal entries
- [ ] Calendar bill click navigates to `/bills?highlight={id}`
- [ ] Invoice detail "Discuss" opens chat with context banner
- [ ] Quote/PO/Payroll detail show lifecycle context badge
- [ ] Chat context banner links back to source record

### Files Added (V2.1)

```
src/lib/boe/
  businessEvents.ts
  orchestration.ts
  platformServices.ts
  nextActionEngine.ts
  activityEngine.ts
  calendarNavigation.ts
  contextualChat.ts
  routeLifecycleMap.ts
  index.ts

src/components/boe/
  LifecycleContextBadge.tsx
  ActivityFeed.tsx
  OperationsActionPanel.tsx
```

### Rollback Strategy

All changes are client-side additions. Rollback = revert V2.1 commit. No database migrations. No edge function changes. Zero accounting impact.

---

## Permanent Standard

> AdminLess Fin is a **Business Operations Platform**. Every screen, workflow, document, notification, report, AI insight, calendar event, dashboard widget, and audit entry must strengthen an end-to-end business lifecycle.

**Enforcement:**
- New features register a `BusinessEventDefinition` in `businessEvents.ts`
- New pages bind to a lifecycle via `routeLifecycleMap.ts`
- New detail pages include `LifecycleContextBadge` + contextual chat link
- Edge function changes should emit orchestration metadata (future)

**BOE entry point:** `import { ... } from '@/lib/boe'`
