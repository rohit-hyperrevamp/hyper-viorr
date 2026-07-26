import { createFileRoute } from "@tanstack/react-router";

type Row = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
  unit_id: string | null;
  designation_id: string | null;
  reports_to: string | null;
  status: string | null;
};

function todayMMDD(): { month: number; day: number; iso: string } {
  const d = new Date();
  return { month: d.getMonth() + 1, day: d.getDate(), iso: d.toISOString().slice(0, 10) };
}

function yearsBetween(fromISO: string, to: Date) {
  const f = new Date(fromISO);
  let y = to.getFullYear() - f.getFullYear();
  const m = to.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < f.getDate())) y--;
  return y;
}

export const Route = createFileRoute("/api/public/hooks/daily-people-pings")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const today = todayMMDD();
        const now = new Date();

        // Load active candidates with dob
        const { data: candidates, error: cErr } = await supabaseAdmin
          .from("candidates")
          .select("id,full_name,date_of_birth,approved_at,created_at,unit_id,designation_id,reports_to,status")
          .in("status", ["approved", "active"]);
        if (cErr) throw cErr;

        const rows = ((candidates as unknown) as Row[]) ?? [];

        const birthdays = rows.filter((r) => {
          if (!r.date_of_birth) return false;
          const d = new Date(r.date_of_birth);
          return d.getMonth() + 1 === today.month && d.getDate() === today.day;
        });

        const anniversaries = rows
          .map((r) => {
            const started = r.approved_at || r.created_at;
            if (!started) return null;
            const d = new Date(started);
            if (d.getMonth() + 1 !== today.month || d.getDate() !== today.day) return null;
            const years = yearsBetween(started, now);
            if (years < 1) return null;
            return { r, years };
          })
          .filter(Boolean) as Array<{ r: Row; years: number }>;

        if (!birthdays.length && !anniversaries.length) {
          return Response.json({ ok: true, birthdays: 0, anniversaries: 0 });
        }

        // Recipients: HR/Leadership/Admin/Super Admin (via existing helper),
        // plus per-person branch_manager & reports_to.
        const { data: approverRows } = await supabaseAdmin.rpc(
          "get_onboarding_approver_user_ids" as never,
        );
        const baseRecipients = new Set<string>(
          (((approverRows as unknown) as Array<{ user_id: string }>) ?? []).map((r) => r.user_id),
        );

        // Resolve unit -> branch, and lookup names for unit/designation for message body.
        const unitIds = Array.from(new Set(rows.map((r) => r.unit_id).filter(Boolean))) as string[];
        const desigIds = Array.from(new Set(rows.map((r) => r.designation_id).filter(Boolean))) as string[];
        const [{ data: units }, { data: desigs }] = await Promise.all([
          unitIds.length
            ? supabaseAdmin.from("units").select("id,name,code,branch_id").in("id", unitIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string; code: string; branch_id: string | null }> }),
          desigIds.length
            ? supabaseAdmin.from("designations").select("id,name").in("id", desigIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
        ]);
        const unitById = new Map(
          (((units as unknown) as Array<{ id: string; name: string; code: string; branch_id: string | null }>) ?? []).map(
            (u) => [u.id, u],
          ),
        );
        const desigById = new Map(
          (((desigs as unknown) as Array<{ id: string; name: string }>) ?? []).map((d) => [d.id, d.name]),
        );

        async function branchRecipients(branchId: string | null | undefined) {
          if (!branchId) return [] as string[];
          const { data } = await supabaseAdmin.rpc("get_user_ids_by_branch" as never, {
            _branch_id: branchId,
          } as never);
          return (((data as unknown) as Array<{ user_id: string }>) ?? []).map((r) => r.user_id);
        }

        async function foUserId(candidateId: string | null | undefined) {
          if (!candidateId) return null;
          const { data } = await supabaseAdmin.rpc("get_user_id_by_candidate" as never, {
            _candidate_id: candidateId,
          } as never);
          return ((data as unknown) as string) || null;
        }

        async function unitTeammateUserIds(unitId: string | null | undefined, excludeCandidateId: string) {
          if (!unitId) return [] as string[];
          const { data } = await supabaseAdmin.rpc("get_user_ids_by_unit" as never, {
            _unit_id: unitId,
          } as never);
          const ids = (((data as unknown) as Array<{ user_id: string }>) ?? []).map((r) => r.user_id);
          const selfId = await foUserId(excludeCandidateId);
          return selfId ? ids.filter((id) => id !== selfId) : ids;
        }

        function personLine(r: Row) {
          const u = r.unit_id ? unitById.get(r.unit_id) : null;
          const desig = r.designation_id ? desigById.get(r.designation_id) : "";
          const bits = [desig, u ? u.name || u.code : ""].filter(Boolean);
          return bits.join(" · ");
        }

        async function fanOut(type: string, title: string, message: string, r: Row) {
          const link = `/admin/candidates/${r.id}/details`;
          const recipients = new Set<string>(baseRecipients);
          const u = r.unit_id ? unitById.get(r.unit_id) : null;
          const branchIds = await branchRecipients(u?.branch_id ?? null);
          branchIds.forEach((id) => recipients.add(id));
          const foId = await foUserId(r.reports_to);
          if (foId) recipients.add(foId);
          const teammateIds = await unitTeammateUserIds(r.unit_id, r.id);
          teammateIds.forEach((id) => recipients.add(id));
          if (!recipients.size) return 0;

          const entityKey = `${r.id}:${today.iso}`;
          const rowsToInsert = Array.from(recipients).map((uid) => ({
            user_id: uid,
            actor_id: null as string | null,
            type,
            title,
            message,
            link,
            entity_type: "candidate",
            entity_id: entityKey,
          }));
          // Dedupe: skip existing (user_id, entity_id, type) combos for today.
          const { data: existing } = await supabaseAdmin
            .from("notifications")
            .select("user_id")
            .eq("entity_id", entityKey)
            .eq("type", type);
          const already = new Set(
            (((existing as unknown) as Array<{ user_id: string }>) ?? []).map((r) => r.user_id),
          );
          const fresh = rowsToInsert.filter((r) => !already.has(r.user_id));
          if (!fresh.length) return 0;
          await supabaseAdmin.from("notifications").insert(fresh as never);
          const { sendNativePushToUsersServer } = await import("@/lib/push-delivery.server");
          await sendNativePushToUsersServer(
            fresh.map((notification) => notification.user_id),
            { title, body: message, link },
          ).catch((error) => console.warn("daily people native push failed", error));
          return fresh.length;
        }

        let sentB = 0;
        for (const r of birthdays) {
          const sub = personLine(r);
          sentB += await fanOut(
            "birthday",
            `🎂 Birthday today — ${r.full_name}`,
            sub ? `${sub}. Wish them a great day!` : "Wish them a great day!",
            r,
          );
        }
        let sentA = 0;
        for (const { r, years } of anniversaries) {
          const sub = personLine(r);
          sentA += await fanOut(
            "work_anniversary",
            `🎉 ${years}-year work anniversary — ${r.full_name}`,
            sub ? `${sub}. Congrats on ${years} year${years === 1 ? "" : "s"} with RGS.` : `Congrats on ${years} year${years === 1 ? "" : "s"} with RGS.`,
            r,
          );
        }

        return Response.json({
          ok: true,
          birthdays: birthdays.length,
          anniversaries: anniversaries.length,
          notifications_created: sentB + sentA,
        });
      },
    },
  },
});
