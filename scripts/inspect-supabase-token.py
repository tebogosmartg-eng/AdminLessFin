import json
import win32cred
from pathlib import Path

out = Path(__file__).with_name(".token-meta.json")
cred = win32cred.CredRead("Supabase CLI:supabase", win32cred.CRED_TYPE_GENERIC)
blob = cred["CredentialBlob"]
variants = {
    "utf16": blob.decode("utf-16-le"),
    "utf8": blob.decode("utf-8", "replace"),
    "latin1": blob.decode("latin-1"),
}
meta = {}
for k, v in variants.items():
    meta[k] = {
        "len": len(v),
        "starts_sbp": v.startswith("sbp_"),
        "prefix_codepoints": [ord(ch) for ch in v[:8]],
        "is_printable": v.isprintable(),
    }
out.write_text(json.dumps(meta, indent=2), encoding="utf-8")
