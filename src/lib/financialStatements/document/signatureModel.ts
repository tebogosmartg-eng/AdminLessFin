/**
 * AFS Document Workspace — signature blocks (V11.5 / Phase C).
 *
 * Assembles formal signature sections from canonical corporate information.
 * All officer names route through provideCorporateInformation.
 */
import type { EfsWorkspaceGeneralInformation } from '../api';
import { corporateDisplayFromEntity } from '../corporateInformation/accessors';

export type SignatureRole =
  | 'prepared_by'
  | 'reviewed_by'
  | 'approved_by'
  | 'authorised_representative';

export type DocSignatureNode = {
  id: string;
  kind: 'signature';
  role: SignatureRole;
  /** Business label shown in tree / PDF (e.g. "Prepared By"). */
  label: string;
  name: string;
  position: string;
  date: string;
  /** True when at least a name is present. */
  complete: boolean;
};

export const SIGNATURE_PLACEHOLDERS = {
  name: '[Name]',
  position: '[Position]',
  date: '[Date]',
  signature: '[Signature]',
} as const;

const SIGNATURE_DEFS: Array<{
  role: SignatureRole;
  id: string;
  label: string;
  defaultPosition: string;
}> = [
  {
    role: 'prepared_by',
    id: 'sig-prepared',
    label: 'Prepared By',
    defaultPosition: 'Prepared by',
  },
  {
    role: 'reviewed_by',
    id: 'sig-reviewed',
    label: 'Reviewed By',
    defaultPosition: 'Reviewer',
  },
  {
    role: 'approved_by',
    id: 'sig-approved',
    label: 'Approved By',
    defaultPosition: 'Partner',
  },
  {
    role: 'authorised_representative',
    id: 'sig-authorised',
    label: 'Authorised Representative',
    defaultPosition: 'Authorised representative',
  },
];

function trimOrEmpty(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function authorisedName(entity: EfsWorkspaceGeneralInformation | null): string {
  if (!entity) return '';
  const display = corporateDisplayFromEntity(entity);
  if (display.companySecretary) return display.companySecretary;
  const director = entity.directors?.[0];
  return trimOrEmpty(director?.name);
}

function authorisedPosition(entity: EfsWorkspaceGeneralInformation | null): string {
  if (!entity) return '';
  const display = corporateDisplayFromEntity(entity);
  if (display.companySecretary) return 'Company Secretary';
  const director = entity.directors?.[0];
  return trimOrEmpty(director?.role);
}

/**
 * Always returns the four formal signature blocks.
 * Missing engagement values stay empty strings — the renderer substitutes placeholders.
 */
export function assembleSignatures(
  entity: EfsWorkspaceGeneralInformation | null,
): DocSignatureNode[] {
  const display = corporateDisplayFromEntity(entity);
  return SIGNATURE_DEFS.map((def) => {
    let name = '';
    let position = '';
    let date = '';

    switch (def.role) {
      case 'prepared_by':
        name = display.preparedBy;
        position = name ? def.defaultPosition : '';
        date = '';
        break;
      case 'reviewed_by':
        name = display.reviewedBy;
        position = name ? def.defaultPosition : '';
        date = '';
        break;
      case 'approved_by':
        name = display.partner || trimOrEmpty(entity?.approved_by);
        position = name ? def.defaultPosition : '';
        date = trimOrEmpty(entity?.approval_date);
        break;
      case 'authorised_representative':
        name = authorisedName(entity);
        position = authorisedPosition(entity) || (name ? def.defaultPosition : '');
        date = trimOrEmpty(entity?.authorisation_date);
        break;
    }

    return {
      id: def.id,
      kind: 'signature' as const,
      role: def.role,
      label: def.label,
      name,
      position,
      date,
      complete: !!name,
    };
  });
}

/** Display helper: empty → placeholder; never blanks the rendered document. */
export function displaySignatureField(
  value: string,
  placeholder: keyof typeof SIGNATURE_PLACEHOLDERS = 'name',
): string {
  const v = trimOrEmpty(value);
  return v || SIGNATURE_PLACEHOLDERS[placeholder];
}

export function signatureCompleteness(signatures: DocSignatureNode[]): {
  filled: number;
  total: number;
  allComplete: boolean;
  anyComplete: boolean;
} {
  const filled = signatures.filter((s) => s.complete).length;
  return {
    filled,
    total: signatures.length,
    allComplete: filled === signatures.length && signatures.length > 0,
    anyComplete: filled > 0,
  };
}
