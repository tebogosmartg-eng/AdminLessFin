/**
 * Report Registry — Enterprise Reporting Platform (V3.6.3)
 *
 * Every report must register itself. Modules add definitions; consumers discover by
 * module / category / id without knowing domain internals.
 */

import type {
  ReportCategory,
  ReportDefinition,
  ReportDefinitionInput,
  ReportModule,
} from './reportDefinition';

const registry = new Map<string, ReportDefinition>();

export function registerReport(definition: ReportDefinitionInput): ReportDefinition {
  if (!definition.id?.trim()) {
    throw new Error('Report definition requires a non-empty id.');
  }
  if (!definition.generator) {
    throw new Error(`Report "${definition.id}" requires a generator.`);
  }
  if (registry.has(definition.id)) {
    throw new Error(`Report "${definition.id}" is already registered.`);
  }

  const frozen: ReportDefinition = Object.freeze({
    ...definition,
    enabled: definition.enabled !== false,
    supportedFilters: Object.freeze([...(definition.supportedFilters ?? [])]),
    supportedExports: Object.freeze([...(definition.supportedExports ?? [])]),
    permissions: Object.freeze({ ...(definition.permissions ?? {}) }),
    tags: definition.tags ? Object.freeze([...definition.tags]) : undefined,
  });

  registry.set(frozen.id, frozen);
  return frozen;
}

export function getReport(id: string): ReportDefinition | undefined {
  return registry.get(id);
}

export function requireReport(id: string): ReportDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Report "${id}" is not registered.`);
  return def;
}

export function listReports(options?: {
  module?: ReportModule;
  category?: ReportCategory;
  enabledOnly?: boolean;
}): ReportDefinition[] {
  const enabledOnly = options?.enabledOnly !== false;
  return Array.from(registry.values())
    .filter((r) => (enabledOnly ? r.enabled !== false : true))
    .filter((r) => (options?.module ? r.module === options.module : true))
    .filter((r) => (options?.category ? r.category === options.category : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listReportCatalogue(module?: ReportModule) {
  return listReports({ module, enabledOnly: true }).map((r) => ({
    id: r.id,
    name: r.name,
    module: r.module,
    category: r.category,
    description: r.description,
    supportedFilters: r.supportedFilters,
    supportedExports: r.supportedExports,
    tags: r.tags,
  }));
}

/** Test / bootstrap helper — clears all registrations. */
export function clearReportRegistry(): void {
  registry.clear();
}

export function isReportRegistered(id: string): boolean {
  return registry.has(id);
}
