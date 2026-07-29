const SESSION_KEY = 'alf_analytics_session_id';
const REGISTRATION_TRACKED_KEY = 'alf_registration_tracked';

export function getAnalyticsSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function markRegistrationTracked(userId: string): void {
  sessionStorage.setItem(`${REGISTRATION_TRACKED_KEY}:${userId}`, '1');
}

export function wasRegistrationTracked(userId: string): boolean {
  return sessionStorage.getItem(`${REGISTRATION_TRACKED_KEY}:${userId}`) === '1';
}

const STEP_TIMER_PREFIX = 'alf_setup_step_start:';

export function markStepStart(stepKey: string): void {
  sessionStorage.setItem(`${STEP_TIMER_PREFIX}${stepKey}`, String(Date.now()));
}

export function consumeStepDuration(stepKey: string): number | undefined {
  const raw = sessionStorage.getItem(`${STEP_TIMER_PREFIX}${stepKey}`);
  if (!raw) return undefined;
  sessionStorage.removeItem(`${STEP_TIMER_PREFIX}${stepKey}`);
  const start = Number(raw);
  if (!Number.isFinite(start)) return undefined;
  return Math.max(0, Date.now() - start);
}

const FIRST_USAGE_PREFIX = 'alf_first_usage:';

export function wasFirstUsageTracked(companyId: string, eventKey: string): boolean {
  return localStorage.getItem(`${FIRST_USAGE_PREFIX}${companyId}:${eventKey}`) === '1';
}

export function markFirstUsageTracked(companyId: string, eventKey: string): void {
  localStorage.setItem(`${FIRST_USAGE_PREFIX}${companyId}:${eventKey}`, '1');
}
