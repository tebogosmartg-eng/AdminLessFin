import { useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { draftKey, useFormPersistence } from '../../hooks/useFormPersistence';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { Input } from '../../components/ui/input';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Progress } from '../../components/ui/progress';
import { invokeCompliance } from '../api';
import { complianceKeys, useComplianceOverview } from '../queries';
import { formatDate } from '../labels';
import {
  ACTIVITY_QUESTIONS,
  ENTITY_TYPE_OPTIONS,
  questionnaireSchema,
  STEPS,
  VAT_FREQUENCY_OPTIONS,
  VAT_STATUS_OPTIONS,
  type QuestionnaireStep,
  type QuestionnaireValues,
} from '../questionnaire';
import type { ComplianceOverview } from '../types';

const STEP_FIELDS: Record<QuestionnaireStep, Array<keyof QuestionnaireValues>> = {
  business: ['entity_type', 'incorporation_date', 'industry_code'],
  activities: [
    'activity_transport',
    'activity_food',
    'activity_security',
    'activity_construction',
    'activity_childcare',
    'processes_personal_information',
  ],
  registrations: ['has_premises', 'vat_status', 'vat_filing_frequency', 'has_employees', 'employee_count'],
};

function YesNo({ control, name, label, description }: {
  control: Control<QuestionnaireValues>;
  name: keyof QuestionnaireValues;
  label: string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-2">
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <RadioGroup
              className="flex gap-6"
              value={field.value === true ? 'yes' : field.value === false ? 'no' : ''}
              onValueChange={(v) => field.onChange(v === 'yes')}
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="yes" /> Yes
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="no" /> No
              </label>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OnFileRow({ label, value, module }: { label: string; value: string | null; module: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        {value ? <span className="font-medium">{value}</span> : <span className="text-muted-foreground">Not on file</span>}{' '}
        <Link className="ml-1 text-xs text-primary underline-offset-2 hover:underline" to={`/settings?tab=master-data&module=${module}`}>
          {value ? 'Change' : 'Add'}
        </Link>
      </span>
    </div>
  );
}

function OnFilePanel({ data }: { data: ComplianceOverview }) {
  const f = data.on_file;
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Already on file</CardTitle>
        <CardDescription>
          Taken from your records, so you are not asked again. Compliance never changes these; edit them in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <OnFileRow label="Registration number" value={f.registration_number} module="company_profile" />
        <OnFileRow label="Entity type (as recorded)" value={f.master_entity_type} module="company_profile" />
        <OnFileRow label="Nature of business" value={f.nature_of_business} module="company_profile" />
        <OnFileRow label="VAT number" value={f.vat_number} module="tax_registrations" />
        <OnFileRow label="PAYE number" value={f.paye_number} module="tax_registrations" />
        <OnFileRow label="Business address" value={f.address_on_file} module="addresses" />
        <div className="flex justify-between gap-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Active employees</span>
          <span className="font-medium">{f.active_employee_count}</span>
        </div>
        <div className="flex justify-between gap-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Financial year end</span>
          <span className="font-medium">{f.financial_year_end_date ? formatDate(f.financial_year_end_date) : 'No financial year set up'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function defaultsFrom(data: ComplianceOverview): QuestionnaireValues {
  const a = data.profile?.answers ?? {};
  return {
    entity_type: (a.entity_type ?? undefined) as QuestionnaireValues['entity_type'],
    incorporation_date: a.incorporation_date ?? '',
    industry_code: a.industry_code ?? '',
    activity_transport: a.activity_transport ?? (undefined as unknown as boolean),
    activity_food: a.activity_food ?? (undefined as unknown as boolean),
    activity_security: a.activity_security ?? (undefined as unknown as boolean),
    activity_construction: a.activity_construction ?? (undefined as unknown as boolean),
    activity_childcare: a.activity_childcare ?? (undefined as unknown as boolean),
    processes_personal_information: a.processes_personal_information ?? (undefined as unknown as boolean),
    has_premises: a.has_premises ?? null,
    vat_status: a.vat_status ?? null,
    vat_filing_frequency: a.vat_filing_frequency ?? null,
    has_employees: a.has_employees ?? null,
    employee_count: a.employee_count ?? null,
  };
}

function QuestionnaireForm({ data, companyId }: { data: ComplianceOverview; companyId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const stepKey = (params.get('step') as QuestionnaireStep) || 'business';
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === stepKey));
  const step = STEPS[stepIndex];
  const submitting = useRef(false);

  const form = useForm<QuestionnaireValues>({
    resolver: zodResolver(questionnaireSchema),
    defaultValues: defaultsFrom(data),
    mode: 'onTouched',
  });
  const persistence = useFormPersistence(form, {
    storageKey: draftKey(companyId, 'compliance-questionnaire'),
    active: true,
  });

  const vatStatus = useWatch({ control: form.control, name: 'vat_status' });
  const hasEmployees = useWatch({ control: form.control, name: 'has_employees' });
  const f = data.on_file;
  const askPremises = !f.address_on_file;
  const askVat = !f.vat_number;
  const vatRegistered = !!f.vat_number || vatStatus === 'registered';
  const askEmployees = f.active_employee_count === 0 && !f.has_payroll_runs;

  const save = useMutation({
    mutationFn: (values: QuestionnaireValues) => {
      const answers: Record<string, unknown> = { ...values };
      if (!answers.incorporation_date) answers.incorporation_date = null;
      if (typeof answers.employee_count === 'number' && Number.isNaN(answers.employee_count)) answers.employee_count = null;
      if (!askPremises) delete answers.has_premises;
      if (!askVat) delete answers.vat_status;
      if (!vatRegistered) answers.vat_filing_frequency = null;
      if (!askEmployees) {
        delete answers.has_employees;
      } else if (answers.has_employees !== true) {
        answers.employee_count = null;
      }
      return invokeCompliance<ComplianceOverview>(companyId, 'SAVE_PROFILE', {
        answers,
        complete: true,
        expected_revision: data.profile?.revision ?? 0,
      });
    },
    onSuccess: (overview) => {
      persistence.clear();
      qc.setQueryData(complianceKeys.overview(companyId), overview);
      qc.invalidateQueries({ queryKey: complianceKeys.all(companyId) });
      toast.success('Profile saved', {
        description: `${overview.counts.applicable} obligation${overview.counts.applicable === 1 ? '' : 's'} apply to this business.`,
      });
      navigate('/compliance');
    },
    onError: (e: Error) => toast.error('Could not save your answers', { description: e.message }),
    onSettled: () => {
      submitting.current = false;
    },
  });

  const goTo = (i: number) => {
    const next = new URLSearchParams(params);
    next.set('step', STEPS[i].key);
    setParams(next, { replace: false });
  };

  const onNext = async () => {
    const ok = await form.trigger(STEP_FIELDS[step.key]);
    if (!ok) return;
    if (stepIndex < STEPS.length - 1) {
      goTo(stepIndex + 1);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    await form.handleSubmit(
      (values) => save.mutate(values),
      () => {
        submitting.current = false;
        // Jump back to the first step that still has a problem.
        const errors = form.formState.errors;
        const firstBad = STEPS.findIndex((s) => STEP_FIELDS[s.key].some((k) => errors[k]));
        if (firstBad >= 0) goTo(firstBad);
      },
    )();
  };

  const industries = useMemo(() => data.industries, [data.industries]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <Progress value={((stepIndex + 1) / STEPS.length) * 100} className="h-1.5" />
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                void onNext();
              }}
            >
              {step.key === 'business' && (
                <>
                  <FormField
                    control={form.control}
                    name="entity_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What type of business is this?</FormLabel>
                        {f.master_entity_type && (
                          <FormDescription>Your records say: “{f.master_entity_type}”.</FormDescription>
                        )}
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose one" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ENTITY_TYPE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="incorporation_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>When was it registered (incorporated)?</FormLabel>
                        <FormDescription>
                          On the CIPC registration certificate. Annual return dates are counted from it. Leave empty if
                          you are not sure; the obligation will ask for it later.
                        </FormDescription>
                        <FormControl>
                          <Input type="date" max={data.today} value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="industry_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Which industry fits best?</FormLabel>
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose one" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {industries.map((i) => (
                              <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {step.key === 'activities' && (
                <>
                  {ACTIVITY_QUESTIONS.map((q) => (
                    <YesNo key={q.key} control={form.control} name={q.key} label={q.label} />
                  ))}
                  <YesNo
                    control={form.control}
                    name="processes_personal_information"
                    label="Do you keep personal information beyond ordinary invoicing?"
                    description="For example ID numbers, health or banking details, CVs, customer databases or marketing lists."
                  />
                </>
              )}

              {step.key === 'registrations' && (
                <>
                  {askPremises && (
                    <YesNo control={form.control} name="has_premises" label="Does the business operate from its own premises (office, shop, workshop)?" />
                  )}
                  {askVat ? (
                    <FormField
                      control={form.control}
                      name="vat_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Is the business registered for VAT?</FormLabel>
                          <FormDescription>
                            Choosing “registered” does not record a VAT number; add it under Settings → Master Data.
                          </FormDescription>
                          <FormControl>
                            <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} className="space-y-1">
                              {VAT_STATUS_OPTIONS.map((o) => (
                                <label key={o.value} className="flex items-center gap-2 text-sm">
                                  <RadioGroupItem value={o.value} /> {o.label}
                                </label>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                  {vatRegistered && (
                    <FormField
                      control={form.control}
                      name="vat_filing_frequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How often do you submit VAT returns?</FormLabel>
                          <FormDescription>SARS set this when you registered; it is on your VAT registration notice.</FormDescription>
                          <FormControl>
                            <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} className="space-y-1">
                              {VAT_FREQUENCY_OPTIONS.map((o) => (
                                <label key={o.value} className="flex items-center gap-2 text-sm">
                                  <RadioGroupItem value={o.value} /> {o.label}
                                </label>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {askEmployees ? (
                    <>
                      <YesNo
                        control={form.control}
                        name="has_employees"
                        label="Does the business employ anyone?"
                        description="Include people paid outside AdminLess payroll. Directors paid a salary count."
                      />
                      {hasEmployees === true && (
                        <FormField
                          control={form.control}
                          name="employee_count"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>About how many employees?</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={field.value === null || field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Employees are taken from Payroll ({f.active_employee_count} active).
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="ghost" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : stepIndex === STEPS.length - 1 ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : null}
                  {stepIndex === STEPS.length - 1 ? 'Save and see my obligations' : 'Next'}
                  {stepIndex < STEPS.length - 1 && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <OnFilePanel data={data} />
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Why we ask</AlertTitle>
          <AlertDescription>
            Your answers decide which obligations apply. They stay in Compliance and never change your company records.
          </AlertDescription>
        </Alert>
      </aside>
    </div>
  );
}

export default function ComplianceQuestionnaire() {
  useDocumentTitle('Compliance profile');
  const { activeCompany } = useAuth();
  // Hold the last company id so a brief re-hydration never remounts the wizard.
  const companyRef = useRef<string | undefined>(undefined);
  if (activeCompany?.id) companyRef.current = activeCompany.id;
  const companyId = companyRef.current;
  const { data, isLoading, isError, error, refetch } = useComplianceOverview(companyId);

  return (
    <div className="section-stack">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Compliance profile</h1>
          <p className="text-muted-foreground">A few questions so AdminLess can work out which obligations apply to this business.</p>
        </div>
        {data?.profile?.status === 'completed' && (
          <Button asChild variant="outline">
            <Link to="/compliance">
              <ExternalLink className="mr-2 h-4 w-4" /> Back to obligations
            </Link>
          </Button>
        )}
      </header>
      {isLoading || !companyId ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertTitle>The questionnaire could not be loaded</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{(error as Error)?.message ?? 'Please try again.'}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <QuestionnaireForm key={`${companyId}:${data.profile?.revision ?? 0}`} data={data} companyId={companyId} />
      )}
    </div>
  );
}
