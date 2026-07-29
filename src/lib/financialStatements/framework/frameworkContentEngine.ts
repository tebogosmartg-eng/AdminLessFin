/**
 * Enterprise Framework Content Engine (V12.0 / Critical Gap 2 / V14.2 consumer).
 *
 * Assembles a near-complete draft Annual Financial Statement from the immutable
 * Enterprise Reporting Knowledge Repository (via the frameworkContent facade).
 * Produces standard accounting policies, mandatory disclosure notes (headings,
 * narratives, tables), and evaluates optional disclosures against conditional rules.
 *
 * MERGE CONTRACT (immutability + editability):
 *  - Engagement instances loaded from the server ALWAYS take precedence and
 *    remain fully editable through the existing disclosure/policy edit APIs.
 *  - Framework-generated nodes fill gaps so a complete draft always exists,
 *    even with a thin server pack. They are flagged `source: 'framework'`.
 *  - Knowledge Repository definitions are never mutated.
 */
import type {
  DocNoteNode,
  DocPolicyNode,
  DocPolicySetNode,
  DocStatementNode,
} from '../document/documentModel';
import {
  getFrameworkDefinition,
  normaliseFrameworkKey,
  resolveExtensionNotes,
  type FrameworkKey,
  type FrameworkNoteDef,
  type FrameworkTableDef,
} from './frameworkContent';
import {
  buildFactLookup,
  populateFrameworkTable,
  type ManualField,
} from './trialBalanceDisclosureMapping';

export type FrameworkAssemblyContext = {
  /** Flags that switch conditional optional disclosures on. */
  conditions?: Record<string, boolean>;
};

export type OptionalDisclosureStatus = {
  code: string;
  title: string;
  conditionKey?: string;
  included: boolean;
  reason: string;
};

export type FrameworkAssemblyResult = {
  frameworkKey: FrameworkKey;
  frameworkLabel: string;
  policySets: DocPolicySetNode[];
  notes: DocNoteNode[];
  optionalDisclosures: OptionalDisclosureStatus[];
  manualFields: ManualField[];
};

export type FrameworkAssemblyInput = {
  frameworkKey: string | null | undefined;
  statements?: DocStatementNode[];
  serverNotes?: DocNoteNode[];
  serverPolicySets?: DocPolicySetNode[];
  context?: FrameworkAssemblyContext;
};

function codeKey(code: string): string {
  return String(code || '').trim().toUpperCase();
}

function noteHasBody(note: DocNoteNode): boolean {
  return (
    (note.paragraphs && note.paragraphs.length > 0) ||
    (note.sections && note.sections.length > 0) ||
    (note.tables && note.tables.length > 0)
  );
}

function buildFrameworkPolicySet(
  frameworkKey: FrameworkKey,
  serverPolicySets: DocPolicySetNode[],
): DocPolicySetNode {
  const def = getFrameworkDefinition(frameworkKey);
  const server = serverPolicySets.find((s) => (s.policies || []).length > 0) || serverPolicySets[0];
  const setId = server?.id || `fw:policyset:${frameworkKey}`;

  const existingCodes = new Set((server?.policies || []).map((p) => codeKey(p.policy_code)));
  const policies: DocPolicyNode[] = [...(server?.policies || [])];

  let sort = policies.length;
  for (const def_policy of def.policies) {
    if (existingCodes.has(codeKey(def_policy.code))) continue;
    sort += 1;
    policies.push({
      id: `fw:policy:${frameworkKey}:${def_policy.code}`,
      kind: 'policy',
      policy_set_id: setId,
      policy_code: def_policy.code,
      title: def_policy.title,
      body: def_policy.body,
      sort_order: sort,
      status: 'draft',
      source: 'framework',
    });
  }

  return {
    id: setId,
    kind: 'policySet',
    title: server?.title || 'Significant accounting policies',
    status: server?.status || 'draft',
    version_no: server?.version_no ?? 1,
    framework_pack_id: server?.framework_pack_id ?? null,
    policies,
  };
}

