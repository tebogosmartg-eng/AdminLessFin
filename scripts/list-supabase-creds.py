import win32cred

targets = win32cred.CredEnumerate(None, 0)
for c in targets:
    name = c.get("TargetName", "")
    if "supabase" in name.lower():
        blob = c.get("CredentialBlob", b"")
        print(name, "| user:", c.get("UserName"), "| blob_len:", len(blob))
