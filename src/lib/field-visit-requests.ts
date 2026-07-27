import { supabase } from "@/integrations/supabase/client";
import { notifyUser } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export type FieldVisitRequestStatus = "pending" | "acknowledged" | "completed" | "cancelled";
export type FieldVisitRequestPriority = "emergency" | "high" | "normal";

export type FieldVisitRequest = {
  id: string;
  candidate_id: string;
  unit_id: string;
  requested_by: string | null;
  priority: FieldVisitRequestPriority;
  reason: string;
  status: FieldVisitRequestStatus;
  acknowledged_at: string | null;
  completed_at: string | null;
  visit_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function createFieldVisitRequest(input: {
  candidateId: string;
  unitId: string;
  priority: FieldVisitRequestPriority;
  reason: string;
  unitLabel?: string;
}): Promise<FieldVisitRequest> {
  const { data: authRes } = await supabase.auth.getUser();
  const requestedBy = authRes.user?.id ?? null;

  const { data, error } = await supabase
    .from("field_visit_requests" as never)
    .insert({
      candidate_id: input.candidateId,
      unit_id: input.unitId,
      priority: input.priority,
      reason: input.reason,
      requested_by: requestedBy,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  const row = data as unknown as FieldVisitRequest;

  // Notify the field officer (best-effort)
  try {
    const { data: uidData } = await supabase.rpc(
      "get_user_id_by_candidate_id" as never,
      { _candidate_id: input.candidateId } as never,
    );
    const foUserId = (uidData as unknown as string | null) ?? null;
    if (foUserId) {
      const label = input.unitLabel ?? "a unit";
      const priorityLabel = input.priority === "emergency" ? "Emergency" : input.priority === "high" ? "High priority" : "New";
      await notifyUser(foUserId, {
        type: "field_visit:request",
        title: `${priorityLabel} site visit requested`,
        message: `${label}${input.reason ? ` — ${input.reason}` : ""}`,
        link: "/admin/field-sense",
        entityType: "field_visit_request",
        entityId: row.id,
      });
    }
  } catch (e) {
    console.warn("field visit request notify failed", e);
  }

  try {
    await logActivity({
      module: "Field Sense",
      action: "request",
      entityType: "field_visit_request",
      entityId: row.id,
      entityLabel: input.unitLabel ?? "Unit",
      details: { priority: input.priority, reason: input.reason },
    });
  } catch { /* noop */ }

  return row;
}

export async function acknowledgeFieldVisitRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from("field_visit_requests" as never)
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function cancelFieldVisitRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from("field_visit_requests" as never)
    .update({ status: "cancelled" } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function completeFieldVisitRequestForUnit(params: {
  candidateId: string;
  unitId: string;
  visitId: string;
}): Promise<void> {
  // Auto-complete the most recent open request for this FO+unit when they check in
  const { data } = await supabase
    .from("field_visit_requests" as never)
    .select("id")
    .eq("candidate_id", params.candidateId)
    .eq("unit_id", params.unitId)
    .in("status", ["pending", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as unknown as Array<{ id: string }>)[0];
  if (!row) return;
  await supabase
    .from("field_visit_requests" as never)
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      visit_id: params.visitId,
    } as never)
    .eq("id", row.id);
}

export async function listOpenRequestsForCandidate(candidateId: string): Promise<FieldVisitRequest[]> {
  const { data, error } = await supabase
    .from("field_visit_requests" as never)
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["pending", "acknowledged"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FieldVisitRequest[];
}

export async function listRecentRequestsAdmin(limit = 50): Promise<FieldVisitRequest[]> {
  const { data, error } = await supabase
    .from("field_visit_requests" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as FieldVisitRequest[];
}
