/**
 * Framework pack versioning constants (V14.2).
 *
 * Future amendments register a new versionId under frameworks/<key>/<version>/
 * without changing the Framework Content Engine.
 */

export const ACTIVE_FRAMEWORK_VERSION = '2026.1' as const;

export type FrameworkVersionId = typeof ACTIVE_FRAMEWORK_VERSION | string;

export function contentRefFor(frameworkKey: string, versionId: string = ACTIVE_FRAMEWORK_VERSION): string {
  return `platform://frameworks/${frameworkKey}/${versionId}`;
}
