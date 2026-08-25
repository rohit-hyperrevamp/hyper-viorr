DO $$
DECLARE
  v_customer uuid := 'b448218d-60f6-491c-8bb5-dd50a9f666c4';
  v_unit uuid := '0eb68427-598c-456d-98d3-4e0913990011';
  v_cands uuid[] := ARRAY['66da92e2-c2e3-4af4-a1ef-6e766728a53f'::uuid, '5e958258-c5b9-48ba-9498-ce58d09ef9a0'::uuid];
BEGIN
  -- attendance
  DELETE FROM attendance_entries WHERE unit_id = v_unit OR candidate_id = ANY(v_cands);
  DELETE FROM attendance_sheets WHERE unit_id = v_unit;

  -- additions / deductions
  DELETE FROM additions WHERE candidate_id = ANY(v_cands);
  DELETE FROM deductions WHERE candidate_id = ANY(v_cands);

  -- employee related mappings
  DELETE FROM employee_scope_assignments WHERE candidate_id = ANY(v_cands) OR (scope_type='unit' AND scope_id::uuid = v_unit) OR (scope_type='customer' AND scope_id::uuid = v_customer);
  DELETE FROM candidate_units WHERE candidate_id = ANY(v_cands) OR unit_id = v_unit;
  DELETE FROM employee_signed_documents WHERE candidate_id = ANY(v_cands);

  -- contracts (cascades to contract_resources)
  DELETE FROM client_contracts WHERE unit_id = v_unit;

  -- payroll runs for the unit (cascade ok)
  DELETE FROM payroll_runs WHERE unit_id = v_unit;

  -- candidates
  DELETE FROM candidates WHERE id = ANY(v_cands);

  -- unit
  DELETE FROM units WHERE id = v_unit;

  -- customer (cascades gst numbers)
  DELETE FROM customers WHERE id = v_customer;
END $$;