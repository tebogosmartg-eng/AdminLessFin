-- Production Hardening Sprint 1 — attachments storage bucket and RLS.
-- Paths: {company_id}/{filename} — consumed by journals, bills, logos, expenses.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Company-scoped read (authenticated members + public URLs for public bucket).
DROP POLICY IF EXISTS "attachments_select_company_members" ON storage.objects;
CREATE POLICY "attachments_select_company_members"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attachments_insert_company_members" ON storage.objects;
CREATE POLICY "attachments_insert_company_members"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attachments_update_company_members" ON storage.objects;
CREATE POLICY "attachments_update_company_members"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attachments_delete_company_members" ON storage.objects;
CREATE POLICY "attachments_delete_company_members"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
  )
);
