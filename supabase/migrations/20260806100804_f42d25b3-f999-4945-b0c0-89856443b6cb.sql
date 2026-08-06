UPDATE public.deductions
SET amount = -ABS(amount)
WHERE source_kind = 'payroll_amendment'
  AND deduction_name ILIKE 'Gross deduction%'
  AND amount > 0;