"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth";
import { api, type PlatformHospital, type Role } from "../../../lib/api";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";

const ROLE_LABELS: Record<Role, string> = {
  TOP_ADMIN: "Platform Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  HOD: "Head of Department",
  DOCTOR: "Doctor",
  STAFF: "Staff",
  PATIENT: "Patient",
};

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [hospitals, setHospitals] = useState<PlatformHospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    code: "",
    hospitalType: "",
    registrationNumber: "",
    phone: "",
    administratorName: "",
    adminEmail: "",
    adminPassword: "",
    city: "",
    address: "",
    state: "",
    pincode: "",
    totalBeds: "50",
    icuBeds: "5",
    activeDoctors: "5",
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const [users, setUsers] = useState<Array<{ id: string; email: string; role: Role; full_name: string; is_active: boolean; hospital_id: string | null; department_id: string | null }>>([]);

  const loadHospitals = async () => {
    try {
      const res = await api.adminListHospitals();
      setHospitals(res.hospitals.map((h) => ({ id: String(h._id || h.id), ...h })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hospitals.");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setUsers((await api.adminListUsers()).users);
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadHospitals);
    Promise.resolve().then(loadUsers);
  }, []);

  const set = (key: keyof typeof form, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const createHospital = async () => {
    setCreating(true);
    setMessage("");
    try {
      await api.adminCreateHospital({
        name: form.name,
        code: form.code || undefined,
        hospitalType: form.hospitalType || undefined,
        registrationNumber: form.registrationNumber || undefined,
        phone: form.phone || undefined,
        administratorName: form.administratorName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
        totalBeds: Number(form.totalBeds) || undefined,
        icuBeds: Number(form.icuBeds) || undefined,
        activeDoctors: Number(form.activeDoctors) || undefined,
      });
      setMessage("Hospital and its administrator account created.");
      setForm({ ...form, name: "", code: "", registrationNumber: "", administratorName: "", adminEmail: "", adminPassword: "" });
      await loadHospitals();
      await loadUsers();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create the hospital.");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await api.adminSetUserActive(id, !active);
    await loadUsers();
  };

  const input = "h-11 w-full rounded-xl border border-black/[.1] bg-[#fbfcfb] px-3 text-sm outline-none focus:border-[#54749a] focus:ring-2 focus:ring-[#54749a]/10";
  const label = "mb-1.5 block text-[9px] font-semibold uppercase tracking-[.1em] text-black/45";

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#17201d]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/[.06] bg-[#f9fbfa]/90 px-5 py-4 backdrop-blur-xl sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17201d] text-white"><Activity size={17} /></span>
          <div>
            <p className="text-sm font-semibold tracking-[-.02em]">VITAWEAVE</p>
            <p className="text-[8px] font-medium uppercase tracking-[.2em] text-black/40">Platform administration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-black/50 sm:flex"><ShieldCheck size={12} />{user?.full_name || "Admin"}</span>
          {user?.role === "TOP_ADMIN" && <button onClick={logout} className="rounded-lg border border-black/[.1] px-3 py-1.5 text-xs">Sign out</button>}
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10">
        <section className="relative overflow-hidden rounded-[28px] border border-black/[.06] bg-[#e9eff2] p-6 sm:p-9">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="relative">
            <p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#54749a]"><span className="h-1.5 w-1.5 rounded-full bg-[#54749a]" />Level 1 · Top admin</p>
            <h1 className="max-w-3xl text-[clamp(2.4rem,5vw,4.6rem)] font-medium leading-[.88] tracking-[-.06em]">Hospitals, admins,<br /><span className="text-black/35">platform-wide control.</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-black/55">Create hospital workspaces and their Hospital Admin accounts. Hospital admins then build departments, doctors and staff within their own hospital.</p>
          </div>
        </section>

        <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,.025)]">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f0eb] text-[#52786d]"><Plus size={16} /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Onboard hospital</p><h2 className="text-lg font-medium tracking-[-.04em]">Create hospital + hospital admin</h2></div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className={label}>Hospital name *</span><input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="City General Hospital" /></label>
                <label className="block"><span className={label}>Code</span><input className={input} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="VITA-CGH-005" /></label>
                <label className="block"><span className={label}>Hospital type</span><input className={input} value={form.hospitalType} onChange={(e) => set("hospitalType", e.target.value)} placeholder="Tertiary" /></label>
                <label className="block"><span className={label}>Registration number</span><input className={input} value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} /></label>
                <label className="block"><span className={label}>Phone</span><input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
                <label className="block"><span className={label}>City</span><input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
                <label className="block"><span className={label}>State / address / pincode</span><input className={input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Address" /></label>
                <label className="block sm:col-span-1"><span className={label}>&nbsp;</span><input className={input} value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State" /></label>
                <label className="block sm:col-span-1"><span className={label}>&nbsp;</span><input className={input} value={form.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="Pincode" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {([["Total beds", "totalBeds"], ["ICU beds", "icuBeds"], ["Active doctors", "activeDoctors"]] as const).map(([lab, key]) => (
                  <label key={key} className="block"><span className={label}>{lab}</span><input type="number" min="0" className={input} value={form[key]} onChange={(e) => set(key, e.target.value)} /></label>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-[#f4f8f6] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/45">Hospital admin account</p>
              <div className="mt-4 space-y-4">
                <label className="block"><span className={label}>Administrator name *</span><input className={input} value={form.administratorName} onChange={(e) => set("administratorName", e.target.value)} placeholder="Dr. City General Administrator" /></label>
                <label className="block"><span className={label}>Admin email *</span><input type="email" className={input} value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} placeholder="admin@citygeneral.org" /></label>
                <label className="block"><span className={label}>Temporary password *</span><input type="password" className={input} value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} placeholder="Min 8 characters" /></label>
                <button onClick={createHospital} disabled={creating || !form.name || !form.administratorName || !form.adminEmail || form.adminPassword.length < 8} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17201d] text-xs font-medium text-white disabled:opacity-50">
                  {creating ? "Creating…" : <><Plus size={14} /> Create hospital</>}
                </button>
                {message && <p className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-[#52786d]"><CheckCircle2 size={13} />{message}</p>}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-[23px] border border-black/[.06] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,.025)]">
            <div className="flex items-center gap-2"><Building2 size={16} className="text-[#54749a]" /><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Platform</p></div>
            <h2 className="mt-1 text-xl font-medium tracking-[-.04em]">Hospitals</h2>
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
            <div className="mt-4 space-y-2">
              {!loading && !hospitals.length && <p className="rounded-xl bg-[#f8faf9] p-4 text-sm text-black/45">No hospitals yet.</p>}
              {hospitals.map((h) => (
                <div key={String(h.id || h._id)} className="rounded-xl bg-[#f8faf9] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-sm font-semibold">{h.name}</p><p className="mt-0.5 font-mono text-[10px] text-black/45">{h.code}</p></div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase text-[#52786d]">{h.active_doctors || 0} doctors</span>
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase text-[#52786d]">{h.general_total_beds || 0} beds</span>
                    </div>
                  </div>
                  {h.administrator_name && <p className="mt-2 text-[11px] text-black/50">Admin: {h.administrator_name} · {h.official_email}</p>}
                  <p className="mt-0.5 text-[11px] text-black/40">{h.location?.city ? `${String(h.location.city)} · ` : ""}{h.phone}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[23px] border border-black/[.06] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,.025)]">
            <div className="flex items-center gap-2"><Users size={16} className="text-[#54749a]" /><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Directory</p></div>
            <h2 className="mt-1 text-xl font-medium tracking-[-.04em]">Users</h2>
            <div className="mt-4 space-y-2">
              {users.slice(0, 30).map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8faf9] px-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-[13px] font-medium">{u.full_name}</p><p className="truncate text-[11px] text-black/45">{u.email}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold uppercase text-[#52786d]">{ROLE_LABELS[u.role] || u.role}</span>
                    <button onClick={() => toggleActive(u.id, u.is_active)} className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{u.is_active ? "Active" : "Inactive"}</button>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/" className="mt-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.14em] text-[#54749a] hover:text-[#17201d]">Back to home <ArrowRight size={12} /></Link>
          </section>
        </div>

        <footer className="mt-8 flex flex-col gap-3 border-t border-black/[.06] py-5 text-[9px] uppercase tracking-[.14em] text-black/30 sm:flex-row sm:justify-between">
          <span className="flex items-center gap-2"><ShieldCheck size={13} />Role-based platform administration</span>
          <span className="flex items-center gap-2">TOP_ADMIN → HOSPITAL_ADMIN → HOD → DOCTOR / STAFF</span>
        </footer>
      </div>
    </main>
  );
}