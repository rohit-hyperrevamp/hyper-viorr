import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const restorePhoneSession = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ phone: z.string().regex(/^\d{10}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const eligibility = await supabaseAdmin.rpc("can_phone_login", { _mobile: data.phone });
    if (eligibility.error || eligibility.data !== true) {
      throw new Error("This account is not enabled.");
    }

    const email = `phone-${data.phone}@radiantguard.local`;
    let link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
      });
      if (created.error) throw created.error;
      link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    }
    const tokenHash = link.data?.properties.hashed_token;
    if (link.error || !tokenHash) throw link.error ?? new Error("Could not restore this account.");

    const signedIn = await supabaseAdmin.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("Could not establish a secure session.");
    }
    return {
      accessToken: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
    };
  });