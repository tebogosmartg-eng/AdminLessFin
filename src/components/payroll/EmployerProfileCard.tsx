import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { SmartSelect } from '../cotf/SmartSelect';
import { showError, showSuccess } from '../../utils/toast';
import { invokePayroll } from '../../lib/payrollOperations';
import {
  EMPTY_EMPLOYER_PROFILE,
  normaliseEmployerProfile,
  validateEmployerProfile,
  type EmployerProfile,
  type EmployerProfileError,
} from '../../lib/sars/employerProfile';
import { SIC7_CODES } from '../../lib/sars/sic7Codes';

type ProfileResponse = {
  profile: (EmployerProfile & { updated_at?: string }) | null;
  errors: EmployerProfileError[];
  suggested?: Partial<Record<keyof EmployerProfile, string>>;
};

type FormState = Record<keyof EmployerProfile, string | boolean>;

const SIC7_OPTIONS = SIC7_CODES.map(([code, description]) => ({
  value: code,
  label: `${code} – ${description}`,
  keywords: [code, description],
}));

function toForm(profile: Partial<EmployerProfile> | null | undefined): FormState {
  const form = {} as FormState;
  for (const key of Object.keys(EMPTY_EMPLOYER_PROFILE) as Array<keyof EmployerProfile>) {
    const value = profile?.[key];
    form[key] = key === 'diplomatic_indemnity' || key === 'claim_eti' || key === 'coida_domestic_employer'
      ? value === true
      : value === null || value === undefined ? '' : String(value);
  }
  if (!form.address_country) form.address_country = 'ZA';
  return form;
}

const TEXT_FIELDS: Array<{ key: keyof EmployerProfile; label: string; placeholder?: string; inputMode?: 'numeric' | 'tel' | 'email' }> = [
  { key: 'trading_name', label: 'Trading or Other Name' },
  { key: 'paye_reference', label: 'PAYE Reference Number', placeholder: '7xxxxxxxxx', inputMode: 'numeric' },
  { key: 'sdl_reference', label: 'SDL Reference Number', placeholder: 'Lxxxxxxxxx (if registered)' },
  { key: 'uif_reference', label: 'UIF Reference Number', placeholder: 'Uxxxxxxxxx (SARS number, if registered)' },
  { key: 'contact_first_name', label: 'Contact First Name' },
  { key: 'contact_surname', label: 'Contact Surname' },
  { key: 'contact_position', label: 'Contact Position' },
  { key: 'contact_email', label: 'Contact E-mail', inputMode: 'email' },
  { key: 'contact_business_phone', label: 'Business Telephone', placeholder: '0211234567', inputMode: 'tel' },
  { key: 'contact_cell_phone', label: 'Cell Number', placeholder: '0821234567', inputMode: 'tel' },
  { key: 'contact_fax', label: 'Fax Number', inputMode: 'tel' },
];

/** Registrations outside SARS: UIF with the Department of Labour, and COIDA. */
const REGISTRATION_FIELDS: Array<{ key: keyof EmployerProfile; label: string; placeholder?: string; inputMode?: 'numeric' }> = [
  { key: 'uif_dol_reference', label: 'UIF Reference (Department of Labour)', placeholder: 'e.g. 1234567/8', inputMode: 'numeric' },
  { key: 'coida_registration_number', label: 'COIDA Registration Number' },
  { key: 'coida_rate_percent', label: 'COIDA Assessment Rate (%)', placeholder: 'from the notice of assessment, e.g. 0.18', inputMode: 'numeric' },
];

const ADDRESS_FIELDS: Array<{ key: keyof EmployerProfile; label: string; inputMode?: 'numeric' }> = [
  { key: 'address_unit_number', label: 'Unit Number' },
  { key: 'address_complex', label: 'Complex' },
  { key: 'address_street_number', label: 'Street Number' },
  { key: 'address_street_name', label: 'Street or Farm Name' },
  { key: 'address_suburb', label: 'Suburb or District' },
  { key: 'address_city', label: 'City or Town' },
  { key: 'address_postal_code', label: 'Postal Code', inputMode: 'numeric' },
  { key: 'address_country', label: 'Country Code' },
];

/**
 * Employer details for SARS returns (EMP201, EMP501). Checked against the SARS
 * reconciliation rules as the user types; the payroll function checks them again.
 */
