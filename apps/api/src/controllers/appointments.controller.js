const { Appointment, Patient, Hospital, Doctor, Department, Report, AuditLog, DepartmentQuestionnaire, PreConsultation } = require("../models/schemas");
const { AppError } = require("../utils/async");
const { assertHospitalScope } = require("../middleware/permissions");
const { config } = require("../config");
const { translateToEnglish } = require("../services/translate");
const { summarizeScreening } = require("../services/summarize");
const conversationService = require("../services/screeningConversationService");

function hospitalIdOf(req) {
  const id = req.user.hospital_id;
  if (!id) throw new AppError("You are not linked to a hospital", 403);
  return id;
}

function screeningJson(submission) {
  if (!submission) return { completed: false, answer_count: 0, version: 0 };
  return { completed: submission.status === "completed", answer_count: (submission.answers || []).length, version: submission.questionnaire_version };
}

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
  const { scheduled_for, department, department_id, reason, hospital_id, doctor_id } = req.body;
  if (!scheduled_for || Number.isNaN(new Date(scheduled_for).getTime())) throw new AppError("A valid appointment date and time is required", 400);
  if (new Date(scheduled_for).getTime() <= Date.now()) throw new AppError("Appointments must be scheduled for a future date and time", 400);
  const hospital = hospital_id ? await Hospital.findById(hospital_id) : await Hospital.findOne({ code: "VITA-CGH-001" });
  if (!hospital) throw new AppError("Hospital not found", 404);
  const doctor = doctor_id ? await Doctor.findById(doctor_id) : null;
  if (doctor_id && !doctor) throw new AppError("Selected doctor was not found", 404);
  let dept = null;
  if (department_id) {
    dept = await Department.findById(department_id);
    if (!dept) throw new AppError("Department not found", 404);
    if (String(dept.hospital_id) !== String(hospital._id)) throw new AppError("Selected department does not belong to this hospital", 400);
  }
  const deptName = dept?.name || department || doctor?.specialty || "General Medicine";
  const appointment = await Appointment.create({
    patient_id: patient._id,
    hospital_id: hospital._id,
    doctor_id: doctor?._id || null,
    department_id: dept?._id || null,
    scheduled_for: new Date(scheduled_for),
    department: deptName,
    reason: reason || null,
    status: "requested",
  });
  await AuditLog.create({ user_id: req.user.id, action: "APPOINTMENT_REQUESTED", entity: "APPOINTMENT", entity_id: String(appointment._id) });
  const populated = await Appointment.findById(appointment._id).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.status(201).json({ appointment: (await withScreening([populated]))[0] });
}

function appointmentDetails(appointment) {
  return {
    _id: String(appointment._id), scheduled_for: appointment.scheduled_for, department: appointment.department,
    department_id: appointment.department_id ? String(appointment.department_id._id || appointment.department_id) : null,
    reason: appointment.reason, status: appointment.status,
    hospital: appointment.hospital_id ? { id: String(appointment.hospital_id._id || appointment.hospital_id), name: appointment.hospital_id.name || "Hospital" } : null,
    doctor: appointment.doctor_id ? { id: String(appointment.doctor_id._id || appointment.doctor_id), full_name: appointment.doctor_id.user_id?.full_name || "Doctor", specialty: appointment.doctor_id.specialty || null } : null,
  };
}

async function withScreening(appointments) {
  if (!appointments.length) return [];
  const appointmentsWithScreening = await Promise.all(
    appointments.map(async (appointment) => {
      const submission = await PreConsultation.findOne({ appointment_id: appointment._id }).lean();
      return { ...appointmentDetails(appointment), pre_consultation: screeningJson(submission) };
    })
  );
  return appointmentsWithScreening;
}