function buildFrameworkNote(
  frameworkKey: FrameworkKey,
  def: FrameworkNoteDef,
  sortOrder: number,
  facts: ReturnType<typeof buildFactLookup>,
  manualFields: ManualField[],
): DocNoteNode {
  const note: DocNoteNode = {
    id: `fw:note:${frameworkKey}:${def.code}`,
    kind: 'note',
    disclosure_code: def.code,
    title: def.title,
    status: 'draft',
    requirement_level: def.requirement,
    sort_order: sortOrder,
    sections: [],
    paragraphs: [],
    tables: [],
    source: 'framework',
  };

  // Narrative library — support a single narrative and/or multiple paragraphs.
  const narrativeParagraphs: string[] = [
    ...(def.narrative ? [def.narrative] : []),
    ...(def.narratives || []),
  ];
  narrativeParagraphs.forEach((body, index) => {
    note.paragraphs.push({
      id: `fw:para:${frameworkKey}:${def.code}:${index + 1}`,
      section_id: null,
      paragraph_code: `P${index + 1}`,
      body,
      sort_order: index + 1,
    });
  });

  // Table library — support a single table and/or multiple tables.
  const tableDefs: FrameworkTableDef[] = [
    ...(def.table ? [def.table] : []),
    ...(def.tables || []),
  ];
  tableDefs.forEach((tableDef, index) => {
    const suffix = index === 0 ? '' : `:${index + 1}`;
    const populated = populateFrameworkTable(
      def.code,
      tableDef,
      facts,
      `fw:table:${frameworkKey}:${def.code}${suffix}`,
      index,
    );
    note.tables.push(populated.table);
    manualFields.push(...populated.manualFields);
  });

  return note;
}

/**
 * Assemble the complete framework document (policies + notes), merging server
 * engagement content (precedence) with framework-generated standard content.
 */
export function assembleFrameworkDocument(input: FrameworkAssemblyInput): FrameworkAssemblyResult {
  const frameworkKey = normaliseFrameworkKey(input.frameworkKey);
  const def = getFrameworkDefinition(frameworkKey);
  const statements = input.statements || [];
  const serverNotes = input.serverNotes || [];
  const serverPolicySets = input.serverPolicySets || [];
  const conditions = input.context?.conditions || {};

  const facts = buildFactLookup(statements);
  const manualFields: ManualField[] = [];
  const optionalDisclosures: OptionalDisclosureStatus[] = [];

  const serverByCode = new Map<string, DocNoteNode>();
  for (const note of serverNotes) serverByCode.set(codeKey(note.disclosure_code), note);
  const consumedServer = new Set<string>();

  const notes: DocNoteNode[] = [];
  let sort = 0;

  // Core framework notes plus any active industry-specific extension notes.
  const noteDefs: FrameworkNoteDef[] = [
    ...def.notes,
    ...resolveExtensionNotes(frameworkKey, conditions),
  ];

  for (const noteDef of noteDefs) {
    sort += 10;
    const key = codeKey(noteDef.code);
    const serverNote = serverByCode.get(key);
    const isOptional = noteDef.requirement === 'optional';
    const conditionMet = noteDef.conditionKey ? conditions[noteDef.conditionKey] === true : false;

    if (isOptional) {
      const includedFromServer = Boolean(serverNote);
      const included = includedFromServer || conditionMet;
      optionalDisclosures.push({
        code: noteDef.code,
        title: noteDef.title,
        conditionKey: noteDef.conditionKey,
        included,
        reason: includedFromServer
          ? 'Included: present as an engagement disclosure.'
          : conditionMet
            ? `Included: condition '${noteDef.conditionKey}' met.`
            : `Flagged, not inserted: condition '${noteDef.conditionKey}' not met.`,
      });
      if (!included) continue;
    }

    if (serverNote) {
      consumedServer.add(key);
      // Enrich an empty engagement instance with the standard narrative/table,
      // without overriding accountant-authored content.
      if (!noteHasBody(serverNote)) {
        const enriched = buildFrameworkNote(frameworkKey, noteDef, serverNote.sort_order || sort, facts, manualFields);
        notes.push({
          ...serverNote,
          paragraphs: enriched.paragraphs.map((p) => ({ ...p, id: `${serverNote.id}:${p.paragraph_code}` })),
          tables: enriched.tables.map((t) => ({ ...t, id: `${serverNote.id}:${t.table_code}` })),
        });
      } else {
        notes.push(serverNote);
      }
    } else {
      notes.push(buildFrameworkNote(frameworkKey, noteDef, sort, facts, manualFields));
    }
  }

  // Append any additional server (company-specific) notes not defined by the framework.
  for (const note of serverNotes) {
    if (!consumedServer.has(codeKey(note.disclosure_code))) {
      sort += 10;
      notes.push({ ...note, sort_order: note.sort_order || sort });
    }
  }

  const policySets = [buildFrameworkPolicySet(frameworkKey, serverPolicySets)];

  return {
    frameworkKey,
    frameworkLabel: def.label,
    policySets,
    notes,
    optionalDisclosures,
    manualFields,
  };
}
