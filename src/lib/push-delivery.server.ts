import { sendApnsPush, type ApnsPayload } from "./apns.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type TokenRow = {
  user_id: string;
  token: string;
  platform: string;
  last_seen_at: string;
};

export type NativePushDeliveryResult = {
  sent: number;
  total: number;
  failures: Array<{ tokenSuffix: string; error: string }>;
};

export type NativePushRegistrationResult = {
  saved: boolean;
  tokenSuffix: string;
  tokenCount: number;
};

function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter(Boolean)));
}

async function deleteDeadToken(supabase: AppSupabaseClient, token: string) {
  try {
    await supabase.from("device_push_tokens").delete().eq("token", token);
  } catch {
    /* best-effort cleanup only */
  }
}

export async function getPushRegistrationStatusForUser(
  supabase: AppSupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("device_push_tokens")
    .select("id,platform,last_seen_at,created_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  const rows = (data as Array<{ id: string; platform: string; last_seen_at: string; created_at: string }> | null) ?? [];
  return {
    registered: rows.length > 0,
    count: rows.length,
    latestSeenAt: rows[0]?.last_seen_at ?? null,
    platforms: Array.from(new Set(rows.map((row) => row.platform).filter(Boolean))),
  };
}

export async function saveNativePushTokenForUser(
  supabase: AppSupabaseClient,
  userId: string,
  input: { token: string; platform: "ios" | "android" | "web" },
): Promise<NativePushRegistrationResult> {
  const { data, error } = await supabase.rpc("register_device_push_token" as never, {
    _token: input.token,
    _platform: input.platform,
  } as never);

  if (error) throw error;

  const rows = (data as unknown as NativePushRegistrationResult[] | null) ?? [];
  const result = rows[0];
  if (result) return result;

  const status = await getPushRegistrationStatusForUser(supabase, userId);
  return {
    saved: true,
    tokenSuffix: input.token.slice(-8),
    tokenCount: status.count,
  };
}

async function sendNativePushToTokenRows(
  supabase: AppSupabaseClient,
  rows: TokenRow[],
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  let sent = 0;
  const failures: NativePushDeliveryResult["failures"] = [];

  for (const row of rows) {
    const result = await sendApnsPush(row.token, payload);
    if (result.success) {
      sent += 1;
      continue;
    }

    const errorMessage = result.error || `HTTP ${result.status ?? "unknown"}`;
    failures.push({ tokenSuffix: row.token.slice(-8), error: errorMessage });
    if (/Unregistered/i.test(errorMessage)) {
      await deleteDeadToken(supabase, row.token);
    }
  }

  return { sent, total: rows.length, failures };
}

export async function sendNativePushToCurrentUserServer(
  supabase: AppSupabaseClient,
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  const { data, error } = await supabase
    .from("device_push_tokens")
    .select("user_id,token,platform,last_seen_at")
    .eq("platform", "ios")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;

  return sendNativePushToTokenRows(supabase, (data as TokenRow[] | null) ?? [], payload);
}

export async function sendNativePushForRecentNotifications(
  supabase: AppSupabaseClient,
  userIds: string[],
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  const recipients = uniqueUserIds(userIds);
  if (recipients.length === 0) return { sent: 0, total: 0, failures: [] };

  const { data, error } = await supabase.rpc("get_recent_notification_push_tokens" as never, {
    _user_ids: recipients,
  } as never);
  if (error) throw error;

  const rows = ((data as unknown as TokenRow[] | null) ?? []).filter((row) => row.platform === "ios");
  return sendNativePushToTokenRows(supabase, rows, payload);
}