async function listAppointmentOptions(_req, res) {
  const [hospitals, doctors, departments] = await Promise.all([
    Hospital.find().sort({ name: 1 }).lean(),
    Doctor.find().populate("user_id", "full_name is_active").lean(),
    Department.find({ is_active: true }).sort({ name: 1 }).lean(),
  ]);
  res.json({
    hospitals: hospitals.map((hospital) => ({ id: String(hospital._id), name: hospital.name, location: hospital.location?.city || hospital.location?.address || "" })),
    departments: departments.map((department) => ({ id: String(department._id), hospital_id: String(department.hospital_id), name: department.name })),
    doctors: doctors.filter((doctor) => doctor.user_id?.is_active !== false).map((doctor) => ({ id: String(doctor._id), full_name: doctor.user_id?.full_name || "Doctor", specialty: doctor.specialty || null, hospital_id: doctor.hospital_id ? String(doctor.hospital_id) : null, department_id: doctor.department_id ? String(doctor.department_id) : null })),
  });
}

async function listMyAppointments(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointments = await Appointment.find({ patient_id: patient._id }).sort({ scheduled_for: 1 }).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.json({ appointments: await withScreening(appointments) });
}

async function updateMyAppointment(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.findOne({ _id: req.params.id, patient_id: patient._id });
  if (!appointment) throw new AppError("Appointment not found", 404);
  const { action, scheduled_for, department, department_id, reason, doctor_id } = req.body;
  if (action === "cancel") {
    if (["completed", "cancelled"].includes(appointment.status)) throw new AppError("This appointment cannot be cancelled", 400);
    appointment.status = "cancelled";
  } else if (action === "reschedule") {
    if (appointment.status !== "requested") throw new AppError("Only requested appointments can be rescheduled", 400);
    if (!scheduled_for || Number.isNaN(new Date(scheduled_for).getTime()) || new Date(scheduled_for).getTime() <= Date.now()) throw new AppError("Choose a future date and time", 400);
    if (doctor_id) { const doctor = await Doctor.findById(doctor_id); if (!doctor) throw new AppError("Selected doctor was not found", 404); appointment.doctor_id = doctor._id; }
    let deptName = department || appointment.department;
    if (department_id) {
      const dept = await Department.findById(department_id);
      if (!dept) throw new AppError("Department not found", 404);
      if (appointment.hospital_id && String(dept.hospital_id) !== String(appointment.hospital_id)) throw new AppError("Selected department does not belong to this hospital", 400);
      appointment.department_id = dept._id;
      deptName = dept.name;
    }
    appointment.scheduled_for = new Date(scheduled_for); appointment.department = deptName; appointment.reason = reason?.trim() || null;
  } else throw new AppError("Unsupported appointment action", 400);
  await appointment.save();
  await AuditLog.create({ user_id: req.user.id, action: action === "cancel" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_RESCHEDULED", entity: "APPOINTMENT", entity_id: String(appointment._id) });
  const populated = await Appointment.findById(appointment._id).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  res.json({ appointment: (await withScreening([populated]))[0] });
}

async function listHospitalAppointments(req, res) {
  const hospitalId = hospitalIdOf(req);
  const appointments = await Appointment.find({ hospital_id: hospitalId }).sort({ scheduled_for: 1 }).populate({ path: "patient_id", populate: { path: "user_id", select: "full_name" } }).populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  const rows = await withScreening(appointments);
  res.json({ appointments: rows.map((row, index) => {
    const appointment = appointments[index];
    return { ...row, patient: appointment.patient_id ? { id: String(appointment.patient_id._id), custom_id: appointment.patient_id.custom_id, full_name: appointment.patient_id.user_id?.full_name || "Patient" } : null };
  }) });
}

async function listDoctorAppointments(req, res) {
  const doctor = await Doctor.findOne({ user_id: req.user.id });
  if (!doctor) throw new AppError("Doctor profile not found", 403);
  const hospitalId = doctor.hospital_id || hospitalIdOf(req);
  const filter = { hospital_id: hospitalId };
  if (req.user.role === "HOD" && doctor.department_id) filter.department_id = doctor.department_id;
  else filter.doctor_id = doctor._id;
  const appointments = await Appointment.find(filter).sort({ scheduled_for: 1 }).populate({ path: "patient_id", populate: { path: "user_id", select: "full_name" } }).populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).populate("hospital_id", "name location").lean();
  const rows = await withScreening(appointments);
  res.json({ appointments: rows.map((row, index) => {
    const appointment = appointments[index];
    return { ...row, patient: appointment.patient_id ? { id: String(appointment.patient_id._id), custom_id: appointment.patient_id.custom_id, full_name: appointment.patient_id.user_id?.full_name || "Patient" } : null };
  }) });
}

async function getAppointmentScreening(req, res) {
  const appointment = await Appointment.findById(req.params.id).populate({ path: "patient_id", populate: { path: "user_id", select: "full_name" } });
  if (!appointment) throw new AppError("Appointment not found", 404);
  assertHospitalScope(req.user, appointment.hospital_id);
  if (["DOCTOR", "HOD"].includes(req.user.role)) {
    const doctor = await Doctor.findOne({ user_id: req.user.id });
    if (doctor && doctor.department_id && appointment.department_id && String(doctor.department_id) !== String(appointment.department_id)) {
      throw new AppError("This screening belongs to another department", 403);
    }
  }
  const submission = await PreConsultation.findOne({ appointment_id: appointment._id }).lean();
  res.json({
    appointment: {
      _id: String(appointment._id),
      patient_id: appointment.patient_id ? String(appointment.patient_id._id) : null,
      patient_name: appointment.patient_id?.user_id?.full_name || "Patient",
      department: appointment.department,
      department_id: appointment.department_id ? String(appointment.department_id._id || appointment.department_id) : null,
      scheduled_for: appointment.scheduled_for,
      status: appointment.status,
    },
    screening: submission
      ? {
          completed: submission.status === "completed",
          version: submission.questionnaire_version,
          visit_number: submission.visit_number || 1,
          answers: (submission.answers || []).map((a) => ({
            question_id: a.question_id,
            question_text: a.question_text,
            answer_type: a.answer_type,
            category: a.category || "doctor",
            value: a.value,
            value_original: a.value_original ?? null,
            translated: Boolean(a.translated),
            language: a.language || null,
            skipped: Boolean(a.skipped),
            not_known: Boolean(a.not_known),
            corrected: Boolean(a.corrected),
            correction: a.correction || null,
            fact_status: a.fact_status || "reported",
            detected: a.detected || null,
          })),
          conversation: submission.conversation_log || [],
          follow_ups: submission.follow_ups || [],
          facts: submission.facts || [],
          corrections: submission.corrections || [],
          plan: submission.conversation_plan || [],
          summary: submission.summary || null,
        }
      : null,
  });
}

async function correctScreeningAnswer(req, res) {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new AppError("Appointment not found", 404);
  assertHospitalScope(req.user, appointment.hospital_id);
  if (["DOCTOR", "HOD"].includes(req.user.role)) {
    const doctor = await Doctor.findOne({ user_id: req.user.id });
    if (doctor && doctor.department_id && appointment.department_id && String(doctor.department_id) !== String(appointment.department_id)) {
      throw new AppError("This screening belongs to another department", 403);
    }
  }
  const { question_id, new_value, reason } = req.body;
  if (!question_id) throw new AppError("question_id is required", 400);
  if (new_value === undefined || new_value === null || String(new_value).trim() === "") {
    throw new AppError("A correction value is required", 400);
  }
  const screening = await PreConsultation.findOne({ appointment_id: appointment._id });
  if (!screening) throw new AppError("No pre-consultation screening found for this appointment", 404);

  const corrected = await conversationService.correctAnswer({ screening, questionId: String(question_id), newValue: new_value, reason: reason || null, user: req.user });
  await AuditLog.create({ user_id: req.user.id, action: "SCREENING_ANSWER_CORRECTED", entity: "APPOINTMENT", entity_id: String(appointment._id) });
  res.json({ corrected });
}

async function updateHospitalAppointment(req, res) {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new AppError("Appointment not found", 404);
  assertHospitalScope(req.user, appointment.hospital_id);
  const { status } = req.body;
  if (!['confirmed', 'completed', 'cancelled'].includes(status)) throw new AppError("Invalid appointment status", 400);
  if (appointment.status === 'cancelled' || appointment.status === 'completed') throw new AppError("This appointment is already closed", 400);
  appointment.status = status; await appointment.save();
  await AuditLog.create({ user_id: req.user.id, action: `APPOINTMENT_${status.toUpperCase()}`, entity: "APPOINTMENT", entity_id: String(appointment._id) });
  res.json({ appointment: appointmentDetails(appointment) });
}

async function getHospitalPatientAppointment(req, res) {
  const hospitalId = hospitalIdOf(req);
  const suppliedId = req.params.patientId.trim();
  const identifier = /^\d+$/.test(suppliedId) ? `PAT-${suppliedId}` : suppliedId;
  const patient = await Patient.findOne({ custom_id: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).populate("user_id", "full_name email");
  if (!patient) throw new AppError("No patient found for that patient ID", 404);
  const appointments = await Appointment.find({ patient_id: patient._id, hospital_id: hospitalId }).sort({ scheduled_for: -1 }).lean();
  if (!appointments.length) throw new AppError("This patient has no appointments at your hospital", 404);
  await AuditLog.create({ user_id: req.user.id, action: "PATIENT_APPOINTMENT_VIEW", entity: "PATIENT", entity_id: String(patient._id) });
  res.json({ patient: patientDetails(patient), appointments });
}

async function uploadHospitalPatientReport(req, res) {
  const hospitalId = hospitalIdOf(req);
  const suppliedId = req.params.patientId.trim();
  const identifier = /^\d+$/.test(suppliedId) ? `PAT-${suppliedId}` : suppliedId;
  const patient = await Patient.findOne({ custom_id: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (!patient) throw new AppError("No patient found for that patient ID", 404);
  const appointment = await Appointment.exists({ patient_id: patient._id, hospital_id: hospitalId, status: { $in: ["requested", "confirmed", "completed"] } });
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
    file_mimetype: req.file.mimetype || null,
    file_provider: "local",
    uploaded_by: req.user.id,
  });
  await AuditLog.create({ user_id: req.user.id, action: "PATIENT_PRESCRIPTION_UPLOADED", entity: "REPORT", entity_id: String(report._id) });
  res.status(201).json({ report });
}

// ----- Pre-consultation screening (patient answer flow) -----

function questionKey(q) {
  return q && q._id ? String(q._id) : `q-${q.order}`;
}

function questionJson(q) {
  return {
    id: questionKey(q),
    text: q.text,
    text_hi: q.text_hi || null,
    answer_type: q.answer_type,
    required: Boolean(q.required),
    options: q.options || [],
    show_if_question: q.show_if_question ? String(q.show_if_question) : null,
    show_if_value: q.show_if_value || null,
    visit_type: q.visit_type || "all",
    order: q.order,
  };
}

async function getMyAppointmentQuestionnaire(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.findOne({ _id: req.params.id, patient_id: patient._id }).populate("hospital_id", "name location").populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } }).lean();
  if (!appointment) throw new AppError("Appointment not found", 404);

  const questionnaire = appointment.department_id ? await DepartmentQuestionnaire.findOne({ department_id: appointment.department_id }).lean() : null;
  const active = questionnaire && questionnaire.is_active;
  const screening = await PreConsultation.findOne({ appointment_id: appointment._id }).lean();

  res.json({
    appointment: appointmentDetails(appointment),
    questionnaire: active
      ? { id: String(questionnaire._id), department_id: String(questionnaire.department_id), title: questionnaire.title, description: questionnaire.description, version: questionnaire.version, languages: questionnaire.languages }
      : null,
    questions: active ? (questionnaire.questions || []).slice().sort((a, b) => a.order - b.order).map(questionJson) : [],
    screening: screening
      ? { appointment_id: String(screening.appointment_id), status: screening.status, version: screening.questionnaire_version, answers: (screening.answers || []).map((a) => ({ question_id: a.question_id, question_text: a.question_text, answer_type: a.answer_type, value: a.value_original ?? a.value, translated: Boolean(a.translated) })) }
      : null,
  });
}

