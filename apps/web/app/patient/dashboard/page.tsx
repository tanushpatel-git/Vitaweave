"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PatientSidebar from "./components/PatientSidebar";
import PatientTopBar from "./components/PatientTopBar";
import PatientHero from "./components/PatientHero";
import PatientAppointments from "./components/PatientAppointments";
import PatientHealthMetrics from "./components/PatientHealthMetrics";
import PatientHealthTrend from "./components/PatientHealthTrend";
import PatientClinicalNote from "./components/PatientClinicalNote";
import PatientFooter from "./components/PatientFooter";
import TluxFloatingButton from "./components/TluxFloatingButton";
import ClinicalDashboardPage from "../modelDisplay/page";
import { api, type AppointmentDoctor, type AppointmentHospital, type AppointmentDepartment, type HospitalAppointment } from "../../../lib/api";

type View = "overview" | "clinical";

const MIN_DATETIME = new Date(Date.now() + 60000).toISOString().slice(0, 16);

export default function Page() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<View>("overview");
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [hospitals, setHospitals] = useState<AppointmentHospital[]>([]);
  const [departments, setDepartments] = useState<AppointmentDepartment[]>([]);
  const [doctors, setDoctors] = useState<AppointmentDoctor[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [appointments, setAppointments] = useState<HospitalAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<HospitalAppointment | null>(null);

  const loadAppointments = async () => {
    try { setAppointments((await api.getMyAppointments()).appointments); }
    catch (err) { setBookingError(err instanceof Error ? err.message : "Could not load appointments."); }
    finally { setAppointmentsLoading(false); }
  };
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [appointmentsResult, optionsResult] = await Promise.all([api.getMyAppointments(), api.getAppointmentOptions()]);
        if (!mounted) return;
        setAppointments(appointmentsResult.appointments);
        setHospitals(optionsResult.hospitals);
        setDepartments(optionsResult.departments);
        setDoctors(optionsResult.doctors);
        setHospitalId((current) => current || optionsResult.hospitals[0]?.id || "");
      } catch (err) {
        if (mounted) setBookingError(err instanceof Error ? err.message : "Could not load booking options.");
      } finally {
        if (mounted) setAppointmentsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const submitAppointment = async (event: FormEvent) => {
    event.preventDefault();
    if (!appointmentDate || new Date(appointmentDate).getTime() <= Date.now()) { setBookingError("Select a future appointment date and time."); return; }
    if (!editingAppointment && !hospitalId) { setBookingError("Choose a hospital."); return; }
    if (!departmentId) { setBookingError("Choose a department."); return; }
    const selectedDepartment = departments.find((d) => d.id === departmentId)?.name || "";
    setBooking(true); setBookingError("");
    try {
      if (editingAppointment) {
        await api.updateMyAppointment(editingAppointment._id, { action: "reschedule", scheduled_for: new Date(appointmentDate).toISOString(), department: selectedDepartment, department_id: departmentId, reason: reason.trim() || undefined, doctor_id: doctorId || undefined });
        setBookingSuccess("Your appointment request was rescheduled.");
      } else {
        const created = await api.createAppointment({ scheduled_for: new Date(appointmentDate).toISOString(), department: selectedDepartment, department_id: departmentId, reason: reason.trim() || undefined, hospital_id: hospitalId, doctor_id: doctorId || undefined });
        try {
          const screening = await api.getAppointmentQuestionnaire(created.appointment._id);
          if (screening.questions.length > 0) {
            setShowAppointmentForm(false);
            router.push(`/patient/screening/${created.appointment._id}`);
            return;
          }
        } catch { /* Questionnaire availability is optional */ }
        setBookingSuccess("Appointment request sent. The hospital can now review it in their dashboard.");
      }
      setReason(""); setEditingAppointment(null); await loadAppointments();
    } catch (err) { setBookingError(err instanceof Error ? err.message : "Could not book the appointment."); }
    finally { setBooking(false); }
  };
  const cancelAppointment = async (appointment: HospitalAppointment) => { if (!window.confirm("Cancel this appointment request?")) return; try { await api.updateMyAppointment(appointment._id, { action: "cancel" }); await loadAppointments(); } catch (err) { setBookingError(err instanceof Error ? err.message : "Could not cancel appointment."); } };
  const startReschedule = (appointment: HospitalAppointment) => { setEditingAppointment(appointment); setAppointmentDate(new Date(appointment.scheduled_for).toISOString().slice(0, 16)); setDepartmentId(appointment.department_id || ""); setReason(appointment.reason || ""); setDoctorId(appointment.doctor?.id || ""); setBookingError(""); setBookingSuccess(""); setShowAppointmentForm(true); };

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#17221f]">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <PatientSidebar
          activeTab={activeTab}
          onTabChange={(key) => {
            if (key === "overview") {
              setActiveTab("overview");
            } else if (key === "health") {
              setActiveTab("clinical");
            }
          }}
        />

        {/* MAIN CONTENT */}
        <section className="min-w-0 flex-1 lg:ml-[245px]">
          {/* Top bar */}
          <PatientTopBar />

          {activeTab === "overview" ? (
            <div className="mx-auto max-w-[1450px] px-5 py-6 md:px-8 md:py-8">
              {/* HERO */}
              <PatientHero onViewChange={(view) => setActiveTab(view)} onBookAppointment={() => { setEditingAppointment(null); setAppointmentDate(""); setDepartmentId(""); setReason(""); setDoctorId(""); setBookingError(""); setBookingSuccess(""); setShowAppointmentForm(true); }} />
              <PatientAppointments appointments={appointments} loading={appointmentsLoading} onCancel={cancelAppointment} onReschedule={startReschedule}/>

              {/* HEALTH METRICS */}
              <PatientHealthMetrics />

              {/* HEALTH TREND */}
              <section className="mt-5">
                <PatientHealthTrend />
              </section>

              {/* CLINICAL NOTE */}
              <PatientClinicalNote />

              {/* Footer */}
              <PatientFooter />
            </div>
          ) : (
            <div className="min-w-0">
              <ClinicalDashboardPage />
            </div>
          )}
        </section>
      </div>

      {/* TLUX FLOATING BUTTON */}
      <TluxFloatingButton />

      {showAppointmentForm && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"><form onSubmit={submitAppointment} className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#71807a]">Appointment request</p><h2 className="mt-1 text-2xl font-medium tracking-[-.04em]">{editingAppointment ? "Reschedule appointment" : "Book an appointment"}</h2><p className="mt-2 text-sm text-[#687873]">Your request will be visible to hospital staff.</p></div><button type="button" onClick={() => setShowAppointmentForm(false)} className="text-xl text-[#71807a]">×</button></div><div className="mt-6 grid gap-4">{!editingAppointment && <label className="text-xs font-medium text-[#35403c]">Hospital<select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setDepartmentId(""); }} required className="mt-2 h-11 w-full rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#8aaba0]"><option value="">Choose a hospital</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}{hospital.location ? ` · ${hospital.location}` : ""}</option>)}</select></label>}<label className="text-xs font-medium text-[#35403c]">Preferred doctor <span className="font-normal text-[#89938f]">(optional)</span><select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#8aaba0]"><option value="">No preference</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}{doctor.specialty ? ` · ${doctor.specialty}` : ""}</option>)}</select></label><label className="text-xs font-medium text-[#35403c]">Preferred date & time<input type="datetime-local" min={MIN_DATETIME} value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#8aaba0]"/></label><label className="text-xs font-medium text-[#35403c]">Department<select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#8aaba0]"><option value="">Choose a department</option>{(departments.filter((d) => !hospitalId || d.hospital_id === hospitalId).length ? departments.filter((d) => !hospitalId || d.hospital_id === hospitalId) : departments).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="text-xs font-medium text-[#35403c]">Reason for visit <span className="font-normal text-[#89938f]">(optional)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Briefly describe what you need help with" className="mt-2 w-full rounded-xl border border-[#dfe5e2] bg-[#f9faf9] p-3 text-sm outline-none focus:border-[#8aaba0]"/></label>{bookingError && <p className="text-xs text-red-600">{bookingError}</p>}{bookingSuccess && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{bookingSuccess}</p>}<button disabled={booking} className="h-12 rounded-xl bg-[#17221f] text-sm font-medium text-white disabled:opacity-60">{booking ? "Saving…" : editingAppointment ? "Confirm reschedule" : "Confirm appointment request"}</button></div></form></div>}
    </main>
  );
}
