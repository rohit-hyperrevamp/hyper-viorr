import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AUTH_PAGE_SIZE = 1000;

export function credentialsForPhone(phone: string) {
  return {
    email: `phone-${phone}@radiantguard.local`,
    password: `RG-${phone}-pre-launch!`,
  };
}

export async function ensurePhoneIdentity(
  supabaseAdmin: SupabaseClient<Database>,
  phone: string,
) {
  const { email, password } = credentialsForPhone(phone);
  let page = 1;

  while (true) {
    const usersPage = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (usersPage.error) throw usersPage.error;

    const found = usersPage.data.users.find(
      (user) => (user.email ?? "").toLowerCase() === email,
    );
    if (found) {
      const updated = await supabaseAdmin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
      });
      if (updated.error) throw updated.error;
      return { email };
    }

    if (usersPage.data.users.length < AUTH_PAGE_SIZE) break;
    page += 1;
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  return { email };
}