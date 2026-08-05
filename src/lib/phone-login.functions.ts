import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

export const createHyperAuthSession = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ phone: z.string().regex(/^\+91\d{10}$/) }).parse(input))
  .handler(async ({ data }) => {
    const ips = [
      getRequestHeader("cf-connecting-ip"),
      getRequestHeader("x-forwarded-for"),
      getRequestHeader("x-real-ip"),
      getRequestIP({ xForwardedFor: true }),
    ].filter((value): value is string => Boolean(value));
    const country =
      getRequestHeader("cf-ipcountry") ??
      getRequestHeader("x-vercel-ip-country") ??
      getRequestHeader("x-country-code") ??
      "";
    const { checkRequestAccess } = await import("@/lib/ip-access.server");
    const access = await checkRequestAccess(ips, country);
    if (!access.allowed) throw new Error("HYPERAUTH_BLOCKED");

    const digits = data.phone.slice(-10);
    const email = `phone-${digits}@radiantguard.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    if (link.error || !link.data.properties.hashed_token || !link.data.user) {
      throw link.error ?? new Error("SESSION_CREATION_FAILED");
    }

    const signedIn = await supabaseAdmin.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("SESSION_CREATION_FAILED");
    }

    return {
      accessToken: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
    };
  });