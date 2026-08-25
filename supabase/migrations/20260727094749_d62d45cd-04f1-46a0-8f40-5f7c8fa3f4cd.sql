DROP POLICY IF EXISTS "FO update own visit proofs" ON storage.objects;
CREATE POLICY "FO update own visit proofs" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'field-visit-proofs' AND (storage.foldername(name))[1] = (current_user_candidate_id())::text)
WITH CHECK (bucket_id = 'field-visit-proofs' AND (storage.foldername(name))[1] = (current_user_candidate_id())::text);

DROP POLICY IF EXISTS "FO delete own visit proofs" ON storage.objects;
CREATE POLICY "FO delete own visit proofs" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'field-visit-proofs' AND (storage.foldername(name))[1] = (current_user_candidate_id())::text);