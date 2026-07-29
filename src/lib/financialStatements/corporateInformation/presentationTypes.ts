/**
 * V16.1 — Corporate Information Presentation Model types.
 *
 * Renderers consume presentation rows — not raw canonical fields.
 */
export type CorporateInformationPresentationRow =
  | {
      kind: 'group_header';
      id: string;
      label: string;
      spacingBefore?: number;
    }
  | {
      kind: 'single';
      id: string;
      label: string;
      value: string;
    }
  | {
      kind: 'paragraph';
      id: string;
      label: string;
      value: string;
    }
  | {
      kind: 'address_block';
      id: string;
      label: string;
      lines: string[];
    }
  | {
      kind: 'person_list';
      id: string;
      label: string;
      people: Array<{ name: string; detail?: string | null }>;
    }
  | {
      kind: 'banker_list';
      id: string;
      label: string;
      bankers: Array<{ name: string; detail?: string | null }>;
    }
  | {
      kind: 'tax_list';
      id: string;
      label: string;
      items: Array<{ label: string; number: string }>;
    }
  | {
      kind: 'spacer';
      id: string;
      height: number;
    };

export type CorporateInformationPresentation = {
  version: '16.1';
  title: string;
  sections: Array<{
    id: string;
    title: string;
    rows: CorporateInformationPresentationRow[];
  }>;
  /** Flat row list for renderers that prefer a single stream. */
  rows: CorporateInformationPresentationRow[];
  presentationFingerprint: string;
};
