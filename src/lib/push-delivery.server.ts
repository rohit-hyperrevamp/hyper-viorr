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

export type NativePushRegistrationResult = {
  saved: boolean;
  tokenSuffix: string;
  tokenCount: number;
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

async function resolveRelatedUserIds(userId: string): Promise<string[]> {
  const ids = new Set<string>([userId]);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData.user?.email ?? "";
    const mobile = email.match(/^phone-(\d{10})@radiantguard\.local$/i)?.[1];
    if (!mobile) return Array.from(ids);

    const { data: candidate } = await supabaseAdmin
      .from("candidates")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle();

    if (!candidate?.id) return Array.from(ids);

    const { data: users } = await supabaseAdmin.rpc("get_user_id_by_candidate", {
      _candidate_id: candidate.id,
    });

    if (typeof users === "string") ids.add(users);
  } catch {
    /* Keep the direct authenticated user as the authoritative fallback. */
  }

  return Array.from(ids);
}

async function resolveRelatedUserIdsForMany(userIds: string[]): Promise<string[]> {
  const resolved = await Promise.all(userIds.map((id) => resolveRelatedUserIds(id)));
  return Array.from(new Set(resolved.flat().filter(Boolean)));
}

export async function getPushRegistrationStatusForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const relatedUserIds = await resolveRelatedUserIds(userId);
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id,platform,last_seen_at,created_at")
    .in("user_id", relatedUserIds)
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
  userId: string,
  input: { token: string; platform: "ios" | "android" | "web" },
): Promise<NativePushRegistrationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("device_push_tokens")
    .upsert(
      {
        user_id: userId,
        token: input.token,
        platform: input.platform,
        last_seen_at: now,
      },
      { onConflict: "token" },
    );

  if (error) throw error;

  const status = await getPushRegistrationStatusForUser(userId);
  return {
    saved: true,
    tokenSuffix: input.token.slice(-8),
    tokenCount: status.count,
  };
}

export async function sendNativePushToUsersServer(
  userIds: string[],
  payload: ApnsPayload,
): Promise<NativePushDeliveryResult> {
  const recipients = await resolveRelatedUserIdsForMany(uniqueUserIds(userIds));
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
    if (/Unregistered/i.test(errorMessage)) {
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