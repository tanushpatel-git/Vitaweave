"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, FileUp, History, LoaderCircle, Pill, Upload } from "lucide-react";
import { api, getStoredUser, type TimelineEvent } from "../../../lib/api";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export default function PatientHistoryPage() {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadHistory = async () => {
    const user = getStoredUser();
    if (!user?.patient_id) { setError("Please sign in to access your history."); setLoading(false); return; }
    try {
      const result = await api.getPatientTimeline(user.patient_id);
      setTimeline(result.timeline);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your patient history."); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadHistory(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim()) { setError("Choose a prescription file and provide its title."); return; }
    setUploading(true); setError(""); setMessage("");
    try {
      await api.uploadMyPrescription(file, title.trim(), summary.trim() || undefined);
      setFile(null); setTitle(""); setSummary(""); setMessage("Prescription uploaded to your patient history.");
      await loadHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not upload your prescription."); }
    finally { setUploading(false); }
  };

  return <main className="min-h-screen bg-[#f4f6f5] px-5 py-8 text-[#17221f] sm:px-10">
    <div className="mx-auto max-w-4xl">
      <Link href="/patient/dashboard" className="inline-flex items-center gap-2 text-sm text-[#63716b] hover:text-[#17221f]"><ArrowLeft size={16}/> Back to dashboard</Link>
      <header className="mt-7 flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e3efe9] text-[#52786d]"><History size={22}/></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#7b8581]">Personal health record</p><h1 className="mt-1 text-3xl font-medium tracking-[-.04em]">My patient history</h1><p className="mt-2 text-sm text-[#6d7773]">Review reports, consultations, and prescriptions shared with your care team.</p></div></header>
      <section className="mt-7 rounded-[22px] border border-[#dfe8e3] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,.025)]"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf4f1] text-[#52786d]"><FileUp size={17}/></span><div><h2 className="text-sm font-semibold">Upload a prescription</h2><p className="text-xs text-[#71807a]">Mistral OCR will extract prescription details for your doctor to review. You can add an optional note if anything is unclear.</p></div></div><form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2"><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} required className="text-xs"/><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Prescription title" required className="h-11 rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#aab5b0]"/><textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Optional note for your doctor" rows={2} className="rounded-xl border border-[#dfe5e2] bg-[#f9faf9] p-3 text-sm outline-none focus:border-[#aab5b0] md:col-span-2"/><div className="flex items-center gap-3 md:col-span-2"><button disabled={uploading} className="flex h-11 items-center gap-2 rounded-xl bg-[#17221f] px-4 text-sm font-medium text-white disabled:opacity-60">{uploading ? <LoaderCircle size={15} className="animate-spin"/> : <Upload size={15}/>}{uploading ? "Extracting details…" : "Upload & extract prescription"}</button>{message && <p className="text-xs text-emerald-700">{message}</p>}{error && <p className="text-xs text-red-600">{error}</p>}</div></form></section>
      <section className="mt-5 rounded-[22px] border border-[#dfe8e3] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,.025)]"><h2 className="text-lg font-medium">History timeline</h2>{loading ? <div className="mt-6 flex items-center gap-2 text-sm text-[#71807a]"><LoaderCircle size={16} className="animate-spin"/> Loading history…</div> : timeline.length ? <div className="mt-5 space-y-3">{timeline.map((item) => <article key={item.id} className="flex gap-4 rounded-xl border border-[#e7ece9] bg-[#fbfcfb] p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf4f1] text-[#52786d]">{item.report_type === "Prescription" ? <Pill size={16}/> : <FileText size={16}/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#71807a]">{new Date(item.timestamp).toLocaleString("en-IN")} · {item.report_type || item.eventType}</p></div>{item.file_url && <a href={`${apiUrl}${item.file_url}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#d8e5df] bg-white px-2.5 py-1.5 text-xs font-medium text-[#52786d] hover:bg-[#edf4f1]">View file</a>}</div>{item.summary && <p className="mt-2 text-sm leading-5 text-[#596962]">{item.summary}</p>}{item.uploaded_by_name && <p className="mt-2 text-[11px] text-[#89938f]">Uploaded by {item.uploaded_by_name}</p>}</div></article>)}</div> : <p className="mt-5 rounded-xl bg-[#f8faf9] p-4 text-sm text-[#71807a]">No history entries yet.</p>}</section>
    </div>
  </main>;
}
