import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Repeat } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { useAuth } from '../contexts/AuthContext';
import {
  invokeImport,
  stageImport,
  type EntitySpec,
  type EntityType,
  type ImportRun,
  type OutcomeCounts,
} from '../imports/api';
import { autoMapColumns, missingRequired } from '../imports/autoMap';
import { ImportHistory } from '../imports/components/ImportHistory';
import { MappingStep } from '../imports/components/MappingStep';
import { ResultStep } from '../imports/components/ResultStep';
import { ReviewStep } from '../imports/components/ReviewStep';
import { TypePicker } from '../imports/components/TypePicker';
import { UploadStep } from '../imports/components/UploadStep';
import type { ParsedFile } from '../imports/parseFile';
import { importKeys, useImportHistory, useImportReferences, useImportSpec } from '../imports/queries';

type Step = 'upload' | 'map' | 'review' | 'result';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Match columns' },
  { id: 'review', label: 'Review' },
  { id: 'result', label: 'Import' },
];

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex(s => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={i === index ? 'step' : undefined}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
            i < index ? 'bg-primary text-primary-foreground' : i === index ? 'border-2 border-primary text-primary' : 'border text-muted-foreground'
          }`}>
            {i < index ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={i === index ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

const Import = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const spec = useImportSpec(companyId);
  const references = useImportReferences(companyId);
  const history = useImportHistory(companyId);

  const [entity, setEntity] = useState<EntityType | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [run, setRun] = useState<ImportRun | null>(null);
  const [runDirty, setRunDirty] = useState(false);
  const [counts, setCounts] = useState<OutcomeCounts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const currentSpec: EntitySpec | null = entity && spec.data ? spec.data.entities[entity] : null;

  const reset = useCallback(() => {
    cancelled.current = true;
    setEntity(null);
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping({});
    setOptions({});
    setRun(null);
    setRunDirty(false);
    setCounts(null);
    setBusy(null);
    setError(null);
    setFileWarning(null);
    setImporting(false);
    setImportError(null);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromSwitch = searchParams.get('from') === 'switch';
  const [mappingNote, setMappingNote] = useState<string | null>(null);

  // A company switch starts over: a run belongs to exactly one company.
  const lastCompany = useRef(companyId);
  useEffect(() => {
    if (lastCompany.current !== undefined && lastCompany.current !== companyId) reset();
    lastCompany.current = companyId;
  }, [companyId, reset]);
  useEffect(() => () => { cancelled.current = true; }, []);

  // Deep link from the switch checklist: /import?type=invoices&from=switch
  useEffect(() => {
    const type = searchParams.get('type') as EntityType | null;
    if (!type || !spec.data?.entities[type] || entity) return;
    cancelled.current = false;
    setEntity(type);
    const asAt = searchParams.get('as_at');
    setOptions(type === 'opening_balances' && asAt ? { as_at_date: asAt } : {});
  }, [searchParams, spec.data, entity]);

  const leaveWizard = () => {
    reset();
    if (fromSwitch) navigate('/import/switch');
    else if (searchParams.get('type')) setSearchParams({});
  };

  const pick = (next: EntityType) => {
    reset();
    cancelled.current = false;
    setEntity(next);
    setOptions({});
  };

  const handleParsed = (f: File, p: ParsedFile) => {
    if (!currentSpec) return;
    if (run && run.status !== 'committed') {
      void invokeImport(companyId!, 'CANCEL_RUN', { run_id: run.id }).catch(() => undefined);
    }
    setFile(f);
    setParsed(p);
    setRun(null);
    // A file laid out like one imported before gets the same column choices.
    const known = new Set(currentSpec.fields.map(field => field.key));
    const previous = (history.data?.runs ?? []).find(r =>
      r.entity_type === entity && r.status === 'committed' && r.mapping &&
      Object.keys(r.mapping).length > 0 &&
      Object.entries(r.mapping).every(([key, header]) => known.has(key) && p.headers.includes(header)));
    if (previous) {
      setMapping({ ...previous.mapping });
      setMappingNote(`Using your column choices from ${previous.file_name ?? 'your last import'}.`);
    } else {
      setMapping(autoMapColumns(p.headers, currentSpec.fields));
      setMappingNote(null);
    }
    setError(null);
    setStep('map');
  };

  const updateOptions = (next: Record<string, unknown>) => {
    setOptions(next);
    if (run) setRunDirty(true);
  };
  const updateMapping = (next: Record<string, string>) => {
    setMapping(next);
    if (run) setRunDirty(true);
  };

  /** Stage (first time) or re-apply settings, then validate on the server. */
  const check = async () => {
    if (!companyId || !entity || !currentSpec) return;
    setError(null);
    try {
      let current = run;
      if (!current) {
        if (!file || !parsed) throw new Error('Choose a file first.');
        setBusy('Uploading your file…');
        const staged = await stageImport(companyId, entity, file, parsed, mapping, options,
          (done, total) => setBusy(`Uploading your file… ${Math.round((done / total) * 100)}%`));
        current = staged.run;
        setFileWarning(staged.fileWarning);
      } else if (runDirty || current.status !== 'validated') {
        setBusy('Saving your choices…');
        current = (await invokeImport<{ run: ImportRun }>(companyId, 'SET_OPTIONS', {
          run_id: current.id, mapping, options,
        })).run;
      }
      setRun(current);
      setRunDirty(false);
      setBusy('Checking every row…');
      const validated = await invokeImport<{ run: ImportRun }>(companyId, 'VALIDATE', { run_id: current.id });
      setRun(validated.run);
      setStep('review');
      void queryClient.invalidateQueries({ queryKey: importKeys.history(companyId) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const commitLoop = useCallback(async (target: ImportRun) => {
    if (!companyId) return;
    cancelled.current = false;
    setImporting(true);
    setImportError(null);
    setStep('result');
    try {
      for (;;) {
        const result = await invokeImport<{ status: 'committed' | 'continuing'; counts: OutcomeCounts }>(
          companyId, 'COMMIT', { run_id: target.id });
        setCounts(result.counts);
        if (result.status === 'committed' || cancelled.current) break;
      }
      const fresh = await invokeImport<{ run: ImportRun; counts: OutcomeCounts | null }>(companyId, 'GET_RUN', { run_id: target.id });
      setRun(fresh.run);
      if (fresh.counts) setCounts(fresh.counts);
      // Imported records appear everywhere else in the app. The history is
      // dropped rather than marked stale, so it never shows the pre-import row.
      queryClient.removeQueries({ queryKey: importKeys.history(companyId) });
      void queryClient.invalidateQueries();
    } catch (e) {
      setImportError((e as Error).message);
      try {
        const fresh = await invokeImport<{ run: ImportRun; counts: OutcomeCounts | null }>(companyId, 'GET_RUN', { run_id: target.id });
        setRun(fresh.run);
        if (fresh.counts) setCounts(fresh.counts);
      } catch { /* the error above is what the user needs */ }
    } finally {
      setImporting(false);
    }
  }, [companyId, queryClient]);

  const startImport = async () => {
    if (!companyId || !run) return;
    setError(null);
    try {
      let target = run;
      if ((options.skip_invalid === true) !== (run.options?.skip_invalid === true)) {
        setBusy('Saving your choices…');
        await invokeImport(companyId, 'SET_OPTIONS', { run_id: run.id, options: { skip_invalid: options.skip_invalid === true } });
        setBusy('Checking every row…');
        target = (await invokeImport<{ run: ImportRun }>(companyId, 'VALIDATE', { run_id: run.id })).run;
        setRun(target);
        setBusy(null);
      }
      await commitLoop(target);
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  };

  const openRun = async (r: ImportRun) => {
    if (!companyId) return;
    reset();
    cancelled.current = false;
    setEntity(r.entity_type);
    try {
      const fresh = await invokeImport<{ run: ImportRun; counts: OutcomeCounts | null }>(companyId, 'GET_RUN', { run_id: r.id });
      setRun(fresh.run);
      setCounts(fresh.counts);
      setMapping(fresh.run.mapping ?? {});
      setOptions(fresh.run.options ?? {});
      if (['committed', 'committing'].includes(fresh.run.status)) setStep('result');
      else if (fresh.run.status === 'validated') setStep('review');
      else setStep('upload');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!companyId) {
    return <p className="text-muted-foreground">Choose a company to import into.</p>;
  }

  // ── Landing: what to import + history ─────────────────────────────────────
  if (!entity) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Import data</h1>
          <p className="text-muted-foreground">
            Bring in lists and transactions from a spreadsheet or another accounting system. Every file is checked before anything is saved.
          </p>
        </div>
        <Link
          to="/import/switch"
          className="flex items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary"
          data-testid="switch-entry"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Repeat className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-medium">Moving from Sage, Xero or QuickBooks?</span>
            <span className="block text-sm text-muted-foreground">Follow the switch checklist: each step in the right order, then a check that every balance matches your old system.</span>
          </span>
          <ArrowRight className="h-4 w-4 text-primary" aria-hidden />
        </Link>
        {spec.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : spec.error ? (
          <Alert variant="destructive"><AlertDescription>{(spec.error as Error).message}</AlertDescription></Alert>
        ) : spec.data ? (
          <TypePicker specs={spec.data.entities} onPick={pick} />
        ) : null}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Import history</h2>
          <ImportHistory runs={history.data?.runs} loading={history.isLoading} error={history.error as Error | null} onOpen={r => void openRun(r)} />
        </section>
      </div>
    );
  }

  if (!currentSpec) return <Skeleton className="h-64 w-full" />;

  const missing = missingRequired(mapping, currentSpec.fields);
  const settingsMissing =
    (entity === 'bank_transactions' && !options.bank_account_id) ||
    (entity === 'opening_balances' && !options.as_at_date);
  const t = run?.totals ?? {};
  const runBlocked = (t.run_issues ?? []).some(i => i.severity === 'error');
  const rowErrors = t.errors ?? 0;
  const canImport = run?.status === 'validated' && !runBlocked && (rowErrors === 0 || options.skip_invalid === true) && (t.valid ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={leaveWizard} disabled={importing}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> {fromSwitch ? 'Switch checklist' : 'All imports'}
        </Button>
        <h1 className="text-3xl font-bold">Import {currentSpec.label.toLowerCase()}</h1>
        <Stepper current={step} />
      </div>

      {fileWarning && step !== 'result' && <Alert><AlertDescription>{fileWarning}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {step === 'upload' && (
        <UploadStep
          spec={currentSpec}
          references={references.data}
          options={options}
          onOptionsChange={updateOptions}
          onParsed={handleParsed}
          blockedReason={settingsMissing
            ? (entity === 'bank_transactions' ? 'Choose the bank account above first.' : 'Choose the date of the balances above first.')
            : null}
        />
      )}

      {step === 'map' && mappingNote && <p className="text-sm text-muted-foreground">{mappingNote}</p>}
      {step === 'map' && parsed && (
        <MappingStep
          spec={currentSpec}
          parsed={parsed}
          mapping={mapping}
          onMappingChange={updateMapping}
          options={options}
          onOptionsChange={updateOptions}
        />
      )}

      {step === 'review' && run && (
        <ReviewStep
          companyId={companyId}
          run={run}
          spec={currentSpec}
          skipInvalid={options.skip_invalid === true}
          onSkipInvalidChange={v => setOptions(o => ({ ...o, skip_invalid: v }))}
        />
      )}

      {step === 'result' && run && (
        <ResultStep
          companyId={companyId}
          run={run}
          spec={currentSpec}
          counts={counts}
          importing={importing}
          importError={importError}
          onResume={() => void commitLoop(run)}
        />
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          {step === 'map' && <Button variant="outline" onClick={() => setStep('upload')} disabled={!!busy}>Back</Button>}
          {step === 'review' && parsed && <Button variant="outline" onClick={() => setStep('map')} disabled={!!busy}>Back to columns</Button>}
          {step === 'review' && !parsed && <Button variant="outline" onClick={() => { const e = entity; reset(); setEntity(e); }} disabled={!!busy}>Upload a new file</Button>}
          {step === 'result' && !importing && run?.status === 'committed' && (
            <Button variant="outline" onClick={() => { const e = entity; reset(); setEntity(e); }}>Import another file</Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {busy && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{busy}</span>}
          {step === 'map' && (
            <Button onClick={() => void check()} disabled={!!busy || missing.length > 0 || settingsMissing} data-testid="import-check">
              Check the file
            </Button>
          )}
          {step === 'review' && run && (
            <Button onClick={() => void startImport()} disabled={!!busy || !canImport} data-testid="import-commit">
              Import {(t.valid ?? 0).toLocaleString()} {(t.valid ?? 0) === 1 ? 'row' : 'rows'}
            </Button>
          )}
          {step === 'result' && run?.status === 'committed' && (
            <Button onClick={leaveWizard}>{fromSwitch ? 'Back to the checklist' : 'Done'}</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Import;
