// Governance Foundation — shared types (Phase G3.1).
//
// These types are used across every governance domain so that "domain model",
// "validation model", "read interface", "mutation interface", and "permission
// boundary" (per Enterprise Constitution Volume I/II) mean the same shape
// everywhere, rather than each domain inventing its own conventions.
//
// This file introduces no runtime behaviour — it is type declarations only.

export type GovernanceRole = 'owner' | 'admin' | 'member';

// Permission boundary: the declared requirement for a given action, checked
// by callers against the actor's actual role. Phase G3.1 only *declares*
// these boundaries per domain — enforcement wiring into a live permission
// layer (Volume I §8) is a later migration phase's job, not this one's.
export interface GovernancePermissionBoundary {
  action: string;
  requiredRole: GovernanceRole;
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface GovernanceMutationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// Every governance service method that reads or writes company-scoped data
// takes at minimum a companyId — this is the one required piece of context,
// matching the company-scoping already used throughout the existing app.
export interface GovernanceServiceContext {
  companyId: string;
}
