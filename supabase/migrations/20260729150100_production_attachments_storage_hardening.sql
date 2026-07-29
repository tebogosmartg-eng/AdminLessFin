-- Production Hardening Sprint 1 — attachments bucket visibility and mime hardening.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id = 'attachments';

DROP POLICY IF EXISTS "attachments_bucket_read_authenticated" ON storage.buckets;
CREATE POLICY "attachments_bucket_read_authenticated"
ON storage.buckets FOR SELECT
TO authenticated
USING (id = 'attachments');
