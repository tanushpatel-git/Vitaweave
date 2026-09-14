import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Brain,
  Building2,
  ChevronRight,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

const portals = [
  {
    href: "/patient/login",
    label: "Patient",
    eyebrow: "01 / PERSONAL",
    description: "Personal health workspace and care access.",
    icon: HeartPulse,
    accent: "text-[#477b70]",
    surface: "bg-[#eef5f2]",
    metric: "CARE",
  },
  {
    href: "/hospital/login",
    label: "Hospital",
    eyebrow: "02 / OPERATIONS",
    description: "Organization capacity, demand and resource intelligence.",
    icon: Building2,
    accent: "text-[#54749a]",
    surface: "bg-[#eef2f7]",
    metric: "CAPACITY",
  },
  {
    href: "/doctor/login",
    label: "Doctor",
    eyebrow: "03 / CLINICAL",
    description: "Clinical intelligence, prediction and patient review.",
    icon: Stethoscope,
    accent: "text-[#766653]",
    surface: "bg-[#f4f0e9]",
    metric: "SIGNAL",
  },
  {
    href: "/admin/login",
    label: "Admin",
    eyebrow: "04 / PLATFORM",
    description: "Hospital onboarding, accounts and platform oversight.",
    icon: ShieldCheck,
    accent: "text-[#8a5a44]",
    surface: "bg-[#f4efec]",
    metric: "CONTROL",
  },
] as const;

