import { sendApnsPush, type ApnsPayload } from "./apns.server";

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

function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter(Boolean)));
}

async function deleteDeadToken(token: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("device_push_tokens").delete().eq("token", token);
  } catch {
    /* best-effort cleanup only */
  }
}

export async function getPushRegistrationStatusForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
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
    .order("last_seen_at", { ascending: false });
  if (error) throw error;

  const rows = ((data as TokenRow[] | null) ?? []).filter((row) => row.platform === "ios");
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
    if (/Unregistered|BadDeviceToken|DeviceTokenNotForTopic/i.test(errorMessage)) {
      await deleteDeadToken(row.token);
    }
  }

  return { sent, total: rows.length, failures };
}

export async function sendNativePushForRecentNotifications(
  actorUserId: string,
  userIds: string[],
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  const recipients = uniqueUserIds(userIds);
  if (recipients.length === 0) return { sent: 0, total: 0, failures: [] };

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Authorization: only fan out native pushes to users for whom the caller
  // just created a notification row in the last 5 minutes. We intentionally
  // don't match on title/message/link — those fields are fragile (whitespace,
  // punctuation, i18n) and were silently suppressing valid pushes. Matching
  // on actor + recipient + recency is enough to prove the caller is the
  // legitimate origin of this notification.
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("user_id")
    .in("user_id", recipients)
    .eq("actor_id", actorUserId)
    .gte("created_at", since);
  if (error) throw error;

  const authorizedRecipients = Array.from(
    new Set(((data as Array<{ user_id: string }> | null) ?? []).map((row) => row.user_id)),
  );
  return sendNativePushToUsersServer(authorizedRecipients, payload);
}