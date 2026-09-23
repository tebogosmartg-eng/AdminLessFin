/**
 * Is this set of financial statements fit to issue?
 *
 * The existing validation run answers a different question — whether the
 * paperwork around the engagement is in order: working papers finalised,
 * evidence attached, sockets bound. Useful to a reviewer, but it will report a
 * clean run on statements that do not balance, and an accountant reading
 * "Overall readiness 84" learns nothing they can act on.
 *
 * This asks the accounting questions instead, against the document that is
 * actually on screen, and grades them the way a preparer would:
 *
 *   BLOCKED          the statements are wrong; issuing them would be a mistake
 *   ACTION REQUIRED  something is missing that only a person can supply
 *   WARNING          defensible, but a reviewer will ask about it
 *   READY            nothing outstanding that we can detect
 *
 * Every issue carries where to go and fix it, because a finding you cannot
 * navigate to is a finding you will not act on.
 */
import type { DocumentModel } from './document/documentModel';
import type { EfsStatementLine } from './api';

export type ReadinessState = 'ready' | 'warning' | 'action_required' | 'blocked';

export type ReadinessLocation =
  | { kind: 'statement'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'policy'; id: string }
  | { kind: 'information'; id: string };

export type ReadinessIssue = {
  id: string;
  state: Exclude<ReadinessState, 'ready'>;
  title: string;
  detail: string;
  location?: ReadinessLocation;
};

export type Readiness = {
  state: ReadinessState;
  issues: ReadinessIssue[];
  /** Counts by state, for a one-line summary. */
  counts: Record<Exclude<ReadinessState, 'ready'>, number>;
};

export const READINESS_LABEL: Record<ReadinessState, string> = {
  ready: 'Ready',
  warning: 'Warning',
  action_required: 'Action required',
  blocked: 'Blocked',
};

const SEVERITY: Record<Exclude<ReadinessState, 'ready'>, number> = {
  blocked: 3,
  action_required: 2,
  warning: 1,
};

/** Money compares to the cent; anything finer is floating-point noise. */
const TOLERANCE = 0.005;

function lineBy(lines: EfsStatementLine[], ...codes: string[]): EfsStatementLine | undefined {
  for (const code of codes) {
    const hit = lines.find((l) => l.line_code === code);
    if (hit) return hit;
  }
  return undefined;
}

function amount(line: EfsStatementLine | undefined): number | null {
  if (!line || line.amount == null) return null;
  return Number(line.amount);
}

