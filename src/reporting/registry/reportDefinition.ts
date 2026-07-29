/**
 * Report Definition contracts — Enterprise Reporting Platform (V3.6.3)
 *
 * Domain-agnostic. Modules register reports; they do not recalculate business logic.
 */

export type ReportModule =
  | 'payroll'
  | 'accounting'
  | 'inventory'
  | 'assets'
  | 'sales'
  | 'crm'
  | 'platform'
  | 'work';

export type ReportCategory =
  | 'operational'
  | 'management'
  | 'statutory'
  | 'analytical'
  | 'compliance';

export type ReportExportFormat = 'csv' | 'excel' | 'pdf' | 'json';

export type ReportFilterType = 'date_range' | 'string' | 'enum' | 'boolean' | 'number' | 'company';

export type ReportFilterDefinition = {
  id: string;
  label: string;
  type: ReportFilterType;
  required?: boolean;
  enumValues?: string[];
  description?: string;
};

export type ReportPermission = {
  /** Capability / role keys that may run this report. Empty = authenticated company user. */
  roles?: string[];
  /** Fine-grained permission codes (e.g. payroll.reports.read). */
  permissions?: string[];
  /** When true, report is visible in catalogue but generator may still enforce auth. */
  publicCatalogue?: boolean;
};

export type ReportRow = Record<string, string | number | boolean | null>;

export type ReportResult = {
  reportId: string;
  generatedAt: string;
  title: string;
  subtitle?: string;
  columns?: string[];
  rows: ReportRow[];
  meta?: Record<string, unknown>;
};

export type ReportGeneratorContext = {
  companyId: string;
  companyName?: string;
  filters: Record<string, unknown>;
  /** Finalized snapshot facts / ledger facts — never live engine output. */
  source: unknown;
  userId?: string;
  roles?: string[];
};

export type ReportGenerator = (ctx: ReportGeneratorContext) => ReportResult | Promise<ReportResult>;

export type ReportDefinition = {
  id: string;
  name: string;
  module: ReportModule;
  category: ReportCategory;
  description: string;
  supportedFilters: readonly ReportFilterDefinition[];
  supportedExports: readonly ReportExportFormat[];
  permissions: ReportPermission;
  generator: ReportGenerator;
  /** Optional tags for discovery */
  tags?: readonly string[];
  /** When false, hidden from default catalogue listings */
  enabled?: boolean;
};

export type ReportDefinitionInput = Omit<ReportDefinition, 'enabled'> & {
  enabled?: boolean;
};
