CREATE OR REPLACE FUNCTION public.register_device_push_token(_token text, _platform text DEFAULT 'ios')
RETURNS TABLE(saved boolean, token_suffix text, token_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid push platform';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, token, platform, last_seen_at)
  VALUES (_uid, _token, _platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = EXCLUDED.last_seen_at;

  RETURN QUERY
  SELECT
    true,
    right(_token, 8),
    count(*)::integer
  FROM public.device_push_tokens
  WHERE user_id = _uid
    AND platform = _platform;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_push_token(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_recent_notification_push_tokens(_user_ids uuid[])
RETURNS TABLE(user_id uuid, token text, platform text, last_seen_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.user_id, d.token, d.platform, d.last_seen_at
  FROM public.device_push_tokens d
  WHERE d.platform = 'ios'
    AND d.user_id IN (
      SELECT DISTINCT n.user_id
      FROM public.notifications n
      WHERE n.actor_id = auth.uid()
        AND n.user_id = ANY(_user_ids)
        AND n.created_at >= now() - interval '5 minutes'
    )
  ORDER BY d.last_seen_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_notification_push_tokens(uuid[]) TO authenticated;