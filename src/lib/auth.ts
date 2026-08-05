import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, getClientIp } from "@/lib/activity-log";

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

function read(): AuthUser | null {
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
 * Bridge the pre-launch phone OTP into the existing Auth session used by RLS.
 * HyperAuth remains an independent network gate and must not create sessions.
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

  const stored = read();
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

async function ensureSupabaseSession(phone: string) {
  const { email, password } = credsForPhone(phone);
  const signIn = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    "Login is taking too long. Please try again.",
  );
  if (!signIn.error) return;

  const signUp = await withTimeout(
    supabase.auth.signUp({ email, password }),
    "Account setup is taking too long. Please try again.",
  );
  if (signUp.error && !/registered/i.test(signUp.error.message)) {
    throw signUp.error;
  }

  const retry = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    "Login is taking too long. Please try again.",
  );
  if (retry.error) throw retry.error;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => read());
  const [isReady, setIsReady] = useState(() => typeof window === "undefined");

  useEffect(() => {
    let active = true;
    const syncStoredUser = () => {
      if (!active) return;
      setUser(read());
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

      const stored = read();
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
      await ensureSupabaseSession(phone);
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
  }, []);

  const logout = useCallback(() => {
    const current = read();
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