const signals = [
  "PATIENT RISK",
  "DISEASE SIGNAL",
  "DEMAND",
  "CAPACITY",
  "ACTION",
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7f6] text-[#17201d]">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#dcebe6] opacity-60 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[600px] w-[600px] rounded-full bg-[#e5ebf2] opacity-70 blur-3xl" />

        {/* Architectural grid */}
        <div
          className="absolute inset-0 opacity-[0.32]"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(23,32,29,0.045) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(23,32,29,0.045) 1px, transparent 1px)
            `,
            backgroundSize: "72px 72px",
          }}
        />

        {/* Vertical editorial lines */}
        <div className="absolute left-[12%] top-0 h-full w-px bg-black/[0.045]" />
        <div className="absolute left-[50%] top-0 h-full w-px bg-black/[0.045]" />
        <div className="absolute right-[12%] top-0 h-full w-px bg-black/[0.045]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-6 py-6 sm:px-10 lg:px-14">
        {/* NAV */}
        <header className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#17201d] text-white shadow-lg shadow-black/10">
              <Activity size={18} strokeWidth={2.1} />

              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#f5f7f6] bg-[#6c998d]" />
            </div>

            <div>
              <p className="text-[13px] font-semibold tracking-[0.2em]">
                VITAWEAVE
              </p>
              <p className="text-[9px] uppercase tracking-[0.18em] text-black/35">
                Healthcare Intelligence
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-black/35">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6c998d]" />
              Intelligence system online
            </div>

            <div className="h-5 w-px bg-black/10" />

            <div className="font-mono text-[9px] tracking-[0.14em] text-black/30">
              VTV / 01.0
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="grid flex-1 items-center gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-24">
          {/* LEFT */}
          <div>
            <div className="mb-8 flex items-center gap-3">
              <span className="h-px w-10 bg-[#4d7c72]" />

              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#4d7c72]">
                Unified healthcare intelligence
              </span>
            </div>

            <h1 className="max-w-4xl text-[clamp(4.2rem,8vw,8.5rem)] font-medium leading-[0.79] tracking-[-0.075em]">
              See the
              <br />
              <span className="text-black/30">signal.</span>
              <br />
              <span>Act earlier.</span>
            </h1>

            <p className="mt-10 max-w-xl text-[15px] leading-7 text-black/50 sm:text-base">
              VITAWEAVE connects clinical risk, hospital demand and regional
              capacity into one intelligence system — helping healthcare
              teams understand what is happening and what comes next.
            </p>

            {/* Intelligence chain */}
            <div className="mt-12 overflow-x-auto pb-2">
              <div className="flex min-w-max items-center">
                {signals.map((signal, index) => (
                  <div key={signal} className="flex items-center">
                    <div
                      className={`flex h-9 items-center rounded-full border border-black/[0.07] px-4 ${
                        index === 0
                          ? "bg-[#17201d] text-white"
                          : "bg-white/60 text-black/45"
                      }`}
                    >
                      <span className="font-mono text-[9px] font-medium tracking-[0.14em]">
                        {signal}
                      </span>
                    </div>

                    {index < signals.length - 1 && (
                      <div className="mx-2 flex items-center">
                        <span className="h-px w-5 bg-black/10" />
                        <ChevronRight size={11} className="text-black/20" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — SPATIAL INTELLIGENCE VISUAL */}
          <div className="relative mx-auto w-full max-w-[600px] lg:ml-auto">
            <div className="relative aspect-square">
              {/* Outer rings */}
              <div className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.055]" />

              <div className="absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.07]" />

              <div className="absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.08]" />

              {/* Radial lines */}
              <div className="absolute left-1/2 top-[11%] h-[78%] w-px -translate-x-1/2 bg-black/[0.055]" />

              <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-black/[0.055]" />

              {/* Central intelligence core */}
              <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75 shadow-[0_30px_80px_rgba(38,63,57,0.12)] backdrop-blur-xl">
                <div className="absolute inset-5 rounded-full border border-[#7ca79d]/25" />

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Brain
                    size={32}
                    strokeWidth={1.2}
                    className="mb-3 text-[#4d7c72]"
                  />

                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/35">
                    Intelligence
                  </span>

                  <span className="mt-1 text-2xl font-medium tracking-[-0.04em]">
                    VITAWEAVE
                  </span>
                </div>

                {/* Core pulse */}
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4d7c72] shadow-[0_0_0_8px_rgba(77,124,114,0.08)]" />
              </div>

              {/* Orbit node 01 */}
              <div className="absolute left-[8%] top-[25%]">
                <div className="relative">
                  <div className="absolute -right-20 top-1/2 h-px w-20 bg-black/10" />

                  <div className="relative rounded-2xl border border-black/[0.07] bg-white/80 px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                    <p className="font-mono text-[8px] tracking-[0.15em] text-black/30">
                      01 / CLINICAL
                    </p>

                    <p className="mt-1 text-xs font-medium">Patient Risk</p>

                    <p className="mt-1 text-[10px] text-black/35">
                      Prediction signal
                    </p>
                  </div>

                  <span className="absolute -right-[86px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#4d7c72]" />
                </div>
              </div>

              {/* Orbit node 02 */}
              <div className="absolute right-[4%] top-[30%]">
                <div className="relative">
                  <div className="absolute -left-20 top-1/2 h-px w-20 bg-black/10" />

                  <div className="rounded-2xl border border-black/[0.07] bg-white/80 px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                    <p className="font-mono text-[8px] tracking-[0.15em] text-black/30">
                      02 / DEMAND
                    </p>

                    <p className="mt-1 text-xs font-medium">Hospital Load</p>

                    <p className="mt-1 text-[10px] text-black/35">
                      7-day forecast
                    </p>
                  </div>

                  <span className="absolute -left-[86px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#54749a]" />
                </div>
              </div>

              {/* Orbit node 03 */}
              <div className="absolute bottom-[15%] left-[12%]">
                <div className="relative">
                  <div className="absolute -right-16 top-1/2 h-px w-16 bg-black/10" />

                  <div className="rounded-2xl border border-black/[0.07] bg-white/80 px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                    <p className="font-mono text-[8px] tracking-[0.15em] text-black/30">
                      03 / RESOURCE
                    </p>

                    <p className="mt-1 text-xs font-medium">Capacity</p>

                    <p className="mt-1 text-[10px] text-black/35">
                      Pressure detected
                    </p>
                  </div>

                  <span className="absolute -right-[70px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#766653]" />
                </div>
              </div>

              {/* Orbit node 04 */}
              <div className="absolute bottom-[18%] right-[9%]">
                <div className="relative">
                  <div className="absolute -left-16 top-1/2 h-px w-16 bg-black/10" />

                  <div className="rounded-2xl border border-black/[0.07] bg-white/80 px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                    <p className="font-mono text-[8px] tracking-[0.15em] text-black/30">
                      04 / ACTION
                    </p>

                    <p className="mt-1 text-xs font-medium">Coordinate</p>

                    <p className="mt-1 text-[10px] text-black/35">
                      Network response
                    </p>
                  </div>

                  <span className="absolute -left-[70px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#647b72]" />
                </div>
              </div>

              {/* Floating status */}
              <div className="absolute left-1/2 top-[5%] -translate-x-1/2 rounded-full border border-black/[0.07] bg-white/70 px-4 py-2 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6c998d] opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6c998d]" />
                  </span>

                  <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-black/40">
                    Live intelligence
                  </span>
                </div>
              </div>

              {/* Bottom coordinate */}
              <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-[0.18em] text-black/20">
                CLINICAL → HOSPITAL → NETWORK
              </div>
            </div>
          </div>
        </section>

        {/* PORTAL SELECTOR */}
        <section className="pb-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/30">
                Access point
              </p>

              <h2 className="mt-2 text-xl font-medium tracking-[-0.03em]">
                Choose your workspace
              </h2>
            </div>

            <p className="hidden text-[10px] uppercase tracking-[0.14em] text-black/25 sm:block">
              Select your role to continue
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {portals.map((portal) => {
              const Icon = portal.icon;

              return (
                <Link
                  key={portal.href}
                  href={portal.href}
                  className="group relative overflow-hidden rounded-[24px] border border-black/[0.07] bg-white/75 p-6 shadow-[0_12px_45px_rgba(0,0,0,0.035)] backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:border-black/[0.12] hover:bg-white hover:shadow-[0_24px_65px_rgba(0,0,0,0.08)]"
                >
                  {/* Hover wash */}
                  <div
                    className={`absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 ${portal.surface}`}
                  />

                  <div className="relative">
                    <div className="mb-10 flex items-start justify-between">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4f6f5] ${portal.accent} transition duration-500 group-hover:scale-105`}
                      >
                        <Icon size={20} strokeWidth={1.7} />
                      </div>

                      <span className="font-mono text-[8px] tracking-[0.15em] text-black/25">
                        {portal.eyebrow}
                      </span>
                    </div>

                    <div className="flex items-end justify-between gap-5">
                      <div>
                        <h3 className="text-xl font-medium tracking-[-0.035em]">
                          {portal.label}
                        </h3>

                        <p className="mt-2 max-w-[280px] text-xs leading-5 text-black/45">
                          {portal.description}
                        </p>
                      </div>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.07] transition duration-500 group-hover:border-[#17201d] group-hover:bg-[#17201d] group-hover:text-white">
                        <ArrowUpRight
                          size={15}
                          className="transition duration-500 group-hover:rotate-12"
                        />
                      </div>
                    </div>

                    <div className="mt-7 flex items-center justify-between border-t border-black/[0.06] pt-4">
                      <span className="font-mono text-[8px] tracking-[0.15em] text-black/25">
                        ENTER WORKSPACE
                      </span>

                      <span className={`text-[9px] font-semibold tracking-[0.12em] ${portal.accent}`}>
                        {portal.metric}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="flex flex-col gap-3 border-t border-black/[0.06] py-5 text-[9px] uppercase tracking-[0.15em] text-black/25 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={13} />
            Secure healthcare intelligence platform
          </div>

          <div className="font-mono">
            VITAWEAVE / CLINICAL INTELLIGENCE SYSTEM
          </div>
        </footer>
      </div>
    </main>
  );
}
