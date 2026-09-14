"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth";
import { api, type Department, type ManagedDoctor, type StaffMember } from "../../../lib/api";
import {
  Activity,
  ArrowLeft,
  KeyRound,
  LogOut,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

type Tab = "departments" | "doctors" | "staff";

export default function HospitalManagePage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("departments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<ManagedDoctor[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [deptForm, setDeptForm] = useState({ name: "", code: "", description: "" });
  const [doctorForm, setDoctorForm] = useState({ email: "", password: "", fullName: "", specialty: "", licenseNo: "", department_id: "" });
  const [staffForm, setStaffForm] = useState({ email: "", password: "", fullName: "" });

  const [hodPick, setHodPick] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [d, dr, s] = await Promise.all([api.listMyDepartments(), api.listMyDoctors(), api.listMyStaff()]);
      setDepartments(d.departments);
      setDoctors(dr.doctors);
      setStaff(s.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hospital data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(load);
  }, []);

  const input = "h-11 w-full rounded-xl border border-black/[.1] bg-[#fbfcfb] px-3 text-sm outline-none focus:border-[#54749a] focus:ring-2 focus:ring-[#54749a]/10";
  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(""), 4000); };

  const createDepartment = async () => {
    if (!deptForm.name.trim()) return;
    try {
      await api.createDepartment(deptForm);
      setDeptForm({ name: "", code: "", description: "" });
      flash("Department created.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create department."); }
  };

  const assignHod = async (deptId: string) => {
    const doctorId = hodPick[deptId];
    if (!doctorId) return;
    try {
      await api.updateDepartment(deptId, { hod_id: doctorId });
      flash("Head of Department assigned.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not assign HOD."); }
  };

  const deleteDepartment = async (deptId: string) => {
    try {
      await api.deleteDepartment(deptId);
      flash("Department deleted.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete department."); }
  };

  const createDoctor = async () => {
    try {
      await api.createDoctor({ ...doctorForm, department_id: doctorForm.department_id || undefined });
      setDoctorForm({ email: "", password: "", fullName: "", specialty: "", licenseNo: "", department_id: "" });
      flash("Doctor account created.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create doctor."); }
  };

  const moveDoctor = async (doctorId: string, departmentId: string) => {
    try {
      await api.updateDoctor(doctorId, { department_id: departmentId || null });
      flash("Doctor department updated.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not move doctor."); }
  };

  const createStaff = async () => {
    try {
      await api.createStaff(staffForm);
      setStaffForm({ email: "", password: "", fullName: "" });
      flash("Staff account created.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create staff account."); }
  };

  const deptOptions = (doctor: ManagedDoctor) => (
    <select
      onChange={(e) => moveDoctor(doctor.id, e.target.value)}
      defaultValue={doctor.department_id || ""}
      className="h-9 rounded-lg border border-black/[.1] bg-white px-2 text-xs outline-none"
    >
      <option value="">Unassigned</option>
      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );

  const tabButton = (key: Tab, icon: ReactNode, text: string) => (
    <button
      onClick={() => { setTab(key); setError(""); }}
      className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${tab === key ? "bg-[#17201d] text-white" : "border border-black/[.08] text-black/55 hover:bg-white"}`}
    >
      {icon}{text}
    </button>
  );

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#17201d]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/[.06] bg-[#f9fbfa]/90 px-5 py-4 backdrop-blur-xl sm:px-10">
        <div className="flex items-center gap-4">
          <Link href="/hospital/dashboard" className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[.08] bg-white text-black/50 hover:text-black"><ArrowLeft size={16} /></Link>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17201d] text-white"><Activity size={17} /></span>
            <div><p className="text-sm font-semibold tracking-[-.02em]">VITAWEAVE</p><p className="text-[8px] font-medium uppercase tracking-[.2em] text-black/40">Hospital administration</p></div>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-black/50"><ShieldCheck size={12} />{user?.role === "HOSPITAL_ADMIN" ? "Hospital Admin" : user?.role}</span>
        <button onClick={logout} className="flex h-9 items-center gap-2 rounded-xl border border-black/[.1] px-3 text-[10px] font-medium text-black/60 hover:bg-black/[.04]"><LogOut size={13}/>Sign out</button>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-10">
        <section className="rounded-[28px] border border-black/[.06] bg-[#e9eff2] p-6 sm:p-9">
          <p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#54749a]"><span className="h-1.5 w-1.5 rounded-full bg-[#54749a]" />Level 2 · Hospital admin</p>
          <h1 className="max-w-3xl text-[clamp(2rem,4.5vw,4rem)] font-medium leading-[.9] tracking-[-.06em]">Organise your hospital.<br /><span className="text-black/35">Departments, doctors, staff.</span></h1>
          <div className="mt-6 flex flex-wrap gap-2">{tabButton("departments", <Users size={14} />, "Departments")}{tabButton("doctors", <UserCog size={14} />, "Doctors")}{tabButton("staff", <UserPlus size={14} />, "Staff")}</div>
        </section>

        {message && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p>}

        {tab === "departments" && (
          <>
            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f0eb] text-[#52786d]"><Plus size={16} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">New department</p><h2 className="text-lg font-medium tracking-[-.04em]">Add a department</h2></div></div>
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_.5fr_1.2fr_auto]">
                <input className={input} placeholder="Name (e.g. General Medicine)" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
                <input className={input} placeholder="Code (e.g. GM)" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} />
                <input className={input} placeholder="Description (optional)" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} />
                <button onClick={createDepartment} disabled={!deptForm.name.trim()} className="flex h-11 items-center gap-2 rounded-xl bg-[#17201d] px-4 text-xs font-medium text-white disabled:opacity-50"><Plus size={14} /> Add</button>
              </div>
            </section>

            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Departments</p>
              <div className="mt-4 space-y-3">
                {!loading && !departments.length && <p className="rounded-xl bg-[#f8faf9] p-4 text-sm text-black/45">No departments yet.</p>}
                {departments.map((d) => {
                  const deptDoctors = doctors.filter((dr) => dr.department_id === d.id);
                  return (
                    <div key={d.id} className="rounded-xl border border-black/[.06] bg-[#f8faf9] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{d.name} {d.code && <span className="font-mono text-[10px] text-black/45">{d.code}</span>}</p>
                          <p className="mt-1 text-[11px] text-black/50">{d.description || "—"}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-[#52786d]">{d.doctor_count} doctors</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-[#52786d]">HOD: {d.hod_name || "Not assigned"}</span>
                          </div>
                        </div>
                        <button onClick={() => deleteDepartment(d.id)} className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50"><Trash2 size={12} /> Delete</button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[.05] pt-3">
                        <span className="text-[9px] font-semibold uppercase tracking-[.1em] text-black/40">Assign HOD:</span>
                        <select value={hodPick[d.id] || ""} onChange={(e) => setHodPick({ ...hodPick, [d.id]: e.target.value })} className="h-9 rounded-lg border border-black/[.1] bg-white px-2 text-xs outline-none">
                          <option value="">Select a doctor</option>
                          {deptDoctors.map((dr) => <option key={dr.id} value={dr.user_id}>{dr.full_name}{dr.is_hod ? " (HOD)" : ""}</option>)}
                        </select>
                        <button onClick={() => assignHod(d.id)} disabled={!hodPick[d.id]} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#17201d] px-3 text-[10px] font-medium text-white disabled:opacity-40"><Save size={12} /> Set HOD</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {tab === "doctors" && (
          <>
            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f0eb] text-[#52786d]"><UserPlus size={16} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">New doctor</p><h2 className="text-lg font-medium tracking-[-.04em]">Create a doctor account</h2></div></div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <input className={input} placeholder="Doctor name" value={doctorForm.fullName} onChange={(e) => setDoctorForm({ ...doctorForm, fullName: e.target.value })} />
                <input type="email" className={input} placeholder="Email" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                <input type="password" className={input} placeholder="Temporary password (min 8)" value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} />
                <input className={input} placeholder="Specialty" value={doctorForm.specialty} onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })} />
                <input className={input} placeholder="License no." value={doctorForm.licenseNo} onChange={(e) => setDoctorForm({ ...doctorForm, licenseNo: e.target.value })} />
                <select className={input} value={doctorForm.department_id} onChange={(e) => setDoctorForm({ ...doctorForm, department_id: e.target.value })}>
                  <option value="">No department yet</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button onClick={createDoctor} disabled={!doctorForm.fullName || !doctorForm.email || doctorForm.password.length < 8} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#17201d] px-4 text-xs font-medium text-white disabled:opacity-50"><KeyRound size={14} /> Create doctor</button>
            </section>

            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Doctors</p>
              <div className="mt-4 space-y-2">
                {!loading && !doctors.length && <p className="rounded-xl bg-[#f8faf9] p-4 text-sm text-black/45">No doctors yet.</p>}
                {doctors.map((dr) => (
                  <div key={dr.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8faf9] p-3">
                    <div className="min-w-[200px]">
                      <p className="text-sm font-semibold">{dr.full_name} {dr.is_hod && <span className="rounded-full bg-[#e5f0eb] px-2 py-0.5 text-[9px] font-bold uppercase text-[#52786d]">HOD</span>}</p>
                      <p className="mt-0.5 text-[11px] text-black/45">{dr.email} · {dr.specialty || "No specialty"}</p>
                    </div>
                    <div className="flex items-center gap-2">{deptOptions(dr)}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "staff" && (
          <>
            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f0eb] text-[#52786d]"><UserPlus size={16} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">New staff</p><h2 className="text-lg font-medium tracking-[-.04em]">Create a staff account</h2></div></div>
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <input className={input} placeholder="Staff name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} />
                <input type="email" className={input} placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                <input type="password" className={input} placeholder="Temporary password (min 8)" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
                <button onClick={createStaff} disabled={!staffForm.fullName || !staffForm.email || staffForm.password.length < 8} className="flex h-11 items-center gap-2 rounded-xl bg-[#17201d] px-4 text-xs font-medium text-white disabled:opacity-50"><Plus size={14} /> Add staff</button>
              </div>
            </section>

            <section className="mt-5 rounded-[23px] border border-black/[.06] bg-white p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">Staff</p>
              <div className="mt-4 space-y-2">
                {!loading && !staff.length && <p className="rounded-xl bg-[#f8faf9] p-4 text-sm text-black/45">No staff accounts yet.</p>}
                {staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-[#f8faf9] px-3 py-2.5">
                    <div><p className="text-sm font-medium">{s.full_name}</p><p className="text-[11px] text-black/45">{s.email}</p></div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-[#52786d]">{s.is_active ? "Active" : "Inactive"}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}