const EmployerProfileCard = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const queryKey = ['payroll-employer-profile', companyId ?? ''];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => invokePayroll<ProfileResponse>({ method: 'GET_EMPLOYER_PROFILE', company_id: companyId }),
    enabled: !!companyId,
  });
  const [form, setForm] = useState<FormState>(() => toForm(null));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm(toForm(data.profile ?? { ...EMPTY_EMPLOYER_PROFILE, ...(data.suggested ?? {}) } as EmployerProfile));
    setTouched(false);
  }, [data]);

  const profile = useMemo(() => normaliseEmployerProfile(form), [form]);
  const errors = useMemo(() => validateEmployerProfile(profile), [profile]);
  const errorFor = (key: keyof EmployerProfile) => errors.find((e) => e.field === key)?.message;

  const save = useMutation({
    mutationFn: () => invokePayroll<ProfileResponse>({ method: 'UPDATE_EMPLOYER_PROFILE', company_id: companyId, profile }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, { ...data, ...saved });
      // Run pages warn while these details are missing.
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail'] });
      showSuccess('Employer details for SARS saved.');
    },
    onError: (error: Error) => showError(error.message),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const set = (key: keyof EmployerProfile, value: string | boolean) => {
    setTouched(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const showErrors = touched || !!data.profile;

  const field = ({ key, label, placeholder, inputMode }: { key: keyof EmployerProfile; label: string; placeholder?: string; inputMode?: 'numeric' | 'tel' | 'email' }) => (
    <div key={key} className="space-y-1">
      <Label htmlFor={`employer-${key}`}>{label}</Label>
      <Input
        id={`employer-${key}`}
        value={String(form[key] ?? '')}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => set(key, event.target.value)}
        aria-invalid={showErrors && !!errorFor(key)}
      />
      {showErrors && errorFor(key) && <p className="text-xs text-destructive">{errorFor(key)}</p>}
    </div>
  );

  return (
    <Card data-testid="employer-profile">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Employer Details for SARS</CardTitle>
        <CardDescription>
          Used on the EMP201 and the EMP501 reconciliation. Reference numbers are checked with the SARS check-digit rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!data.profile && (
          <Alert>
            <AlertDescription>
              Not captured yet. Values found elsewhere in the company (for example the financial statements) have been filled in; check them before saving.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEXT_FIELDS.map(field)}
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="employer-sic7_code">SIC7 Industry Code</Label>
            <SmartSelect
              id="employer-sic7_code"
              options={SIC7_OPTIONS}
              value={String(form.sic7_code || '') || null}
              onChange={(value) => set('sic7_code', value)}
              entityLabel="industry code"
              placeholder="Search by code or description…"
            />
            {showErrors && errorFor('sic7_code') && <p className="text-xs text-destructive">{errorFor('sic7_code')}</p>}
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              id="employer-diplomatic"
              checked={form.diplomatic_indemnity === true}
              onCheckedChange={(checked) => set('diplomatic_indemnity', checked)}
            />
            <Label htmlFor="employer-diplomatic" className="font-normal">The employer enjoys diplomatic indemnity</Label>
          </div>
          <div className="flex items-start gap-3 md:col-span-2">
            <Switch
              id="employer-claim-eti"
              checked={form.claim_eti === true}
              onCheckedChange={(checked) => set('claim_eti', checked)}
            />
            <div>
              <Label htmlFor="employer-claim-eti" className="font-normal">Claim the Employment Tax Incentive (ETI)</Label>
              <p className="text-xs text-muted-foreground">
                ETI reduces the PAYE paid to SARS for qualifying employees (18–29, earning under R7 500). Only for employers registered for PAYE and tax compliant.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">UIF and COIDA</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{REGISTRATION_FIELDS.map(field)}</div>
          <div className="flex items-center gap-3">
            <Switch
              id="employer-coida-domestic"
              checked={form.coida_domestic_employer === true}
              onCheckedChange={(checked) => set('coida_domestic_employer', checked)}
            />
            <Label htmlFor="employer-coida-domestic" className="font-normal">Domestic employer (lower COIDA minimum assessment)</Label>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Physical Address</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{ADDRESS_FIELDS.map(field)}</div>
        </div>
        {data.profile?.updated_at && (
          <p className="text-xs text-muted-foreground">Last saved {format(new Date(data.profile.updated_at), 'PPP p')}.</p>
        )}
        <Button onClick={() => { setTouched(true); if (!errors.length) save.mutate(); }} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Employer Details'}
        </Button>
        {touched && errors.length > 0 && (
          <p className="text-sm text-destructive">{errors.length} field{errors.length === 1 ? '' : 's'} to correct before saving.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default EmployerProfileCard;