function shownQuestions(questions, answers) {
  const byId = new Map(questions.map((q) => [questionKey(q), q]));
  const shown = [];
  for (const q of questions) {
    if (!q.show_if_question) { shown.push(q); continue; }
    const source = byId.get(String(q.show_if_question));
    const value = answers.get(String(q.show_if_question));
    if (!source || value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    if (values.some((v) => String(v) === String(q.show_if_value))) shown.push(q);
  }
  return shown;
}

function sanitizeAnswer(q, raw) {
  const present = raw !== undefined && raw !== null && !(Array.isArray(raw) && raw.length === 0) && String(raw).trim() !== "";
  if (q.required && !present) throw new AppError(`Please answer: "${q.text}"`, 400);
  if (!present) return null;

  switch (q.answer_type) {
    case "number": {
      const num = Number(raw);
      if (Number.isNaN(num)) throw new AppError(`Please enter a valid number for: "${q.text}"`, 400);
      return num;
    }
    case "date": {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new AppError(`Please enter a valid date for: "${q.text}"`, 400);
      return date.toISOString();
    }
    case "yes_no": {
      if (!["Yes", "No"].includes(String(raw))) throw new AppError(`Please answer Yes or No for: "${q.text}"`, 400);
      return String(raw);
    }
    case "multiple_choice": {
      if (!q.options.map((o) => String(o)).includes(String(raw))) throw new AppError(`Please choose a valid option for: "${q.text}"`, 400);
      return String(raw);
    }
    case "multiple_select": {
      const values = Array.isArray(raw) ? raw.map((v) => String(v)) : [String(raw)];
      const optionSet = new Set(q.options.map((o) => String(o)));
      for (const v of values) if (!optionSet.has(v)) throw new AppError(`Please choose valid options for: "${q.text}"`, 400);
      return values;
    }
    case "voice":
    case "text_voice":
    case "text":
    default:
      return String(raw).trim();
  }
}

async function submitMyAppointmentScreening(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment || String(appointment.patient_id) !== String(patient._id)) throw new AppError("Appointment not found", 404);
  if (["cancelled", "completed"].includes(appointment.status)) throw new AppError("This appointment can no longer be updated", 400);
  if (!appointment.department_id) throw new AppError("This appointment has no department questionnaire", 400);

  const questionnaire = await DepartmentQuestionnaire.findOne({ department_id: appointment.department_id });
  if (!questionnaire || !questionnaire.is_active) throw new AppError("This department has not set up the pre-consultation questionnaire yet", 409);
  const questions = (questionnaire.questions || []).slice().sort((a, b) => a.order - b.order);

  const rawAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const answers = new Map(rawAnswers.map((a) => [String(a.question_id), a.value]));
  const shown = shownQuestions(questions, answers);

  const sanitized = [];
  for (const q of shown) {
    const value = sanitizeAnswer(q, answers.get(questionKey(q)));
    if (value !== null) sanitized.push({ question_id: questionKey(q), question_text: q.text, answer_type: q.answer_type, value, value_original: null, translated: false });
  }

  const freeTextValues = sanitized
    .filter((a) => ["text", "voice", "text_voice"].includes(a.answer_type) && typeof a.value === "string" && a.value.trim() !== "")
    .map((a) => a.value);
  let translations = [];
  if (freeTextValues.length) {
    translations = await translateToEnglish(freeTextValues);
  }
  let translatedIndex = 0;
  for (const a of sanitized) {
    if (!["text", "voice", "text_voice"].includes(a.answer_type) || typeof a.value !== "string" || !a.value.trim()) continue;
    const english = translations[translatedIndex];
    translatedIndex += 1;
    if (english && english.trim() && english !== a.value) {
      a.value_original = a.value;
      a.translated = true;
      a.value = english.trim();
    }
  }

  const existing = await PreConsultation.findOne({ appointment_id: appointment._id });
  const submission = existing || new PreConsultation({
    appointment_id: appointment._id,
    hospital_id: appointment.hospital_id,
    department_id: appointment.department_id,
    patient_id: patient._id,
  });
  submission.questionnaire_id = questionnaire._id;
  submission.questionnaire_version = questionnaire.version;
  submission.answers = sanitized;
  submission.status = "completed";
  submission.summary = await summarizeScreening(
    sanitized.map((a) => ({ question: a.question_text, answer: a.value })),
    appointment.department || appointment.department_id
  );
  await submission.save();

  await AuditLog.create({ user_id: req.user.id, action: "SCREENING_SUBMITTED", entity: "APPOINTMENT", entity_id: String(appointment._id) });

  res.json({
    submission: {
      appointment_id: String(appointment._id),
      status: submission.status,
      version: submission.questionnaire_version,
      answers: submission.answers.map((a) => ({ question_id: a.question_id, question_text: a.question_text, answer_type: a.answer_type, value: a.value_original ?? a.value, translated: Boolean(a.translated) })),
    },
  });
}

