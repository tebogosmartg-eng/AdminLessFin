import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingReadinessQuery } from '../../lib/queries';
import type { AccountingGatedModule } from '@/governance/domains/accountingReadiness/model';
import AccountingSetupGuidance from './AccountingSetupGuidance';

type AccountingReadyGateProps = {
  children: ReactNode;
  module: AccountingGatedModule;
};

/**
 * ERP Phase 1A — blocks operational accounting modules until Accounting Ready = TRUE.
 * Orchestration gate only; posting engine / GL / TB / FS are unchanged.
 *
 * UX: never replace the application shell with a viewport-sized loader. A
 * full-screen loader unmounts the gated page (and any open form) and paints
 * over the sidebar — that is the "page appearing/disappearing" failure.
 * First-load pending and not-ready are both in-content, stable states.
 */
export default function AccountingReadyGate({ children, module }: AccountingReadyGateProps) {
  const { activeCompany } = useAuth();

  const { data: readiness, isPending, isError, error } = useQuery({
    ...accountingReadinessQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  if (readiness?.accountingReady) {
    return <>{children}</>;
  }

  if (!readiness && (isPending || !activeCompany)) {
    return <AccountingSetupGuidance module={module} pending />;
  }

  return (
    <AccountingSetupGuidance
      module={module}
      readiness={readiness}
      errorMessage={
        isError && !readiness
          ? error instanceof Error
            ? error.message
            : 'Accounting setup could not be verified. Complete Accounting Setup before posting.'
          : undefined
      }
    />
  );
}
