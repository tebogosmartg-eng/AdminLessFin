import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Upload, PencilLine, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { coaTemplatesQuery } from '../../lib/queries';
import { showError, showSuccess } from '../../utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface TemplateCatalogEntry {
  key: string;
  name: string;
  description: string;
  framework: string;
  region: string;
  recommended: boolean;
  accountCount: number;
}

interface CoaOnboardingProps {
  /** Opens the existing manual account form. */
  onCreateManually: () => void;
}

/**
 * Chart of Accounts onboarding — shown when the active company has no accounts.
 * Every company requires a Chart of Accounts; this is the guided entry point.
 * Generating the standard chart is the recommended (default) path.
 */
const CoaOnboarding = ({ onCreateManually }: CoaOnboardingProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: templates } = useQuery<TemplateCatalogEntry[]>({
    ...coaTemplatesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const standard =
    templates?.find((t) => t.recommended) ?? templates?.[0];

  const generateMutation = useMutation({
    mutationFn: async (templateKey: string) => {
      if (!activeCompany) throw new Error('No active company selected');
      const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
        body: { method: 'GENERATE', company_id: activeCompany.id, templateKey },
      });
      if (error) throw new Error(error.message);
      return data as { generated: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      showSuccess(`Generated ${result?.generated ?? ''} accounts. Your Chart of Accounts is ready.`);
    },
    onError: (error) => showError(`Could not generate the Chart of Accounts: ${error.message}`),
  });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome to AdminLess Fin</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Every company requires a Chart of Accounts — it is the single source of
          truth every accounting module builds on. Choose how you want to start.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {/* Recommended — Generate Standard */}
        <div className="flex flex-col rounded-lg border border-primary/40 bg-primary/5 p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-semibold">Generate Standard</h3>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              Recommended
            </span>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">
            {standard
              ? `${standard.description}`
              : 'A professionally structured chart, ready to use immediately.'}
          </p>
          {standard && (
            <p className="mt-2 text-xs text-muted-foreground">
              {standard.framework} · {standard.accountCount} accounts
            </p>
          )}
          <Button
            className="mt-4"
            disabled={!standard || generateMutation.isPending}
            onClick={() => standard && generateMutation.mutate(standard.key)}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Generate Standard
              </>
            )}
          </Button>
        </div>

        {/* Import */}
        <div className="flex flex-col rounded-lg border p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Upload className="h-5 w-5" />
          </div>
          <h3 className="mb-1 font-semibold">Import Existing</h3>
          <p className="flex-1 text-sm text-muted-foreground">
            Bring your chart in from a spreadsheet or another accounting system
            (CSV, Excel, Sage, Pastel, Xero, QuickBooks).
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/import')}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
        </div>

        {/* Manual */}
        <div className="flex flex-col rounded-lg border p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PencilLine className="h-5 w-5" />
          </div>
          <h3 className="mb-1 font-semibold">Create Manually</h3>
          <p className="flex-1 text-sm text-muted-foreground">
            Build your chart account by account. Best if you have a small,
            bespoke structure in mind.
          </p>
          <Button variant="outline" className="mt-4" onClick={onCreateManually}>
            <PencilLine className="mr-2 h-4 w-4" /> Add First Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CoaOnboarding;
