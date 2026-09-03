import { describe, it, expect } from 'vitest';
import { identityFromMaster } from '../../src/lib/enterpriseMasterData/identity';
import { classifyFromMessage } from '../../src/lib/platform/platformError';

describe('enterprise identity email', () => {
  it('projects company email from the address repository', () => {
    const identity = identityFromMaster('co-1', {
      company_profile: { registered_name: 'Spaceman (Pty) Ltd' },
      addresses: {
        business_address: '1 Main Road',
        email: 'accounts@spaceman.co.za',
      },
      tax_registrations: {},
      directors: [],
      governance: {},
      officers: [],
      principal_bankers: [],
    });

    expect(identity.email).toBe('accounts@spaceman.co.za');
    expect(identity.name).toBe('Spaceman (Pty) Ltd');
  });

  it('returns an empty email when master data has none', () => {
    const identity = identityFromMaster('co-1', null);
    expect(identity.email).toBe('');
  });
});

describe('outbound mail error classification', () => {
  it('classifies a missing Resend configuration as an integration failure, not a 500-style unknown', () => {
    expect(
      classifyFromMessage(
        'Email service is not configured. Set the RESEND_API_KEY and RESEND_DOMAIN secrets on the Supabase project to enable sending.',
      ),
    ).toBe('IntegrationError');
  });

  it('classifies a Resend delivery failure as an integration failure', () => {
    expect(classifyFromMessage('Failed to send email: The domain is not verified.')).toBe(
      'IntegrationError',
    );
  });
});
