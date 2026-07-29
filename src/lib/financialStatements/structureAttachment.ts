/**
 * EFS V6.4.2–V6.4.5 — Statement Structure client contract.
 * Structure nodes are the ONLY certified attachment addresses for
 * Working Papers / Leads / Evidence / Disclosures / Cross References / Validation Results.
 * Never attach to Statement Instances.
 */

export type StructureNodeKind = 'statement' | 'section' | 'subsection' | 'line_item';

export type AttachmentKindCode =
  | 'working_paper'
  | 'lead_schedule'
  | 'supporting_evidence'
  | 'review_comment'
  | 'validation_result'
  | 'cross_reference'
  | 'note_placeholder'
  | 'publication_anchor';

export const ATTACHMENT_FORBIDDEN_TARGETS = [
  'statement_instance',
  'live_gl_account',
  'operational_report',
] as const;

export function assertAttachmentTarget(input: {
  structure_node_id?: string | null;
  disclosure_node_id?: string | null;
  statement_instance_id?: string | null;
}): void {
  if (input.statement_instance_id) {
    throw new Error(
      'EFS_ATTACHMENT_FORBIDDEN: cannot attach to Statement Instance; use structure_node_id or disclosure_node_id',
    );
  }
  if (!input.structure_node_id && !input.disclosure_node_id) {
    throw new Error('structure_node_id or disclosure_node_id is required.');
  }
}
