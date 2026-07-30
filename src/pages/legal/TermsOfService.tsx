import { Link } from 'react-router-dom';
import { MarketingShell, LegalBody, LegalSection } from '../../components/marketing/MarketingShell';
import { BRAND } from '../../config/brand';

const LAST_UPDATED = 'Last updated: 29 July 2026';

const TermsOfService = () => (
  <MarketingShell title="Terms of Service">
    <LegalBody eyebrow="Legal" title="Terms of Service" updated={LAST_UPDATED}>
      <p>
        These terms govern your use of {BRAND.product} during its private beta. By creating an account
        or using the service, you agree to these terms on behalf of your business.
      </p>

      <LegalSection heading="The service">
        <p>
          {BRAND.product} is a cloud platform for accounting, invoicing, payroll, inventory and financial
          reporting, aimed at South African small and medium-sized businesses. Features and availability
          may change during the beta as we improve the product.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You are responsible for the accuracy of the information you enter, for maintaining the
          confidentiality of your login credentials, and for the activity of users you invite to your
          company workspace. You must use the service lawfully and only for your own business records.
        </p>
      </LegalSection>

      <LegalSection heading="Your data">
        <p>
          You retain ownership of the business and financial data you enter. You grant us the permissions
          needed to host and process that data to provide the service, as described in our{' '}
          <Link to="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Not professional advice">
        <p>
          {BRAND.product} provides software tools, including calculations for items such as VAT, PAYE,
          UIF and SDL based on the information you enter. It is not a substitute for professional
          accounting, tax, audit or legal advice. You remain responsible for reviewing your records and
          for your own statutory submissions. Please confirm outputs with your accountant or registered
          tax practitioner before filing.
        </p>
      </LegalSection>

      <LegalSection heading="Beta service and availability">
        <p>
          During the beta the service is provided on an “as is” and “as available” basis. We aim for high
          reliability but do not guarantee uninterrupted availability, and features may be added, changed
          or removed. We recommend keeping your own backups of critical records.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, {BRAND.master} is not liable for indirect or
          consequential losses arising from use of the beta service. Nothing in these terms limits
          liability that cannot be limited under South African law.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the service and close your account at any time. We may suspend or terminate
          access for breach of these terms or to protect the service and its users.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law and contact">
        <p>
          These terms are governed by the laws of the Republic of South Africa. Questions? Reach us via
          the <Link to="/contact" className="font-medium text-primary hover:underline">contact page</Link>.
          This document is a beta-stage agreement and does not constitute legal advice.
        </p>
      </LegalSection>
    </LegalBody>
  </MarketingShell>
);

export default TermsOfService;
