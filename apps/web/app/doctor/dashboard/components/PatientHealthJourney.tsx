"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Brain, CalendarDays, FileText, LoaderCircle, Minus, RefreshCw, TrendingUp } from "lucide-react";
import type { PatientHealthJourney, JourneyParameter } from "../../../../lib/api";

const DISCLAIMER = "This is an AI-generated longitudinal summary and must be verified by a qualified clinician against the underlying reports.";

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  if (Math.round(value) === value) return Math.round(value).toString();
  return String(Math.round(value * 100) / 100);
}

function TrendIcon({ trend }: { trend: JourneyParameter["trend"] }) {
  if (trend === "up") return <ArrowUp size={13} className="text-rose-600" />;
  if (trend === "down") return <ArrowDown size={13} className="text-sky-600" />;
  return <Minus size={13} className="text-[#89958f]" />;
}

function trendClass(pct: number | null) {
  if (pct === null) return "rounded-full bg-[#f0f2f1] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#69736f]";
  if (pct > 0) return "rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-rose-700";
  if (pct < 0) return "rounded-full bg-sky-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-sky-700";
  return "rounded-full bg-[#f0f2f1] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#69736f]";
}

function HealthStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/[.08] p-3">
      <p className="text-xl font-medium">{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-[.1em] text-white/45">{label}</p>
    </div>
  );
}

