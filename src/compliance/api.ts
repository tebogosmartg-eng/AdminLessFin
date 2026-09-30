import { supabase } from '../integrations/supabase/client';
import {
  SESSION_EXPIRED_MESSAGE,
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../lib/auth/ensureSessionForInvoke';
import { parsePlatformErrorEnvelope } from '../lib/platform/platformError';

/** Only the `compliance` edge function; the UI never touches the tables. */

async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      return await context.clone().json();
    } catch {
      return null;
    }
  }
  return null;
}

function toReadableError(payload: unknown, fallback: string): Error {
  const err = parsePlatformErrorEnvelope(payload, 'compliance:client');
  if (
    err.envelope.category === 'AuthenticationError' ||
    /not authenticated|jwt|session/i.test(`${err.envelope.technicalMessage} ${fallback}`)
  ) {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }
  // The server writes plain-language messages for everything a user can fix.
  const business = err.envelope.businessMessage;
  if (business && !/^bad request$/i.test(business) && !/non-2xx/i.test(business)) return new Error(business);
  return new Error(err.envelope.technicalMessage || fallback);
}

export async function invokeCompliance<T>(
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const session = await ensureSessionForInvoke();
  const { data, error } = await supabase.functions.invoke('compliance', {
    body: { ...payload, method, company_id: companyId },
    headers: authorizationHeaderFromSession(session),
  });
  if (error) {
    const body = await readFunctionErrorBody(error);
    throw toReadableError(body ?? error, error.message || 'Compliance request failed');
  }
  if (data?.error || data?.platformError) {
    throw toReadableError(data, typeof data.error === 'string' ? data.error : 'Compliance request failed');
  }
  return data as T;
}

/**
 * Uploads a file through a server-issued signed URL to the private bucket.
 * The browser never chooses the storage path.
 */
export async function uploadComplianceEvidence(
  companyId: string,
  cycleId: string,
  file: File,
  title: string,
): Promise<string> {
  const ticket = await invokeCompliance<{ evidence_id: string; path: string; token: string }>(
    companyId,
    'EVIDENCE_CREATE_UPLOAD',
    { cycle_id: cycleId, file_name: file.name, mime_type: file.type, size_bytes: file.size, title },
  );
  const { error } = await supabase.storage
    .from('compliance-evidence')
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw new Error(`The upload failed: ${error.message}`);
  return ticket.evidence_id;
}
