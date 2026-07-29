import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";

// ---------------------------------------------------------------------------
// Generic, DB-driven workflow engine.
// Definitions + steps live in `workflow_definitions` / `workflow_steps`, while
// rehire approvals are surfaced from Employees → Candidates.
// ---------------------------------------------------------------------------

export type WorkflowDefinition = {
  id: string;
  key: string;
  name: string;
  description: string;
  entity_type: string;
  route_path: string;
  is_active: boolean;
};

export type WorkflowStep = {
  id: string;
  workflow_id: string;
  step_order: number;
  key: string;
  name: string;
  description: string;
  approver_role_key: string;
  action_label: string;
  is_active: boolean;
};

export type RehireRequest = {
  id: string;
  request_number: string | null;
  workflow_key: string;
  previous_candidate_id: string | null;
  new_candidate_id: string | null;
  aadhaar_number: string;
  full_name: string;
  mobile: string;
  unit_id: string | null;
  role_key: string | null;
  designation_id: string | null;
  requested_by: string | null;
  requested_by_candidate_id: string | null;
  resignation_url: string;
  id_card_url: string;
  notes: string;
  current_step_order: number;
  status: string;
  rejection_reason: string;
  new_employee_code: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RehireEvent = {
  id: string;
  request_id: string;
  step_order: number;
  step_name: string;
  actor_id: string | null;
  actor_name: string;
  actor_role_key: string;
  action: string;
  notes: string;
  created_at: string;
};

export const REHIRE_WORKFLOW_KEY = "rehire";

const REHIRE_LINK = "/admin/employees";
const ACTIVITY_MODULE = "Rehire Workflow";

function rehireNotificationLink(entityId: string) {
  return `${REHIRE_LINK}?tab=candidate&rehire=${entityId}`;
}

// ---------------------------------- reads ----------------------------------

export async function fetchWorkflows(): Promise<WorkflowDefinition[]> {
  const { data, error } = await supabase
    .from("workflow_definitions")
    .select("id,key,name,description,entity_type,route_path,is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as WorkflowDefinition[];
}

export async function fetchWorkflowByKey(key: string): Promise<WorkflowDefinition | null> {
  const { data, error } = await supabase
    .from("workflow_definitions")
    .select("id,key,name,description,entity_type,route_path,is_active")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowDefinition | null) ?? null;
}

export async function fetchWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("id,workflow_id,step_order,key,name,description,approver_role_key,action_label,is_active")
    .eq("workflow_id", workflowId)
    .order("step_order");
  if (error) throw error;
  return (data ?? []) as WorkflowStep[];
}

