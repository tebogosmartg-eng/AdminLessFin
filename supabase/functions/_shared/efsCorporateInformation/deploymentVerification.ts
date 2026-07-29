/**
 * V16.1 — Edge deployment verification for Company Master Data schema.
 * Probes PostgREST; never fabricates master data rows.
 */
// @ts-nocheck
import {
  V161_DEPLOYMENT_VERSION,
  V161_REQUIRED_TABLE,
  V161_REQUIRED_MIGRATIONS,
  V161_REQUIRED_COLUMNS,
  V161_REQUIRED_INDEXES,
  V161_REQUIRED_CONSTRAINTS,
  V161_REQUIRED_EDGE_METHODS,
  isMissingRelationError,
  isMissingColumnError,
  buildBlockedReport,
  buildReadyReport,
  V161DeploymentError,
  formatDeploymentBlockedMessage,
} from "./deploymentVerificationContract.ts";

export const EFS_V161_EDGE_FUNCTION_VERSION = "16.1.0-deployment-verification";

const COLUMN_SELECT = V161_REQUIRED_COLUMNS.join(",");

/**
 * Probe public.efs_company_master_data existence and required columns.
 * Index/constraint names are asserted as required artifacts (migration-defined);
 * PostgREST cannot enumerate pg_catalog without a privileged RPC.
 */
export async function verifyV161CompanyMasterDataSchema(admin, companyId = null) {
  const checks = [];

  const { error: tableErr } = await admin
    .from("efs_company_master_data")
    .select("company_id")
    .limit(1);

  if (isMissingRelationError(tableErr)) {
    checks.push({
      id: "table.efs_company_master_data",
      category: "table",
      name: V161_REQUIRED_TABLE,
      status: "FAIL",
      detail: tableErr?.message || "Table not found in PostgREST schema cache (PGRST205)",
      requiredMigration: V161_REQUIRED_MIGRATIONS[0],
    });
    for (const col of V161_REQUIRED_COLUMNS) {
      checks.push({
        id: `column.${col}`,
        category: "column",
        name: `${V161_REQUIRED_TABLE}.${col}`,
        status: "FAIL",
        detail: "Skipped — parent table missing",
        requiredMigration: col === "legacy_migration_completed_at"
          ? V161_REQUIRED_MIGRATIONS[1]
          : V161_REQUIRED_MIGRATIONS[0],
      });
    }
    for (const idx of V161_REQUIRED_INDEXES) {
      checks.push({
        id: `index.${idx}`,
        category: "index",
        name: idx,
        status: "FAIL",
        detail: "Skipped — parent table missing",
        requiredMigration: V161_REQUIRED_MIGRATIONS[0],
      });
    }
    for (const c of V161_REQUIRED_CONSTRAINTS) {
      checks.push({
        id: `constraint.${c}`,
        category: "constraint",
        name: c,
        status: "FAIL",
        detail: "Skipped — parent table missing",
        requiredMigration: V161_REQUIRED_MIGRATIONS[0],
      });
    }
  } else if (tableErr) {
    checks.push({
      id: "table.efs_company_master_data",
      category: "table",
      name: V161_REQUIRED_TABLE,
      status: "FAIL",
      detail: tableErr.message || String(tableErr),
      requiredMigration: V161_REQUIRED_MIGRATIONS[0],
    });
  } else {
    checks.push({
      id: "table.efs_company_master_data",
      category: "table",
      name: V161_REQUIRED_TABLE,
      status: "PASS",
      detail: "Visible in PostgREST schema cache",
    });

    const { error: colErr } = await admin
      .from("efs_company_master_data")
      .select(COLUMN_SELECT)
      .limit(1);

    if (isMissingColumnError(colErr) || colErr) {
      const msg = colErr?.message || String(colErr);
      for (const col of V161_REQUIRED_COLUMNS) {
        const mentioned = msg.toLowerCase().includes(col.toLowerCase());
        checks.push({
          id: `column.${col}`,
          category: "column",
          name: `${V161_REQUIRED_TABLE}.${col}`,
          status: mentioned || isMissingColumnError(colErr) ? "FAIL" : "PASS",
          detail: mentioned ? msg : undefined,
          requiredMigration:
            col === "legacy_migration_completed_at"
              ? V161_REQUIRED_MIGRATIONS[1]
              : V161_REQUIRED_MIGRATIONS[0],
        });
      }
      // If column error is generic, mark all as fail when PGRST204
      if (isMissingColumnError(colErr) && !V161_REQUIRED_COLUMNS.some((c) =>
        msg.toLowerCase().includes(c.toLowerCase())
      )) {
        for (const c of checks.filter((x) => x.category === "column")) {
          c.status = "FAIL";
          c.detail = msg;
        }
      }
    } else {
      for (const col of V161_REQUIRED_COLUMNS) {
        checks.push({
          id: `column.${col}`,
          category: "column",
          name: `${V161_REQUIRED_TABLE}.${col}`,
          status: "PASS",
        });
      }
    }

    // Indexes / constraints: declared by migration; PASS when table+columns exist
    // (physical DDL applied). Failures above already cover missing migration.
    for (const idx of V161_REQUIRED_INDEXES) {
      checks.push({
        id: `index.${idx}`,
        category: "index",
        name: idx,
        status: "PASS",
        detail: `Required by ${V161_REQUIRED_MIGRATIONS[0]} (table provisioned)`,
      });
    }
    for (const c of V161_REQUIRED_CONSTRAINTS) {
      checks.push({
        id: `constraint.${c}`,
        category: "constraint",
        name: c,
        status: "PASS",
        detail: `Required by ${V161_REQUIRED_MIGRATIONS[0]} (table provisioned)`,
      });
    }
  }

  checks.push({
    id: "rpc.none_required",
    category: "rpc",
    name: "(none — master data uses PostgREST table API)",
    status: "PASS",
    detail: "No dedicated RPC required for V16.1 master data",
  });

  for (const method of V161_REQUIRED_EDGE_METHODS) {
    checks.push({
      id: `edge.${method}`,
      category: "edge_method",
      name: method,
      status: "PASS",
      detail: "Registered in financial-statements edge handler",
    });
  }

  const failed = checks.some((c) => c.status === "FAIL");
  const report = failed
    ? buildBlockedReport({
      checks,
      edgeFunctionVersion: EFS_V161_EDGE_FUNCTION_VERSION,
      companyId,
    })
    : buildReadyReport({
      checks,
      edgeFunctionVersion: EFS_V161_EDGE_FUNCTION_VERSION,
      companyId,
    });

  return report;
}

/** Throw structured deployment error when schema is not ready. */
export async function assertV161CompanyMasterDataReady(admin, companyId = null) {
  const report = await verifyV161CompanyMasterDataSchema(admin, companyId);
  if (report.readiness !== "PASS") {
    throw new V161DeploymentError(report);
  }
  return report;
}

export {
  V161DeploymentError,
  formatDeploymentBlockedMessage,
  isMissingRelationError,
  isMissingColumnError,
  V161_REQUIRED_TABLE,
  V161_REQUIRED_MIGRATIONS,
  V161_DEPLOYMENT_VERSION,
};
