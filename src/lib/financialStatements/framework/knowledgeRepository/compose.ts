/**
 * Shared composition helpers for Knowledge Repository packs.
 */
import type { FrameworkKey, FrameworkPolicyDef } from './types';

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = (obj as Record<string, unknown>)[prop];
      if (value && typeof value === 'object') deepFreeze(value);
    });
    Object.freeze(obj);
  }
  return obj;
}

export function normaliseFrameworkKey(input: string | null | undefined): FrameworkKey {
  const raw = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (raw.includes('SME')) return 'IFRS_SME';
  if (raw.includes('GRAP')) return 'GRAP';
  if (raw.includes('IPSAS')) return 'IPSAS';
  return 'IFRS';
}

/**
 * Compose a professionally authored policy body from its life-cycle components.
 * Clauses flow as continuous statutory prose — without robotic "Recognition —"
 * label prefixes that mark the text as template-generated.
 */
export function composePolicyBody(parts: {
  intro?: string;
  recognition?: string;
  initialMeasurement?: string;
  subsequentMeasurement?: string;
  derecognition?: string;
  judgements?: string;
  estimates?: string;
  presentation?: string;
}): string {
  const clauses: string[] = [];
  if (parts.intro) clauses.push(parts.intro.trim());
  if (parts.recognition) clauses.push(parts.recognition.trim());
  if (parts.initialMeasurement) clauses.push(parts.initialMeasurement.trim());
  if (parts.subsequentMeasurement) clauses.push(parts.subsequentMeasurement.trim());
  if (parts.derecognition) clauses.push(parts.derecognition.trim());
  if (parts.judgements) clauses.push(parts.judgements.trim());
  if (parts.estimates) clauses.push(parts.estimates.trim());
  if (parts.presentation) clauses.push(parts.presentation.trim());
  return clauses.filter(Boolean).join(' ');
}

/** Policy builder that composes the rendered body from structured components. */
export function pol(def: Omit<FrameworkPolicyDef, 'body'> & { intro?: string }): FrameworkPolicyDef {
  const { intro, ...rest } = def;
  return {
    ...rest,
    body: composePolicyBody({
      intro,
      recognition: def.recognition,
      initialMeasurement: def.initialMeasurement,
      subsequentMeasurement: def.subsequentMeasurement,
      derecognition: def.derecognition,
      judgements: def.judgements,
      estimates: def.estimates,
      presentation: def.presentation,
    }),
  };
}
