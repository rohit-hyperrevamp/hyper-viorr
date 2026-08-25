
CREATE POLICY "FO upload own visit proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'field-visit-proofs'
    AND (storage.foldername(name))[1] = public.current_user_candidate_id()::text
  );

CREATE POLICY "FO read own visit proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'field-visit-proofs'
    AND (
      (storage.foldername(name))[1] = public.current_user_candidate_id()::text
      OR public.is_admin_user()
      OR public.current_user_role_key() IN ('hr','leadership')
    )
  );

CREATE POLICY "FO update own visit proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'field-visit-proofs'
    AND (storage.foldername(name))[1] = public.current_user_candidate_id()::text
  );
