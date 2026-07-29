# ADMINLESS FIN

# ARCHITECTURE DECISION RECORD (ADR)

## ADR-0001

# CHART OF ACCOUNTS CERTIFICATION & ARCHITECTURE FREEZE

**Status:** ACCEPTED

**Effective Date:** 29 July 2026

**Version:** 1.0

---

# Decision

Following:

- Enterprise Architecture Review
- Independent Implementation Audit
- Database Certification
- Edge Function Certification
- Regression Testing
- Security Review
- Production Readiness Assessment

the Chart of Accounts (CoA) domain is formally designated as a **Certified Core Domain** within AdminLess Fin.

The Chart of Accounts architecture is now considered stable, production-ready, and shall serve as the foundation for all future accounting functionality.

---

# Certification Status

The Chart of Accounts has successfully passed:

✓ Enterprise Architecture Review

✓ Independent Code Review

✓ Database Architecture Review

✓ Edge Function Review

✓ Security Review

✓ Regression Testing

✓ Production Build

✓ TypeScript Validation

✓ Unit Testing

✓ Integration Testing

✓ Accounting Validation

✓ Production Readiness Assessment

The certification is considered complete and closed.

Evidence binder: [`docs/coa-certification/`](../coa-certification/00_CERTIFICATION_INDEX.md)

---

# Governance Decision

Effective immediately:

## The Chart of Accounts architecture is frozen.

This means:

- No architectural redesigns.
- No structural refactoring.
- No replacement implementations.
- No alternative account-role models.
- No changes to the accounting identity model.
- No redesign of system account protection.
- No breaking database changes.

Future development must preserve complete backward compatibility.

---

# Certified Architectural Principles

The following principles are permanently adopted unless superseded by a future Architecture Decision Record (ADR).

## Principle 1

Accounting identity is determined by **Account Roles**, not display names.

Changing an account name must never change accounting behaviour.

---

## Principle 2

System Accounts are immutable.

System Accounts:

- cannot be deleted
- cannot change accounting type
- cannot change Account Role
- cannot lose system status
- cannot lose control status

They may:

- be renamed
- change account code
- be reordered
- be activated/deactivated

---

## Principle 3

The database is the final enforcement authority.

Business rules enforced by PostgreSQL are authoritative.

Edge Functions and UI validation exist to improve user experience only.

They are not trusted security boundaries.

---

## Principle 4

The Chart of Accounts is the single source of truth for ledger structure.

All accounting modules must consume CoA metadata rather than duplicating accounting logic.

---

## Principle 5

Financial Statements consume CoA metadata.

Financial Statements must never own or duplicate:

- Account classifications
- Statement mappings
- Account roles
- System account definitions

---

## Principle 6

Backward compatibility is mandatory.

Existing ledgers, journals, financial statements and historical accounting records must remain valid after future releases.

---

## Principle 7

Enterprise accounting correctness takes precedence over convenience.

Where usability conflicts with accounting integrity, accounting integrity always prevails.

---

# Allowed Changes

The following work may continue without reopening architecture review.

## Bug Fixes

Examples:

- validation defects
- calculation defects
- API bugs
- UI bugs
- migration issues
- deployment defects

---

## Security Improvements

Examples:

- authorization hardening
- dependency updates
- vulnerability remediation
- validation improvements

---

## Performance Improvements

Examples:

- indexing
- SQL optimisation
- caching
- rendering improvements
- API optimisation

---

## Documentation

Examples:

- developer documentation
- user documentation
- architecture documentation
- certification updates

---

## Test Improvements

Examples:

- Unit Tests
- Integration Tests
- Playwright Tests
- Regression Suites
- Certification Tests

---

# Changes Requiring Architecture Board Approval

The following are considered architectural changes and require a formal ADR before implementation.

## Account Role Model

- new Account Roles
- removed Account Roles
- renamed Account Roles
- changes to role semantics

---

## System Account Model

- protection rules
- lifecycle
- immutability
- deletion behaviour
- control account behaviour

---

## Posting Engine

- posting architecture
- journal engine
- posting rules
- double-entry logic

---

## Financial Statement Architecture

- statement mappings
- reporting architecture
- classification rules

---

## Database Architecture

- schema redesign
- breaking migrations
- primary key changes
- accounting constraints
- accounting relationships

---

# Certification Preservation Policy

Every future release affecting the Chart of Accounts must satisfy the following.

- Existing certification evidence remains valid.
- Existing regression suites continue to pass.
- Existing accounting behaviour remains unchanged unless explicitly approved.
- Existing APIs remain backward compatible.
- Existing database constraints remain enforced.
- Accounting identity remains Account Role driven.
- Database enforcement remains authoritative.

---

# Release Policy

The Chart of Accounts is now placed into **Maintenance Mode**.

Only the following categories of work are permitted:

- Bug Fixes
- Security Updates
- Performance Improvements
- Documentation
- Automated Tests
- Certification Maintenance

No feature work shall alter the certified architecture.

---

# Future Engineering Roadmap

With the Chart of Accounts certified, engineering focus shifts to the next core accounting domains in the following order:

## Phase 1

General Ledger

Scope:

- Journal Engine
- Journal Posting
- Posting Validation
- Ledger Integrity
- Trial Balance

---

## Phase 2

Financial Statements

Scope:

- IFRS Financial Statements
- IFRS for SMEs
- Statement Generation
- Notes to Financial Statements
- Statement Validation

---

## Phase 3

Financial Close

Scope:

- Period Locking
- Year-End Close
- Retained Earnings Roll Forward
- Closing Journals
- Audit Controls

---

## Phase 4

Fixed Assets

Scope:

- Asset Register
- Depreciation
- Impairment
- Revaluations
- Disposals

---

## Phase 5

Tax Engine

Scope:

- VAT
- Deferred Tax
- Tax Reporting
- Compliance Validation

---

## Phase 6

Accounts Receivable & Accounts Payable

Scope:

- Customer Accounting
- Supplier Accounting
- Settlements
- Allocations
- Credit Control
- Payment Processing

---

# Final Resolution

The Chart of Accounts domain is hereby declared a **Certified Core Domain** of AdminLess Fin.

Its architecture is approved, frozen, and adopted as the permanent accounting foundation of the platform.

Future development shall build upon this foundation while preserving the certified architecture and maintaining enterprise-grade accounting integrity.

**Status:** CERTIFIED CORE DOMAIN

**Architecture:** FROZEN

**Certification:** ACTIVE

**Production Readiness:** APPROVED

**Development Mode:** MAINTENANCE ONLY
