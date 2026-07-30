import { Link } from 'react-router-dom';
import { MarketingShell, LegalBody, LegalSection } from '../../components/marketing/MarketingShell';
import { BRAND } from '../../config/brand';

const LAST_UPDATED = 'Last updated: 29 July 2026';

const PrivacyPolicy = () => (
  <MarketingShell title="Privacy Policy">
    <LegalBody eyebrow="Legal" title="Privacy Policy" updated={LAST_UPDATED}>
      <p>
        This policy explains what information {BRAND.product} collects, how it is used, and the choices
        you have. {BRAND.product} is a cloud financial platform for South African businesses and is
        currently in private beta. We will update this policy as the product matures; material changes
        will be reflected by the date above.
      </p>

      <LegalSection heading="Who this applies to">
        <p>
          This policy applies to businesses and individuals who create an account, are invited to a
          company workspace, or otherwise use {BRAND.product}.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li><span className="text-foreground">Account information</span> — your name, email address and authentication details.</li>
          <li><span className="text-foreground">Business and financial data</span> — the records you enter or import, such as your chart of accounts, invoices, bills, payroll, employees and transactions.</li>
          <li><span className="text-foreground">Usage information</span> — basic technical logs needed to operate, secure and troubleshoot the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <p>
          We use your information to provide the service, keep your account secure, process the
          accounting, payroll and reporting features you request, respond to support enquiries, and
          improve reliability. We do not sell your personal or financial information.
        </p>
      </LegalSection>

      <LegalSection heading="Data separation and access">
        <p>
          Each company workspace is logically separated, and access is controlled by role-based
          permissions and row-level security so that users only see data for companies they belong to.
          Access to production data by our team is limited to what is necessary to operate and support
          the service.
        </p>
      </LegalSection>

      <LegalSection heading="Storage and processing">
        <p>
          Your data is stored on managed cloud infrastructure and is encrypted in transit and at rest.
          We engage service providers (such as our hosting and infrastructure partners) to operate the
          platform; they process data on our behalf under their own security commitments.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Subject to applicable South African law, including the Protection of Personal Information Act
          (POPIA), you may request access to, correction of, or deletion of your personal information.
          You can also export your business data. To make a request, contact us using the details below.
        </p>
      </LegalSection>

      <LegalSection heading="Retention">
        <p>
          We retain your information for as long as your account is active and as needed to provide the
          service, comply with legal and accounting record-keeping obligations, and resolve disputes.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy or a data request? Reach us via the{' '}
          <Link to="/contact" className="font-medium text-primary hover:underline">contact page</Link>.
          This document is a beta-stage policy and does not constitute legal advice.
        </p>
      </LegalSection>
    </LegalBody>
  </MarketingShell>
);

export default PrivacyPolicy;
