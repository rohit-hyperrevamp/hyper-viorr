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

  const rows =
    (data as unknown as Array<{
      saved: boolean;
      token_suffix: string;
      token_count: number;
    }> | null) ?? [];
  const result = rows[0];
  if (result) {
    return {
      saved: result.saved,
      tokenSuffix: result.token_suffix,
      tokenCount: result.token_count,
    };
  }

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

export async function sendNativePushToUsersServer(
  userIds: string[],
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  const recipients = uniqueUserIds(userIds);
  if (recipients.length === 0) return { sent: 0, total: 0, failures: [] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("user_id,token,platform,last_seen_at")
    .in("user_id", recipients)
    .eq("platform", "ios")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;

  return sendNativePushToTokenRows(supabaseAdmin, (data as TokenRow[] | null) ?? [], payload);
}

export async function sendNativePushForRecentNotifications(
  _supabase: AppSupabaseClient,
  userIds: string[],
  payload: ApnsPayload,
  options?: { actorUserId?: string | null; notificationIds?: string[] },
): Promise<NativePushDeliveryResult> {
  const recipients = uniqueUserIds(userIds);
  if (recipients.length === 0) return { sent: 0, total: 0, failures: [] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const notificationIds = uniqueUserIds(options?.notificationIds ?? []);
  const baseNotificationQuery = supabaseAdmin
    .from("notifications")
    .select("user_id")
    .in("user_id", recipients);
  const notificationQuery = notificationIds.length > 0
    ? baseNotificationQuery.in("id", notificationIds)
    : baseNotificationQuery.gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const { data: recentNotifications, error: notificationError } = await notificationQuery;

  if (notificationError) throw notificationError;

  const allowedRecipients = uniqueUserIds(
    ((recentNotifications as Array<{ user_id: string }> | null) ?? []).map((row) => row.user_id),
  );
  if (allowedRecipients.length === 0) return { sent: 0, total: 0, failures: [] };

  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("user_id,token,platform,last_seen_at")
    .in("user_id", allowedRecipients)
    .eq("platform", "ios")
    .order("last_seen_at", { ascending: false });

  if (error) throw error;

  const rows = ((data as unknown as TokenRow[] | null) ?? []).filter((row) => row.platform === "ios");
  console.log("native push real notification dispatch", {
    recipients: allowedRecipients.length,
    tokens: rows.length,
    notificationIds: notificationIds.length,
    title: payload.title,
  });
  return sendNativePushToTokenRows(supabaseAdmin, rows, payload);
}