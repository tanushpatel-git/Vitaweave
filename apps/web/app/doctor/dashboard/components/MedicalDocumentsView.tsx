"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileSearch,
  FileText,
  FlaskConical,
  History,
  Pill,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import {
  api,
  apiFileUrl,
  type MedicalDocumentOverview,
  type MedicalReport,
} from "../../../../lib/api";

const TYPE_ICONS: Record<string, typeof FileText> = {
  Blood: FlaskConical,
  Urine: FlaskConical,
  ECG: Activity,
  "X-Ray": ScanLine,
  MRI: ScanLine,
  CT: ScanLine,
  Prescription: Pill,
  Discharge: History,
  Pathology: FlaskConical,
};

function reportIcon(type: string) {
  return TYPE_ICONS[type] || FileText;
}

function statusPill(report: MedicalReport) {
  if (report.ai_status === "processing")
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-700">
        <Clock size={10} /> AI analysing
      </span>
    );
  if (report.ai_status === "completed")
    return (
      <span className="flex items-center gap-1 rounded-full bg-[#e4f1eb] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-[#4c756c]">
        <Brain size={10} /> AI summary ready
      </span>
    );
  if (report.ai_status === "failed")
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-red-500">
        <AlertTriangle size={10} /> AI unavailable
      </span>
    );
  return (
    <span className="rounded-full bg-[#f0f2f1] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-[#7b837f]">
      Queued
    </span>
  );
}