async function transcribeScreeningAudio(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.exists({ _id: req.params.id, patient_id: patient._id });
  if (!appointment) throw new AppError("Appointment not found", 404);
  const language = req.body.language || "en-IN";

  if (req.file && req.file.buffer) {
    try {
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
      formData.append("file", blob, req.file.originalname || "screening_audio.webm");
      formData.append("language", language);
      const resp = await fetch(`${config.aiServiceUrl}/api/transcribe-audio`, { method: "POST", body: formData });
      if (resp.ok) {
        const data = await resp.json();
        return res.json(data);
      }
    } catch (e) {
      console.warn("Screening audio transcribe error:", e.message);
    }
  }

  res.json({ transcript: "", status: "transcribed_fallback" });
}

async function requirePatientConversation(req) {
  const patient = await Patient.findOne({ user_id: req.user.id }).populate("user_id", "full_name email");
  if (!patient) throw new AppError("Patient profile not found", 404);
  const appointment = await Appointment.findById(req.params.id).populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } });
  if (!appointment || String(appointment.patient_id) !== String(patient._id)) throw new AppError("Appointment not found", 404);
  if (["cancelled", "completed"].includes(appointment.status)) throw new AppError("This appointment can no longer be updated", 400);
  if (!appointment.department_id) throw new AppError("This appointment has no department questionnaire", 400);
  const questionnaire = await DepartmentQuestionnaire.findOne({ department_id: appointment.department_id });
  if (!questionnaire || !questionnaire.is_active) throw new AppError("This department has not set up the pre-consultation questionnaire yet", 409);
  return { patient, appointment, questionnaire };
}

