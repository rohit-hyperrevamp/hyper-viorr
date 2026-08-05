import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const createHyperAuthSession = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ phone: z.string().regex(/^\+91\d{10}$/) }).parse(input))
  .handler(async ({ data }) => {
    const firstIp = (raw: string | null | undefined) => (raw?.split(",")[0] ?? "").trim();
    const ip =
      firstIp(getRequestHeader("cf-connecting-ip")) ||
      firstIp(getRequestHeader("x-forwarded-for")) ||
      getRequestIP({ xForwardedFor: true }) ||
      "";
    const country =
      getRequestHeader("cf-ipcountry") ??
      getRequestHeader("x-vercel-ip-country") ??
      getRequestHeader("x-country-code") ??
      "";
    const { checkRequestAccess } = await import("@/lib/ip-access.server");
    const access = await checkRequestAccess(ip, country);
    if (!access.allowed) throw new Error("HYPERAUTH_BLOCKED");

    const digits = data.phone.slice(-10);
    const email = `phone-${digits}@radiantguard.local`;
    const legacyPassword = `RG-${digits}-pre-launch!`;
    const superAdminPhone = process.env["VITE_SUPER_ADMIN_PHONE"] ?? "8373914073";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (digits !== superAdminPhone) {
      const eligibility = await supabaseAdmin.rpc("can_phone_login" as never, {
        _mobile: digits,
      } as never) as unknown as { data: boolean | null; error: { message: string } | null };
      if (eligibility.error) throw new Error(eligibility.error.message);
      if (!eligibility.data) throw new Error("ACCOUNT_DISABLED");
    }

    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const backendUrl = process.env["SUPABASE_URL"];
    if (!publishableKey || !backendUrl) throw new Error("AUTH_CONFIGURATION_ERROR");
    const authClient = createClient<Database>(backendUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            publishableKey.startsWith("sb_") &&
            headers.get("Authorization") === `Bearer ${publishableKey}`
          ) {
            headers.delete("Authorization");
          }
          headers.set("apikey", publishableKey);
          return fetch(input, { ...init, headers });
        },
      },
    });

    let signedIn = await authClient.auth.signInWithPassword({
      email,
      password: legacyPassword,
    });
    if (signedIn.error) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: legacyPassword,
        email_confirm: true,
      });
      if (created.error && !/registered|already/i.test(created.error.message)) {
        throw created.error;
      }
      signedIn = await authClient.auth.signInWithPassword({ email, password: legacyPassword });
    }
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("SESSION_CREATION_FAILED");
    }

    return {
      accessToken: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
    };
  });