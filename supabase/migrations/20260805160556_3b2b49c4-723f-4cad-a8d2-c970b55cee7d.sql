DELETE FROM public.geo_access_rules;
INSERT INTO public.geo_access_rules (country_code, country_name, mode, is_active, notes)
VALUES ('IN','India','allow',true,'India-only sign-in policy');