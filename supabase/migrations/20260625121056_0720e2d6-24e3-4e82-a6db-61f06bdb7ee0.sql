
-- Allow inventory managers to read all candidates (needed for caps + cross-branch inventory ops)
CREATE POLICY "Inventory managers read all candidates"
ON public.candidates FOR SELECT
USING (public.current_user_is_inventory_manager());

-- Enable realtime so the Inventory Cap page (and others) auto-refresh
ALTER TABLE public.candidates REPLICA IDENTITY FULL;
ALTER TABLE public.branches REPLICA IDENTITY FULL;
ALTER TABLE public.inv_caps REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.branches; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inv_caps; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
