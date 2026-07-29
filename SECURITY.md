# Security Policy

AdminLess Fin is a financial operating system. We treat security reports seriously, especially issues that could affect accounting integrity, payroll accuracy, or tenant data isolation.

## Supported Versions

Security fixes are provided for actively maintained release lines only.

| Version | Supported |
| ------- | --------- |
| Latest `main` | Yes |
| Older commits / tags | No (unless explicitly listed in a release announcement) |

If you are running a fork or a pinned commit, please include the commit SHA or tag in your report.

## How to Report a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

Report security issues privately to:

**Email:** security@adminless.com

If that address is not yet active for your deployment, contact the repository maintainer through the private channel provided in the repository settings or your enterprise support agreement.

Include as much detail as possible:

- Description of the issue and potential impact
- Steps to reproduce (proof of concept if available)
- Affected components (frontend, edge function name, migration, module)
- Your environment (browser, Node version, Supabase project role, if relevant)
- Whether the issue affects accounting balances, payroll calculations, audit trails, or multi-tenant isolation

## Responsible Disclosure Policy

We ask researchers and users to:

1. **Report privately** and allow reasonable time for investigation and remediation before public disclosure.
2. **Avoid** accessing, modifying, or exfiltrating data that does not belong to you.
3. **Avoid** denial-of-service testing against production systems without prior written approval.
4. **Avoid** social engineering, physical intrusion, or third-party service attacks outside the scope of this project.
5. **Good faith** — act in the interest of user safety and data integrity.

We will not pursue legal action against researchers who follow this policy and act in good faith.

## Response Targets

These are targets, not guarantees. Complex financial or accounting issues may require extended validation.

| Stage | Target |
| ----- | ------ |
| Initial acknowledgement | 2 business days |
| Triage and severity assessment | 5 business days |
| Status update for confirmed issues | Every 7 business days until resolved |
| Fix or mitigation for critical issues | 30 days (target) |
| Fix or mitigation for high-severity issues | 90 days (target) |

Severity is assessed based on exploitability, scope, and impact on confidentiality, integrity, and availability.

## Scope

**In scope**

- AdminLess Fin application source in this repository
- Supabase Edge Functions shipped in `supabase/functions/`
- Database migrations in `supabase/migrations/`
- Authentication, authorization, and tenant isolation in the application layer
- Issues that could cause incorrect journal postings, payroll miscalculations, or unauthorized access to company data

**Out of scope**

- Third-party services (Supabase platform, Vercel, Resend, OpenAI, etc.) — report to the respective vendor
- Misconfigured `.env` files or exposed credentials in user-controlled deployments
- Issues requiring physical access to a user's device
- Automated scanning noise without demonstrated impact
- Social engineering of end users

## Priority: Financial and Accounting Integrity

Issues that could affect **financial or accounting integrity** receive the **highest priority**, including but not limited to:

- Incorrect double-entry journal postings or balance corruption
- Payroll or statutory calculation errors that would produce wrong payslips or tax figures
- Bypass of period close, CoA system-account protection, or posting-engine controls
- Cross-tenant data leakage (one company accessing another company's ledger, payroll, or documents)
- Tampering with or silent deletion of audit trails

These reports are escalated immediately for triage, even if exploitation requires authenticated access.

## Security Best Practices for Deployments

Operators and contributors should:

- **Never commit secrets.** Use `.env` locally and platform secret stores in production. Rotate keys if exposure is suspected.
- **Protect the service role key.** `SUPABASE_SERVICE_ROLE_KEY` must only exist in Supabase Edge Function secrets, never in frontend env vars.
- **Apply migrations in order.** Run all migrations in `supabase/migrations/` on production before deploying dependent edge functions.
- **Deploy edge functions after schema changes.** Frontend releases assume matching backend function and migration versions.
- **Enable least privilege.** Restrict Supabase dashboard and deployment access to trusted operators.
- **Use HTTPS only.** Production frontends must be served over TLS.
- **Review CI output.** The statutory certification workflow (`npm run build`, tests, certification gates) should pass before promoting releases.

## Recognition

We appreciate responsible disclosure. With your permission, we may acknowledge researchers in release notes. We do not currently operate a paid bug bounty program.
