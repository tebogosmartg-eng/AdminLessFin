import { computeNoteNumbering } from '../../../lib/financialStatements/document/renumber';
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
}: {
  model: DocumentModel;
  selection: DocSelection;
  overridesApi: DocumentOverridesApi;
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

  // Reorder support for notes: reindex the visible notes and swap neighbours.
  const { visible } = computeNoteNumbering(model.notes, overrides);
  const orderedIds = visible.map((v) => v.note.id);
  const currentIndex = note ? orderedIds.indexOf(note.id) : -1;

  const applyOrder = (ids: string[]) => {
    ids.forEach((id, idx) => overridesApi.setOrder(id, idx));
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
              {currentIndex >= 0 && <span className="text-muted-foreground">Note {currentIndex + 1}</span>}
            </div>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
