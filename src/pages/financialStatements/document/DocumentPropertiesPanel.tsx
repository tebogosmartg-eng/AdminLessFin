import type { NoteRegister } from '../../../lib/financialStatements/document/noteRegister';
import {
  isHidden,
  resolvedTitle,
  type DocumentOverridesApi,
} from '../../../lib/financialStatements/document/documentStore';
import type {
  DocNoteNode,
  DocumentModel,
} from '../../../lib/financialStatements/document/documentModel';
import type { DocSelection } from '../experience/EngagementDocumentWorkspace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Switch } from '../../../components/ui/switch';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Hideable = { id: string; label: string };

function resolveHideable(
  model: DocumentModel,
  selection: DocSelection,
): { node: Hideable | null; kindLabel: string; note?: DocNoteNode } {
  if (selection.kind === 'statement') {
    const s = model.statements.find((x) => x.id === selection.id);
    return { node: s ? { id: s.id, label: s.title } : null, kindLabel: 'Statement' };
  }
  if (selection.kind === 'policy') {
    for (const set of model.policySets) {
      const p = set.policies.find((x) => x.id === selection.id);
      if (p) return { node: { id: p.id, label: p.title }, kindLabel: 'Accounting policy' };
    }
    return { node: null, kindLabel: 'Accounting policy' };
  }
  if (selection.kind === 'note') {
    const n = model.notes.find((x) => x.id === selection.id);
    return {
      node: n ? { id: n.id, label: n.title } : null,
      kindLabel: 'Note',
      note: n || undefined,
    };
  }
  return { node: null, kindLabel: '' };
}

export default function DocumentPropertiesPanel({
  model,
  selection,
  overridesApi,
  register,
}: {
  model: DocumentModel;
  selection: DocSelection;
  overridesApi: DocumentOverridesApi;
  /** The printed numbering — the same one the statements and the PDF use. */
  register: NoteRegister | null;
}) {
  const { overrides } = overridesApi;
  const { node, kindLabel, note } = resolveHideable(model, selection);

  if (selection.kind === 'cover' || selection.kind === 'contents' || selection.kind === 'policySet') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Properties</CardTitle>
          <CardDescription>
            {selection.kind === 'policySet'
              ? 'Select an individual policy to control its visibility.'
              : 'This section is generated automatically and is always included.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!node) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Properties</CardTitle>
          <CardDescription>Select an item in the document tree.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const superseded = note?.status === 'superseded';
  const hidden = isHidden(overrides, node.id) || superseded;

  // Reordering works on the notes as they print: swap with the neighbour the
  // reader can see, and restate the whole order as one change.
  const orderedIds = (register?.notes ?? []).map((n) => n.id);
  const currentIndex = note ? orderedIds.indexOf(note.id) : -1;
  const printedNumber = note ? register?.byId.get(note.id)?.noteNumber : undefined;
  const withheld = note ? register?.withheld.get(note.id) : undefined;

  const applyOrder = (ids: string[]) => {
    overridesApi.setOrders(Object.fromEntries(ids.map((id, idx) => [id, idx])));
  };

  const move = (direction: -1 | 1) => {
    if (currentIndex < 0) return;
    const target = currentIndex + direction;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[currentIndex], next[target]] = [next[target], next[currentIndex]];
    applyOrder(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Properties</CardTitle>
        <CardDescription>
          {kindLabel}: {resolvedTitle(overrides, node.id, node.label)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <Label className="text-sm">Include in preview &amp; PDF</Label>
            <p className="text-xs text-muted-foreground">
              {hidden ? 'Currently hidden' : 'Currently shown'}
            </p>
          </div>
          <Switch
            checked={!hidden}
            disabled={superseded}
            onCheckedChange={(checked) => overridesApi.setHidden(node.id, !checked)}
          />
        </div>

        {note && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{note.status}</Badge>
              <Badge variant="secondary">{note.requirement_level}</Badge>
              {printedNumber != null && (
                <span className="text-muted-foreground" data-testid="afs-properties-note-number">
                  Note {printedNumber}
                </span>
              )}
            </div>
            {withheld && !hidden && (
              <p className="text-xs text-muted-foreground">Not printed: {withheld}</p>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Order</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => move(-1)}
                  disabled={currentIndex <= 0}
                >
                  <ChevronUp className="mr-1 h-4 w-4" />
                  Move up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => move(1)}
                  disabled={currentIndex < 0 || currentIndex >= orderedIds.length - 1}
                >
                  <ChevronDown className="mr-1 h-4 w-4" />
                  Move down
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Notes are renumbered automatically after reordering.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label className="text-sm">Start on a new page</Label>
                <p className="text-xs text-muted-foreground">
                  Otherwise the note follows on, and moves to the next page by itself only when it
                  would not fit.
                </p>
              </div>
              <Switch
                data-testid="afs-page-break"
                checked={!!overrides.pageBreaks?.[note.id]}
                onCheckedChange={(checked) => overridesApi.setPageBreak(note.id, checked)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
