-- Add approval workflow columns to client_contracts
ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_signature_data text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signed_pdf_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill: anything currently 'active' is treated as approved + signed already
UPDATE public.client_contracts
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, created_at),
       signed_at = COALESCE(signed_at, created_at)
 WHERE status = 'active' AND approval_status = 'pending';

-- Allow 'pending_approval' as a new default for the textual status column
-- (status is text in the schema, so no enum change needed)

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL DEFAULT 'generic',
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their notifications" ON public.notifications;
CREATE POLICY "Users read their notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their notifications" ON public.notifications;
CREATE POLICY "Users update their notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users delete their notifications" ON public.notifications;
CREATE POLICY "Users delete their notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
