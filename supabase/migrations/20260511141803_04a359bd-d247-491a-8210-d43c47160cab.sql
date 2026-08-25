
CREATE TABLE public.allowance_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  earning_type TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  short_name TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.allowance_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read allowance_types" ON public.allowance_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write allowance_types" ON public.allowance_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update allowance_types" ON public.allowance_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete allowance_types" ON public.allowance_types FOR DELETE TO authenticated USING (true);

CREATE TRIGGER allowance_types_set_updated_at
BEFORE UPDATE ON public.allowance_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.allowance_types (name, earning_type, display_name, short_name, is_default) VALUES
('Basic', 'Basic', 'Basic', 'Basic', true),
('DA', 'Dearness Allowance', 'DA', 'DA', true),
('HRA', 'House Rent Allowance', 'HRA', 'HRA', true),
('CCA', 'City Compensatory Allowance', 'CCA', 'CCA', true),
('Washing Allowance', 'Uniform Allowance', 'WA', 'WA', true),
('4HRA', 'Other Cash Allowance', '4HRA', '4HRA', true),
('Others', 'Other Cash Allowance', 'Others', 'Others', true),
('OverTime Amount', 'Overtime Allowance', 'Overtime Amount', 'OT', false),
('Reliever Amount', 'Other Cash Allowance', 'Reliever Amount', 'Reliever', false),
('Bonus Amount', 'Bonus', 'Bonus Amount', 'Bonus', false),
('Casual Leave', 'Leave Encashment', 'Casual Leave', 'CL', false),
('Earnings Leave', 'Leave Encashment', 'Earnings Leave', 'EL', false),
('NFH Amount', 'Other Cash Allowance', 'NFH Amount', 'NFH', false),
('Gratuity Amount', 'Gratuity', 'Gratuity', 'Gratuity', false),
('Additional Wages', 'Other Cash Allowance', 'Additional Wages', 'Addtl Wages', false),
('Special Allowance', 'Special Allowance', 'Special Allowance', 'Spl Allow', false),
('Medical Allowance', 'Medical Allowance', 'Medical Allowance', 'Med Allow', false),
('Conveyance Allowance', 'Conveyance Allowance', 'Conveyance Allowance', 'Conv Allow', false),
('Telephone Allowance', 'Telephone Allowance', 'Telephone Allowance', 'Tel Allow', false),
('Arrear', 'Arrear', 'Arrear', 'Arrear', false),
('Additional Allowance', 'Other Cash Allowance', 'Additional Allowance', 'Addl. Allow.', true),
('Skill Allowance', 'Entertainment Allowance', 'Skill Allowance', 'Skill Allowance', true);
