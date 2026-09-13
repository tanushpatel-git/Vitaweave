const { Appointment, Patient, Hospital, Doctor, Report, AuditLog } = require("../models/schemas");
const { AppError } = require("../utils/async");
const { config } = require("../config");

function patientDetails(patient) {
  return {
    id: String(patient._id), custom_id: patient.custom_id || `PAT-${String(patient._id).slice(-4).toUpperCase()}`,
    full_name: patient.user_id?.full_name || "Unknown Patient", email: patient.user_id?.email || "",
    dob: patient.dob, sex: patient.sex, blood_type: patient.blood_type, contact_phone: patient.contact_phone,
    emergency_contact: patient.emergency_contact || null, known_allergies: patient.known_allergies || [], chronic_conditions: patient.chronic_conditions || [],
  };
}

function extractPrescriptionPoints(title, summary) {
  const text = `${title || ""}\n${summary || ""}`.replace(/\s+/g, " ").trim();
  if (!summary?.trim()) return ["Prescription uploaded — review the attached document for medicine and dose details."];
  const points = text.split(/(?:\.|;|\n|•|\||\s+-\s+)/).map((item) => item.trim()).filter((item) => item.length > 3).slice(0, 3);
  return points.length ? points : ["Prescription details were provided by the patient."];
}

async function createAppointment(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const { scheduled_for, department, reason, hospital_id, doctor_id } = req.body;
  if (!scheduled_for || Number.isNaN(new Date(scheduled_for).getTime())) throw new AppError("A valid appointment date and time is required", 400);
  if (new Date(scheduled_for).getTime() <= Date.now()) throw new AppError("Appointments must be scheduled for a future date and time", 400);
  const hospital = hospital_id ? await Hospital.findById(hospital_id) : await Hospital.findOne({ code: "VITA-CGH-001" });
  if (!hospital) throw new AppError("Hospital not found", 404);
  const doctor = doctor_id ? await Doctor.findById(doctor_id) : null;
  if (doctor_id && !doctor) throw new AppError("Selected doctor was not found", 404);
  const appointment = await Appointment.create({ patient_id: patient._id, hospital_id: hospital._id, doctor_id: doctor?._id || null, scheduled_for: new Date(scheduled_for), department: department || doctor?.specialty || "General Medicine", reason: reason || null, status: "requested" });
  await AuditLog.create({ user_id: req.user.id, action: "APPOINTMENT_REQUESTED", entity: "APPOINTMENT", entity_id: String(appointment._id) });
  res.status(201).json({ appointment });
}

function appointmentDetails(appointment) {
  return {
    _id: String(appointment._id), scheduled_for: appointment.scheduled_for, department: appointment.department,
    reason: appointment.reason, status: appointment.status,
    hospital: appointment.hospital_id ? { id: String(appointment.hospital_id._id || appointment.hospital_id), name: appointment.hospital_id.name || "Hospital" } : null,
    doctor: appointment.doctor_id ? { id: String(appointment.doctor_id._id || appointment.doctor_id), full_name: appointment.doctor_id.user_id?.full_name || "Doctor", specialty: appointment.doctor_id.specialty || null } : null,
  };
}

async function listAppointmentOptions(_req, res) {
  const [hospitals, doctors] = await Promise.all([
    Hospital.find().sort({ name: 1 }).lean(),
    Doctor.find().populate("user_id", "full_name is_active").lean(),
  ]);
  res.json({
    hospitals: hospitals.map((hospital) => ({ id: String(hospital._id), name: hospital.name, location: hospital.location?.city || hospital.location?.address || "" })),
    doctors: doctors.filter((doctor) => doctor.user_id?.is_active !== false).map((doctor) => ({ id: String(doctor._id), full_name: doctor.user_id?.full_name || "Doctor", specialty: doctor.specialty || null })),
  });
}

async function listMyAppointments(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointments = await Appointment.find({ patient_id: patient._id }).sort({ scheduled_for: 1 }).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.json({ appointments: appointments.map(appointmentDetails) });
}

