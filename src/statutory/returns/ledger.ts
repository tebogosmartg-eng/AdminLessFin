/**
 * Immutable statutory snapshot + in-memory submission ledger (V3.6.1).
 * Append-only: never mutates prior events. Submitted returns cannot be regenerated.
 */

import { computePayloadChecksum } from '../registry/types';
import type { StatutoryReturn } from '../../lib/statutoryReturns/types';
import type { SubmissionLedgerEvent, SubmissionLedgerEventType } from './contracts';

const ledger: SubmissionLedgerEvent[] = [];

const TERMINAL_STATUSES = new Set(['submitted', 'accepted']);

export function hashStatutoryReturn(ret: Pick<StatutoryReturn, 'declarationData' | 'sourcePayrollRuns' | 'taxYear' | 'returnType' | 'country'>): string {
  return computePayloadChecksum({
    country: ret.country,
    returnType: ret.returnType,
    taxYear: ret.taxYear,
    sourcePayrollRuns: ret.sourcePayrollRuns,
    declarationData: ret.declarationData,
  });
}

export function freezeStatutoryReturn(ret: StatutoryReturn): StatutoryReturn {
  const contentHash = hashStatutoryReturn(ret);
  return {
    ...ret,
    contentHash,
    immutable: true,
    declarationData: Object.freeze({ ...ret.declarationData }) as Record<string, unknown>,
  };
}

export function isReturnSubmitted(ret: StatutoryReturn): boolean {
  return TERMINAL_STATUSES.has(ret.status) || !!ret.submittedAt;
}

export function assertCanRegenerate(existing: StatutoryReturn | null | undefined): void {
  if (!existing) return;
  if (isReturnSubmitted(existing) || existing.immutable) {
    throw new Error(
      `REGENERATION_BLOCKED: Statutory return ${existing.id} is immutable/submitted and must never be regenerated.`
    );
  }
}

export function appendSubmissionLedgerEvent(input: {
  statutoryReturnId: string;
  companyId?: string | null;
  eventType: SubmissionLedgerEventType;
  contentHash?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}): SubmissionLedgerEvent {
  const event: SubmissionLedgerEvent = {
    id: `LEDGER_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`}`,
    statutoryReturnId: input.statutoryReturnId,
    companyId: input.companyId ?? null,
    eventType: input.eventType,
    contentHash: input.contentHash ?? null,
    payload: Object.freeze({ ...(input.payload ?? {}) }) as Record<string, unknown>,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
  ledger.push(Object.freeze(event) as SubmissionLedgerEvent);
  return event;
}

export function listSubmissionLedgerEvents(statutoryReturnId?: string): readonly SubmissionLedgerEvent[] {
  if (!statutoryReturnId) return ledger.slice();
  return ledger.filter((e) => e.statutoryReturnId === statutoryReturnId);
}

export function clearSubmissionLedgerForTests(): void {
  ledger.length = 0;
}

export function markReturnSubmitted(
  ret: StatutoryReturn,
  submissionReference: string,
  actorId?: string | null
): StatutoryReturn {
  if (isReturnSubmitted(ret) && ret.immutable) {
    throw new Error(`Return ${ret.id} is already submitted and immutable.`);
  }
  const frozen = freezeStatutoryReturn({
    ...ret,
    status: 'submitted',
    submissionReference,
    submittedAt: new Date().toISOString(),
  });
  appendSubmissionLedgerEvent({
    statutoryReturnId: frozen.id,
    eventType: 'submitted',
    contentHash: frozen.contentHash,
    createdBy: actorId ?? null,
    payload: { submissionReference },
  });
  return frozen;
}
