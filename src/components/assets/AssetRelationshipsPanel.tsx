import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Trash2 } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { fixedAssetsQuery } from '../../lib/queries';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { EmptyState } from '../EmptyState';
import { showError, showSuccess } from '../../utils/toast';
import type { AssetRelationshipType } from '../../lib/assets/lifecycleTypes';

export type RelationshipRow = {
  id: string;
  relationship_type: string;
  notes?: string | null;
  parent_asset_id?: string;
  child_asset_id?: string;
  child?: { id: string; asset_code: string; description: string; status: string } | null;
  parent?: { id: string; asset_code: string; description: string; status: string } | null;
};

type Props = {
  assetId: string;
  relationships: { children: RelationshipRow[]; parents: RelationshipRow[] };
  onChanged: () => void;
};

const REL_TYPES: AssetRelationshipType[] = [
  'parent_child',
  'component',
  'dependency',
  'trailer',
  'related',
];

const AssetRelationshipsPanel = ({ assetId, relationships, onChanged }: Props) => {
  const { activeCompany } = useAuth();
  const [childId, setChildId] = useState('');
  const [relType, setRelType] = useState<AssetRelationshipType>('parent_child');
  const [notes, setNotes] = useState('');

  const { data: assets } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const options = useMemo(() => {
    const linked = new Set([
      ...(relationships.children || []).map((r) => r.child_asset_id || r.child?.id),
      ...(relationships.parents || []).map((r) => r.parent_asset_id || r.parent?.id),
      assetId,
    ]);
    return ((assets as { id: string; asset_code: string; description: string }[]) || []).filter(
      (a) => !linked.has(a.id)
    );
  }, [assets, relationships, assetId]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!childId) throw new Error('Select a child asset');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'ADD_RELATIONSHIP',
          company_id: activeCompany.id,
          parent_asset_id: assetId,
          child_asset_id: childId,
          relationship_type: relType,
          notes: notes.trim() || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Relationship linked.');
      setChildId('');
      setNotes('');
      onChanged();
    },
    onError: (e: Error) => showError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (relationshipId: string) => {
      if (!activeCompany) throw new Error('No company');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'DELETE_RELATIONSHIP',
          company_id: activeCompany.id,
          relationshipId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Relationship removed.');
      onChanged();
    },
    onError: (e: Error) => showError(e.message),
  });

  const children = relationships.children || [];
  const parents = relationships.parents || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add relationship</CardTitle>
          <CardDescription>Link this asset as parent to another register asset.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label>Child asset</Label>
            <Select value={childId} onValueChange={setChildId}>
              <SelectTrigger>
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                {options.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.asset_code} — {a.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={relType} onValueChange={(v) => setRelType(v as AssetRelationshipType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !childId}>
              <Link className="mr-1.5 h-3.5 w-3.5" />
              Add relationship
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Children</CardTitle>
            <CardDescription>Assets where this is the parent</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {children.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="p-0">
                      <EmptyState icon={Link} title="No child links" description="" />
                    </TableCell>
                  </TableRow>
                ) : (
                  children.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-mono text-sm">{r.child?.asset_code}</div>
                        <div className="text-xs text-muted-foreground">{r.child?.description}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {(r.relationship_type || '').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => deleteMutation.mutate(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Parents</CardTitle>
            <CardDescription>Assets that list this as a child</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="p-0">
                      <EmptyState icon={Link} title="No parent links" description="" />
                    </TableCell>
                  </TableRow>
                ) : (
                  parents.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-mono text-sm">{r.parent?.asset_code}</div>
                        <div className="text-xs text-muted-foreground">{r.parent?.description}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {(r.relationship_type || '').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => deleteMutation.mutate(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssetRelationshipsPanel;
