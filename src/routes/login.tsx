import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Fingerprint, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp } from "@/lib/auth";
import {
  enableBiometric,
  getBiometricStatus,
  signInWithBiometric,
} from "@/lib/biometric";
import { markNativeAppSessionUnlocked } from "@/lib/native-app-lock";
import logo from "@/assets/hv-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hyper Viorr" },
      {
        name: "description",
        content:
          "Sign in to Hyper Viorr with your phone number and OTP.",
      },
      { property: "og:title", content: "Sign in — Hyper Viorr" },
      {
        property: "og:description",
        content:
          "Sign in to Hyper Viorr with your phone number and OTP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sign in — Hyper Viorr" },
      {
        name: "twitter:description",
        content:
          "Sign in to Hyper Viorr with your phone number and OTP.",
      },
    ],
  }),
  component: LoginPage,
});

type Step = "phone" | "otp";

function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const verifyInFlightRef = useRef(false);

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
    if (user && !revealing) navigate({ to: "/", replace: true });
  }, [user, navigate, revealing]);

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
    setVerifying(true);
    if (!verifyOtp(code)) {
      verifyInFlightRef.current = false;
      setVerifying(false);
      setError("Incorrect code. Please check your SMS and try again.");
      setOtp("");
      return;
    }
    try {
      await login(`+91${phone}`);
      markNativeAppSessionUnlocked();
      toast.success("Signed in");
      // Offer to enable Face ID on first successful sign-in on a device.
      const biometricStatus = await getBiometricStatus();
      if (biometricStatus.available && !biometricStatus.enabled) {
        try {
          await enableBiometric(`+91${phone}`);
          setBioAvailable(true);
          setBioEnabled(true);
          toast.success("Face ID enabled for this device");
        } catch (bioErr) {
          console.warn("[biometric] enable failed", bioErr);
          toast.info(
            bioErr instanceof Error && bioErr.message
              ? `Face ID not enabled: ${bioErr.message}`
              : "Face ID not enabled (you can enable it later from Profile).",
          );
        }
      }
      setRevealing(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 640);
    } catch (err) {
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
      const savedPhone = await signInWithBiometric();
      if (!savedPhone) {
        setBioBusy(false);
        return;
      }
      markNativeAppSessionUnlocked();
      await login(savedPhone);
      toast.success("Signed in with Face ID");
      setRevealing(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 640);
    } catch (err) {
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
    <div className="login-screen relative flex min-h-dvh w-full overflow-hidden">
      {/* ================= Background imagery ================= */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img
          src={opsImage}
          alt=""
          width={1280}
          height={1600}
          className="login-photo h-full w-full object-cover object-center"
        />
        <div className="login-photo-scrim absolute inset-0" />
      </div>

      {/* ================= Left: brand canvas ================= */}
      <div className="relative z-10 hidden flex-1 flex-col justify-center px-16 lg:flex xl:px-24">
        <div aria-hidden className="login-brand-glow pointer-events-none absolute inset-0" />

        <div className="reveal relative">
          <div className="mb-8 flex items-center gap-3">
            <img
              src={logo}
              alt="Hyper Viorr"
              className="h-11 w-11 rounded-xl object-contain"
            />
            <span className="font-display text-2xl font-semibold tracking-tight text-white">
              Hyper Viorr
            </span>
          </div>

          <div className="login-headline max-w-xl text-white">
            Workforce operations
            <br />
            <span className="login-headline-accent">redefined for scale.</span>
          </div>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
            Guards, units, payroll and compliance — one command center built
            for modern enterprises.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <img
              src={guardImage}
              alt="Security officer on duty at a corporate lobby"
              loading="lazy"
              width={912}
              height={1200}
              className="login-thumb h-32 w-24 rounded-2xl object-cover"
            />
            <div className="max-w-[220px] text-sm leading-relaxed text-zinc-400">
              <span className="login-accent font-semibold">Live field visibility</span> — attendance,
              patrols and escalations, the moment they happen.
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="absolute bottom-12 left-16 flex gap-12 xl:left-24">
          <div className="flex flex-col">
            <span className="font-display text-lg font-medium text-white">24×7</span>
            <span className="text-sm text-zinc-500">Ops coverage</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-medium text-white">99.9%</span>
            <span className="text-sm text-zinc-500">Uptime SLA</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-medium text-white">Pan-India</span>
            <span className="text-sm text-zinc-500">Deployment ready</span>
          </div>
        </div>
      </div>


      {/* ================= Right: glass sign-in panel ================= */}
      <div
        className={`login-panel relative z-20 flex min-h-dvh w-full flex-col justify-center px-6 py-10 sm:px-14 lg:w-[520px] lg:shrink-0 ${
          revealing ? "animate-slide-out-up" : "animate-slide-in-right"
        }`}
      >
        {/* Mobile brand header */}
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <img
            src={logo}
            alt="Hyper Viorr"
            className="h-9 w-9 rounded-lg object-contain"
          />
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold tracking-tight text-white">
              Hyper Viorr
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Viorr × HyperRevamp
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm lg:mx-0 lg:px-6">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {step === "phone" ? (
              <>
                <Sparkles className="h-3.5 w-3.5 text-white" /> Welcome back
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-white" /> Almost there
              </>
            )}
          </div>

          <div className="font-display text-3xl font-medium tracking-tight text-white">
            {step === "phone" ? "Sign in to continue" : "Verify your number"}
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
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
                      <span className="whitespace-nowrap text-[15px] font-semibold text-white">
                        +91
                      </span>
                      <span className="h-6 w-px bg-white/15" />
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
                      className="h-full flex-1 bg-transparent pr-5 text-[16px] font-medium tracking-wide text-white placeholder:text-zinc-600 focus:outline-none"
                    />
                  </div>
                </label>

                <button
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
                </button>

                {bioAvailable && bioEnabled && (
                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={bioBusy}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                  >
                    {bioBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4 text-white" />
                        Sign in with Face ID
                      </>
                    )}
                  </button>
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
                      if (v.length === 6) handleVerify(v);
                    }}
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
                    <p className="mt-3 text-center text-sm font-medium text-red-400">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-[13px] text-zinc-500">
                      Enter the 6-digit code sent to your phone
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleVerify()}
                  disabled={otp.length !== 6 || verifying}
                  className="login-btn flex h-14 w-full items-center justify-center rounded-xl text-[16px] font-semibold"
                >
                  {verifying ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Verify & sign in"
                  )}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setOtp("");
                      setError(null);
                    }}
                    className="font-medium text-zinc-500 transition hover:text-white"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || sending}
                    onClick={() => sendOtp()}
                    className="font-semibold text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:text-zinc-600"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Trust row */}
          <div className="mt-9 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] font-medium text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-white" />
            <span>Encrypted end-to-end · Secure OTP verification</span>
          </div>
        </div>

        {/* Footer credit */}
        <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-1.5 px-4 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
          <span>Hyper Viorr Ops Portal</span>
          <span aria-hidden>·</span>
          <span>A Viorr × HyperRevamp product</span>
        </div>
      </div>
    </div>
  );
}
