/**
 * Resolve the EAM enterprise certification tenant — never pick an arbitrary first membership.
 */

export type CompanyMembershipRow = {
  company_id: string;
  role: string;
  companies?: { id: string; name: string } | { id: string; name: string }[] | null;
};

export type ResolvedCertificationCompany = {
  companyId: string;
  companyName: string | null;
  role: string;
  resolution: 'env_company_id' | 'env_company_name' | 'default_enterprise_name';
};

function companyNameFromRow(row: CompanyMembershipRow): string | null {
  const c = row.companies;
  if (!c) return null;
  if (Array.isArray(c)) return c[0]?.name ?? null;
  return c.name ?? null;
}

/**
 * @throws Error when no valid certification tenant can be resolved.
 */
export function resolveEamCertificationCompany(
  memberships: CompanyMembershipRow[],
): ResolvedCertificationCompany {
  if (!memberships?.length) {
    throw new Error(
      'EAM certification requires company membership. Sign in with E2E_EMAIL and ensure company_users rows exist.',
    );
  }

  const explicitId =
    process.env.EAM_CERT_COMPANY_ID?.trim() || process.env.E2E_COMPANY_ID?.trim() || '';
  if (explicitId) {
    const hit = memberships.find((m) => m.company_id === explicitId);
    if (!hit) {
      throw new Error(
        `EAM certification company ${explicitId} is not in the signed-in user memberships. Set EAM_CERT_COMPANY_ID / E2E_COMPANY_ID to a company this user belongs to.`,
      );
    }
    return {
      companyId: hit.company_id,
      companyName: companyNameFromRow(hit),
      role: hit.role,
      resolution: 'env_company_id',
    };
  }

  const explicitName = process.env.EAM_CERT_COMPANY_NAME?.trim();
  if (explicitName) {
    const hit = memberships.find((m) => companyNameFromRow(m) === explicitName);
    if (!hit) {
      throw new Error(
        `EAM certification company name "${explicitName}" not found in memberships. Available: ${memberships
          .map((m) => companyNameFromRow(m) ?? m.company_id)
          .join(', ')}`,
      );
    }
    return {
      companyId: hit.company_id,
      companyName: companyNameFromRow(hit),
      role: hit.role,
      resolution: 'env_company_name',
    };
  }

  const defaultName = process.env.EAM_CERT_DEFAULT_COMPANY_NAME?.trim() || 'Spaceman';
  const preferred = memberships.find((m) => companyNameFromRow(m) === defaultName);
  if (!preferred) {
    throw new Error(
      `No valid EAM certification tenant. Set EAM_CERT_COMPANY_ID (recommended: Spaceman 3cbfd4eb-a095-43f3-837a-0b4f1e2c1752) or EAM_CERT_COMPANY_NAME. Signed-in memberships: ${memberships
        .map((m) => `${companyNameFromRow(m) ?? 'unknown'} (${m.company_id})`)
        .join('; ')}`,
    );
  }

  return {
    companyId: preferred.company_id,
    companyName: companyNameFromRow(preferred),
    role: preferred.role,
    resolution: 'default_enterprise_name',
  };
}
