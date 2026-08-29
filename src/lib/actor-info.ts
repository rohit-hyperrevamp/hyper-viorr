import { supabase } from "@/integrations/supabase/client";

export type ActorInfo = {
  userId: string;
  fullName: string;
  mobile: string;
  roleLabel: string;
  designation: string;
};

const cache = new Map<string, ActorInfo>();

function titleCase(s: string) {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolves a human-readable actor (who performed an action) from an auth user id:
 * full name, designation, role and mobile. Cached per session.
 */
export async function fetchActorInfo(
  userId: string | null | undefined,
): Promise<ActorInfo | null> {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit) return hit;

  let fullName = "";
  let mobile = "";
  let roleKey = "";
  try {
    const { data } = await supabase.rpc("get_user_display_name" as never, {
      _user_id: userId,
    } as never);
    const row = (data as unknown as Array<Record<string, unknown>> | null)?.[0];
    if (row) {
      fullName = String(row.full_name ?? "");
      mobile = String(row.mobile ?? "");
      roleKey = String(row.role_key ?? "");
    }
  } catch {
    /* ignore */
  }

  let designation = "";
  if (mobile) {
    try {
      const { data: cand } = await supabase
        .from("candidates")
        .select("full_name,designation_id,role_key")
        .eq("mobile", mobile)
        .maybeSingle();
      if (cand) {
        if (!fullName) fullName = String(cand.full_name ?? "");
        if (!roleKey) roleKey = String(cand.role_key ?? "");
        if (cand.designation_id) {
          const { data: d } = await supabase
            .from("designations")
            .select("name")
            .eq("id", cand.designation_id as string)
            .maybeSingle();
          designation = String(d?.name ?? "");
        }
      }
    } catch {
      /* ignore */
    }
  }

  const info: ActorInfo = {
    userId,
    fullName: fullName || (mobile ? `User ${mobile}` : "Unknown user"),
    mobile,
    roleLabel: roleKey ? titleCase(roleKey) : "",
    designation: designation || (roleKey ? titleCase(roleKey) : ""),
  };
  cache.set(userId, info);
  return info;
}

/** "Rahul Deshmukh (HR Manager · 9800100487)" — used in notification messages. */
export function formatActor(info: ActorInfo | null): string {
  if (!info) return "";
  const meta = [info.designation, info.mobile].filter(Boolean).join(" · ");
  return meta ? `${info.fullName} (${meta})` : info.fullName;
}
