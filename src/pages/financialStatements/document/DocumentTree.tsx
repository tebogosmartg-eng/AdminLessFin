import type { NoteRegister } from '../../../lib/financialStatements/document/noteRegister';
import {
  flipChoice,
  includeChoice,
  isHidden,
  isPolicyPrinted,
  resolvedTitle,
  type DocOverrides,
  type IncludeKind,
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
          title={hidden ? 'Switch on: print in the AFS' : 'Switch off: leave out of the AFS'}
          aria-label={hidden ? 'Switch on' : 'Switch off'}
          data-testid={testId ? `${testId}-switch` : undefined}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-muted-foreground" data-testid="afs-tree-available">
      {children}
    </p>
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
  onSetIncluded,
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
  /** Switch a note, policy, schedule or front section on or off. */
  onSetIncluded?: (kind: IncludeKind, code: string, printed: boolean | null, nodeId?: string) => void;
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
      ].map((row) => {
        const off = includeChoice(overrides, 'section', row.id) === false;
        return (
          <TreeRow
            key={row.id}
            label={row.label}
            testId="afs-tree-front"
            badge={off ? 'off' : row.authored ? 'edited' : undefined}
            active={isActive('front', row.id)}
            muted={off}
            hideable={!!onSetIncluded}
            hidden={off}
            onSelect={() => onSelect({ kind: 'front', id: row.id })}
            onToggleHidden={() => onSetIncluded?.('section', row.id, off ? null : false)}
          />
        );
      })}

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
            {[...set.policies]
              .filter((p) => p.status !== 'superseded')
              .sort((a, b) => Number(isPolicyPrinted(overrides, b)) - Number(isPolicyPrinted(overrides, a)))
              .map((p, i, all) => {
                const printed = isPolicyPrinted(overrides, p);
                const firstOff = !printed && (i === 0 || isPolicyPrinted(overrides, all[i - 1]));
                const choice = includeChoice(overrides, 'policy', p.policy_code);
                const why =
                  choice === false || (choice == null && isHidden(overrides, p.id))
                    ? 'Switched off by you'
                    : p.applies === false && choice !== true
                      ? p.applicability
                      : undefined;
                return (
                  <div key={p.id}>
                    {firstOff ? <SubLabel>Available, not printed</SubLabel> : null}
                    <TreeRow
                      label={resolvedTitle(overrides, p.id, p.title)}
                      depth={2}
                      testId="afs-tree-policy"
                      active={isActive('policy', p.id)}
                      muted={!printed}
                      badge={!printed ? 'off' : choice === true && p.applies === false ? 'on' : undefined}
                      title={why ? `${p.title} - ${why}` : undefined}
                      hideable
                      hidden={!printed}
                      onSelect={() => onSelect({ kind: 'policy', id: p.id })}
                      onToggleHidden={() =>
                        onSetIncluded
                          ? onSetIncluded('policy', p.policy_code, flipChoice(overrides, 'policy', p.policy_code, printed, p.id), p.id)
                          : onToggleHidden(p.id)
                      }
                    />
                  </div>
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
        notes.map((n, i) => {
          const superseded = n.status === 'superseded';
          const number = numberById.get(n.id);
          const printed = number != null;
          const firstOff = !printed && (i === 0 || numberById.get(notes[i - 1].id) != null);
          const title = resolvedTitle(overrides, n.id, n.title);
          const choice = includeChoice(overrides, 'note', n.disclosure_code);
          // Why it is not printed: the preparer's switch, or the engine's own
          // reason, which the preparer can overrule by switching it on.
          const why = printed
            ? undefined
            : choice === false || (choice == null && isHidden(overrides, n.id))
              ? 'Switched off by you'
              : superseded
                ? 'Superseded'
                : register?.withheld.get(n.id);
          return (
            <div key={n.id}>
              {firstOff ? <SubLabel>Available, not printed</SubLabel> : null}
              <TreeRow
                label={number ? `Note ${number}. ${title}` : title}
                depth={1}
                testId="afs-tree-note"
                noteNumber={number}
                badge={!printed ? 'off' : choice === true ? 'on' : undefined}
                title={why ? `${title} - not printed: ${why}` : undefined}
                active={isActive('note', n.id)}
                muted={!printed}
                hideable={!superseded}
                hidden={!printed}
                onSelect={() => onSelect({ kind: 'note', id: n.id })}
                onToggleHidden={() =>
                  onSetIncluded
                    ? onSetIncluded('note', n.disclosure_code, flipChoice(overrides, 'note', n.disclosure_code, printed, n.id), n.id)
                    : onToggleHidden(n.id)
                }
              />
            </div>
          );
        })
      )}

      {model.detailedIncomeStatement ? (
        <>
          <GroupLabel>Supplementary Information</GroupLabel>
          {(() => {
            const s = model.detailedIncomeStatement!;
            const off = includeChoice(overrides, 'schedule', s.id) === false;
            return (
              <TreeRow
                label={resolvedTitle(overrides, s.id, s.title)}
                depth={1}
                testId="afs-tree-schedule"
                active={isActive('schedule', s.id)}
                muted={off}
                badge={off ? 'off' : undefined}
                hideable={!!onSetIncluded}
                hidden={off}
                onSelect={() => onSelect({ kind: 'schedule', id: s.id })}
                onToggleHidden={() => onSetIncluded?.('schedule', s.id, off ? null : false)}
              />
            );
          })()}
        </>
      ) : null}

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
