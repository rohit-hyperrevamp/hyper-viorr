
ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS review_proof_url text;

-- Storage policies for the new private bucket
DROP POLICY IF EXISTS "attendance_review_proofs_select" ON storage.objects;
DROP POLICY IF EXISTS "attendance_review_proofs_insert" ON storage.objects;
DROP POLICY IF EXISTS "attendance_review_proofs_update" ON storage.objects;
DROP POLICY IF EXISTS "attendance_review_proofs_delete" ON storage.objects;

CREATE POLICY "attendance_review_proofs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-review-proofs');

CREATE POLICY "attendance_review_proofs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-review-proofs');

CREATE POLICY "attendance_review_proofs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attendance-review-proofs')
  WITH CHECK (bucket_id = 'attendance-review-proofs');

CREATE POLICY "attendance_review_proofs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-review-proofs');
