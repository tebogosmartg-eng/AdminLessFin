/**
 * Command execution observability — emits structured lifecycle events.
 */

import type { PlatformErrorEnvelope } from './platformError';

export type CommandLifecyclePhase =
  | 'started'
  | 'validated'
  | 'executing'
  | 'succeeded'
  | 'failed';

export type CommandExecutionLog = {
  phase: CommandLifecyclePhase;
  commandId: string;
  commandName: string;
  correlationId: string;
  companyId: string;
  userId?: string;
  entityId?: string;
  entityType?: string;
  durationMs?: number;
  subscribersExecuted?: string[];
  subscribersFailed?: string[];
  error?: PlatformErrorEnvelope;
  timestamp: string;
};

const executionLogs: CommandExecutionLog[] = [];
const MAX_LOGS = 500;

export function emitCommandLog(entry: CommandExecutionLog): void {
  executionLogs.unshift(entry);
  if (executionLogs.length > MAX_LOGS) executionLogs.length = MAX_LOGS;

  const label = `[BOE:${entry.phase}] ${entry.commandName}`;
  if (import.meta.env.DEV) {
    if (entry.phase === 'failed') {
      console.error(label, entry);
    } else {
      // Success-path lifecycle logs are dev-only diagnostics. The in-memory ring
      // buffer (getRecentCommandLogs) retains them for the diagnostics UI regardless.
      console.info(label, {
        correlationId: entry.correlationId,
        commandId: entry.commandId,
        durationMs: entry.durationMs,
        subscribersFailed: entry.subscribersFailed,
      });
    }
  }
}

export function getRecentCommandLogs(limit = 50): readonly CommandExecutionLog[] {
  return executionLogs.slice(0, limit);
}

export function clearCommandLogs(): void {
  executionLogs.length = 0;
}
