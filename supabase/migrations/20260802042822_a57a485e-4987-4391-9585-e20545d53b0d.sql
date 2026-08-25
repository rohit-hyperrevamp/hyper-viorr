DELETE FROM public.role_permissions WHERE module_key = 'office_assets';
DROP TABLE IF EXISTS public.office_asset_allocations CASCADE;
DROP TABLE IF EXISTS public.office_asset_units CASCADE;
DROP TABLE IF EXISTS public.office_assets CASCADE;
DROP TABLE IF EXISTS public.office_asset_categories CASCADE;