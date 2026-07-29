import { ArrowLeft } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import type { MasterDataModuleId } from '../../../../lib/financialStatements/masterData';
import { MASTER_DATA_MODULE_LABELS } from '../../../../lib/financialStatements/masterData';

export function MasterDataModuleShell({
  moduleId,
  onBack,
  onSave,
  saving,
  backLabel = 'Back to Information Workspace',
  children,
}: {
  moduleId: MasterDataModuleId;
  onBack: () => void;
  onSave: () => void;
  saving?: boolean;
  /** Host-context back affordance (Settings vs FS Information Workspace). */
  backLabel?: string;
  children: React.ReactNode;
}) {
  const meta = MASTER_DATA_MODULE_LABELS[moduleId];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
