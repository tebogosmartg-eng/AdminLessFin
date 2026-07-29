/**
 * Isolated statutory return pipeline (V3.6.1).
 * Order is fixed: generate → validate → export → transmit.
 * Stages never call into payroll calculation.
 */

import type { GenerateReturnInput, StatutoryReturn, StatutoryReturnType } from '../../lib/statutoryReturns/types';
import type {
  ExportFormat,
  PipelineStage,
  StatutoryReturnPipelineResult,
  StatutoryReturnPlugin,
  TransmissionProviderId,
} from './contracts';
import { exportStatutoryReturn } from './exportFramework';
import {
  appendSubmissionLedgerEvent,
  assertCanRegenerate,
  freezeStatutoryReturn,
  markReturnSubmitted,
} from './ledger';
import { transmitStatutoryExport } from './transmissionFramework';

export type RunPipelineOptions = {
  plugin: StatutoryReturnPlugin;
  input: GenerateReturnInput;
  /** Existing immutable return — regeneration throws. */
  existingReturn?: StatutoryReturn | null;
  exportFormat?: ExportFormat;
  transmit?: boolean;
  transmissionProviderId?: TransmissionProviderId;
  companyId?: string | null;
  stages?: PipelineStage[];
};

export function runStatutoryReturnPipeline(options: RunPipelineOptions): StatutoryReturnPipelineResult {
  const stages = options.stages ?? (['generate', 'validate'] as PipelineStage[]);
  const ledgerEvents = [];
  const stagesCompleted: PipelineStage[] = [];

  try {
    assertCanRegenerate(options.existingReturn ?? null);
  } catch (err) {
    const blocked = options.existingReturn!;
    const event = appendSubmissionLedgerEvent({
      statutoryReturnId: blocked.id,
      companyId: options.companyId,
      eventType: 'regeneration_blocked',
      contentHash: blocked.contentHash,
      createdBy: options.input.generatedBy ?? null,
      payload: { message: err instanceof Error ? err.message : 'blocked' },
    });
    return {
      returnRecord: blocked,
      validation: blocked.validationResult,
      artifact: null,
      transmission: null,
      ledgerEvents: [event],
      stagesCompleted: [],
    };
  }

  let returnRecord: StatutoryReturn = options.plugin.generate(options.input);
  stagesCompleted.push('generate');
  ledgerEvents.push(
    appendSubmissionLedgerEvent({
      statutoryReturnId: returnRecord.id,
      companyId: options.companyId,
      eventType: 'generated',
      createdBy: options.input.generatedBy ?? null,
      payload: { returnType: options.plugin.returnType },
    })
  );

  if (stages.includes('validate')) {
    const validation = options.plugin.validate(returnRecord, options.input);
    returnRecord = {
      ...returnRecord,
      validationResult: validation,
      status: validation.ok ? 'validated' : 'draft',
    };
    stagesCompleted.push('validate');
    ledgerEvents.push(
      appendSubmissionLedgerEvent({
        statutoryReturnId: returnRecord.id,
        companyId: options.companyId,
        eventType: 'validated',
        createdBy: options.input.generatedBy ?? null,
        payload: { ok: validation.ok, issueCount: validation.issues.length },
      })
    );
  }

  let artifact = null;
  if (stages.includes('export')) {
    if (!returnRecord.validationResult.ok) {
      throw new Error('EXPORT_BLOCKED: Cannot export a statutory return that failed validation.');
    }
    returnRecord = freezeStatutoryReturn(returnRecord);
    artifact = options.plugin.exportReturn(returnRecord, options.exportFormat ?? 'json');
    stagesCompleted.push('export');
    ledgerEvents.push(
      appendSubmissionLedgerEvent({
        statutoryReturnId: returnRecord.id,
        companyId: options.companyId,
        eventType: 'exported',
        contentHash: returnRecord.contentHash,
        createdBy: options.input.generatedBy ?? null,
        payload: { format: artifact.format, fileName: artifact.fileName },
      })
    );
  }

  let transmission = null;
  if (stages.includes('transmit') || options.transmit) {
    if (!artifact) {
      if (!returnRecord.validationResult.ok) {
        throw new Error('TRANSMIT_BLOCKED: Validation failed.');
      }
      returnRecord = freezeStatutoryReturn(returnRecord);
      artifact = options.plugin.exportReturn(returnRecord, options.exportFormat ?? 'json');
      if (!stagesCompleted.includes('export')) stagesCompleted.push('export');
    }
    transmission = options.plugin.transmit({
      artifact,
      providerId: options.transmissionProviderId ?? 'manual',
      actorId: options.input.generatedBy ?? null,
    });
    stagesCompleted.push('transmit');
    if (transmission.ok && transmission.submissionReference) {
      returnRecord = markReturnSubmitted(
        returnRecord,
        transmission.submissionReference,
        options.input.generatedBy ?? null
      );
    } else {
      ledgerEvents.push(
        appendSubmissionLedgerEvent({
          statutoryReturnId: returnRecord.id,
          companyId: options.companyId,
          eventType: 'rejected',
          contentHash: returnRecord.contentHash,
          createdBy: options.input.generatedBy ?? null,
          payload: { message: transmission.message },
        })
      );
    }
  }

  return {
    returnRecord,
    validation: returnRecord.validationResult,
    artifact,
    transmission,
    ledgerEvents,
    stagesCompleted,
  };
}

export function getPluginReturnType(plugin: StatutoryReturnPlugin): StatutoryReturnType {
  return plugin.returnType;
}
