# 01 — Structure Implementation Summary

**Version:** 6.4.2 Phase C1  

## Statement Structure

```
Statement Definition (neutral code)
 └── Section
      └── Subsection
           └── Line Item  ──taxonomy_line_code──► Framework Mapping presentation
                └── Structure Node (canonical attachment address)
```

Unified tree: `efs_structure_nodes` (`statement` → `section` → `subsection` → `line_item`) with immutable published paths.

Framework presentation labels live in `efs_structure_node_labels` and Phase B taxonomy — **Framework Mapping still controls presentation**.

## Disclosure Structure

- `efs_disclosure_nodes` (hierarchy)
- `efs_disclosure_placeholders` (reserved slots — no content)
- `efs_disclosure_references` (disclosure ↔ structure node)

## Attachment Model

| Kind | Phase reserved |
|------|----------------|
| working_paper | C |
| lead_schedule | C |
| supporting_evidence | C |
| cross_reference | C |
| note_placeholder | C |
| review_comment | D |
| validation_result | D |
| publication_anchor | D |

Forbidden targets catalogue: `statement_instance`, `live_gl_account`, `operational_report`.

API: `GET_STATEMENT_STRUCTURE`, `GET_DISCLOSURE_STRUCTURE`, `LIST_ATTACHMENT_POINTS`, `RESOLVE_ATTACHMENT_TARGET`.

Client guard: `src/lib/financialStatements/structureAttachment.ts`.