async function updateMyAppointment(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.findOne({ _id: req.params.id, patient_id: patient._id });
  if (!appointment) throw new AppError("Appointment not found", 404);
  const { action, scheduled_for, department, reason, doctor_id } = req.body;
  if (action === "cancel") {
    if (["completed", "cancelled"].includes(appointment.status)) throw new AppError("This appointment cannot be cancelled", 400);
    appointment.status = "cancelled";
  } else if (action === "reschedule") {
    if (appointment.status !== "requested") throw new AppError("Only requested appointments can be rescheduled", 400);
    if (!scheduled_for || Number.isNaN(new Date(scheduled_for).getTime()) || new Date(scheduled_for).getTime() <= Date.now()) throw new AppError("Choose a future date and time", 400);
    if (doctor_id) { const doctor = await Doctor.findById(doctor_id); if (!doctor) throw new AppError("Selected doctor was not found", 404); appointment.doctor_id = doctor._id; }
    appointment.scheduled_for = new Date(scheduled_for); appointment.department = department || appointment.department; appointment.reason = reason?.trim() || null;
  } else throw new AppError("Unsupported appointment action", 400);
  await appointment.save();
  await AuditLog.create({ user_id: req.user.id, action: action === "cancel" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_RESCHEDULED", entity: "APPOINTMENT", entity_id: String(appointment._id) });
  const populated = await Appointment.findById(appointment._id).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.json({ appointment: appointmentDetails(populated) });
}

async function listHospitalAppointments(req, res) {
  const hospital = await Hospital.findOne({ user_id: req.user.id });
  if (!hospital) throw new AppError("Hospital profile not found", 404);
  const appointments = await Appointment.find({ hospital_id: hospital._id }).sort({ scheduled_for: 1 }).populate({ path: "patient_id", populate: { path: "user_id", select: "full_name" } }).populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.json({ appointments: appointments.map((appointment) => ({ ...appointmentDetails(appointment), patient: appointment.patient_id ? { id: String(appointment.patient_id._id), custom_id: appointment.patient_id.custom_id, full_name: appointment.patient_id.user_id?.full_name || "Patient" } : null })) });
}

async function updateHospitalAppointment(req, res) {
  const hospital = await Hospital.findOne({ user_id: req.user.id });
  if (!hospital) throw new AppError("Hospital profile not found", 404);
  const appointment = await Appointment.findOne({ _id: req.params.id, hospital_id: hospital._id });
  if (!appointment) throw new AppError("Appointment not found", 404);
  const { status } = req.body;
  if (!['confirmed', 'completed', 'cancelled'].includes(status)) throw new AppError("Invalid appointment status", 400);
  if (appointment.status === 'cancelled' || appointment.status === 'completed') throw new AppError("This appointment is already closed", 400);
  appointment.status = status; await appointment.save();
  await AuditLog.create({ user_id: req.user.id, action: `APPOINTMENT_${status.toUpperCase()}`, entity: "APPOINTMENT", entity_id: String(appointment._id) });
  res.json({ appointment: appointmentDetails(appointment) });
}

async function getHospitalPatientAppointment(req, res) {
  const hospital = await Hospital.findOne({ user_id: req.user.id });
  if (!hospital) throw new AppError("Hospital profile not found", 404);
  const suppliedId = req.params.patientId.trim();
  const identifier = /^\d+$/.test(suppliedId) ? `PAT-${suppliedId}` : suppliedId;
  const patient = await Patient.findOne({ custom_id: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).populate("user_id", "full_name email");
  if (!patient) throw new AppError("No patient found for that patient ID", 404);
  const appointments = await Appointment.find({ patient_id: patient._id, hospital_id: hospital._id }).sort({ scheduled_for: -1 }).lean();
  if (!appointments.length) throw new AppError("This patient has no appointments at your hospital", 404);
  await AuditLog.create({ user_id: req.user.id, action: "PATIENT_APPOINTMENT_VIEW", entity: "PATIENT", entity_id: String(patient._id) });
  res.json({ patient: patientDetails(patient), appointments });
}

async function uploadHospitalPatientReport(req, res) {
  const hospital = await Hospital.findOne({ user_id: req.user.id });
  if (!hospital) throw new AppError("Hospital profile not found", 404);
  const suppliedId = req.params.patientId.trim();
  const identifier = /^\d+$/.test(suppliedId) ? `PAT-${suppliedId}` : suppliedId;
  const patient = await Patient.findOne({ custom_id: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (!patient) throw new AppError("No patient found for that patient ID", 404);
  const appointment = await Appointment.exists({ patient_id: patient._id, hospital_id: hospital._id, status: { $in: ["requested", "confirmed", "completed"] } });
  if (!appointment) throw new AppError("A booked appointment is required before uploading a report", 403);
  if (!req.file) throw new AppError("Report file is required", 400);
  if (!req.body.title?.trim()) throw new AppError("Report title is required", 400);

  let extraction = { ocrText: null, data: null, points: extractPrescriptionPoints(req.body.title.trim(), req.body.summary?.trim()), status: "failed", error: null };
  try {
    const { extractMedicalDocumentFromFile } = await import("../services/prescriptionExtraction.mjs");
    const result = await extractMedicalDocumentFromFile(req.file, config.ollamaBaseUrl, config.ollamaModel, req.body.type || "clinical report");
    extraction = { ...result, error: null };
  } catch (error) {
    extraction.error = error instanceof Error ? error.message.slice(0, 500) : "Report extraction failed.";
  }
  const report = await Report.create({
    patient_id: patient._id,
    type: req.body.type || "Other",
    title: req.body.title.trim(),
    summary: req.body.summary?.trim() || null,
    extracted_points: extraction.points,
    extraction_source: extraction.status === "failed" ? "upload metadata only" : "Local Ollama vision extraction",
    ocr_text: extraction.ocrText,
    extracted_data: extraction.data,
    extraction_status: extraction.status,
    extraction_error: extraction.error,
    date: new Date(),
    file_url: `/uploads/reports/${req.file.filename}`,
    uploaded_by: req.user.id,
  });
  await AuditLog.create({ user_id: req.user.id, action: "HOSPITAL_REPORT_UPLOADED", entity: "REPORT", entity_id: String(report._id) });
  res.status(201).json({ report });
}

async function uploadMyPrescription(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  if (!req.file) throw new AppError("Prescription file is required", 400);
  if (!req.body.title?.trim()) throw new AppError("Prescription title is required", 400);
  const prescriptionSummary = req.body.summary?.trim() || null;
  let extraction = { ocrText: null, data: null, points: extractPrescriptionPoints(req.body.title.trim(), prescriptionSummary), status: "failed", error: null };
  try {
    const { extractMedicalDocumentFromFile } = await import("../services/prescriptionExtraction.mjs");
    const result = await extractMedicalDocumentFromFile(req.file, config.ollamaBaseUrl, config.ollamaModel, "prescription");
    extraction = { ...result, error: null };
  } catch (error) {
    extraction.error = error instanceof Error ? error.message.slice(0, 500) : "Prescription extraction failed.";
  }
  const report = await Report.create({
    patient_id: patient._id,
    type: "Prescription",
    title: req.body.title.trim(),
    summary: prescriptionSummary,
    extracted_points: extraction.points,
    extraction_source: extraction.status === "failed" ? (prescriptionSummary ? "patient-entered details" : "upload metadata only") : "Local Ollama vision extraction",
    ocr_text: extraction.ocrText,
    extracted_data: extraction.data,
    extraction_status: extraction.status,
    extraction_error: extraction.error,
    date: new Date(),
    file_url: `/uploads/reports/${req.file.filename}`,
    uploaded_by: req.user.id,
  });
  await AuditLog.create({ user_id: req.user.id, action: "PATIENT_PRESCRIPTION_UPLOADED", entity: "REPORT", entity_id: String(report._id) });
  res.status(201).json({ report });
}

module.exports = { createAppointment, listAppointmentOptions, listMyAppointments, updateMyAppointment, listHospitalAppointments, updateHospitalAppointment, getHospitalPatientAppointment, uploadHospitalPatientReport, uploadMyPrescription };
