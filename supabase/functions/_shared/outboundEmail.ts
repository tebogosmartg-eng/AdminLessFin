/**
 * Shared outbound mail — Resend delivery + company identity as the sender.
 *
 * From-address rules (Resend will reject an arbitrary mailbox):
 *   - If the company email's domain matches RESEND_DOMAIN, send FROM that address.
 *   - Otherwise send FROM `{mailbox}@{RESEND_DOMAIN}` and set Reply-To to the
 *     company email so customers/vendors reply to the business, not the platform.
 */
// @ts-nocheck
import { edgeFailure } from './enterpriseEdgePlatform.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class OutboundEmailError extends Error {
  code;
  category;
  businessMessage;
  recoverySuggestion;
  status;
  retryable;
  constructor(message, extras = {}) {
    super(message);
    this.name = 'OutboundEmailError';
    this.code = extras.code ?? 'EMAIL_NOT_CONFIGURED';
    this.category = extras.category ?? 'IntegrationError';
    this.businessMessage = extras.businessMessage;
    this.recoverySuggestion = extras.recoverySuggestion;
    this.status = extras.status ?? 503;
    this.retryable = extras.retryable ?? false;
  }
}

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

function formatFrom(name, email) {
  const safe = str(name).replace(/[<>"]/g, '') || 'Your Company';
  return `${safe} <${email}>`;
}

function domainOf(email) {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

/** Nested PostgREST relation: object, one-element array, or null. */
export function relatedOne(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * @param {{ name?: string, email?: string }} identity
 * @param {string} mailbox  e.g. purchasing | invoices | quotes | accounts | payroll
 */
export function resolveOutboundSender(identity, mailbox) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const domain = str(Deno.env.get('RESEND_DOMAIN')).replace(/^@/, '').toLowerCase();
  if (!apiKey || !domain) {
    throw new OutboundEmailError(
      'Email service is not configured. Set the RESEND_API_KEY and RESEND_DOMAIN secrets on the Supabase project to enable sending.',
      {
        code: 'EMAIL_NOT_CONFIGURED',
        category: 'IntegrationError',
        businessMessage:
          'Email delivery is not enabled for this workspace yet, so the message was not sent.',
        recoverySuggestion:
          'Set a company email under Settings → Company. If that is already set, ask an administrator to enable the mail delivery service.',
        status: 503,
        retryable: false,
      },
    );
  }

  const companyEmail = str(identity?.email).toLowerCase();
  const name = str(identity?.name) || 'Your Company';
  const companyDomain = companyEmail && EMAIL_REGEX.test(companyEmail) ? domainOf(companyEmail) : '';
  const fromEmail =
    companyDomain && companyDomain === domain ? companyEmail : `${mailbox}@${domain}`;

  return {
    apiKey,
    from: formatFrom(name, fromEmail),
    replyTo: companyEmail && EMAIL_REGEX.test(companyEmail) ? companyEmail : undefined,
  };
}

export async function sendOutboundEmail({ identity, mailbox, to, subject, html }) {
  const sender = resolveOutboundSender(identity, mailbox);
  const payload = {
    from: sender.from,
    to,
    subject,
    html,
  };
  if (sender.replyTo) payload.reply_to = sender.replyTo;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sender.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const resendBody = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    throw new OutboundEmailError(
      `Failed to send email: ${resendBody.message || 'Unknown error'}`,
      {
        code: 'EMAIL_DELIVERY_FAILED',
        category: 'IntegrationError',
        businessMessage:
          'The email could not be delivered. Check the recipient address and try again.',
        recoverySuggestion:
          resendBody.message
            ? String(resendBody.message)
            : 'Ask an administrator to confirm the mail delivery service is configured.',
        status: 502,
        retryable: true,
      },
    );
  }

  return {
    providerMessageId: resendBody.id ?? null,
    from: sender.from,
    replyTo: sender.replyTo ?? null,
  };
}

export function outboundEmailFailure(ctx, error) {
  if (error instanceof OutboundEmailError) {
    return edgeFailure(
      ctx,
      error,
      {
        category: error.category,
        code: error.code,
        businessMessage: error.businessMessage,
        recoverySuggestion: error.recoverySuggestion,
        retryable: error.retryable,
      },
      error.status,
    );
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (
    raw.includes('RESEND_API_KEY') ||
    raw.includes('RESEND_DOMAIN') ||
    raw.toLowerCase().includes('email service is not configured')
  ) {
    return edgeFailure(
      ctx,
      error,
      {
        category: 'IntegrationError',
        code: 'EMAIL_NOT_CONFIGURED',
        businessMessage:
          'Email delivery is not enabled for this workspace yet, so the message was not sent.',
        recoverySuggestion:
          'Set a company email under Settings → Company. If that is already set, ask an administrator to enable the mail delivery service.',
        retryable: false,
      },
      503,
    );
  }
  return edgeFailure(ctx, error);
}