async function startScreeningConversation(req, res) {
  const { patient, appointment, questionnaire } = await requirePatientConversation(req);
  const session = await conversationService.startConversation({ appointment, patient, questionnaire });
  res.json({ session });
}

async function sendScreeningMessage(req, res) {
  const { patient, appointment, questionnaire } = await requirePatientConversation(req);
  const { question_id, answer, finalize } = req.body;
  if (!question_id) throw new AppError("question_id is required", 400);
  if (!finalize && (answer === undefined || answer === null || String(answer).trim() === "")) throw new AppError("answer is required", 400);
  const result = await conversationService.handleMessage({
    appointment,
    patient,
    questionnaire,
    questionId: String(question_id),
    rawAnswer: finalize ? "" : String(answer),
    finalizeOnly: Boolean(finalize),
  });
  res.json(result);
}

module.exports = { createAppointment, listAppointmentOptions, listMyAppointments, updateMyAppointment, listHospitalAppointments, listDoctorAppointments, getAppointmentScreening, updateHospitalAppointment, getHospitalPatientAppointment, uploadHospitalPatientReport, uploadMyPrescription, getMyAppointmentQuestionnaire, submitMyAppointmentScreening, transcribeScreeningAudio, startScreeningConversation, sendScreeningMessage, correctScreeningAnswer };
