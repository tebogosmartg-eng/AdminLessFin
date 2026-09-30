/**
 * CERT TX: reopen the final set (the product's "Reopen for changes") and
 * record the company's registered particulars through the engagement's
 * general-information route — the same save the Information page makes.
 *
 *   npx tsx tools/staging-recovery/cert-general-information.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const WORKSPACE = '0d534936-3535-422c-b2c6-472da049451c';

async function main() {
  const { supabase } = await connect('x');
  const call = async (method: string, body: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', { method, company_id: COMPANY, workspace_id: WORKSPACE, ...body });
    if (!r.ok) throw new Error(`${method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body as Record<string, unknown>;
  };

  const dash = (await call('GET_WORKSPACE_DASHBOARD')) as { snapshot?: { currentVersion?: { status?: string } } };
  const status = dash.snapshot?.currentVersion?.status;
  if (status === 'frozen' || status === 'publication_bound') {
    await call('CREATE_SNAPSHOT_DRAFT', { force_successor: true });
    console.log('reopened (new draft version; the final version is kept)');
  } else console.log(`already a draft (${status})`);

  await call('UPSERT_WORKSPACE_GENERAL_INFORMATION', {
    general_information: {
      registered_name: 'Protea Trading Solutions (Pty) Ltd',
      registration_number: '2024/512377/07',
      nature_of_business: 'The wholesale distribution of electronic components and the provision of related installation services',
      country_of_incorporation: 'South Africa',
      entity_type: 'Private company',
      registered_office: '12 Protea Road\nCenturion\n0157',
      business_address: '12 Protea Road\nCenturion\n0157',
      postal_address: 'PO Box 4410\nCenturion\n0046',
      telephone: '012 664 1200',
      email: 'accounts@proteatrading.example',
      income_tax_number: '9412/771/23/5',
      vat_number: '4870291133',
      directors: [
        { name: 'N.P. Mokoena', role: 'Director', appointment_date: '2024-11-01' },
        { name: 'J. van der Merwe', role: 'Director', appointment_date: '2024-11-01' },
      ],
      accounting_officer: 'Kreston Pretoria Accounting Services',
      principal_bankers: [{ bankName: 'First National Bank', active: true }],
      engagement_type: 'compilation',
      prepared_by: 'Kreston Pretoria Accounting Services',
      approval_date: '2027-03-15',
      issue_date: '2027-03-15',
      share_information: {
        share_class: 'Ordinary',
        authorised_shares: 1000000,
        issued_shares: 900000,
        issued_shares_prior: 900000,
        par_value: 1,
      },
    },
  });
  console.log('general information saved');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
