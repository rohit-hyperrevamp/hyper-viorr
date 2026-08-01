import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Emails a rendered posting order to the employee. */
export const sendPostingOrderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        to: z.string().email(),
        subject: z.string().min(3).max(300),
        html: z.string().min(10).max(200_000),
        text: z.string().max(50_000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendEmailViaResend } = await import("./posting-order.server");
    return sendEmailViaResend(data);
  });
