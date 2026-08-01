import { supabase } from "@/integrations/supabase/client";

/**
 * Supabase restores the persisted session from localStorage asynchronously.
 * Any query fired during the first render therefore goes out WITHOUT the
 * bearer token, and RLS silently returns zero rows (no error) — which is why
 * pages showed 0s until a second refresh.
 *
 * `supabaseSessionReady()` resolves once the client has hydrated its session,
 * so callers can await it before hitting the Data API. The root component also
 * uses it to invalidate anything that was fetched too early.
 */
let readyPromise: Promise<boolean> | null = null;

export function supabaseSessionReady(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!readyPromise) {
    readyPromise = supabase.auth
      .getSession()
      .then(({ data }) => !!data.session)
      .catch(() => false);
  }
  return readyPromise;
}
