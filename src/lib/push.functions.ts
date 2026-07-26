import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendApnsPush } from "./apns.server";

export const sendTestPushToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ message: z.string().optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;

    const { data: rows, error } = await context.supabase
      .from("device_push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return {
        sent: 0,
        total: 0,
        message:
          "No registered device tokens found. Sign in on an iOS device and allow notifications first.",
      };
    }

    let sent = 0;
    const results: Array<{ tokenSuffix: string; ok: boolean; error?: string }> = [];

    for (const row of rows) {
      const token = row.token;
      const result = await sendApnsPush(token, {
        title: "Radiant Guard",
        body: data.message || "Test push notification",
      });
      if (result.success) {
        sent++;
        results.push({ tokenSuffix: token.slice(-8), ok: true });
      } else {
        results.push({
          tokenSuffix: token.slice(-8),
          ok: false,
          error: result.error || `HTTP ${result.status}`,
        });
      }
    }

    const failed = results.filter((result) => !result.ok);
    const failedDetail = failed[0]?.error
      ? `APNs error: ${failed[0].error}`
      : "No push notifications were sent.";
    return {
      sent,
      total: rows.length,
      results,
      message:
        sent > 0
          ? `Sent ${sent} of ${rows.length} push notification${rows.length === 1 ? "" : "s"}.`
          : failedDetail,
    };
  });
