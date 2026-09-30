import type { NoteRegister } from '../../../lib/financialStatements/document/noteRegister';
import {
  isHidden,
  resolvedTitle,
  type DocOverrides,
} from '../../../lib/financialStatements/document/documentStore';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import { professionalStatementTitle } from '../../../lib/financialStatements/publication/afsProfessionalPdf';
import type { DocSelection } from '../experience/EngagementDocumentWorkspace';
import { cn } from '../../../lib/utils';
import { Eye, EyeOff, Plus } from 'lucide-react';

function TreeRow({
  label,
  depth = 0,
  active,
  muted,
  badge,
  hideable,
  hidden,
  testId,
  noteNumber,
  title,
  onSelect,
  onToggleHidden,
}: {
  label: string;
  depth?: number;
  active?: boolean;
  muted?: boolean;
  badge?: string;
  hideable?: boolean;
  hidden?: boolean;
  /** Names the kind of row, so a test can tell a note from a policy of the same title. */
  testId?: string;
  /** The number the note prints with, for a note that is printed. */
  noteNumber?: number;
  /** Why the row reads as it does, where the label alone does not say. */
  title?: string;
  onSelect: () => void;
  onToggleHidden?: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md pr-1',
        active ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        data-testid={testId}
        data-note-number={noteNumber}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          'flex-1 truncate py-1.5 pr-2 text-left text-sm',
          muted && 'text-muted-foreground line-through',
          active && 'font-medium',
        )}
        title={title || label}
      >
        {label}
        {badge ? <span className="ml-2 text-xs text-muted-foreground">{badge}</span> : null}
      </button>
      {hideable && onToggleHidden ? (
        <button
          type="button"
          onClick={onToggleHidden}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
          title={hidden ? 'Show in preview / PDF' : 'Hide from preview / PDF'}
          aria-label={hidden ? 'Show section' : 'Hide section'}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export default function DocumentTree({
  model,
  overrides,
  selection,
  onSelect,
  onToggleHidden,
  onAddDisclosure,
  register,
  frontMatter,
}: {
  model: DocumentModel;
  overrides: DocOverrides;
  /** The narrative front matter as it will print, for titles and edit state. */
  frontMatter?: import('../../../lib/financialStatements/publication/canonicalDocumentView').CanonicalFrontMatter | null;
  /** The printed numbering — the same one the statements and the PDF use. */
  register: NoteRegister | null;
  selection: DocSelection;
  onSelect: (selection: DocSelection) => void;
  onToggleHidden: (nodeId: string) => void;
  onAddDisclosure?: () => void;
}) {
  // Notes are listed in the order they print, each with the number it prints
  // with. Notes that do not print follow, unnumbered, in their own order.
  const printed = register?.notes ?? [];
  const numberById = new Map(printed.map((n) => [n.id, n.noteNumber]));
  const position = new Map(printed.map((n, i) => [n.id, i]));
  const notes = [...model.notes].sort(
    (a, b) =>
      (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const isActive = (kind: string, id: string) =>
    (selection as { kind: string; id: string }).kind === kind && selection.id === id;

  return (
    <nav aria-label="Document structure" className="max-h-[70vh] overflow-y-auto p-2">
      <TreeRow
        label="Cover"
        active={isActive('cover', 'cover')}
        onSelect={() => onSelect({ kind: 'cover', id: 'cover' })}
      />
      <TreeRow
        label="General Information"
        active={isActive('information', 'information')}
        onSelect={() => onSelect({ kind: 'information', id: 'information' })}
      />
      <TreeRow
        label="Contents"
        active={isActive('contents', 'contents')}
        onSelect={() => onSelect({ kind: 'contents', id: 'contents' })}
      />

      <GroupLabel>Reports</GroupLabel>
      {[
        {
          id: 'front:directors_responsibilities',
          label: frontMatter?.responsibilities.title ?? "Directors' Responsibilities and Approval",
          authored: frontMatter?.responsibilities.authored,
        },
        {
          id: 'front:directors_report',
          label: frontMatter?.directorsReport.title ?? "Directors' Report",
          authored: frontMatter?.directorsReport.authored,
        },
        {
          id: 'front:independent_auditor',
          label: frontMatter?.practitionerReport.title ?? "Independent Auditor's Report",
          authored: frontMatter?.practitionerReport.authored,
        },
      ].map((row) => (
        <TreeRow
          key={row.id}
          label={row.label}
          badge={row.authored ? 'edited' : undefined}
          active={isActive('front', row.id)}
          onSelect={() => onSelect({ kind: 'front', id: row.id })}
        />
      ))}

      <GroupLabel>Statements</GroupLabel>
      {model.statements.map((s) => {
        const hidden = isHidden(overrides, s.id);
        const title = professionalStatementTitle(
          s.statement_type,
          resolvedTitle(overrides, s.id, s.title),
        );
        return (
          <TreeRow
            key={s.id}
            label={title}
            depth={1}
            active={isActive('statement', s.id)}
            muted={hidden}
            badge={s.populated ? undefined : 'empty'}
            hideable
            hidden={hidden}
            onSelect={() => onSelect({ kind: 'statement', id: s.id })}
            onToggleHidden={() => onToggleHidden(s.id)}
          />
        );
      })}

      <GroupLabel>Accounting Policies</GroupLabel>
      {model.policySets.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No policy set yet.</p>
      ) : (
        model.policySets.map((set) => (
          <div key={set.id}>
            <TreeRow
              label={set.title}
              depth={1}
              active={isActive('policySet', set.id)}
              onSelect={() => onSelect({ kind: 'policySet', id: set.id })}
            />
            {set.policies.map((p) => {
              const hidden = isHidden(overrides, p.id);
              return (
                <TreeRow
                  key={p.id}
                  label={resolvedTitle(overrides, p.id, p.title)}
                  depth={2}
                  active={isActive('policy', p.id)}
                  muted={hidden}
                  hideable
                  hidden={hidden}
                  onSelect={() => onSelect({ kind: 'policy', id: p.id })}
                  onToggleHidden={() => onToggleHidden(p.id)}
                />
              );
            })}
          </div>
        ))
      )}

      <div className="flex items-center justify-between pr-1">
        <GroupLabel>Notes &amp; Disclosures</GroupLabel>
        {onAddDisclosure ? (
          <button
            type="button"
            onClick={onAddDisclosure}
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Add company-specific disclosure"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        ) : null}
      </div>
      {model.notes.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No notes yet.</p>
      ) : (
        notes.map((n) => {
          const hidden = isHidden(overrides, n.id) || n.status === 'superseded';
          const number = numberById.get(n.id);
          const title = resolvedTitle(overrides, n.id, n.title);
          // Left out by the reporting engine, not by the preparer, and the
          // engine's own reason says why.
          const withheld = !number && !hidden ? register?.withheld.get(n.id) : undefined;
          return (
            <TreeRow
              key={n.id}
              label={number ? `Note ${number}. ${title}` : title}
              depth={1}
              testId="afs-tree-note"
              noteNumber={number}
              badge={withheld ? 'not printed' : undefined}
              title={withheld ? `${title} — not printed: ${withheld}` : undefined}
              active={isActive('note', n.id)}
              muted={hidden}
              hideable={n.status !== 'superseded'}
              hidden={hidden}
              onSelect={() => onSelect({ kind: 'note', id: n.id })}
              onToggleHidden={() => onToggleHidden(n.id)}
            />
          );
        })
      )}

      <GroupLabel>Signatures</GroupLabel>
      {(model.signatures || []).map((sig) => (
        <TreeRow
          key={sig.id}
          label={sig.label}
          depth={1}
          active={isActive('signature', sig.id)}
          badge={sig.complete ? undefined : 'pending'}
          onSelect={() => onSelect({ kind: 'signature', id: sig.id })}
        />
      ))}
    </nav>
  );
}
