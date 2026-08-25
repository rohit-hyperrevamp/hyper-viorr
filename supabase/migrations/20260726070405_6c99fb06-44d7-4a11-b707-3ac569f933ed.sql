-- Compensating stock movement: add back the 1 unit that TR-0017 removed
INSERT INTO public.inv_stock_movements (movement_type, location_type, location_id, item_id, size_value, qty_change, reference_type, reference_id, notes)
VALUES ('ADJUSTMENT_IN', 'warehouse', 'aee839b9-8040-42b7-8486-f1d2945854cf', '46f2b6a6-7140-44b1-8832-32859fb80967', '', 1, 'reversal', '4d7f6ba7-9df8-40ff-9ab7-2a24b3c7d5bc', 'Reversal of TR-0017 (mis-routed FO demand; re-fulfil via issuance)');

-- Remove the transfer and its lines
DELETE FROM public.inv_transfer_lines WHERE transfer_id = '4d7f6ba7-9df8-40ff-9ab7-2a24b3c7d5bc';
DELETE FROM public.inv_transfers WHERE id = '4d7f6ba7-9df8-40ff-9ab7-2a24b3c7d5bc';

-- Re-open the demand so admin/inventory manager can fulfil it as an Issuance
UPDATE public.inv_demands
SET status = 'submitted', fulfilled_at = NULL, updated_at = now()
WHERE id = '284dffcc-b7fa-4432-9a4a-c119b4189fd8';