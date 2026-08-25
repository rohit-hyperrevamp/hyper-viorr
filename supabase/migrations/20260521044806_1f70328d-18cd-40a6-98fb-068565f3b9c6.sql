CREATE TABLE public.attendance_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#64748b',
  counts_as_present boolean NOT NULL DEFAULT false,
  is_paid boolean NOT NULL DEFAULT false,
  is_leave boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read attendance_codes" ON public.attendance_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write attendance_codes" ON public.attendance_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update attendance_codes" ON public.attendance_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete attendance_codes" ON public.attendance_codes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER attendance_codes_set_updated_at
BEFORE UPDATE ON public.attendance_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.attendance_codes (code, label, description, color, counts_as_present, is_paid, is_leave, sort_order) VALUES
('P',   'Present',             'Full day present',                          '#16a34a', true,  true,  false, 10),
('A',   'Absent',               'Absent without leave',                      '#dc2626', false, false, false, 20),
('L',   'Late',                 'Reported late but counted present',         '#f59e0b', true,  true,  false, 30),
('HD',  'Half Day',             'Half day attendance',                       '#0ea5e9', false, true,  false, 40),
('WO',  'Weekly Off',           'Scheduled weekly off',                      '#64748b', false, true,  false, 50),
('PH',  'Paid Holiday',         'Public / paid holiday',                     '#7c3aed', false, true,  false, 60),
('CL',  'Casual Leave',         'Paid casual leave',                         '#0891b2', false, true,  true,  70),
('SL',  'Sick Leave',           'Paid sick leave',                           '#db2777', false, true,  true,  80),
('EL',  'Earned Leave',         'Earned / privilege leave',                  '#2563eb', false, true,  true,  90),
('LWP', 'Leave Without Pay',    'Approved leave but unpaid',                 '#475569', false, false, true,  100);