export default function MedicalDocumentsView() {
  const [patientId, setPatientId] = useState("");
  const [overview, setOverview] = useState<MedicalDocumentOverview | null>(null);
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function lookUp() {
    if (!patientId.trim()) return;
    setLoading(true);
    setError("");
    setOverview(null);
    setReports([]);
    try {
      const data = await api.getDoctorPatientOverview(patientId.trim());
      setOverview(data);
      setReports(data.reports || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the patient records.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshReport(id: string) {
    try {
      const { report } = await api.getMedicalReport(id);
      setReports((prev) => prev.map((r) => (r.id === id ? report : r)));
    } catch {
      /* ignore */
    }
  }

  async function reprocess(id: string) {
    try {
      const { report } = await api.reprocessMedicalReport(id);
      setReports((prev) => prev.map((r) => (r.id === id ? report : r)));
    } catch {
      /* ignore */
    }
  }

  async function refreshAll() {
    if (!patientId.trim()) return;
    setRefreshing(true);
    try {
      const data = await api.getDoctorPatientOverview(patientId.trim());
      setReports(data.reports || []);
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[#69736f]">
          <FileSearch size={18} />
          <h2 className="text-2xl font-medium tracking-[-0.045em] text-[#17201d] sm:text-3xl">
            Patient medical documents
          </h2>
        </div>
        <p className="mt-2 text-sm text-[#7b8581]">
          Enter a patient ID to open their unified pre-consultation view: reports, AI
          summaries and recent appointments.
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#929b97]">
          <ShieldCheck size={13} />
          AI summaries assist the clinician and must be verified against the original report.
        </p>
      </div>

      {/* Patient lookup */}
      <div className="flex w-full gap-2 sm:w-[480px]">
        <input
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookUp()}
          placeholder="Patient ID (e.g. PAT-1002)"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-[#dfe5e2] bg-white px-4 text-sm text-[#35403c] outline-none transition placeholder:text-[#a4aca8] focus:border-[#17201d] focus:ring-4 focus:ring-[#17201d]/[0.06]"
        />
        <button
          onClick={lookUp}
          disabled={loading}
          className="flex h-12 items-center gap-2 rounded-2xl bg-[#17201d] px-5 text-sm font-medium text-white transition hover:bg-[#26332e] disabled:opacity-60"
        >
          <Search size={15} />
          {loading ? "Loading…" : "Open patient"}
        </button>
      </div>

      {error && (
        <p className="mt-4 w-full rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 sm:w-[480px]">
          {error}
        </p>
      )}

      {/* Patient header */}
      {overview && (
        <div className="mt-6 max-w-[1100px]">
          <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e4eeeb] text-[#4c756c]">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-[#17201d]">
                    {overview.patient.full_name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[#69736f]">
                    {overview.patient.custom_id}
                  </p>
                </div>
              </div>
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="flex h-9 items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-3 text-xs text-[#69736f] transition hover:bg-[#f9faf9]"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                Refresh AI status
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {[
                ["DOB", overview.patient.dob || "—"],
                ["Sex", overview.patient.sex || "—"],
                ["Blood type", overview.patient.blood_type || "—"],
                ["Contact", overview.patient.contact_phone || "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[#f9faf9] p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#929b97]">
                    {label}
                  </p>
                  <p className="mt-1 font-medium text-[#35403c]">{value}</p>
                </div>
              ))}
            </div>

            {overview.patient.known_allergies && overview.patient.known_allergies.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-red-50/70 px-4 py-2.5">
                <AlertTriangle size={13} className="text-red-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                  Allergies:
                </span>
                {overview.patient.known_allergies.map((a) => (
                  <span key={a} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-red-600">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Medical documents */}
          <div className="mt-5">
            <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
              Medical documents ({reports.length})
            </p>

            {reports.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#c5cfca] bg-white p-10 text-center">
                <FileText className="mx-auto text-[#b0b8b4]" size={28} />
                <p className="mt-3 text-sm font-medium text-[#69736f]">
                  No medical documents yet for this patient.
                </p>
                <p className="mt-1 text-xs text-[#929b97]">
                  Reports uploaded by hospital staff will appear here with AI summaries.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => {
                  const Icon = reportIcon(report.ai_classified_type || report.type);
                  const isOpen = expanded === report.id;
                  return (
                    <div
                      key={report.id}
                      className="rounded-[22px] border border-[#e0e6e2] bg-white p-5 shadow-[0_8px_30px_rgba(20,30,25,0.025)]"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4f2] text-[#4c756c]">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[#17201d]">
                              {report.title}
                            </p>
                            <span className="rounded-full bg-[#f0f2f1] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-[#69736f]">
                              {report.type}
                            </span>
                            {report.ai_classified_type &&
                              report.ai_classified_type !== report.type && (
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                                  AI classified: {report.ai_classified_type}
                                </span>
                              )}
                            {statusPill(report)}
                          </div>
                          <p className="mt-1 text-[10px] text-[#929b97]">
                            {new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(report.date || report.created_at))}
                            {report.uploaded_by?.full_name && ` · by ${report.uploaded_by.full_name}`}
                          </p>
                        </div>
                        <button
                          onClick={() => setExpanded(isOpen ? null : report.id)}
                          className="rounded-xl border border-[#dfe5e2] bg-white px-3 py-2 text-[10px] font-medium text-[#69736f] transition hover:bg-[#f9faf9]"
                        >
                          {isOpen ? "Collapse" : "View detail"}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="mt-4 border-t border-[#edf0ee] pt-4">
                          {report.ai_status === "processing" && (
                            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                              <Clock size={13} /> AI is analysing this document.
                              <button
                                onClick={() => refreshReport(report.id)}
                                className="underline"
                              >
                                Check status
                              </button>
                            </p>
                          )}

                          {report.ai_status === "completed" && report.ai_findings.length > 0 && (
                            <div className="overflow-x-auto rounded-xl border border-[#edf0ee]">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-[#f9faf9] text-[9px] font-semibold uppercase tracking-[0.14em] text-[#929b97]">
                                  <tr>
                                    <th className="px-3 py-2">Parameter</th>
                                    <th className="px-3 py-2">Value</th>
                                    <th className="px-3 py-2">Reference range</th>
                                    <th className="px-3 py-2">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {report.ai_findings.map((finding, idx) => (
                                    <tr key={`${finding.name}-${idx}`} className="border-t border-[#f0f2f1]">
                                      <td className="px-3 py-2 font-medium text-[#35403c]">
                                        {finding.name}
                                      </td>
                                      <td className="px-3 py-2 text-[#35403c]">
                                        {finding.value ?? "—"}
                                        {finding.unit ? <span className="text-[#929b97]"> {finding.unit}</span> : null}
                                      </td>
                                      <td className="px-3 py-2 text-[#929b97]">
                                        {finding.reference_range || "Range not provided"}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                                            finding.status === "high" || finding.status === "low"
                                              ? "bg-red-50 text-red-600"
                                              : finding.status === "borderline"
                                                ? "bg-amber-50 text-amber-700"
                                                : "bg-[#e4f1eb] text-[#4c756c]"
                                          }`}
                                        >
                                          {finding.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {report.flagged_findings.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {report.flagged_findings.map((f) => (
                                <span
                                  key={f}
                                  className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-600"
                                >
                                  <AlertTriangle size={11} /> {f}
                                </span>
                              ))}
                            </div>
                          )}

                          {report.ai_summary && (
                            <div className="mt-3 rounded-xl bg-[#f9faf9] p-4">
                              <div className="flex items-center gap-2">
                                <Brain size={14} className="text-[#4c756c]" />
                                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#4c756c]">
                                  AI summary
                                </p>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-[#42504a]">
                                {report.ai_summary}
                              </p>
                              {report.extracted_points.length > 0 && (
                                <ul className="mt-3 space-y-1.5">
                                  {report.extracted_points.map((point) => (
                                    <li key={point} className="flex gap-2 text-xs text-[#69736f]">
                                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#9ab4ab]" />
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}

                          <p className="mt-3 text-[9px] leading-4 text-[#929b97]">
                            {report.disclaimer ||
                              "This is an AI-generated summary and must be verified by a qualified clinician against the original document."}
                          </p>

                          <div className="mt-4 flex items-center gap-2">
                            {report.file_url && (
                              <a
                                href={apiFileUrl(report.file_url) ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-3 py-2 text-[10px] font-medium text-[#69736f] transition hover:bg-[#f9faf9]"
                              >
                                <FileText size={13} /> View original
                              </a>
                            )}
                            {report.ai_status === "failed" && (
                              <button
                                onClick={() => reprocess(report.id)}
                                className="flex items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-3 py-2 text-[10px] font-medium text-[#69736f] transition hover:bg-[#f9faf9]"
                              >
                                <RefreshCw size={13} /> Reprocess with AI
                              </button>
                            )}
                            <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[#929b97]">
                              <CalendarDays size={11} />
                              {report.ai_extracted_at
                                ? `Analysed ${new Date(report.ai_extracted_at).toLocaleString("en-IN")}`
                                : "AI analysis pending"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent appointments */}
          <div className="mt-6">
            <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
              Recent appointments at this hospital
            </p>
            {overview.appointments.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-xs text-[#929b97]">
                No appointments recorded.
              </p>
            ) : (
              <div className="space-y-2">
                {overview.appointments.map((appointment) => (
                  <div
                    key={appointment._id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#17201d]">
                        {appointment.department}
                      </p>
                      <p className="mt-0.5 text-xs text-[#929b97]">
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(appointment.scheduled_for))}
                        {appointment.doctor?.full_name && ` · ${appointment.doctor.full_name}`}
                        {appointment.reason && ` · ${appointment.reason}`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                        appointment.status === "completed"
                          ? "bg-[#e4f1eb] text-[#4c756c]"
                          : appointment.status === "confirmed"
                            ? "bg-sky-50 text-sky-700"
                            : appointment.status === "cancelled"
                              ? "bg-red-50 text-red-500"
                              : "bg-[#f3efe6] text-[#8c7752]"
                      }`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!overview && !loading && !error && (
        <div className="mt-10 max-w-[1100px] rounded-[22px] border border-dashed border-[#c5cfca] bg-white p-10 text-center">
          <FileText className="mx-auto text-[#b0b8b4]" size={28} />
          <p className="mt-3 text-sm font-medium text-[#69736f]">
            Search a patient to begin.
          </p>
          <p className="mt-1 text-xs text-[#929b97]">
            You will see their reports, AI-extracted summaries and flagged values before the consultation.
          </p>
        </div>
      )}
    </div>
  );
}