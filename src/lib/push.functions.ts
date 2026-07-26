import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getPushRegistrationStatusForUser,
  saveNativePushTokenForUser,
  sendNativePushForRecentNotifications,
  sendNativePushToUsersServer,
} from "./push-delivery.server";

export const getMyPushRegistrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getPushRegistrationStatusForUser(context.userId));

export const saveMyPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      token: z.string().min(32).max(512),
      platform: z.enum(["ios", "android", "web"]).default("ios"),
    }).parse(data),
  )
  .handler(async ({ context, data }) =>
    saveNativePushTokenForUser(context.userId, {
      token: data.token,
      platform: data.platform,
    }),
  );

export const sendTestPushToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ message: z.string().optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const result = await sendNativePushToUsersServer([userId], {
      title: "Radiant Guard",
      body: data.message || "Test push notification",
    });
    const firstFailure = result.failures[0]?.error;
    const failedDetail = firstFailure
      ? `APNs error: ${firstFailure}`
      : "No push notifications were sent.";
    return {
      sent: result.sent,
      total: result.total,
      results: result.failures,
      message:
        result.sent > 0
          ? `Sent ${result.sent} of ${result.total} push notification${result.total === 1 ? "" : "s"}.`
          : result.total === 0
            ? "No registered iPhone token found for this signed-in user. Tap Refresh iPhone registration and try again."
            : failedDetail,
    };
  });

export const sendNativePushToUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      userIds: z.array(z.string().uuid()).min(1).max(100),
      title: z.string().min(1).max(180),
      message: z.string().min(1).max(3000),
      link: z.string().max(500).optional(),
    }).parse(data),
  )
  .handler(async ({ context, data }) =>
    sendNativePushForRecentNotifications(context.userId, data.userIds, {
      title: data.title,
      body: data.message,
      link: data.link,
    }),
  );
