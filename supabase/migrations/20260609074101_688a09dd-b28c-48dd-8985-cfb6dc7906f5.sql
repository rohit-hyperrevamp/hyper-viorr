DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE key = 'field_manager') THEN
    ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_key_fkey;
    UPDATE public.roles SET key = 'field_officer', name = 'Field Officer' WHERE key = 'field_manager';
    UPDATE public.role_permissions SET role_key = 'field_officer' WHERE role_key = 'field_manager';
    UPDATE public.candidates SET role_key = 'field_officer' WHERE role_key = 'field_manager';
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_role_key_fkey
      FOREIGN KEY (role_key) REFERENCES public.roles(key) ON DELETE CASCADE;
  END IF;
END $$;