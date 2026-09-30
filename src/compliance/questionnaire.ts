import { z } from 'zod';

/**
 * The compliance questionnaire (version 1). Questions live in app code with a
 * version number (ADR-0004); the server validates the answers again with its
 * own validator and decides what is stored. Keep ENTITY_TYPE_OPTIONS and the
 * VAT lists in step with supabase/functions/_shared/compliance — the unit
 * test tests/unit/compliance-content.test.ts fails if they drift.
 */
export const QUESTIONNAIRE_VERSION = 1;

export const ENTITY_TYPE_OPTIONS = [
  { value: 'private_company', label: 'Private company (Pty) Ltd' },
  { value: 'public_company', label: 'Public company (Ltd)' },
  { value: 'close_corporation', label: 'Close corporation (CC)' },
  { value: 'non_profit_company', label: 'Non-profit company (NPC)' },
  { value: 'sole_proprietor', label: 'Sole proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust' },
  { value: 'other', label: 'Other' },
] as const;

export const VAT_STATUS_OPTIONS = [
  { value: 'registered', label: 'Registered for VAT' },
  { value: 'not_registered', label: 'Not registered for VAT' },
  { value: 'not_sure', label: 'Not sure' },
] as const;

export const VAT_FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'bimonthly_odd', label: 'Every two months, ending January, March, May…' },
  { value: 'bimonthly_even', label: 'Every two months, ending February, April, June…' },
  { value: 'not_sure', label: 'Not sure' },
] as const;

export const ACTIVITY_QUESTIONS = [
  { key: 'activity_transport', label: 'Transporting goods or passengers for others' },
  { key: 'activity_food', label: 'Preparing, handling or selling food' },
  { key: 'activity_security', label: 'Providing security services' },
  { key: 'activity_construction', label: 'Construction or building work' },
  { key: 'activity_childcare', label: 'Caring for or educating children' },
] as const;

const yesNo = z.boolean({ required_error: 'Choose yes or no.', invalid_type_error: 'Choose yes or no.' });
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const stepSchemas = {
  business: z.object({
    entity_type: z.enum(ENTITY_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]], {
      required_error: 'Choose the type of business.',
      invalid_type_error: 'Choose the type of business.',
    }),
    incorporation_date: z
      .string()
      .optional()
      .nullable()
      .refine((v) => !v || isoDate.test(v), 'Enter a valid date.'),
    industry_code: z.string({ required_error: 'Choose an industry.' }).min(1, 'Choose an industry.'),
  }),
  activities: z.object({
    activity_transport: yesNo,
    activity_food: yesNo,
    activity_security: yesNo,
    activity_construction: yesNo,
    activity_childcare: yesNo,
    processes_personal_information: yesNo,
  }),
  registrations: z.object({
    has_premises: z.boolean().nullable().optional(),
    vat_status: z.enum(['registered', 'not_registered', 'not_sure']).nullable().optional(),
    vat_filing_frequency: z.enum(['monthly', 'bimonthly_odd', 'bimonthly_even', 'not_sure']).nullable().optional(),
    has_employees: z.boolean().nullable().optional(),
    employee_count: z
      .union([z.number().int().min(0, 'Enter zero or more.'), z.nan()])
      .nullable()
      .optional(),
  }),
};

export type QuestionnaireStep = keyof typeof stepSchemas;
export const STEPS: Array<{ key: QuestionnaireStep; title: string; description: string }> = [
  { key: 'business', title: 'Your business', description: 'What kind of entity this is, and when it was registered.' },
  { key: 'activities', title: 'What you do', description: 'Some activities carry their own registrations and permits.' },
  { key: 'registrations', title: 'Registrations and staff', description: 'Only what is not already in your records.' },
];

export const questionnaireSchema = stepSchemas.business.merge(stepSchemas.activities).merge(stepSchemas.registrations);
export type QuestionnaireValues = z.infer<typeof questionnaireSchema>;
