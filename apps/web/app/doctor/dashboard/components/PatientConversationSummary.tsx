"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, ClipboardList, Clock3, LoaderCircle, MessageSquare, Pill, RefreshCw, Search, UserRound } from "lucide-react";
import { api, type Conversation, type PatientConversationSummary, type PatientProfile } from "../../../../lib/api";

export default function PatientConversationSummaryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [summary, setSummary] = useState<PatientConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const patients = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    conversations.forEach((conversation) => {
      if (conversation.patient_id) unique.set(conversation.patient_id, { id: conversation.patient_id, name: conversation.patient_name || "Patient" });
    });
    return [...unique.values()];
  }, [conversations]);

  const loadConversations = async () => {
    try {
      const result = await api.listConversations();
      setConversations(result.conversations);
      setSelectedPatientId((current) => current || result.conversations.find((conversation) => conversation.patient_id)?.patient_id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your patient conversations."); }
    finally { setLoading(false); }
  };

  const loadSummary = async (patientId = selectedPatientId) => {
    if (!patientId) return;
    setLoadingSummary(true); setError("");
    try { setSummary((await api.getPatientConversationSummary(patientId)).summary); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not prepare the patient summary."); }
    finally { setLoadingSummary(false); }
  };

  const searchPatients = async () => {
    if (!patientQuery.trim()) { setSearchResults([]); return; }
    setSearching(true); setError("");
    try { setSearchResults((await api.searchPatients(patientQuery.trim())).patients); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not search patients."); }
    finally { setSearching(false); }
  };

  const selectSearchResult = (patient: PatientProfile) => {
    setSelectedPatientId(patient.id);
    setPatientQuery(`${patient.full_name} · ${patient.custom_id}`);
    setSearchResults([]);
    setSummary(null);
  };

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { if (selectedPatientId) loadSummary(selectedPatientId); }, [selectedPatientId]);
  useEffect(() => {
    const interval = setInterval(() => { loadConversations(); if (selectedPatientId) loadSummary(); }, 20000);
    return () => clearInterval(interval);
  }, [selectedPatientId]);

  if (loading) return <div className="grid min-h-[60vh] place-items-center text-sm text-[#71807a]"><LoaderCircle size={18} className="animate-spin"/> </div>;

  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#71807a]">Live clinical overview</p><h1 className="mt-1 text-3xl font-medium tracking-[-.045em]">Patient conversation summary</h1><p className="mt-2 text-sm text-[#71807a]">An always-current view of the patient&apos;s reported concerns across every conversation.</p></div><button onClick={() => { loadConversations(); loadSummary(); }} disabled={loadingSummary} className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-3 text-xs font-medium text-[#44554e] hover:bg-[#f4f7f5]"><RefreshCw size={14} className={loadingSummary ? "animate-spin" : ""}/>Refresh</button></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[300px_1fr]"><aside className="rounded-[20px] border border-[#e0e6e2] bg-white p-4"><p className="px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-[#89958f]">Find any patient</p><div className="mt-3 flex gap-2"><input value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchPatients()} placeholder="Name or PAT-1002" className="h-10 min-w-0 flex-1 rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-xs outline-none focus:border-[#8aaba0]"/><button onClick={searchPatients} disabled={searching} className="grid h-10 w-10 place-items-center rounded-xl bg-[#17221f] text-white disabled:opacity-60"><Search size={15}/></button></div>{searchResults.length > 0 && <div className="mt-2 space-y-1 rounded-xl border border-[#e0e6e2] p-1">{searchResults.map((patient) => <button key={patient.id} onClick={() => selectSearchResult(patient)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-[#f2f6f4]"><p className="text-xs font-medium">{patient.full_name}</p><p className="mt-0.5 font-mono text-[10px] text-[#71807a]">{patient.custom_id}</p></button>)}</div>}<p className="mt-6 px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-[#89958f]">Recent conversation patients</p><div className="mt-3 space-y-1">{patients.map((patient) => <button key={patient.id} onClick={() => setSelectedPatientId(patient.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs transition ${selectedPatientId === patient.id ? "bg-[#17221f] text-white" : "text-[#52605a] hover:bg-[#f2f6f4]"}`}><UserRound size={15}/><span className="truncate">{patient.name}</span></button>)}{!patients.length && <p className="px-2 py-4 text-xs text-[#89958f]">Search by name or patient ID above.</p>}</div></aside>
      <section>{error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{!summary && !loadingSummary && !error && <div className="rounded-[20px] border border-dashed border-[#d7e0dc] bg-white p-10 text-center text-sm text-[#71807a]">Choose a patient to build their summary.</div>}{loadingSummary && !summary ? <div className="grid min-h-[380px] place-items-center rounded-[20px] border border-[#e0e6e2] bg-white text-sm text-[#71807a]"><LoaderCircle size={18} className="animate-spin"/></div> : summary && <Summary summary={summary}/>}</section>
    </div>
  </div>;
}

function Summary({ summary }: { summary: PatientConversationSummary }) {
  return <div className="space-y-5"><section className="rounded-[22px] bg-[#17221f] p-6 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/45">Patient at a glance</p><h2 className="mt-2 text-2xl font-medium">{summary.patient.full_name}</h2><p className="mt-1 font-mono text-xs text-white/50">{summary.patient.custom_id} · {summary.patient.blood_type || "Blood type not recorded"}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Brain size={20}/></span></div><div className="mt-6 grid grid-cols-3 gap-3"><Metric label="Conversations" value={summary.conversation_count}/><Metric label="Messages reviewed" value={summary.message_count}/><Metric label="Active medicines" value={summary.active_medications.length}/></div></section>
    <section className="rounded-[22px] border border-[#e0e6e2] bg-white p-6"><div className="flex items-center gap-2"><MessageSquare size={17} className="text-[#52786d]"/><h3 className="text-lg font-medium">Latest patient update</h3></div><p className="mt-4 rounded-xl bg-[#f4f8f6] p-4 text-sm leading-6 text-[#34423c]">{summary.latest_patient_update}</p>{summary.latest_activity && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#89958f]"><Clock3 size={12}/>Updated from conversations on {new Date(summary.latest_activity).toLocaleString("en-IN")}</p>}</section>
    <div className="grid gap-5 md:grid-cols-2"><Card title="Key reported concerns" icon={<ClipboardList size={16}/>}><ul className="space-y-3">{summary.recent_concerns.length ? summary.recent_concerns.map((concern, index) => <li key={`${concern.timestamp}-${index}`} className="rounded-lg bg-[#f8faf9] p-3 text-xs leading-5 text-[#4b5953]">{concern.text}</li>) : <li className="text-xs text-[#89958f]">No patient concerns recorded.</li>}</ul></Card><Card title="Clinical context" icon={<AlertTriangle size={16}/>}><div className="space-y-4"><TagGroup label="Known allergies" values={summary.known_allergies} tone="rose"/><TagGroup label="Chronic conditions" values={summary.chronic_conditions} tone="amber"/></div></Card></div>
    <Card title="Active medicines" icon={<Pill size={16}/>}>{summary.active_medications.length ? <div className="grid gap-3 sm:grid-cols-2">{summary.active_medications.map((medication, index) => <div key={`${medication.name}-${medication.dosage}-${index}`} className="rounded-xl border border-[#e0e6e2] bg-[#fbfcfb] p-3"><p className="text-sm font-semibold">{medication.name}</p><p className="mt-1 text-xs text-[#66766f]">{medication.dosage}{medication.duration ? ` · ${medication.duration}` : ""}</p></div>)}</div> : <p className="text-sm text-[#89958f]">No active medicines recorded.</p>}</Card><p className="rounded-xl border border-[#e2e8e5] bg-[#f8faf9] px-4 py-3 text-xs leading-5 text-[#71807a]">{summary.clinical_note}</p></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-white/[.08] p-3"><p className="text-xl font-medium">{value}</p><p className="mt-1 text-[9px] uppercase tracking-[.1em] text-white/45">{label}</p></div>; }
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-[22px] border border-[#e0e6e2] bg-white p-6"><div className="mb-4 flex items-center gap-2 text-[#52786d]">{icon}<h3 className="text-base font-medium text-[#17221f]">{title}</h3></div>{children}</section>; }
function TagGroup({ label, values, tone }: { label: string; values: string[]; tone: "rose" | "amber" }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#89958f]">{label}</p><div className="mt-2 flex flex-wrap gap-2">{values.length ? values.map((value, index) => <span key={`${value}-${index}`} className={`rounded-full px-2.5 py-1 text-xs ${tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{value}</span>) : <span className="text-xs text-[#89958f]">None recorded</span>}</div></div>; }
