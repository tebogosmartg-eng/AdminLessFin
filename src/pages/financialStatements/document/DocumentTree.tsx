import { computeNoteNumbering } from '../../../lib/financialStatements/document/renumber';
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
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          'flex-1 truncate py-1.5 pr-2 text-left text-sm',
          muted && 'text-muted-foreground line-through',
          active && 'font-medium',
        )}
        title={label}
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
}: {
  model: DocumentModel;
  overrides: DocOverrides;
  selection: DocSelection;
  onSelect: (selection: DocSelection) => void;
  onToggleHidden: (nodeId: string) => void;
  onAddDisclosure?: () => void;
}) {
  const { visible } = computeNoteNumbering(model.notes, overrides);
  const numberById = new Map(visible.map((v) => [v.note.id, v.noteNumber]));
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
        label="Contents"
        active={isActive('contents', 'contents')}
        onSelect={() => onSelect({ kind: 'contents', id: 'contents' })}
      />

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
        model.notes.map((n) => {
          const hidden = isHidden(overrides, n.id) || n.status === 'superseded';
          const number = numberById.get(n.id);
          const title = resolvedTitle(overrides, n.id, n.title);
          return (
            <TreeRow
              key={n.id}
              label={number ? `Note ${number}. ${title}` : title}
              depth={1}
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
