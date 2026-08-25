DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_inv_apply_stock_movement'
      AND tgrelid = 'public.inv_stock_movements'::regclass
  ) THEN
    CREATE TRIGGER trg_inv_apply_stock_movement
    AFTER INSERT ON public.inv_stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.inv_apply_stock_movement();
  END IF;
END $$;