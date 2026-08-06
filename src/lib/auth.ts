import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, getClientIp } from "@/lib/activity-log";
import { restorePhoneSession } from "@/lib/phone-session.functions";

const STORAGE_KEY = "radiant.auth";
const AUTH_TIMEOUT_MS = 12_000;
const IP_LOOKUP_TIMEOUT_MS = 1_500;
/**
 * ⚠️ PRE-LAUNCH TESTING ONLY ⚠️
 * The OTP below is a hardcoded development bypass used while the SMS gateway
 * integration is pending. Before launch, this MUST be replaced with a real
 * OTP provider (Twilio / MSG91 / Supabase phone auth) and the value should
 * come exclusively from server-side configuration / environment variables.
 *
 * The default OTP and super-admin phone can be overridden via Vite env vars:
 *   VITE_DEMO_OTP            (default: "111111")
 *   VITE_SUPER_ADMIN_PHONE   (default: "8373914073")
 */
const DEMO_OTP =
  (import.meta.env.VITE_DEMO_OTP as string | undefined) ?? "111111";

export const SUPER_ADMIN_PHONE =
  (import.meta.env.VITE_SUPER_ADMIN_PHONE as string | undefined) ??
  "8373914073";

export type AuthUser = { phone: string; role: "super_admin" | "user" };

export function readStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

/**
 * Bridge phone-OTP login into a real Supabase Auth session so RLS works.
 * Each phone gets a deterministic synthetic email + password (pre-launch only).
 */
function credsForPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return {
    email: `phone-${digits}@radiantguard.local`,
    password: `RG-${digits}-pre-launch!`,
  };
}

function withTimeout<T>(promise: Promise<T>, message: string, ms = AUTH_TIMEOUT_MS) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function resolveClientIpQuickly() {
  return Promise.race<string>([
    getClientIp(),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve(""), IP_LOOKUP_TIMEOUT_MS);
    }),
  ]).catch(() => "");
}

async function authUserFromSession(): Promise<AuthUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  }

  const stored = readStoredAuthUser();
  if (stored) return stored;

  const email = session.user.email ?? "";
  const match = email.match(/^phone-(\d{10})@radiantguard\.local$/i);
  if (!match) return null;

  const phone = `+91${match[1]}`;
  const user: AuthUser = {
    phone,
    role: match[1] === SUPER_ADMIN_PHONE ? "super_admin" : "user",
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  return user;
}

async function ensureSupabaseSession(
  phone: string,
  restore: (input: {
    data: { phone: string };
  }) => Promise<{ accessToken: string; refreshToken: string }>,
) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const isSuperAdmin = digits === SUPER_ADMIN_PHONE;

  // Preflight: only super-admins or active/approved & enabled employees may sign in.
  if (!isSuperAdmin) {
    const rpcRes = await withTimeout(
      Promise.resolve(supabase.rpc("can_phone_login" as never, { _mobile: digits } as never)) as Promise<{ data: boolean | null; error: { message: string } | null }>,
      "Verifying access is taking too long. Please try again.",
    );
    if (rpcRes.error) throw new Error(rpcRes.error.message);
    if (!rpcRes.data) {
      throw new Error(
        "Access disabled. Your account is not active. Please contact your administrator.",
      );
    }
  }

  const { email, password } = credsForPhone(phone);
  const signIn = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    "Login is taking too long. Please try again.",
  );
  if (!signIn.error) return;

  const tokens = await withTimeout(
    restore({ data: { phone: digits } }),
    "Account restoration is taking too long. Please try again.",
  );
  const restored = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (restored.error || !restored.data.session) {
    throw restored.error ?? new Error("Could not establish a secure session.");
  }
}

export function useAuth() {
  const restoreSession = useServerFn(restorePhoneSession);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    // Supabase emits auth events on every token refresh and tab focus. Writing
    // a freshly parsed (but identical) user object each time re-rendered the
    // whole admin shell and made large screens like the payroll register
    // flicker. Only change state when the identity actually changes.
    const setUser = (next: AuthUser | null) => {
      setUserState((prev) =>
        JSON.stringify(prev ?? null) === JSON.stringify(next ?? null) ? prev : next,
      );
    };
    const syncStoredUser = () => {
      if (!active) return;
      setUser(readStoredAuthUser());
    };


    const syncFromSession = async () => {
      try {
        const nextUser = await authUserFromSession();
        if (!active) return;
        setUser(nextUser);
      } finally {
        if (!active) return;
        setIsReady(true);
      }
    };

    listeners.add(syncStoredUser);
    window.addEventListener("storage", syncStoredUser);

    void syncFromSession().catch(() => {
      if (!active) return;
      setUser(null);
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session?.user) {
        window.localStorage.removeItem(STORAGE_KEY);
        setUser(null);
        setIsReady(true);
        return;
      }

      const stored = readStoredAuthUser();
      if (stored) {
        setUser(stored);
        setIsReady(true);
        return;
      }

      const email = session.user.email ?? "";
      const match = email.match(/^phone-(\d{10})@radiantguard\.local$/i);
      if (!match) {
        setUser(null);
        setIsReady(true);
        return;
      }

      const nextUser: AuthUser = {
        phone: `+91${match[1]}`,
        role: match[1] === SUPER_ADMIN_PHONE ? "super_admin" : "user",
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
      setIsReady(true);
    });

    return () => {
      active = false;
      listeners.delete(syncStoredUser);
      window.removeEventListener("storage", syncStoredUser);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    const role: AuthUser["role"] =
      digits === SUPER_ADMIN_PHONE ? "super_admin" : "user";
    const ipPromise = resolveClientIpQuickly();
    try {
      await ensureSupabaseSession(phone, restoreSession);
    } catch (e) {
      void ipPromise.then((ip) =>
        logActivity({
          module: "Authentication",
          action: "login",
          entityType: "user",
          entityLabel: phone,
          userPhone: phone,
          userRole: role,
          ip,
          status: "failure",
          errorMessage: e instanceof Error ? e.message : String(e),
        }),
      );
      throw e;
    }
    const u: AuthUser = { phone, role };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    // If a different phone had biometric enabled on this device, wipe it so
    // the next Face ID prompt can't sign in as the previous user.
    void (async () => {
      try {
        const { getStoredBiometricPhone, disableBiometric } = await import("./biometric");
        const stored = await getStoredBiometricPhone();
        if (stored) {
          const storedDigits = stored.replace(/\D/g, "").slice(-10);
          if (storedDigits && storedDigits !== digits) {
            await disableBiometric();
          }
        }
      } catch {
        /* noop */
      }
    })();
    void ipPromise.then((ip) =>
      logActivity({
        module: "Authentication",
        action: "login",
        entityType: "user",
        entityLabel: phone,
        userPhone: phone,
        userRole: role,
        ip,
      }),
    );
    emit();
  }, [restoreSession]);

  const logout = useCallback(() => {
    const current = readStoredAuthUser();
    void logActivity({
      module: "Authentication",
      action: "logout",
      entityType: "user",
      entityLabel: current?.phone ?? "",
      userPhone: current?.phone ?? "",
      userRole: current?.role ?? "",
    });
    window.localStorage.removeItem(STORAGE_KEY);
    void supabase.auth.signOut();
    emit();
  }, []);

  return { user, login, logout, isReady };
}

// TODO: replace with real OTP provider (Twilio / MSG91 / Supabase phone auth).
// Hardcoded OTP is ONLY for pre-launch testing.
export function verifyOtp(code: string): boolean {
  return code === DEMO_OTP;
}

export const DEMO_OTP_HINT = DEMO_OTP;
