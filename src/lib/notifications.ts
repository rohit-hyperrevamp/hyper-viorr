import { supabase } from "@/integrations/supabase/client";
import { queueRecentNativePush } from "./native-push-api";

export type Notification = {
  id: string;
  userId: string;
  actorId: string | null;
  type: string;
  title: string;
  message: string;
  link: string;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
};

function rowToNotification(r: Record<string, unknown>): Notification {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    actorId: r.actor_id ? String(r.actor_id) : null,
    type: String(r.type ?? "generic"),
    title: String(r.title ?? ""),
    message: String(r.message ?? ""),
    link: String(r.link ?? ""),
    entityType: String(r.entity_type ?? ""),
    entityId: String(r.entity_id ?? ""),
    readAt: r.read_at ? String(r.read_at) : null,
    createdAt: String(r.created_at),
  };
}

function newNotificationId() {
  return crypto.randomUUID();
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listMyNotifications(): Promise<Notification[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("notifications" as never)
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data as unknown) as Record<string, unknown>[]).map(rowToNotification);
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const actor = await currentUserId();
  const notificationId = newNotificationId();
  const { error } = await supabase.from("notifications" as never).insert({
    id: notificationId,
    user_id: input.userId,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  } as never);
  if (error) throw error;
  await deliverNativePush([input.userId], input, [notificationId]);
}

async function deliverNativePush(
  userIds: string[],
  input: { title: string; message: string; link?: string },
  notificationIds: string[] = [],
) {
  const recipients = Array.from(new Set(userIds.filter(Boolean)));
  if (recipients.length === 0) return;
  await queueRecentNativePush(recipients, { ...input, notificationIds }).catch((error) => {
    console.warn("native push delivery failed", error);
  });
}

export async function getAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_admin_user_ids" as never);
  if (error) {
    console.error("getAdminUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/**
 * Auth user IDs of everyone above the given user in the reporting hierarchy:
 * their reporting manager(s), the field officers mapped to their unit(s), and
 * the admins of the branch those units belong to. Resolved by a
 * security-definer RPC so hierarchy tables stay protected.
 */
export async function getHierarchyUserIds(actorUserId?: string | null): Promise<string[]> {
  const uid = actorUserId ?? (await currentUserId());
  if (!uid) return [];
  const { data, error } = await supabase.rpc("get_hierarchy_user_ids" as never, {
    _actor_user_id: uid,
  } as never);
  if (error) {
    console.warn("getHierarchyUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean);
}

/**
 * Broadcast to admins AND the actor's reporting line (manager, unit field
 * officer, branch admins) so every notification follows the hierarchy.
 */
export async function notifyAdmins(input: {
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const actor = await currentUserId();
  const [adminIds, hierarchyIds] = await Promise.all([
    getAdminUserIds(),
    getHierarchyUserIds(actor),
  ]);
  const ids = Array.from(new Set([...adminIds, ...hierarchyIds])).filter(
    (id) => id && id !== actor,
  );
  if (ids.length === 0) return;
  const rows = ids.map((uid) => ({
    id: newNotificationId(),
    user_id: uid,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) {
    console.error("notifyAdmins insert error", error);
    return;
  }
  await deliverNativePush(ids, input, rows.map((row) => row.id));
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("notifications" as never)
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead() {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("notifications" as never)
    .update({ read_at: new Date().toISOString() } as never)
    .eq("user_id", uid)
    .is("read_at", null);
  if (error) throw error;
}

/**
 * Returns auth user IDs of every active user whose role has the
 * `can_approve` flag set for the given module. Used to fan out
 * approval-pending notifications without hardcoding role names.
 */
export async function getApproverUserIds(moduleKey: string): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "get_user_ids_with_approve" as never,
    { _module: moduleKey } as never,
  );
  if (error) {
    console.error("getApproverUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/**
 * Convenience: send the same notification to every approver of a module.
 * Self-notifications are skipped.
 */
export async function notifyApprovers(input: {
  moduleKey: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const [actor, ids] = await Promise.all([
    currentUserId(),
    getApproverUserIds(input.moduleKey),
  ]);
  const recipients = ids.filter((id) => id !== actor);
  if (recipients.length === 0) return 0;
  const rows = recipients.map((uid) => ({
    id: newNotificationId(),
    user_id: uid,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) {
    console.error("notifyApprovers insert error", error);
    return 0;
  }
  await deliverNativePush(recipients, input, rows.map((row) => row.id));
  return recipients.length;
}

/**
 * Auth user IDs of every active approver of the onboarding workflow:
 * HR, Leadership, Admin, Super Admin. Uses a security-definer RPC so
 * we don't leak the auth.users table to client roles.
 */
export async function getOnboardingApproverUserIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "get_onboarding_approver_user_ids" as never,
  );
  if (error) {
    console.error("getOnboardingApproverUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/**
 * Fan out a notification to every onboarding approver, skipping the actor
 * (so a super-admin approving their own submission doesn't get pinged).
 */
export async function notifyOnboardingApprovers(input: {
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const [actor, ids] = await Promise.all([
    currentUserId(),
    getOnboardingApproverUserIds(),
  ]);
  const recipients = ids.filter((id) => id !== actor);
  if (recipients.length === 0) return 0;
  const rows = recipients.map((uid) => ({
    id: newNotificationId(),
    user_id: uid,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) {
    console.error("notifyOnboardingApprovers insert error", error);
    return 0;
  }
  await deliverNativePush(recipients, input, rows.map((row) => row.id));
  return recipients.length;
}

/**
 * Send one notification to a specific user (e.g. the field officer who
 * submitted a candidate, when the request is approved or rejected).
 */
export async function notifyUser(
  userId: string | null | undefined,
  input: {
    type: string;
    title: string;
    message: string;
    link?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  if (!userId) return;
  await createNotification({ userId, ...input });
}
