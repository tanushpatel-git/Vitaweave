"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "../../../lib/auth";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

export function HospitalLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9f8] text-[#17201d]">
      <div className="relative min-h-screen">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-blue-100/50 blur-[110px]" />

          <div className="absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full bg-emerald-100/40 blur-[120px]" />

          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(#17201d 1px, transparent 1px), linear-gradient(90deg, #17201d 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>

        {/* Navigation */}
        <header className="relative z-20 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white text-[#69726e] hover:bg-[#f0f2f1]"
            >
              <ArrowLeft size={18} />
            </button>

            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17201d] text-white shadow-sm">
                <Activity size={18} strokeWidth={2.2} />
              </div>

              <div>
                <div className="text-[15px] font-semibold tracking-[-0.02em]">
                  VITAWEAVE
                </div>

                <div className="hidden text-[8px] font-medium uppercase tracking-[0.22em] text-[#7a8581] sm:block">
                  Healthcare Intelligence
                </div>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#dfe5e2] bg-white/70 px-3 py-2 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#6d7773]">
              Systems Operational
            </span>
          </div>
        </header>

        {/* Main */}
        <section className="relative z-10 mx-auto flex min-h-[calc(100vh-90px)] max-w-[1450px] items-center px-6 pb-12 pt-4 sm:px-10 lg:px-14">
          <div className="grid w-full grid-cols-1 items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            {/* Left editorial */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.7,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative"
            >
              <div className="mb-8 flex items-center gap-3">
                <div className="h-px w-10 bg-[#94a09b]" />

                <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#737e79]">
                  Hospital Intelligence Network
                </span>
              </div>

              <h1 className="max-w-[720px] text-[clamp(3.5rem,7vw,7.2rem)] font-medium leading-[0.88] tracking-[-0.075em] text-[#17201d]">
                See the
                <br />
                <span className="text-[#68736f]">pressure.</span>
                <br />
                Act earlier.
              </h1>

              <p className="mt-8 max-w-[520px] text-base leading-7 text-[#69736f] sm:text-lg">
                VITAWEAVE connects hospital capacity, patient demand, and regional
                resources into one operational intelligence layer.
              </p>

              {/* Intelligence flow */}
              <div className="mt-12 max-w-[570px]">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#89928e]">
                    Hospital intelligence loop
                  </span>

                  <span className="font-mono text-[9px] text-[#a0aaa6]">
                    NXS / 02
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[
                    "CAPACITY",
                    "DEMAND",
                    "RESOURCES",
                    "FORECAST",
                    "ACTION",
                  ].map((item, index) => (
                    <div key={item} className="flex items-center gap-2">
                      <div className="rounded-full border border-[#d9e0dd] bg-white/75 px-3 py-2 text-[9px] font-medium tracking-[0.12em] text-[#56615d] shadow-[0_4px_18px_rgba(23,32,29,0.035)] backdrop-blur-sm">
                        {item}
                      </div>

                      {index < 4 && (
                        <ArrowRight
                          size={11}
                          strokeWidth={1.5}
                          className="text-[#a6afab]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* System information */}
              <div className="mt-14 grid max-w-[570px] grid-cols-3 border-t border-[#dfe5e2] pt-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9aa39f]">
                    Capacity
                  </p>

                  <p className="mt-2 text-sm font-medium text-[#35403c]">
                    Live
                  </p>
                </div>

                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9aa39f]">
                    Forecast
                  </p>

                  <p className="mt-2 text-sm font-medium text-[#35403c]">
                    7 Days
                  </p>
                </div>

                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9aa39f]">
                    Network
                  </p>

                  <p className="mt-2 text-sm font-medium text-[#35403c]">
                    Regional
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Login */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative mx-auto w-full max-w-[470px]"
            >
              {/* Technical coordinates */}
              <div className="absolute -right-2 -top-8 hidden font-mono text-[8px] uppercase tracking-[0.18em] text-[#a0aaa6] sm:block">
                ORGANIZATION ACCESS
                <br />
                NXS / AUTH / 02
              </div>

              <div className="rounded-[30px] border border-[#dfe5e2] bg-white/78 p-7 shadow-[0_30px_100px_rgba(23,32,29,0.08)] backdrop-blur-2xl sm:p-9">
                {/* Heading */}
                <div className="mb-9">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f4f2] text-[#27332f]">
                    <Building2 size={18} strokeWidth={1.8} />
                  </div>

                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8a9590]">
                    Hospital workspace
                  </p>

                  <h2 className="text-3xl font-medium tracking-[-0.045em] text-[#17201d]">
                    Welcome back.
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[#7b8581]">
                    Sign in to access your hospital intelligence workspace.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>}
                  {/* Email */}
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]"
                    >
                      Organization email
                    </label>

                    <div className="group relative">
                      <Mail
                        size={16}
                        strokeWidth={1.7}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa49f] transition-colors group-focus-within:text-[#35413d]"
                      />

                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="admin@hospital.org"
                        autoComplete="email"
                        required
                        className="h-14 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] pl-12 pr-4 text-sm text-[#17201d] outline-none transition-all placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="mb-2.5 flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]"
                      >
                        Password
                      </label>

                      <button
                        type="button"
                        className="text-[10px] font-medium text-[#6d7773] transition-colors hover:text-[#17201d]"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="group relative">
                      <LockKeyhole
                        size={16}
                        strokeWidth={1.7}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa49f] transition-colors group-focus-within:text-[#35413d]"
                      />

                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="h-14 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] pl-12 pr-12 text-sm text-[#17201d] outline-none transition-all placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword((value) => !value)
                        }
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f] transition-colors hover:text-[#35413d]"
                      >
                        {showPassword ? (
                          <EyeOff size={17} strokeWidth={1.7} />
                        ) : (
                          <Eye size={17} strokeWidth={1.7} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Remember */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="remember"
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="h-4 w-4 rounded border-[#ccd5d1] accent-[#17201d]"
                    />

                    <label
                      htmlFor="remember"
                      className="text-xs text-[#7a8580]"
                    >
                      Keep me signed in
                    </label>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative mt-2 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[#17201d] text-sm font-medium text-white shadow-[0_12px_30px_rgba(23,32,29,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#26332e] hover:shadow-[0_18px_40px_rgba(23,32,29,0.2)] active:translate-y-0"
                  >
                    <span>{loading ? "Signing in…" : "Enter hospital workspace"}</span>

                    <ArrowRight
                      size={16}
                      strokeWidth={1.8}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </button>
                </form>

                {/* Security */}
                <div className="mt-7 flex items-center justify-center gap-2 text-center">
                  <ShieldCheck
                    size={14}
                    strokeWidth={1.7}
                    className="text-emerald-600"
                  />

                  <span className="text-[9px] leading-4 text-[#89938f]">
                    Protected hospital workspace · Secure authentication
                  </span>
                </div>
              </div>

              {/* Registration */}
              <p className="mt-6 text-center text-xs text-[#89938f]">
                Hospital workspaces are provisioned by the{" "}
                <button
                  onClick={() => router.push("/")}
                  className="font-medium text-[#35403d] underline decoration-[#c5ceca] underline-offset-4 transition-colors hover:text-[#17201d]"
                >
                  platform administrator
                </button>
              </p>
              <p className="mt-2 text-center text-xs text-[#89938f]">
                Platform admin?{" "}
                <button
                  onClick={() => router.push("/admin/login")}
                  className="font-medium text-[#35403d] underline decoration-[#c5ceca] underline-offset-4 transition-colors hover:text-[#17201d]"
                >
                  Sign in to the platform console
                </button>
              </p>
            </motion.div>
          </div>
        </section>

        {/* Footer coordinates */}
        <div className="pointer-events-none absolute bottom-6 left-6 hidden font-mono text-[8px] uppercase tracking-[0.18em] text-[#a0aaa6] sm:left-10 lg:left-14 lg:block">
          VITAWEAVE / HOSPITAL INTELLIGENCE / AUTH
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 hidden font-mono text-[8px] uppercase tracking-[0.18em] text-[#a0aaa6] sm:right-10 lg:right-14 lg:block">
          SYSTEM 02 · SECURE
        </div>
      </div>
    </main>
  );
}

export default HospitalLoginPage;
