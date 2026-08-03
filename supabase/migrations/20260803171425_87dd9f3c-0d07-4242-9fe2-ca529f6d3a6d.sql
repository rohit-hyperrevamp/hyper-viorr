ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS party text NOT NULL DEFAULT 'both';

ALTER TABLE public.cost_components
  DROP CONSTRAINT IF EXISTS cost_components_party_chk;
ALTER TABLE public.cost_components
  ADD CONSTRAINT cost_components_party_chk CHECK (party IN ('employee','employer','both'));

-- Classify existing rows
UPDATE public.cost_components SET party = 'employee'
WHERE name IN (
  'EE_ESI','EE-EPF NoCap','EE-EPF SP Basic',
  'EPF Employee Contribution','EPF Employee Contribution (Gross - HRA)',
  'ESI Employee Contribution','ESI Employee Contribution (Net)',
  'Professional Tax','Recruitment Fee'
);

UPDATE public.cost_components SET party = 'employer'
WHERE name IN (
  'ER_ESI','ER-EPF nocap','ER EPF SP Basic',
  'EPF Employer Contribution','EPF Employer Contribution (Gross - HRA)',
  'ESI Employer Contribution','ESI Employer Contribution (Net)',
  'Bonus','Bonus (Enhanced)','Bonus SP',
  'Gratuity','Gratuity (Standard)','Gratuity SP','Gratuity Sp 4%',
  'GB Levy','GB Levy SP','LWW (Leave with Wages)','LWW SP',
  'NFH (% of Basic & DA)','NFH (National & Festival Holidays)','PH SP',
  'WC Policy','Management Fee','Management Fee_@26',
  'Reliever Charges','Reliever charges CTC','Uniform Charges'
) OR name LIKE 'LWF Employer Contribution%';

-- Naming cleanup
UPDATE public.cost_components SET name = 'EE ESI'                              WHERE name = 'EE_ESI';
UPDATE public.cost_components SET name = 'EE EPF NoCap'                        WHERE name = 'EE-EPF NoCap';
UPDATE public.cost_components SET name = 'EE EPF SP Basic'                     WHERE name = 'EE-EPF SP Basic';
UPDATE public.cost_components SET name = 'EE EPF Contribution'                 WHERE name = 'EPF Employee Contribution';
UPDATE public.cost_components SET name = 'EE EPF Contribution (Gross - HRA)'   WHERE name = 'EPF Employee Contribution (Gross - HRA)';
UPDATE public.cost_components SET name = 'EE ESI Contribution'                 WHERE name = 'ESI Employee Contribution';
UPDATE public.cost_components SET name = 'EE ESI Contribution (Net)'           WHERE name = 'ESI Employee Contribution (Net)';
UPDATE public.cost_components SET name = 'EE Professional Tax'                 WHERE name = 'Professional Tax';
UPDATE public.cost_components SET name = 'EE Recruitment Fee'                  WHERE name = 'Recruitment Fee';

UPDATE public.cost_components SET name = 'ER ESI'                              WHERE name = 'ER_ESI';
UPDATE public.cost_components SET name = 'ER EPF NoCap'                        WHERE name = 'ER-EPF nocap';
UPDATE public.cost_components SET name = 'ER EPF Contribution'                 WHERE name = 'EPF Employer Contribution';
UPDATE public.cost_components SET name = 'ER EPF Contribution (Gross - HRA)'   WHERE name = 'EPF Employer Contribution (Gross - HRA)';
UPDATE public.cost_components SET name = 'ER ESI Contribution'                 WHERE name = 'ESI Employer Contribution';
UPDATE public.cost_components SET name = 'ER ESI Contribution (Net)'           WHERE name = 'ESI Employer Contribution (Net)';
UPDATE public.cost_components SET name = 'ER LWF - GA'                         WHERE name = 'LWF Employer Contribution - GA';
UPDATE public.cost_components SET name = 'ER LWF - GJ'                         WHERE name = 'LWF Employer Contribution - GJ';
UPDATE public.cost_components SET name = 'ER LWF - KA'                         WHERE name = 'LWF Employer Contribution - KA';
UPDATE public.cost_components SET name = 'ER LWF - MH'                         WHERE name = 'LWF Employer Contribution - MH';
UPDATE public.cost_components SET name = 'ER LWF - TS'                         WHERE name = 'LWF Employer Contribution - TS';