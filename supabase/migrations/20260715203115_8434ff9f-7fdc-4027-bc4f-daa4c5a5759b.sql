ALTER TABLE public.attendance_sheets ALTER COLUMN rejection_reason DROP NOT NULL;
UPDATE public.attendance_sheets SET rejection_reason = NULL WHERE rejection_reason = '';