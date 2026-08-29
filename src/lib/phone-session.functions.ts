import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const provisionPhoneIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ candidateId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actorEmail = String(context.claims.email ?? "").toLowerCase();
    const actorPhone = actorEmail.match(/^phone-(\d{10})@radiantguard\.local$/)?.[1] ?? "";
    const { data: actor } = await context.supabase
      .from("candidates")
      .select("role_key")
      .eq("mobile", actorPhone)
      .maybeSingle();
    const roleKey = actor?.role_key ?? "";
    const isSuperAdmin = actorPhone === "8373914073";
    if (!isSuperAdmin && !["admin", "super_admin", "hr", "leadership"].includes(roleKey)) {
      throw new Error("You do not have permission to provision employee access.");
    }

    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("mobile,status,is_enabled,is_disabled")
      .eq("id", data.candidateId)
      .single();
    if (error) throw error;
    const phone = (candidate.mobile ?? "").replace(/\D/g, "").slice(-10);
    if (!/^\d{10}$/.test(phone)) throw new Error("Employee has no valid login phone number.");
    if (!["active", "approved"].includes(candidate.status) || !candidate.is_enabled || candidate.is_disabled) {
      throw new Error("Employee must be active and enabled before login access is created.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensurePhoneIdentity } = await import("@/lib/phone-session.server");
    await ensurePhoneIdentity(supabaseAdmin, phone);
    return { ok: true };
  });

export const restorePhoneSession = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ phone: z.string().regex(/^\d{10}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const eligibility = await supabaseAdmin.rpc("can_phone_login", {
      _mobile: data.phone,
    });

    if (eligibility.error || eligibility.data !== true) {
      throw new Error("This account is not enabled.");
    }

    const { ensurePhoneIdentity } = await import("@/lib/phone-session.server");
    const { email } = await ensurePhoneIdentity(supabaseAdmin, data.phone);

    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });


    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      throw link.error ?? new Error("Could not restore this account.");
    }

    const signedIn = await supabaseAdmin.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("Could not establish a secure session.");
    }

    return {
      accessToken: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
    };
  });