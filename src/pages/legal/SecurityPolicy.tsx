import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, KeyRound, ScrollText, Server, Users } from 'lucide-react';
import { MarketingShell, LegalBody, LegalSection } from '../../components/marketing/MarketingShell';
import { BRAND } from '../../config/brand';

const LAST_UPDATED = 'Last updated: 29 July 2026';

const CONTROLS = [
  { icon: Lock, title: 'Encryption', desc: 'Data is encrypted in transit (TLS) and at rest on our managed cloud infrastructure.' },
  { icon: Users, title: 'Tenant separation', desc: 'Row-level security scopes every query to your company. Users only see data for workspaces they belong to.' },
  { icon: KeyRound, title: 'Role-based access', desc: 'Permissions control who can view, post, approve or manage sensitive financial workflows.' },
  { icon: ScrollText, title: 'Audit trail', desc: 'Key actions are recorded so changes to financial records can be reviewed.' },
  { icon: Server, title: 'Managed infrastructure', desc: 'Hosted on reputable cloud infrastructure with automated backups of your data.' },
  { icon: ShieldCheck, title: 'Authenticated access', desc: 'Every request is authenticated, and edge services verify company membership before returning data.' },
];

const SecurityPolicy = () => (
  <MarketingShell title="Security">
    <LegalBody eyebrow="Trust" title="Security at AdminLess Fin" updated={LAST_UPDATED}>
      <p>
        Your financial data deserves careful handling. Below is a factual summary of the controls that
        protect {BRAND.product} today. As a private-beta product we continue to strengthen our security
        posture, and we are transparent about what is in place now versus what we are working toward.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {CONTROLS.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <c.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{c.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>

      <LegalSection heading="Data ownership">
        <p>
          You own your business data and can export it. We do not sell your data. See our{' '}
          <Link to="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>{' '}
          for how information is collected and used.
        </p>
      </LegalSection>

      <LegalSection heading="Responsible disclosure">
        <p>
          If you believe you have found a security issue, please tell us before disclosing it publicly so
          we can investigate and fix it. Report it through the{' '}
          <Link to="/contact" className="font-medium text-primary hover:underline">contact page</Link>{' '}
          and we will respond promptly.
        </p>
      </LegalSection>

      <LegalSection heading="Working toward">
        <p>
          As we move from private beta toward general availability, we are formalising our backup and
          incident-response processes and pursuing independent security reviews. We will update this page
          as those milestones are reached. We make no claims of certifications we do not yet hold.
        </p>
      </LegalSection>
    </LegalBody>
  </MarketingShell>
);

export default SecurityPolicy;
