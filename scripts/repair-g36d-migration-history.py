import json
import urllib.request
import win32cred

PROJECT_REF = "zaulhnpohrgqqodvzhxp"
SQL = """
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260726220000')
ON CONFLICT DO NOTHING;

SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260726220000';
"""

cred = win32cred.CredRead("Supabase CLI:supabase", win32cred.CRED_TYPE_GENERIC)
token = cred["CredentialBlob"].decode("utf-8")
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    data=json.dumps({"query": SQL}).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "SupabaseCLI/2.109.0",
    },
    method="POST",
)
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