function PatientJourneyBlock({ journey, loading, onRefresh }: { journey: PatientHealthJourney | null; loading: boolean; onRefresh: () => void }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const data = journey?.journey ?? null;
  const changed = journey?.changed ?? null;

  if (loading && !data) {
    return (
      <section className="xl:col-span-3 rounded-[18px] border border-[#e0e6e2] bg-white p-4 text-[#71807a]">
        <div className="flex items-center gap-2 text-[#52786d]"><TrendingUp size={16} /><h3 className="text-sm font-medium text-[#17221f]">Patient health journey</h3><LoaderCircle size={14} className="ml-auto animate-spin" /></div>
      </section>
    );
  }

  const important = [...(data?.parameters ?? [])]
    .sort((a, b) => Math.abs(b.overall_change_pct ?? 0) - Math.abs(a.overall_change_pct ?? 0))
    .slice(0, 8);

  const toggle = (key: string) => {
    const next = new Set(opened);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpened(next);
  };

  return (
    <section className="xl:col-span-3 rounded-[18px] border border-[#e0e6e2] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-[#52786d]">
        <TrendingUp size={16} />
        <h3 className="text-sm font-medium text-[#17221f]">Patient health journey</h3>
        {journey?.patient.age !== null && journey?.patient.age !== undefined && (
          <span className="rounded-full bg-[#f0f2f1] px-2 py-0.5 font-mono text-[9px] text-[#69736f]">{journey.patient.age} yrs</span>
        )}
        <button onClick={onRefresh} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-[#dfe5e2] bg-white px-2.5 text-[10px] font-medium text-[#69736f] hover:bg-[#f9faf9]">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Regenerate
        </button>
      </div>

      {!data ? (
        <p className="mt-3 rounded-xl bg-[#f4f8f6] p-3 text-[11px] text-[#71807a]">No longitudinal summary yet — it is generated automatically after the first report finishes AI analysis, or tap Regenerate.</p>
      ) : (
        <>
          <div className="mt-3 rounded-2xl bg-[#17221f] p-4 text-white">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HealthStat label="Reports" value={data.stats.reports} />
              <HealthStat label="Visits" value={data.stats.visits} />
              <HealthStat label="Tracked labs" value={data.stats.tracked_parameters} />
              <HealthStat label="Last report" value={data.stats.last_report_date ? new Date(data.stats.last_report_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"} />
            </div>

            {important.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-bold uppercase tracking-[.14em] text-white/45">Important trends</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {important.map((p) => (
                    <button key={p.key} onClick={() => toggle(p.key)} className={`flex items-center gap-1.5 rounded-full bg-white/[.08] px-2.5 py-1 text-[10px] ${p.flagged ? "ring-1 ring-amber-300/60" : ""}`}>
                      <TrendIcon trend={p.trend} />
                      <span className="font-medium text-white/90">{p.name}</span>
                      <span className="font-mono">{p.overall_change_label ?? "—"}</span>
                      {p.flagged && <AlertTriangle size={10} className="text-amber-300" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {important.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#e8edeb] bg-[#fbfcfb] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#648678]">Reading history (report date → value)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {important.map((p) => (
                  <div key={p.key} className="rounded-lg bg-white p-2.5 ring-1 ring-[#e8edeb]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[#35403c]"><TrendIcon trend={p.trend} />{p.name}{p.unit ? <span className="font-mono text-[8px] text-[#89958f]">{p.unit}</span> : null}</p>
                      <span className={trendClass(p.overall_change_pct)}>overall {p.overall_change_label ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.readings.map((r, index) => (
                        <span key={`${r.report_id}-${r.date}-${index}`} className="rounded-md bg-[#f4f8f6] px-1.5 py-0.5 font-mono text-[9px] text-[#52786d]">
                          {fmt(r.value)} <span className="text-[#93a19b]">· {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        </span>
                      ))}
                      <span className="ml-auto text-[8px] text-[#a3aca9]">first → last</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.summary && (
            <div className="mt-3 rounded-lg bg-[#f7faf8] p-3">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#4c756c]"><Brain size={11} /> Longitudinal summary</p>
              <p className="mt-1.5 text-[11px] leading-5 text-[#35403c]">{data.summary}</p>
              <p className="mt-2 text-[9px] leading-4 text-[#89958f]">{DISCLAIMER}</p>
              {data.summary_error && <p className="mt-1 text-[9px] text-amber-700">AI narrative unavailable ({data.summary_error.slice(0, 120)}) — showing calculated trend summary.</p>}
              {data.generated_at && <p className="mt-1 text-right text-[9px] text-[#a3aca9]">Generated {new Date(data.generated_at).toLocaleString("en-IN")}</p>}
            </div>
          )}

          {changed && (changed.parameters.length > 0 || changed.reports_added.length > 0) && (
            <div className="mt-3 rounded-xl border border-[#e8edeb] p-3">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#35403c]"><CalendarDays size={11} /> What&apos;s changed {changed.since_date ? `since ${new Date(changed.since_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}</p>
              {changed.parameters.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {changed.parameters.map((c) => (
                    <span key={`${c.key}-${c.label}`} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${c.direction === "new" ? "bg-[#e4f1eb] text-[#4c756c]" : c.direction === "up" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
                      {c.direction === "up" ? <ArrowUp size={10} /> : c.direction === "down" ? <ArrowDown size={10} /> : <FileText size={10} />} {c.label}
                    </span>
                  ))}
                </div>
              )}
              {changed.reports_added.length > 0 && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-[#71807a]">
                  <span className="font-semibold text-[#35403c]">New document{changed.reports_added.length > 1 ? "s" : ""}:</span>
                  {changed.reports_added.map((r) => (
                    <span key={r.report_id} className="rounded-md bg-[#f0f2f1] px-1.5 py-0.5">{r.title} · {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                  ))}
                </p>
              )}
            </div>
          )}

          {data.timeline.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#648678]">Medical timeline</p>
              <div className="mt-2 flex min-w-max items-center gap-0">
                {data.timeline.map((t, index) => (
                  <div key={t.report_id} className="flex items-center">
                    <div className="flex w-28 flex-col items-center text-center">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#52786d] ring-4 ring-[#e4f1eb]" />
                      <p className="mt-1.5 text-[9px] font-semibold leading-3 text-[#35403c]">{t.title}</p>
                      <p className="font-mono text-[8px] text-[#89958f]">{new Date(t.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
                    </div>
                    {index < data.timeline.length - 1 && <div className="h-px w-8 bg-[#c8d6cf]" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default PatientJourneyBlock;