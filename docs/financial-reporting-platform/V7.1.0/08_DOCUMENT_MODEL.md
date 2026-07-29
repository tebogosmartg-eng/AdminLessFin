# 08 — Document Model

**Version:** 7.1.0  
**Industry analogue:** CaseView / CaseWare Financials document; IRIS Interactive Report assembly; professional AFS pack order

---

## 1. Purpose

Make the published Annual Financial Statements a **first-class structured document**, not only a PDF render of statement JSON.

---

## 2. DocumentSectionDefinition (platform)

| Attribute | Description |
|-----------|-------------|
| `section_code` | `COVER` \| `CONTENTS` \| `CERTIFICATE` \| `DIRECTORS_REPORT` \| `AUDITORS_REPORT` \| `STATEMENT` \| `POLICIES` \| `NOTES` \| `SCHEDULE` \| `APPENDIX` \| `SIGNATURES` \| `METADATA` |
| `framework_pack_id` | Owner |
| `default_sort_order` | Assembly order |
| `required` | bool |
| `repeatable` | bool (multiple statements/notes) |
| `numbering_mode` | `none` \| `roman` \| `arabic` \| `note_seq` |
| `page_break_before` | bool |
| `header_footer_profile` | Profile key |
| `jurisdiction_applicability` | tags |

---

## 3. DocumentInstance (tenant)

| Attribute | Description |
|-----------|-------------|
| `document_id` | Identity |
| `workspace_id` | Engagement |
| `snapshot_version_id` | Bound facts |
| `title` | e.g. Annual Financial Statements |
| `framework_label` | Human label |
| `reporting_period_label` | FY label |
| `language` | default en |
| `status` | draft \| assembled \| locked |
| `structure_hash` | Hash of section order + content refs |

---

## 4. DocumentSectionInstance

| Attribute | Description |
|-----------|-------------|
| `section_instance_id` | Identity |
| `document_id` | Parent |
| `section_code` | Type |
| `sort_order` | Final order |
| `title` | Resolved title |
| `payload_kind` | `gi` \| `statement` \| `disclosure` \| `policy_set` \| `schedule` \| `static` \| `toc` \| `signature` |
| `statement_instance_id` | Optional |
| `disclosure_instance_id` | Optional |
| `lead_schedule_id` | Optional |
| `static_content` | Optional (certificates text) |
| `page_start` / `page_end` | Publication-time |
| `auto_number` | Resolved note/statement number |

---

## 5. Required professional sections

| Section | Content source | Always? |
|---------|----------------|---------|
| Cover Page | EngagementGeneralInformation | Yes |
| Contents | Generated from sections | Yes |
| Primary Statements | StatementInstances (ordered) | Yes |
| Accounting Policies | Policy set / DISC.POLICIES | Yes (framework-dependent) |
| Notes | DisclosureInstances (numbered) | Yes |
| Schedules | Lead/supporting as elected | Optional |
| Appendices | Optional disclosures | Optional |
| Certificates / Signatures | GI + review signoffs | Jurisdiction-dependent |
| Publication Metadata | Pack seal (internal; not printed as debug) | Yes (stored) |

---

## 6. Automatic numbering & TOC

1. Assemble eligible sections (after disclosure conditions).  
2. Assign note numbers sequentially to NOTES payload sections.  
3. Update CrossReference display fields (statement “Note X”).  
4. Build TOC entries with titles + page placeholders.  
5. Publication renderer fills page numbers (existing professional PDF path extended).

---

## 7. Headers, footers, typography (model hints only)

Document model stores **profiles**, not pixels:

| Profile field | Example |
|---------------|---------|
| `running_header` | Entity name + “Annual Financial Statements” |
| `running_footer` | Period label + page N of M |
| `amount_format` | `(1,234.56)` negatives |
| `currency_symbol` | ZAR / R |

Composer/PDF implementations consume profiles; model remains engine-agnostic.

---

## 8. Relationship to PublicationPack

```
DocumentInstance (assembled, hashed)
  → PackReview fingerprint includes structure_hash + statement/disclosure hashes
  → PublicationPack.dataset embeds document section index
  → Artifacts render from DocumentInstance + sealed amounts
```

Publication never recalculates taxonomy math; it renders the locked document.
