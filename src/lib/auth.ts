import { useEffect, useState, useCallback } from "react";
import { logActivity, getClientIp } from "@/lib/activity-log";

const STORAGE_KEY = "radiant.auth";
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

function resolveClientIpQuickly() {
  return Promise.race<string>([
    getClientIp(),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve(""), IP_LOOKUP_TIMEOUT_MS);
    }),
  ]).catch(() => "");
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => read());
  const [isReady, setIsReady] = useState(() => typeof window === "undefined");

  useEffect(() => {
    const syncStoredUser = () => {
      setUser(read());
      setIsReady(true);
    };
    syncStoredUser();
    listeners.add(syncStoredUser);
    window.addEventListener("storage", syncStoredUser);
    return () => {
      listeners.delete(syncStoredUser);
      window.removeEventListener("storage", syncStoredUser);
    };
  }, []);

  const login = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    const role: AuthUser["role"] =
      digits === SUPER_ADMIN_PHONE ? "super_admin" : "user";
    const ipPromise = resolveClientIpQuickly();
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
