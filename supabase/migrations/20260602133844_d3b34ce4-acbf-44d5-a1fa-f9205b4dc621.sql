
-- Addition Types catalog
CREATE TABLE public.addition_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addition_types TO authenticated;
GRANT ALL ON public.addition_types TO service_role;

ALTER TABLE public.addition_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read addition_types" ON public.addition_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write addition_types" ON public.addition_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update addition_types" ON public.addition_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete addition_types" ON public.addition_types FOR DELETE TO authenticated USING (true);

CREATE TRIGGER addition_types_updated_at BEFORE UPDATE ON public.addition_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Additions
CREATE TABLE public.additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  addition_type_id uuid NOT NULL,
  addition_date date NOT NULL,
  addition_name text NOT NULL,
  calculation_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  installments integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.additions TO authenticated;
GRANT ALL ON public.additions TO service_role;

ALTER TABLE public.additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read additions" ON public.additions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert additions" ON public.additions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update additions" ON public.additions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete additions" ON public.additions FOR DELETE TO authenticated USING (true);

CREATE INDEX additions_candidate_idx ON public.additions(candidate_id);
CREATE INDEX additions_date_idx ON public.additions(addition_date DESC);

CREATE TRIGGER additions_updated_at BEFORE UPDATE ON public.additions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed common addition types
INSERT INTO public.addition_types (name, code, sort_order) VALUES
  ('Bonus', 'bonus', 10),
  ('Performance Bonus', 'performance_bonus', 20),
  ('Attendance Bonus', 'attendance_bonus', 30),
  ('Festival Bonus', 'festival_bonus', 40),
  ('Joining Bonus', 'joining_bonus', 50),
  ('Retention Bonus', 'retention_bonus', 60),
  ('Referral Bonus', 'referral_bonus', 70),
  ('Incentive', 'incentive', 80),
  ('Overtime Allowance', 'overtime_allowance', 90),
  ('Night Shift Allowance', 'night_shift_allowance', 100),
  ('Special Allowance', 'special_allowance', 110),
  ('Conveyance Allowance', 'conveyance_allowance', 120),
  ('Food Allowance', 'food_allowance', 130),
  ('Mobile Reimbursement', 'mobile_reimbursement', 140),
  ('Travel Reimbursement', 'travel_reimbursement', 150),
  ('Medical Reimbursement', 'medical_reimbursement', 160),
  ('Uniform Allowance', 'uniform_allowance', 170),
  ('Project Allowance', 'project_allowance', 180),
  ('Arrears', 'arrears', 190),
  ('Leave Encashment', 'leave_encashment', 200),
  ('Ex-Gratia', 'ex_gratia', 210),
  ('Gratuity', 'gratuity', 220),
  ('Salary Advance Reversal', 'advance_reversal', 230),
  ('Miscellaneous', 'miscellaneous', 240);
