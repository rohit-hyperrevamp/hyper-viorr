import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Fingerprint, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp } from "@/lib/auth";
import {
  getBiometricStatus,
  signInWithBiometric,
} from "@/lib/biometric";
import { markNativeAppSessionUnlocked } from "@/lib/native-app-lock";
import { logNativeEvent } from "@/lib/native";
import logo from "@/assets/hv-logo.png";
import opsImage from "@/assets/login-ops.jpg";


export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hyper Vioarr" },
      {
        name: "description",
        content:
          "Sign in to Hyper Vioarr with your phone number and OTP.",
      },
      { property: "og:title", content: "Sign in — Hyper Vioarr" },
      {
        property: "og:description",
        content:
          "Sign in to Hyper Vioarr with your phone number and OTP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sign in — Hyper Vioarr" },
      {
        name: "twitter:description",
        content:
          "Sign in to Hyper Vioarr with your phone number and OTP.",
      },
    ],
  }),
  component: LoginPage,
});

type Step = "phone" | "otp";

function LoginPage() {
  const navigate = useNavigate();
  const { user, login, isReady } = useAuth();
  const verifyInFlightRef = useRef(false);
  const loginStartedRef = useRef(false);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    if (isReady && user && !loginStartedRef.current) {
      void navigate({ to: "/", replace: true });
    }
  }, [isReady, user, navigate]);

  useEffect(() => {
    void getBiometricStatus().then((status) => {
      setBioAvailable(status.available);
      setBioEnabled(status.enabled);
    });
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneValid = /^\d{10}$/.test(phone);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneValid) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 500));
    setSending(false);
    setStep("otp");
    setResendIn(30);
    setOtp("");
    setError(null);
    toast.success(`OTP sent to +91 ••• ••• ${phone.slice(-4)}`);
  }

  async function handleVerify(value?: string) {
    const code = value ?? otp;
    if (code.length !== 6 || verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    loginStartedRef.current = true;
    setVerifying(true);
    if (!verifyOtp(code)) {
      verifyInFlightRef.current = false;
      loginStartedRef.current = false;
      setVerifying(false);
      setError("Incorrect code. Please check your SMS and try again.");
      setOtp("");
      return;
    }
    try {
      logNativeEvent("authentication", "OTP verification started");
      await login(`+91${phone}`);
      markNativeAppSessionUnlocked();
      logNativeEvent("authentication", "secure session established");
      toast.success("Signed in");
      setRevealing(true);
      await navigate({ to: "/", replace: true });
    } catch (err) {
      loginStartedRef.current = false;
      logNativeEvent("authentication", "OTP sign-in failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      setError(
        err instanceof Error ? err.message : "Could not start session. Try again.",
      );
      setOtp("");
    } finally {
      verifyInFlightRef.current = false;
      setVerifying(false);
    }
  }

  async function handleBiometricLogin() {
    if (!bioAvailable || bioBusy) return;
    setBioBusy(true);
    setError(null);
    try {
      loginStartedRef.current = true;
      const savedPhone = await signInWithBiometric();
      if (!savedPhone) {
        loginStartedRef.current = false;
        setBioBusy(false);
        return;
      }
      markNativeAppSessionUnlocked();
      await login(savedPhone);
      toast.success("Signed in with Face ID");
      setRevealing(true);
      await navigate({ to: "/", replace: true });
    } catch (err) {
      loginStartedRef.current = false;
      setError(
        err instanceof Error ? err.message : "Face ID sign-in failed. Use OTP instead.",
      );
      void getBiometricStatus().then((status) => {
        setBioAvailable(status.available);
        setBioEnabled(status.enabled);
      });
    } finally {
      setBioBusy(false);
    }
  }

  return (
    <div className="login-screen relative flex min-h-dvh w-full flex-col overflow-hidden lg:flex-row">
      <div aria-hidden className="login-grid pointer-events-none absolute inset-0" />

      {/* ================= Left: sign-in ================= */}
      <div
        className={`login-panel relative z-20 flex min-h-dvh flex-1 flex-col px-6 py-8 sm:px-12 lg:px-16 ${
          revealing ? "animate-slide-out-up" : ""
        }`}
      >
        {/* Brand header */}
        <div className="login-brand-header flex items-center gap-3">
          <img
            src={logo}
            alt="Hyper Vioarr"
            className="h-10 w-10 rounded-xl object-contain"
          />
          <div className="leading-tight">
            <div className="font-display text-[17px] font-semibold tracking-tight text-zinc-900">
              Hyper Vioarr
            </div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Vioarr × HyperRevamp
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center py-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="login-step-badge mb-6 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            {step === "phone" ? (
              <>
                <Sparkles className="h-3.5 w-3.5 login-accent" /> Welcome back
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 login-accent" /> Almost there
              </>
            )}
          </div>

          <div className="login-title font-display text-[34px] font-semibold leading-[1.08] tracking-tight text-zinc-900">
            {step === "phone" ? "Sign in to continue" : "Verify your number"}
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-500">
            {step === "phone"
              ? "Enter your mobile number to receive a one-time code."
              : `We sent a 6-digit code to +91 ••• ••• ${phone.slice(-4)}.`}
          </p>


          <div className="mt-9">
            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-6">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Mobile number
                  </span>
                  <div className="login-field flex h-14 w-full items-center overflow-hidden rounded-xl">
                    <div className="flex items-center gap-3 pl-5 pr-3">
                      <span className="whitespace-nowrap text-[15px] font-semibold text-zinc-900">
                        +91
                      </span>
                      <span className="h-6 w-px bg-black/15" />
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      className="h-full flex-1 bg-transparent pr-5 text-[16px] font-medium tracking-wide text-zinc-900 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none"
                    />
                  </div>
                </label>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="login-btn group flex h-14 w-full items-center justify-center rounded-xl text-[15px] font-semibold"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Send OTP
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

                {bioAvailable && bioEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBiometricLogin}
                    disabled={bioBusy}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/10 text-[14px] font-semibold text-blue-700 transition hover:bg-blue-500/20 disabled:opacity-60"
                  >
                    {bioBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4 login-accent" />
                        Sign in with Face ID
                      </>
                    )}
                  </Button>
                )}
              </form>
            ) : (
              <div className="space-y-6">
                <div className={error ? "animate-shake" : ""}>
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(v) => {
                      setOtp(v);
                      setError(null);
                    }}
                    onComplete={(value) => void handleVerify(value)}
                    containerClassName="justify-between gap-2"
                  >
                    <InputOTPGroup className="flex w-full justify-between gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="login-otp-slot h-14 w-full rounded-xl text-xl font-semibold tabular-nums first:rounded-l-xl last:rounded-r-xl"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  {error ? (
                    <p className="mt-3 text-center text-sm font-medium text-red-500">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-[13px] text-zinc-500">
                      Enter the 6-digit code sent to your phone
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={otp.length !== 6 || verifying}
                  className="login-btn flex h-14 w-full items-center justify-center rounded-xl text-[16px] font-semibold"
                >
                  {verifying ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Verify & sign in"
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep("phone");
                      setOtp("");
                      setError(null);
                    }}
                    className="h-auto min-h-0 p-0 font-medium text-zinc-500 transition hover:bg-transparent hover:text-zinc-900"
                  >
                    ← Change number
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={resendIn > 0 || sending}
                    onClick={() => sendOtp()}
                    className="h-auto min-h-0 p-0 font-semibold text-zinc-900 transition hover:bg-transparent hover:opacity-80 disabled:cursor-not-allowed disabled:text-zinc-500"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Trust row */}
          <div className="login-trust mt-9 flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/[0.04] px-3 py-2.5 text-[12px] font-medium text-zinc-600">
            <ShieldCheck className="h-4 w-4 login-accent" />
            <span>Encrypted end-to-end · Secure OTP verification</span>
          </div>
        </div>
        </div>

        {/* Footer credit */}
        <div className="login-footer flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          <span>Hyper Vioarr Ops Portal</span>
          <span aria-hidden>·</span>
          <span>A Vioarr × HyperRevamp product</span>
        </div>
      </div>

      {/* ================= Right: visual story panel ================= */}
      <div className="relative z-10 hidden lg:block lg:w-[46%] lg:shrink-0 lg:p-5">
        <div
          className={`login-visual relative flex h-full flex-col justify-between p-12 ${
            revealing ? "" : "animate-slide-in-right"
          }`}
        >
          <img
            src={opsImage}
            alt="CCTV security control room monitor wall"
            width={1280}
            height={2065}
            className="login-photo absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden className="login-photo-scrim absolute inset-0" />
          <div aria-hidden className="login-brand-glow pointer-events-none absolute inset-0" />

          <div className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/85 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5b8bff]" />
            Enterprise workforce OS
          </div>

          <div className="login-copy relative">
            <h1 className="login-headline max-w-xl text-white">
              Workforce operations
              <br />
              <span className="login-headline-accent">redefined for scale.</span>
            </h1>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/70">
              Guards, units, payroll and compliance — one command center built
              for modern enterprises.
            </p>

            <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-white/80">
              <span className="font-semibold text-white">Live field visibility</span> —
              attendance, patrols and escalations, the moment they happen.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            {[
              { v: "24×7", l: "Ops coverage" },
              { v: "99.9%", l: "Uptime SLA" },
              { v: "Pan-India", l: "Deployment ready" },
            ].map((s) => (
              <div key={s.l} className="login-stat px-4 py-3">
                <div className="font-display text-[16px] font-semibold tracking-tight text-white">
                  {s.v}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-white/60">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