export async function fetchRehireRequests(): Promise<RehireRequest[]> {
  const { data, error } = await supabase
    .from("rehire_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RehireRequest[];
}

export async function fetchRehireEvents(requestId: string): Promise<RehireEvent[]> {
  const { data, error } = await supabase
    .from("rehire_request_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as RehireEvent[];
}

/** Aadhaar is the unique person identifier — used to spot returning employees. */
export async function findCandidateByAadhaar(aadhaar: string) {
  const clean = (aadhaar ?? "").replace(/\D/g, "");
  if (clean.length !== 12) return null;
  const { data, error } = await supabase.rpc("find_rehire_candidate_by_aadhaar" as never, {
    _aadhaar: clean,
  } as never);
  if (error) throw error;
  return (((data as unknown) as Array<{
    id: string;
    full_name: string;
    employee_code: string | null;
    candidate_code: string | null;
    mobile: string | null;
    status: string | null;
    aadhaar_number: string | null;
    unit_id: string | null;
    resignation_url: string | null;
    id_card_url: string | null;
  }> | null)?.[0]) ?? null;
}

export async function fetchOpenRehireForAadhaar(aadhaar: string): Promise<RehireRequest | null> {
  const clean = (aadhaar ?? "").replace(/\D/g, "");
  if (clean.length !== 12) return null;
  const { data, error } = await supabase
    .from("rehire_requests")
    .select("*")
    .eq("aadhaar_number", clean)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as RehireRequest | null) ?? null;
}

// -------------------------------- definition edits --------------------------

export async function updateWorkflow(id: string, patch: Partial<WorkflowDefinition>) {
  const { error } = await supabase.from("workflow_definitions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function upsertWorkflowStep(step: Partial<WorkflowStep> & { workflow_id: string }) {
  if (step.id) {
    const { id, ...patch } = step;
    const { error } = await supabase.from("workflow_steps").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("workflow_steps").insert(step as never);
  if (error) throw error;
}

export async function deleteWorkflowStep(id: string) {
  const { error } = await supabase.from("workflow_steps").delete().eq("id", id);
  if (error) throw error;
}

/** Re-writes step_order for the given ordered list of step ids. */
export async function reorderWorkflowSteps(orderedIds: string[]) {
  // Two-phase to dodge the (workflow_id, step_order) unique constraint.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("workflow_steps")
      .update({ step_order: -(i + 1) })
      .eq("id", orderedIds[i]);
    if (error) throw error;
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("workflow_steps")
      .update({ step_order: i + 1 })
      .eq("id", orderedIds[i]);
    if (error) throw error;
  }
}

// --------------------------------- notifications ---------------------------

async function userIdsForRole(roleKey: string): Promise<string[]> {
  if (!roleKey) return [];
  const { data, error } = await supabase.rpc("get_user_ids_by_role" as never, {
    _role_key: roleKey,
  } as never);
  if (error) {
    console.error("userIdsForRole error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

async function notifyRole(
  roleKey: string,
  input: { type: string; title: string; message: string; entityId: string },
) {
  const ids = await userIdsForRole(roleKey);
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const rows = ids.map((uid) => ({
    id: crypto.randomUUID(),
    user_id: uid,
    actor_id: auth?.user?.id ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    link: rehireNotificationLink(input.entityId),
    entity_type: "rehire_request",
    entity_id: input.entityId,
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) console.error("notifyRole insert error", error);
}

async function notifyUserIds(
  userIds: Array<string | null | undefined>,
  input: { type: string; title: string; message: string; entityId: string },
) {
  const ids = userIds.filter((v): v is string => !!v);
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const rows = ids.map((uid) => ({
    id: crypto.randomUUID(),
    user_id: uid,
    actor_id: auth?.user?.id ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    link: rehireNotificationLink(input.entityId),
    entity_type: "rehire_request",
    entity_id: input.entityId,
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) console.error("notifyUserIds insert error", error);
}

// --------------------------------- helpers ---------------------------------

async function currentActor() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  let name = "";
  let role = "";
  if (uid) {
    const { data } = await supabase.rpc("get_user_display_name" as never, {
      _user_id: uid,
    } as never);
    const row = ((data as unknown) as Array<{ full_name: string; role_key: string }> | null)?.[0];
    name = row?.full_name ?? "";
    role = row?.role_key ?? "";
  }
  return { uid, name, role };
}

async function loadRehireSteps(): Promise<WorkflowStep[]> {
  const wf = await fetchWorkflowByKey(REHIRE_WORKFLOW_KEY);
  if (!wf) throw new Error("Rehire workflow is not configured. Ask an administrator to set it up.");
  if (!wf.is_active) throw new Error("The rehire workflow is currently disabled.");
  const steps = (await fetchWorkflowSteps(wf.id)).filter((s) => s.is_active);
  if (steps.length === 0) throw new Error("The rehire workflow has no active steps configured.");
  return steps;
}

export function stepByOrder(steps: WorkflowStep[], order: number) {
  return steps.find((s) => s.step_order === order) ?? null;
}

export function nextStep(steps: WorkflowStep[], order: number) {
  return steps.filter((s) => s.step_order > order).sort((a, b) => a.step_order - b.step_order)[0] ?? null;
}

export async function uploadRehireDocument(file: File, kind: "resignation" | "id-card", aadhaar: string) {
  const ext = file.name.split(".").pop() || "png";
  const path = `rehire/${kind}/${aadhaar || "NEW"}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("candidate-files")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from("candidate-files")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

// --------------------------------- actions ---------------------------------

export async function createRehireRequest(input: {
  previousCandidateId: string;
  aadhaarNumber: string;
  fullName: string;
  mobile?: string;
  unitId?: string | null;
  roleKey?: string | null;
  designationId?: string | null;
  resignationUrl: string;
  idCardUrl: string;
  notes?: string;
}): Promise<RehireRequest> {
  const steps = await loadRehireSteps();
  const requestStep = steps[0];
  const approvalStep = nextStep(steps, requestStep.step_order);
  const actor = await currentActor();

  const existing = await fetchOpenRehireForAadhaar(input.aadhaarNumber);
  if (existing) {
    throw new Error(
      `A rehire request (${existing.request_number ?? existing.id.slice(0, 8)}) is already in progress for this Aadhaar.`,
    );
  }

  const { data: myCandidateId } = await supabase.rpc("current_user_candidate_id" as never);

  const { data, error } = await supabase
    .from("rehire_requests")
    .insert({
      workflow_key: REHIRE_WORKFLOW_KEY,
      previous_candidate_id: input.previousCandidateId,
      aadhaar_number: input.aadhaarNumber.replace(/\D/g, ""),
      full_name: input.fullName ?? "",
      mobile: input.mobile ?? "",
      unit_id: input.unitId ?? null,
      role_key: input.roleKey ?? "",
      designation_id: input.designationId ?? null,
      requested_by: actor.uid,
      requested_by_candidate_id: (myCandidateId as unknown as string) ?? null,
      resignation_url: input.resignationUrl,
      id_card_url: input.idCardUrl,
      notes: input.notes ?? "",
      current_step_order: approvalStep ? approvalStep.step_order : requestStep.step_order,
      status: "pending",
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  const request = data as RehireRequest;

  await supabase.from("rehire_request_events").insert({
    request_id: request.id,
    step_order: requestStep.step_order,
    step_name: requestStep.name,
    actor_id: actor.uid,
    actor_name: actor.name,
    actor_role_key: actor.role,
    action: "submitted",
    notes: input.notes ?? "",
  } as never);

  if (approvalStep) {
    await notifyRole(approvalStep.approver_role_key, {
      type: "rehire_request_pending",
      title: "Rehire approval pending",
      message: `${input.fullName || "A former employee"} has been raised for rehire by ${actor.name || "a field officer"}. Review the resignation and ID card, then approve or reject.`,
      entityId: request.id,
    });
  }

  await logActivity({
    module: ACTIVITY_MODULE,
    action: "create",
    entityType: "rehire_request",
    entityId: request.id,
    entityLabel: `${request.request_number ?? ""} ${input.fullName}`.trim(),
    details: { aadhaar: request.aadhaar_number, previous_candidate_id: input.previousCandidateId },
  });

  return request;
}

/** HR enablement — reactivates the person, either keeping the old employee ID or stamping a new one. */
async function enableRehiredCandidate(
  request: RehireRequest,
  keepEmployeeCode: boolean,
): Promise<string> {
  const candidateId = request.new_candidate_id || request.previous_candidate_id;
  if (!candidateId) throw new Error("No employee record is linked to this rehire request.");

  const { data: prev, error: prevErr } = await supabase
    .from("candidates")
    .select("employee_code")
    .eq("id", candidateId)
    .maybeSingle();
  if (prevErr) throw prevErr;
  const existingCode = ((prev as { employee_code?: string | null } | null)?.employee_code ?? "").trim();

  let code = existingCode;
  if (!keepEmployeeCode || !existingCode) {
    const { data: seq, error: seqErr } = await supabase.rpc("nextval" as never, {
      sequence_name: "employee_code_seq",
    } as never);
    if (seqErr) throw seqErr;
    code = `EMP-${String(seq as unknown as number).padStart(3, "0")}`;
  }

  const { error } = await supabase
    .from("candidates")
    .update({
      status: "active",
      is_enabled: true,
      no_hire: false,
      employee_code: code,
      ...(request.unit_id ? { unit_id: request.unit_id } : {}),
      ...(request.role_key ? { role_key: request.role_key } : {}),
      ...(request.designation_id ? { designation_id: request.designation_id } : {}),
      offboarded_at: null,
      offboarding_reason_id: null,
      rejection_reason: "",
      approved_at: new Date().toISOString(),
    } as never)
    .eq("id", candidateId);
  if (error) throw error;

  // Replace (not merge) the old deployment mapping — a rehire moves the person
  // to the unit chosen at request time; stale rows from the previous stint are
  // what made the old unit keep showing up on the profile.
  if (request.unit_id) {
    const { error: delErr } = await supabase
      .from("candidate_units" as never)
      .delete()
      .eq("candidate_id", candidateId)
      .neq("unit_id", request.unit_id);
    if (delErr) throw new Error(`Could not clear the previous unit mapping: ${delErr.message}`);
    const { error: cuErr } = await supabase
      .from("candidate_units" as never)
      .upsert({ candidate_id: candidateId, unit_id: request.unit_id } as never, {
        onConflict: "candidate_id,unit_id",
      } as never);
    if (cuErr) throw new Error(`Could not assign the rehire unit: ${cuErr.message}`);
  }

  // Same for designations: candidate_designations drives candidates.designation_id
  // via a DB trigger, so leaving the previous designation row behind resurrects
  // the old (contract-invalid) designation.
  const { error: dDelErr } = await supabase
    .from("candidate_designations" as never)
    .delete()
    .eq("candidate_id", candidateId);
  if (dDelErr) throw new Error(`Could not clear the previous designation: ${dDelErr.message}`);
  if (request.designation_id) {
    const { error: dInsErr } = await supabase
      .from("candidate_designations" as never)
      .insert({
        candidate_id: candidateId,
        designation_id: request.designation_id,
        is_primary: true,
      } as never);
    if (dInsErr) throw new Error(`Could not apply the rehire designation: ${dInsErr.message}`);
  } else {
    // No designation captured — make sure the stale one doesn't linger on the profile.
    await supabase.from("candidates").update({ designation_id: null } as never).eq("id", candidateId);
  }

  // The field officer who raised the rehire becomes the reporting manager.
  if (request.requested_by_candidate_id) {
    const { error: mDelErr } = await supabase
      .from("candidate_reporting_managers" as never)
      .delete()
      .eq("candidate_id", candidateId)
      .neq("manager_id", request.requested_by_candidate_id);
    if (mDelErr) console.error("rehire reporting manager cleanup", mDelErr);
    const { error: mErr } = await supabase
      .from("candidate_reporting_managers" as never)
      .upsert(
        {
          candidate_id: candidateId,
          manager_id: request.requested_by_candidate_id,
          unit_id: request.unit_id ?? null,
          is_primary: true,
          source: "rehire",
        } as never,
        { onConflict: "candidate_id,manager_id" } as never,
      );
    if (mErr) throw new Error(`Could not set the reporting manager: ${mErr.message}`);
    await supabase
      .from("candidates")
      .update({ reports_to: request.requested_by_candidate_id } as never)
      .eq("id", candidateId);
  }

  return code;
}


export async function actOnRehireRequest(input: {
  request: RehireRequest;
  action: "approve" | "reject";
  notes?: string;
  /** Final (HR enablement) step only — reuse the previous employee ID instead of issuing a new one. */
  keepEmployeeCode?: boolean;
}): Promise<{ status: string; employeeCode?: string }> {

  const steps = await loadRehireSteps();
  const current = stepByOrder(steps, input.request.current_step_order);
  if (!current) throw new Error("This request's current step no longer exists in the workflow.");
  const actor = await currentActor();

  if (input.action === "reject") {
    const { error } = await supabase
      .from("rehire_requests")
      .update({
        status: "rejected",
        rejection_reason: input.notes ?? "",
      } as never)
      .eq("id", input.request.id);
    if (error) throw error;

    await supabase.from("rehire_request_events").insert({
      request_id: input.request.id,
      step_order: current.step_order,
      step_name: current.name,
      actor_id: actor.uid,
      actor_name: actor.name,
      actor_role_key: actor.role,
      action: "rejected",
      notes: input.notes ?? "",
    } as never);

    await notifyUserIds([input.request.requested_by], {
      type: "rehire_request_rejected",
      title: "Rehire request rejected",
      message: `${input.request.full_name || "The rehire request"} was rejected at ${current.name}.${input.notes ? ` Reason: ${input.notes}` : ""}`,
      entityId: input.request.id,
    });

    await logActivity({
      module: ACTIVITY_MODULE,
      action: "reject",
      entityType: "rehire_request",
      entityId: input.request.id,
      entityLabel: `${input.request.request_number ?? ""} ${input.request.full_name}`.trim(),
      details: { step: current.key, notes: input.notes ?? "" },
    });
    return { status: "rejected" };
  }

  const upcoming = nextStep(steps, current.step_order);
  const isFinal = !upcoming;
  let employeeCode: string | undefined;

  // The last step is the enablement step — it materialises the new employee ID.
  if (isFinal) {
    employeeCode = await enableRehiredCandidate(input.request, !!input.keepEmployeeCode);
  }

  const { error } = await supabase
    .from("rehire_requests")
    .update({
      current_step_order: upcoming ? upcoming.step_order : current.step_order,
      status: isFinal ? "completed" : "pending",
      completed_at: isFinal ? new Date().toISOString() : null,
      new_employee_code: employeeCode ?? input.request.new_employee_code,
    } as never)
    .eq("id", input.request.id);
  if (error) throw error;

  await supabase.from("rehire_request_events").insert({
    request_id: input.request.id,
    step_order: current.step_order,
    step_name: current.name,
    actor_id: actor.uid,
    actor_name: actor.name,
    actor_role_key: actor.role,
    action: isFinal ? "enabled" : "approved",
    notes: input.notes ?? "",
  } as never);

  if (upcoming) {
    await notifyRole(upcoming.approver_role_key, {
      type: "rehire_request_pending",
      title: `Rehire pending: ${upcoming.name}`,
      message: `${input.request.full_name || "A rehire request"} cleared ${current.name}. Your action is required.`,
      entityId: input.request.id,
    });
  }

  await notifyUserIds([input.request.requested_by], {
    type: isFinal ? "rehire_request_completed" : "rehire_request_progress",
    title: isFinal ? "Rehire completed" : "Rehire approved",
    message: isFinal
      ? `${input.request.full_name || "The employee"} has been re-enabled with employee ID ${employeeCode}.`
      : `${input.request.full_name || "The rehire request"} cleared ${current.name} and moved to ${upcoming?.name ?? "the next step"}.`,
    entityId: input.request.id,
  });

  await logActivity({
    module: ACTIVITY_MODULE,
    action: isFinal ? "enable" : "approve",
    entityType: "rehire_request",
    entityId: input.request.id,
    entityLabel: `${input.request.request_number ?? ""} ${input.request.full_name}`.trim(),
    details: { step: current.key, notes: input.notes ?? "", employee_code: employeeCode ?? "" },
  });

  return { status: isFinal ? "completed" : "pending", employeeCode };
}
