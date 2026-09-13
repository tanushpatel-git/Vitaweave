const { Schema, model, models } = require("mongoose");

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, required: true, enum: ["ADMIN", "DOCTOR", "PATIENT", "HOSPITAL"] },
    full_name: { type: String, required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const doctorSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    specialty: { type: String, default: null },
    license_no: { type: String, default: null },
  },
  { timestamps: true }
);

const patientSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    custom_id: { type: String, default: null, index: true },
    abha_id: { type: String, default: null, index: true },
    dob: { type: String, default: null },
    sex: { type: String, default: null },
    blood_type: { type: String, default: null },
    contact_phone: { type: String, default: null },
    emergency_contact: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      relation: { type: String, default: null },
    },
    known_allergies: { type: [String], default: [] },
    chronic_conditions: { type: [String], default: [] },
  },
  { timestamps: true }
);

const doctorDocumentSchema = new Schema(
  {
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    title: { type: String, required: true },
    file_name: { type: String, required: true },
    document_type: { type: String, default: null },
    version: { type: String, default: "1" },
    uploaded_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "active", "error"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const documentChunkSchema = new Schema(
  {
    document_id: { type: Schema.Types.ObjectId, ref: "DoctorDocument", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    content: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    page_number: { type: Number, default: null },
    chunk_index: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
documentChunkSchema.index({ doctor_id: 1, document_id: 1 });

const conversationSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    title: { type: String, default: "New consultation" },
    summary: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ["open", "closed", "escalated"],
      default: "open",
    },
  },
  { timestamps: true }
);
conversationSchema.index({ patient_id: 1, updatedAt: -1 });
conversationSchema.index({ doctor_id: 1, updatedAt: -1 });

const messageSchema = new Schema(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: String, required: true, enum: ["patient", "ai", "doctor", "system"] },
    content: { type: String, required: true },
    safety_flags: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
messageSchema.index({ conversation_id: 1, createdAt: 1 });

const aiConfigSchema = new Schema(
  {
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, unique: true },
    system_prompt: { type: String, default: null },
    response_style: { type: String, default: null },
    language: { type: String, default: null },
    temperature: { type: Number, default: 0.2 },
    max_tokens: { type: Number, default: 512 },
    emergency_policy: { type: String, default: null },
  },
  { timestamps: true }
);

const auditLogSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    entity: { type: String, default: null },
    entity_id: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);
auditLogSchema.index({ user_id: 1, createdAt: -1 });

const hospitalSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null, unique: true, sparse: true },
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    hospital_type: { type: String, default: null },
    registration_number: { type: String, default: null, unique: true, sparse: true },
    administrator_name: { type: String, default: null },
    official_email: { type: String, default: null },
    phone: { type: String, default: null },
    location: { type: Schema.Types.Mixed, default: {} },
    icu_total_beds: { type: Number, required: true, min: 0 },
    general_total_beds: { type: Number, required: true, min: 0 },
    active_doctors: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const hospitalCapacitySnapshotSchema = new Schema(
  {
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    observed_at: { type: Date, required: true },
    icu_occupied: { type: Number, required: true, min: 0 },
    general_occupied: { type: Number, required: true, min: 0 },
    opd_patients: { type: Number, required: true, min: 0 },
    emergency_patients: { type: Number, required: true, min: 0 },
    doctors_available: { type: Number, required: true, min: 0 },
    source: { type: String, default: "manual" },
  },
  { timestamps: true }
);
hospitalCapacitySnapshotSchema.index({ hospital_id: 1, observed_at: -1 }, { unique: true });

const appointmentSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", default: null },
    scheduled_for: { type: Date, required: true },
    department: { type: String, default: "General Medicine" },
    reason: { type: String, default: null },
    status: { type: String, enum: ["requested", "confirmed", "completed", "cancelled"], default: "requested" },
  },
  { timestamps: true }
);
appointmentSchema.index({ hospital_id: 1, scheduled_for: 1 });
appointmentSchema.index({ patient_id: 1, scheduled_for: -1 });

const consultationSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    date: { type: Date, default: Date.now },
    audio_ref: { type: String, default: null },
    audio_duration: { type: Number, default: 0 },
    transcript: { type: String, default: null },
    consent_id: { type: Schema.Types.ObjectId, ref: "Consent", default: null },
    status: {
      type: String,
      required: true,
      enum: ["draft", "reviewed", "finalized"],
      default: "draft",
    },
  },
  { timestamps: true }
);
consultationSchema.index({ patient_id: 1, date: -1 });
consultationSchema.index({ doctor_id: 1, date: -1 });

const caseSheetSchema = new Schema(
  {
    consultation_id: { type: Schema.Types.ObjectId, ref: "Consultation", required: true, unique: true },
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    symptoms: { type: [String], default: [] },
    previous_diseases_mentioned: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    diagnosis: { type: String, default: null },
    doctors_advice: { type: [String], default: [] },
    follow_up_required: { type: Boolean, default: false },
    follow_up_notes: { type: String, default: null },
    created_by_ai: { type: Boolean, default: true },
    reviewed_by_doctor: { type: Boolean, default: false },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: true }
);
caseSheetSchema.index({ patient_id: 1, createdAt: -1 });

const medicationSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    consultation_id: { type: Schema.Types.ObjectId, ref: "Consultation", default: null },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", default: null },
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    duration: { type: String, default: null },
    start_date: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
medicationSchema.index({ patient_id: 1, active: 1 });

const reportSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    type: {
      type: String,
      required: true,
      enum: ["ECG", "MRI", "CT", "X-Ray", "Blood", "Prescription", "Other"],
      default: "Blood",
    },
    title: { type: String, required: true },
    file_url: { type: String, default: null },
    date: { type: Date, default: Date.now },
    uploaded_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    summary: { type: String, default: null },
    extracted_points: { type: [String], default: [] },
    extraction_source: { type: String, default: null },
    flagged_findings: { type: [String], default: [] },
  },
  { timestamps: true }
);
reportSchema.index({ patient_id: 1, date: -1 });

const consentSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor_id: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    type: {
      type: String,
      required: true,
      enum: ["recording", "access", "emergency"],
      default: "recording",
    },
    granted_at: { type: Date, default: Date.now },
    expires_at: { type: Date, default: null },
    ip_address: { type: String, default: null },
    patient_consent: { type: Boolean, default: true },
    doctor_consent: { type: Boolean, default: true },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);
consentSchema.index({ patient_id: 1, doctor_id: 1, granted_at: -1 });

const patientAccessLogSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    accessed_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    access_type: {
      type: String,
      required: true,
      enum: ["TIMELINE_VIEW", "EMERGENCY_ACCESS", "RECORDING_CONSENT", "CASE_EXPORT"],
    },
    details: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
patientAccessLogSchema.index({ patient_id: 1, timestamp: -1 });

const getModel = (name, schema) => models[name] || model(name, schema);

module.exports = {
  User: getModel("User", userSchema),
  Doctor: getModel("Doctor", doctorSchema),
  Patient: getModel("Patient", patientSchema),
  DoctorDocument: getModel("DoctorDocument", doctorDocumentSchema),
  DocumentChunk: getModel("DocumentChunk", documentChunkSchema),
  Conversation: getModel("Conversation", conversationSchema),
  Message: getModel("Message", messageSchema),
  AiConfig: getModel("AiConfig", aiConfigSchema),
  AuditLog: getModel("AuditLog", auditLogSchema),
  Hospital: getModel("Hospital", hospitalSchema),
  HospitalCapacitySnapshot: getModel("HospitalCapacitySnapshot", hospitalCapacitySnapshotSchema),
  Appointment: getModel("Appointment", appointmentSchema),
  Consultation: getModel("Consultation", consultationSchema),
  CaseSheet: getModel("CaseSheet", caseSheetSchema),
  Medication: getModel("Medication", medicationSchema),
  Report: getModel("Report", reportSchema),
  Consent: getModel("Consent", consentSchema),
  PatientAccessLog: getModel("PatientAccessLog", patientAccessLogSchema),
};
