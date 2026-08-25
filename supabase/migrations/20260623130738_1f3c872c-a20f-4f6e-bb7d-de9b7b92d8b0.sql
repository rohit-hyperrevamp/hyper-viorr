-- Add OTP fields for issuance acknowledgement
ALTER TABLE public.inv_issuances 
  ADD COLUMN IF NOT EXISTS otp_code text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid;