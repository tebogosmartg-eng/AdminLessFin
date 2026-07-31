import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Maps a document status to the correct Badge variant so status colour is
 * consistent and semantically right across the whole app:
 *   success (emerald) = settled/agreed · warning (amber) = awaiting action
 *   outline = draft · destructive (red) = void/declined/overdue · secondary = other
 */
export type StatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

export function statusBadgeVariant(status?: string | null): StatusBadgeVariant {
  const s = (status ?? "").toLowerCase().trim();
  if (["paid", "accepted", "active", "approved", "completed", "reconciled", "received", "closed", "billed"].includes(s)) return "success";
  if (["sent", "partial", "open", "pending", "submitted", "processing", "unpaid", "awaiting"].includes(s)) return "warning";
  if (["draft"].includes(s)) return "outline";
  if (["void", "voided", "declined", "rejected", "cancelled", "canceled", "overdue", "failed", "expired"].includes(s)) return "destructive";
  return "secondary";
}

/**
 * CSV export. Papa Parse is imported dynamically rather than at module scope:
 * this file also exports `cn()`, which every UI component imports, so a static
 * import put the whole CSV parser in the eager startup bundle for the sake of a
 * user-triggered export that most sessions never perform.
 *
 * Returns a promise so callers *may* await it; every existing call site invokes
 * it as a statement and is unaffected. Output bytes are byte-for-byte identical
 * \u2014 same BOM, same Papa.unparse, same blob type and filename.
 */
export async function downloadCSV(data: any[], filename: string) {
  const { default: Papa } = await import("papaparse");
  const csv = Papa.unparse(data);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export type PayrollFunctionError = {
  error?: string;
  stage?: string;
  code?: string;
  recovery?: string;
};

export function parsePayrollFunctionError(
  data: unknown,
  fallback: string
): string {
  if (!data || typeof data !== 'object') return fallback;
  const payload = data as PayrollFunctionError;
  if (payload.error && payload.recovery) {
    const stage = payload.stage ? `[${payload.stage}] ` : '';
    return `${stage}${payload.error} — ${payload.recovery}`;
  }
  return payload.error ?? fallback;
}