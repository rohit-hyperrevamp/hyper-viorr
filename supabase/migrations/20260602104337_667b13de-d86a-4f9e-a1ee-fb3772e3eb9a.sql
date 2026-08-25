
-- Deduction types catalog
CREATE TABLE public.deduction_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deduction_types TO authenticated;
GRANT ALL ON public.deduction_types TO service_role;

ALTER TABLE public.deduction_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read deduction_types" ON public.deduction_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write deduction_types" ON public.deduction_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update deduction_types" ON public.deduction_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete deduction_types" ON public.deduction_types FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_deduction_types_updated
  BEFORE UPDATE ON public.deduction_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.deduction_types (name, code, sort_order) VALUES
  ('General Deduction','general_deduction',10),
  ('Salary Advance','salary_advance',20),
  ('Rent','rent',30),
  ('Uniform','uniform',40),
  ('Canteen','canteen',50),
  ('Theft','theft',60),
  ('Fine','fine',70),
  ('Recruitment Fee','recruitment_fee',80),
  ('E-ERP Charges','e_erp_charges',90),
  ('Miscellaneous','miscellaneous',100),
  ('Training Fee','training_fee',110),
  ('GPAIP','gpaip',120),
  ('Security Deposit','security_deposit',130),
  ('TDS','tds',140),
  ('Advance Recovery','advance_recovery',150),
  ('Medical','medical',160),
  ('Mobile','mobile',170),
  ('Police Verification','police_verification',180),
  ('Welfare Fund','welfare_fund',190),
  ('GB Reg Fee','gb_reg_fee',200),
  ('Med Claim','med_claim',210),
  ('Transport','transport',220),
  ('ID Card','id_card',230),
  ('Nameplate','nameplate',240);

-- Employee deductions
CREATE TABLE public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  deduction_type_id uuid NOT NULL REFERENCES public.deduction_types(id) ON DELETE RESTRICT,
  deduction_date date NOT NULL,
  deduction_name text NOT NULL,
  calculation_type text NOT NULL CHECK (calculation_type IN ('lumpsum','per_duty_amount','total_amount')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  installments int NOT NULL DEFAULT 1 CHECK (installments >= 1),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deductions_candidate ON public.deductions(candidate_id);
CREATE INDEX idx_deductions_type ON public.deductions(deduction_type_id);
CREATE INDEX idx_deductions_date ON public.deductions(deduction_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT ALL ON public.deductions TO service_role;

ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read deductions" ON public.deductions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert deductions" ON public.deductions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update deductions" ON public.deductions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete deductions" ON public.deductions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_deductions_updated
  BEFORE UPDATE ON public.deductions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
