
-- 1) Merge typo designation "BMS OPREATOR" into "BMS Operator"
UPDATE public.candidates SET designation_id='ca231997-aaf7-4999-becb-d7ac21cf8f06'
  WHERE designation_id='1bbd7054-86a6-4034-9f9d-12ce235a99d6';
UPDATE public.contract_resources SET designation_id='ca231997-aaf7-4999-becb-d7ac21cf8f06'
  WHERE designation_id='1bbd7054-86a6-4034-9f9d-12ce235a99d6';
UPDATE public.attendance_entries SET designation_id='ca231997-aaf7-4999-becb-d7ac21cf8f06'
  WHERE designation_id='1bbd7054-86a6-4034-9f9d-12ce235a99d6';
DELETE FROM public.designations WHERE id='1bbd7054-86a6-4034-9f9d-12ce235a99d6';

-- 2) Fix FPL master designation mismatches
UPDATE public.candidates SET designation_id='ca231997-aaf7-4999-becb-d7ac21cf8f06'
  WHERE id='36a935f4-ed54-476b-9625-7112dc3393bd'; -- Anurag Mahunta -> BMS Operator
UPDATE public.candidates SET designation_id='7f4d825b-1d62-4d76-8573-db5f5c9bf805'
  WHERE id='91469957-d163-48a9-bb6c-48154a60f55d'; -- Dham Singhrawat -> Security Supervisor
UPDATE public.candidates SET designation_id='7f4d825b-1d62-4d76-8573-db5f5c9bf805'
  WHERE id='484b5490-5610-4810-95e5-a63eae04d6a8'; -- Muralidhar -> Security Supervisor
UPDATE public.candidates SET designation_id='e790175b-77a8-4d63-9c98-f7d948ef9791'
  WHERE id='af94e1a3-8986-453f-80fe-637b2b12b7b3'; -- Rohit Rathod -> Admin Executive
UPDATE public.candidates SET designation_id='d864ddb6-bf53-4462-9e8c-4f21756d439f'
  WHERE id='33640fd7-20b5-4bca-8fd8-24112e677b18'; -- Vaishnavi -> Receptionist

-- 3) Multi-designation master
CREATE TABLE public.candidate_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  designation_id uuid NOT NULL REFERENCES public.designations(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, designation_id)
);
CREATE UNIQUE INDEX candidate_designations_one_primary
  ON public.candidate_designations(candidate_id) WHERE is_primary;
CREATE INDEX candidate_designations_candidate_idx ON public.candidate_designations(candidate_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_designations TO authenticated;
GRANT ALL ON public.candidate_designations TO service_role;

ALTER TABLE public.candidate_designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cd admins full"
  ON public.candidate_designations FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());

CREATE POLICY "cd branch read"
  ON public.candidate_designations FOR SELECT TO authenticated
  USING (public.is_candidate_in_current_user_branch(candidate_id)
         OR candidate_id = public.current_user_candidate_id());

CREATE POLICY "cd branch write"
  ON public.candidate_designations FOR INSERT TO authenticated
  WITH CHECK (public.is_candidate_in_current_user_branch(candidate_id));

CREATE POLICY "cd branch update"
  ON public.candidate_designations FOR UPDATE TO authenticated
  USING (public.is_candidate_in_current_user_branch(candidate_id))
  WITH CHECK (public.is_candidate_in_current_user_branch(candidate_id));

CREATE POLICY "cd branch delete"
  ON public.candidate_designations FOR DELETE TO authenticated
  USING (public.is_candidate_in_current_user_branch(candidate_id));

CREATE TRIGGER candidate_designations_updated_at
  BEFORE UPDATE ON public.candidate_designations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Sync trigger: keep candidates.designation_id = primary row
CREATE OR REPLACE FUNCTION public.sync_candidate_primary_designation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary THEN
      UPDATE public.candidates SET designation_id = (
        SELECT designation_id FROM public.candidate_designations
        WHERE candidate_id = OLD.candidate_id ORDER BY created_at LIMIT 1
      ) WHERE id = OLD.candidate_id;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.is_primary THEN
    UPDATE public.candidates SET designation_id = NEW.designation_id WHERE id = NEW.candidate_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidate_designations_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.candidate_designations
  FOR EACH ROW EXECUTE FUNCTION public.sync_candidate_primary_designation();

-- 5) Backfill from existing candidates.designation_id
INSERT INTO public.candidate_designations (candidate_id, designation_id, is_primary)
SELECT id, designation_id, true FROM public.candidates
WHERE designation_id IS NOT NULL
ON CONFLICT (candidate_id, designation_id) DO NOTHING;
