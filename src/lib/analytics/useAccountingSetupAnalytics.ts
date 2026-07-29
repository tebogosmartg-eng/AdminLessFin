import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { AccountingReadinessSnapshot, SetupStepKey } from '@/governance/domains/accountingReadiness/model';
import { SETUP_STEP_ORDER } from '@/governance/domains/accountingReadiness/model';
import { AnalyticsEvents } from './events';
import { trackEvent } from './productAnalytics';
import { consumeStepDuration, markStepStart } from './session';

const STEP_EVENT_MAP: Partial<Record<SetupStepKey, string>> = {
  financial_calendar: AnalyticsEvents.SETUP_FINANCIAL_YEAR_CONFIGURED,
  chart_of_accounts: AnalyticsEvents.SETUP_COA_GENERATED,
  tax_configuration: AnalyticsEvents.SETUP_TAX_CONFIGURED,
  opening_balances: AnalyticsEvents.SETUP_OPENING_BALANCES_COMPLETED,
};

/**
 * Tracks accounting setup step completions, validation failures, and abandonment.
 */
export function useAccountingSetupAnalytics(
  companyId: string | undefined,
  readiness: AccountingReadinessSnapshot | undefined,
  activeStep: SetupStepKey | null,
) {
  const startedRef = useRef(false);
  const readyTrackedRef = useRef(false);
  const completedStepsRef = useRef<Set<SetupStepKey>>(new Set());
  const lastErrorsRef = useRef<string>('');

  useEffect(() => {
    if (!companyId || !readiness) return;

    if (!startedRef.current) {
      startedRef.current = true;
      trackEvent({
        eventName: AnalyticsEvents.SETUP_STARTED,
        companyId,
        properties: { status: readiness.status },
      });
    }
  }, [companyId, readiness]);

  useEffect(() => {
    if (!companyId || !readiness) return;

    for (const key of SETUP_STEP_ORDER) {
      if (readiness.steps[key]?.complete && !completedStepsRef.current.has(key)) {
        completedStepsRef.current.add(key);
        const durationMs = consumeStepDuration(key);
        const setupEvent = STEP_EVENT_MAP[key];
        if (setupEvent) {
          trackEvent({
            eventName: setupEvent,
            companyId,
            durationMs,
            properties: { step: key },
          });
        }
        trackEvent({
          eventName: AnalyticsEvents.JOURNEY_STEP_COMPLETED,
          category: 'journey',
          companyId,
          durationMs,
          properties: { step: key, phase: 'accounting_setup' },
        });
      }
    }

    if (readiness.accountingReady && !readyTrackedRef.current) {
      readyTrackedRef.current = true;
      trackEvent({
        eventName: AnalyticsEvents.SETUP_ACCOUNTING_READY,
        companyId,
        properties: { progress_percent: readiness.progressPercent },
      });
    }

    const errors = readiness.validation?.errors ?? [];
    const errorsKey = JSON.stringify(errors);
    if (errors.length > 0 && errorsKey !== lastErrorsRef.current) {
      lastErrorsRef.current = errorsKey;
      trackEvent({
        eventName: AnalyticsEvents.SETUP_VALIDATION_FAILED,
        companyId,
        properties: { errors, progress_percent: readiness.progressPercent },
      });
      trackEvent({
        eventName: AnalyticsEvents.ERROR_VALIDATION_FAILURE,
        companyId,
        module: 'accounting_setup',
        properties: { errors },
      });
    }
  }, [companyId, readiness]);

  useEffect(() => {
    if (!activeStep) return;
    markStepStart(activeStep);
    trackEvent({
      eventName: AnalyticsEvents.SETUP_STEP_VIEWED,
      companyId,
      properties: { step: activeStep },
    });
  }, [activeStep, companyId]);

  useEffect(() => {
    return () => {
      if (!companyId || readyTrackedRef.current) return;
      trackEvent({
        eventName: AnalyticsEvents.SETUP_ABANDONED,
        companyId,
        properties: {
          step: activeStep,
          completed_steps: Array.from(completedStepsRef.current),
        },
      });
      trackEvent({
        eventName: AnalyticsEvents.JOURNEY_DROPOFF,
        category: 'journey',
        companyId,
        properties: { step: activeStep, phase: 'accounting_setup' },
      });
    };
  }, [companyId, activeStep]);
}