export function assessReadiness(model: DocumentModel): Readiness {
  const issues: ReadinessIssue[] = [];

  const position = model.statements.find((s) => s.statement_type === 'financial_position');
  const performance = model.statements.find((s) => s.statement_type === 'financial_performance');
  const populated = model.statements.filter((s) => s.populated);

  // ── Nothing to check yet ──────────────────────────────────────────────────
  if (populated.length === 0) {
    issues.push({
      id: 'no-statements',
      state: 'blocked',
      title: 'The statements have not been built',
      detail:
        'Nothing has been drawn from your accounting records yet. Use "Update from accounting" to build them.',
    });
    return summarise(issues);
  }

  // ── Does the balance sheet balance? ───────────────────────────────────────
  if (position) {
    const assets = amount(lineBy(position.lines, 'sfp.total_assets'));
    const claims = amount(
      lineBy(position.lines, 'sfp.total_liabilities_and_equity', 'sfp.total_equity_and_liabilities'),
    );
    if (assets != null && claims != null && Math.abs(assets - claims) > TOLERANCE) {
      issues.push({
        id: 'sfp-imbalance',
        state: 'blocked',
        title: 'The Statement of Financial Position does not balance',
        detail: `Total assets and total equity and liabilities differ by ${formatGap(assets - claims)}. These statements cannot be issued until the ledger balances.`,
        location: { kind: 'statement', id: position.id },
      });
    }
  }

  // ── Accounts the chart of accounts has not classified ─────────────────────
  for (const statement of populated) {
    const stray = statement.lines.filter((l) => l.is_reconciling);
    if (stray.length === 0) continue;
    const total = stray.reduce((sum, l) => sum + Math.abs(Number(l.amount || 0)), 0);
    issues.push({
      id: `unclassified-${statement.statement_type}`,
      state: 'action_required',
      title: `Unclassified amounts in the ${statement.title}`,
      detail: `${formatGap(total)} could not be presented under a heading because the accounts behind it are not classified in your chart of accounts. It is shown on its own line rather than hidden inside another.`,
      location: { kind: 'statement', id: statement.id },
    });
  }

  // ── Figures the ledger should have supplied but did not ───────────────────
  //
  // Two different things arrive as "manual". A disclosure that inherently calls
  // for judgement — the split of inventories, a commitment, a valuation — is
  // normal, expected work. A fact mapping that found nothing is a defect: the
  // figure exists in the ledger and the note failed to reach it. Reporting them
  // the same way buried the second in the first.
  const manual = model.manualFields || [];
  const noteFor = (code: string) =>
    model.notes.find((n) => String(n.disclosure_code).toUpperCase() === code.toUpperCase());

  const unmapped = manual.filter((f) => /^No financial fact mapped/.test(f.reason));
  if (unmapped.length > 0) {
    const first = noteFor(unmapped[0].noteCode);
    issues.push({
      id: 'unmapped-lines',
      state: 'action_required',
      title: `${unmapped.length} note ${unmapped.length === 1 ? 'line' : 'lines'} found no figure in the ledger`,
      // Absence is ambiguous from here: the company may genuinely hold none of
      // this, or the accounts may not be classified where the note looks. Say
      // both rather than assert the one we cannot prove.
      detail: `${unmapped
        .slice(0, 5)
        .map((f) => `${noteFor(f.noteCode)?.title || f.noteCode} — ${f.label}`)
        .join('; ')}${unmapped.length > 5 ? `; and ${unmapped.length - 5} more` : ''}. Either the company has none, or the accounts behind them are not classified where the note looks.`,
      location: first ? { kind: 'note', id: first.id } : undefined,
    });
  }

  const judgement = manual.filter((f) => !/^No financial fact mapped/.test(f.reason));
  if (judgement.length > 0) {
    const notes = [...new Set(judgement.map((f) => f.noteCode))];
    const first = noteFor(notes[0]);
    issues.push({
      id: 'disclosure-input',
      state: 'action_required',
      title: `${judgement.length} disclosure ${judgement.length === 1 ? 'figure needs' : 'figures need'} your input`,
      detail: `Breakdowns and estimates the ledger cannot supply, across ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}: ${notes
        .slice(0, 4)
        .map((c) => noteFor(c)?.title || c)
        .join(', ')}${notes.length > 4 ? `, and ${notes.length - 4} more` : ''}.`,
      location: first ? { kind: 'note', id: first.id } : undefined,
    });
  }

  // ── Comparatives ──────────────────────────────────────────────────────────
  const hasComparatives = populated.some((s) =>
    s.lines.some((l) => l.prior_amount != null && Number(l.prior_amount) !== 0),
  );
  if (!hasComparatives) {
    issues.push({
      id: 'no-comparatives',
      state: 'warning',
      title: 'No comparative figures',
      detail:
        'These statements show one year only. That is correct for a first set of financial statements; otherwise the prior year has not been captured.',
      location: position ? { kind: 'statement', id: position.id } : undefined,
    });
  }

  // ── The result has to be the same number in both statements ───────────────
  if (position && performance) {
    const resultInPerformance = amount(
      lineBy(performance.lines, 'perf.net_result', 'perf.profit_for_period', 'perf.result'),
    );
    const resultInPosition = amount(lineBy(position.lines, 'sfp.equity.current_result'));
    if (
      resultInPerformance != null &&
      resultInPosition != null &&
      Math.abs(resultInPerformance - resultInPosition) > TOLERANCE
    ) {
      issues.push({
        id: 'result-mismatch',
        state: 'blocked',
        title: 'The result for the year differs between statements',
        detail: `The Statement of Financial Performance reports a different figure from the one carried into equity, by ${formatGap(resultInPerformance - resultInPosition)}.`,
        location: { kind: 'statement', id: performance.id },
      });
    }
  }

  // ── Notes the framework asked for that are still blank ────────────────────
  const blank = model.notes.filter(
    (n) =>
      n.status !== 'superseded' &&
      n.requirement_level !== 'optional' &&
      n.sections.every((s) => !s.body.trim()) &&
      n.paragraphs.every((p) => !p.body.trim()) &&
      n.tables.every((t) => (t.rows_json || []).length === 0),
  );
  if (blank.length > 0) {
    issues.push({
      id: 'blank-notes',
      state: 'warning',
      title: `${blank.length} required ${blank.length === 1 ? 'note has' : 'notes have'} no content`,
      detail: blank
        .slice(0, 5)
        .map((n) => n.title)
        .join(', ') + (blank.length > 5 ? `, and ${blank.length - 5} more` : ''),
      location: { kind: 'note', id: blank[0].id },
    });
  }

  // ── Who the statements are for ────────────────────────────────────────────
  //
  // The company's own name is an internal label chosen at sign-up — often still
  // the default one — and it is not the name the entity is registered under.
  // The cover falls back to it so the document is never nameless, but falling
  // back is a finding, not a resting state: it is how a set of statements ends
  // up headed "My's Company".
  const registered = model.entity?.registered_name;
  if (!registered || !String(registered).trim()) {
    issues.push({
      id: 'no-entity-name',
      state: 'action_required',
      title: model.companyName
        ? `The cover reads "${model.companyName}" because no registered name is recorded`
        : 'The entity has no registered name',
      detail:
        'The cover, every page header and the exported file are named after the entity. Enter the name it is registered under under General Information.',
      location: { kind: 'information', id: 'information' },
    });
  }

  return summarise(issues);
}

function summarise(issues: ReadinessIssue[]): Readiness {
  const counts = { blocked: 0, action_required: 0, warning: 0 };
  for (const issue of issues) counts[issue.state] += 1;

  const worst = issues.reduce<Exclude<ReadinessState, 'ready'> | null>(
    (acc, i) => (acc === null || SEVERITY[i.state] > SEVERITY[acc] ? i.state : acc),
    null,
  );

  const order = (i: ReadinessIssue) => -SEVERITY[i.state];
  return {
    state: worst ?? 'ready',
    issues: [...issues].sort((a, b) => order(a) - order(b)),
    counts,
  };
}

function formatGap(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(Math.abs(value));
}
