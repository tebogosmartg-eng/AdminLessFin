import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { accountingReadinessQuery } from '../../lib/queries';
import type { AccountingGatedModule } from '@/governance/domains/accountingReadiness/model';
import FullScreenLoader from '../FullScreenLoader';
import AccountingSetupGuidance from './AccountingSetupGuidance';

type AccountingReadyGateProps = {
  children: React.ReactNode;
  module: AccountingGatedModule;
};

/**
 * ERP Phase 1A — blocks operational accounting modules until Accounting Ready = TRUE.
 * Orchestration gate only; posting engine / GL / TB / FS are unchanged.
 */
export default function AccountingReadyGate({ children, module }: AccountingReadyGateProps) {
  const { activeCompany } = useAuth();

  const { data: readiness, isLoading } = useQuery({
    ...accountingReadinessQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  if (isLoading) return <FullScreenLoader />;

  if (readiness?.accountingReady) {
    return <>{children}</>;
  }

  return <AccountingSetupGuidance module={module} readiness={readiness} />;
}
