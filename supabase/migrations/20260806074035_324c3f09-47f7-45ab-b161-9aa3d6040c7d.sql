CREATE POLICY "Authenticated read policy docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'policy-documents');
CREATE POLICY "Authenticated upload policy docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'policy-documents');
CREATE POLICY "Authenticated update policy docs" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'policy-documents') WITH CHECK (bucket_id = 'policy-documents');
CREATE POLICY "Authenticated delete policy docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'policy-documents');