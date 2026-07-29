"""Apply G36D migration via Supabase Management API."""
import json
import sys
import urllib.request
from pathlib import Path

import win32cred

PROJECT_REF = "zaulhnpohrgqqodvzhxp"
ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260726220000_efs_g36d_financial_year_consumer_binding.sql"
VERIFY = """
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'efs_reporting_periods'
  AND column_name = 'financial_year_id';
"""


def get_token() -> str:
    cred = win32cred.CredRead("Supabase CLI:supabase", win32cred.CRED_TYPE_GENERIC)
    return cred["CredentialBlob"].decode("utf-8")


def run_query(token: str, sql: str):
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def main() -> int:
    token = get_token()
    sql = MIGRATION.read_text(encoding="utf-8")
    print(f"Applying migration: {MIGRATION.name}")
    apply_result = run_query(token, sql)
    print("Apply result:", json.dumps(apply_result, indent=2))
    verify_result = run_query(token, VERIFY)
    print("Verify result:", json.dumps(verify_result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
