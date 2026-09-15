const { Schema, model, models } = require("mongoose");

const ROLES = ["TOP_ADMIN", "HOSPITAL_ADMIN", "HOD", "DOCTOR", "STAFF", "PATIENT"];

function normalizeRole(role) {
  if (role === "ADMIN") return "TOP_ADMIN";
  if (role === "HOSPITAL") return "HOSPITAL_ADMIN";
  return role;
}

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, required: true, enum: ROLES },
    full_name: { type: String, required: true },
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", default: null },
    department_id: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.index({ hospital_id: 1, role: 1 });
userSchema.index({ department_id: 1 });

const doctorSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", default: null },
    department_id: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    specialty: { type: String, default: null },
    license_no: { type: String, default: null },
    is_hod: { type: Boolean, default: false },
  },
  { timestamps: true }
);
doctorSchema.index({ hospital_id: 1, department_id: 1 });

const departmentSchema = new Schema(
  {
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null },
    description: { type: String, default: null },
    hod_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
departmentSchema.index({ hospital_id: 1, name: 1 }, { unique: true });

const ANSWER_TYPES = ["text", "number", "date", "yes_no", "multiple_choice", "multiple_select", "voice", "text_voice"];
const QUESTION_CATEGORIES = ["doctor", "department", "general", "ai_follow_up"];

const questionnaireQuestionSchema = new Schema(
  {
text: { type: String, required: true, trim: true },
    text_hi: { type: String, default: null, trim: true },
    answer_type: { type: String, required: true, enum: ANSWER_TYPES, default: "text" },
    // Deep Patient Flow: questions are grouped into clinically-bounded tiers.
    // "doctor" = defined by the HOD/doctor, "department" = department-wide
    // screening set, "general" = common across departments, "ai_follow_up" =
    // a synthetic, rule-triggered follow-up the planner asks in between.
    category: { type: String, enum: QUESTION_CATEGORIES, default: "doctor" },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    show_if_question: { type: String, default: null },
    show_if_value: { type: String, default: null },
    visit_type: { type: String, enum: ["all", "first_visit", "follow_up"], default: "all" },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const departmentQuestionnaireSchema = new Schema(
  {
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    department_id: { type: Schema.Types.ObjectId, ref: "Department", required: true, unique: true },
    title: { type: String, default: null },
    description: { type: String, default: null },
    version: { type: Number, default: 1 },
    languages: { type: [String], default: ["English", "Hindi"] },
    is_active: { type: Boolean, default: true },
    questions: { type: [questionnaireQuestionSchema], default: [] },
  },
  { timestamps: true }
);

const screeningAnswerSchema = new Schema(
  {
    question_id: { type: String, required: true },
    question_text: { type: String, required: true, trim: true },
    answer_type: { type: String, enum: ANSWER_TYPES, default: "text" },
    category: { type: String, enum: QUESTION_CATEGORIES, default: "doctor" },
    value: { type: Schema.Types.Mixed, default: null },
    value_original: { type: Schema.Types.Mixed, default: null },
    translated: { type: Boolean, default: false },
    language: { type: String, default: null },
    structured: { type: Schema.Types.Mixed, default: null },
    // Deep Patient Flow: provenance for everything the patient said.
    // Historical information is never treated as current truth.
    detected: { type: Schema.Types.Mixed, default: null },
    confidence: { type: String, enum: ["high", "medium", "low", "auto"], default: "auto" },
    // Patient handled the question without a usable answer.
    skipped: { type: Boolean, default: false },
    not_known: { type: Boolean, default: false },
    // Doctor corrected the AI/patient value -> becomes authoritative.
    corrected: { type: Boolean, default: false },
    correction: {
      value: { type: Schema.Types.Mixed, default: null },
      reason: { type: String, default: null },
      by_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
      by_name: { type: String, default: null },
      at: { type: Date, default: null },
    },
    fact_status: { type: String, enum: ["current", "superseded", "corrected", "reported"], default: "reported" },
  },
  { _id: true }
);

const preConsultationSchema = new Schema(
  {
    appointment_id: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    department_id: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    questionnaire_id: { type: Schema.Types.ObjectId, ref: "DepartmentQuestionnaire", default: null },
    questionnaire_version: { type: Number, default: 0 },
    answers: { type: [screeningAnswerSchema], default: [] },
    summary: { type: Schema.Types.Mixed, default: null },
    conversation_log: { type: Schema.Types.Mixed, default: [] },
    // Deep Patient Flow storage:
    // - conversation_plan: the planner's ordered steps (doctor Qs + follow-ups)
    // - follow_ups: synthetic rule-triggered questions asked between doctor Qs
    // - facts: longitudinal facts with provenance (source/date/visit/status)
    // - corrections: doctor overrides, kept as an audit trail
    conversation_plan: { type: Schema.Types.Mixed, default: [] },
    follow_ups: { type: Schema.Types.Mixed, default: [] },
    facts: { type: Schema.Types.Mixed, default: [] },
    corrections: { type: Schema.Types.Mixed, default: [] },
    // Explicit, clinic-reviewable safety flags. These are not diagnoses.
    safety_events: { type: Schema.Types.Mixed, default: [] },
    visit_number: { type: Number, default: 1 },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    draft: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["draft", "completed"], default: "draft" },
  },
  { timestamps: true }
);
preConsultationSchema.index({ patient_id: 1, createdAt: -1 });

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
    department_id: { type: Schema.Types.ObjectId, ref: "Department", default: null },
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

const REPORT_TYPES = ["Blood", "Urine", "ECG", "X-Ray", "MRI", "CT", "Pathology", "Prescription", "Imaging", "Discharge", "General", "Other"];
const reportSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    type: {
      type: String,
      required: true,
      enum: REPORT_TYPES,
      default: "Blood",
    },
    title: { type: String, required: true },
    file_url: { type: String, default: null },
    file_mimetype: { type: String, default: null },
    file_provider: { type: String, enum: ["imagekit", "local"], default: null },
    file_id: { type: String, default: null },
    date: { type: Date, default: Date.now },
    uploaded_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    hospital_id: { type: Schema.Types.ObjectId, ref: "Hospital", default: null },
    summary: { type: String, default: null },
    extracted_points: { type: [String], default: [] },
    extraction_source: { type: String, default: null },
    ocr_text: { type: String, default: null },
    extracted_data: { type: Schema.Types.Mixed, default: null },
    extraction_status: { type: String, enum: ["pending", "completed", "needs_review", "failed"], default: "pending" },
    extraction_error: { type: String, default: null },
    flagged_findings: { type: [String], default: [] },
    ai_status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
    },
    ai_classified_type: { type: String, default: null },
    ai_summary: { type: String, default: null },
    ai_findings: { type: Schema.Types.Mixed, default: null },
    ai_raw_text: { type: String, default: null },
    ai_extracted_at: { type: Date, default: null },
    ai_error: { type: String, default: null },
  },
  { timestamps: true }
);
reportSchema.index({ patient_id: 1, date: -1 });
reportSchema.index({ hospital_id: 1, patient_id: 1 });
reportSchema.index({ ai_status: 1 });

// Per-patient longitudinal summary, regenerated whenever a new report's AI
// extraction completes. The trend engine computes the numbers; the summary
// string is an LLM narrative written from those precomputed facts.
const healthTimelineSchema = new Schema(
  {
    patient_id: { type: Schema.Types.ObjectId, ref: "Patient", required: true, unique: true },
    version: { type: Number, default: 1 },
    report_count: { type: Number, default: 0 },
    visit_count: { type: Number, default: 0 },
    first_report_date: { type: Date, default: null },
    last_report_date: { type: Date, default: null },
    parameters: [
      {
        key: String,
        name: String,
        unit: { type: String, default: null },
        flagged: { type: Boolean, default: false },
        trend: { type: String, enum: ["up", "down", "stable"], default: "stable" },
        first_value: Schema.Types.Mixed,
        last_value: Schema.Types.Mixed,
        first_date: String,
        last_date: String,
        overall_change_pct: { type: Number, default: null },
        readings: [
          {
            value: Number,
            date: String,
            report_id: { type: Schema.Types.ObjectId, ref: "Report" },
          },
        ],
        changes: [
          {
            from_value: Number,
            to_value: Number,
            change_pct: { type: Number, default: null },
            date: String,
          },
        ],
      },
    ],
    timeline: [
      {
        report_id: { type: Schema.Types.ObjectId, ref: "Report" },
        title: String,
        type: { type: String },
        date: Date,
      },
    ],
    summary: { type: String, default: null },
    summary_error: { type: String, default: null },
    source_report_ids: { type: [Schema.Types.ObjectId], default: [] },
    generated_at: { type: Date, default: null },
  },
  { timestamps: true }
);
healthTimelineSchema.index({ patient_id: 1, updatedAt: -1 });

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
  ROLES,
  normalizeRole,
  ANSWER_TYPES,
  QUESTION_CATEGORIES,
  REPORT_TYPES,
  User: getModel("User", userSchema),
  Doctor: getModel("Doctor", doctorSchema),
  Department: getModel("Department", departmentSchema),
  DepartmentQuestionnaire: getModel("DepartmentQuestionnaire", departmentQuestionnaireSchema),
  PreConsultation: getModel("PreConsultation", preConsultationSchema),
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
  HealthTimeline: getModel("HealthTimeline", healthTimelineSchema),
  Consent: getModel("Consent", consentSchema),
  PatientAccessLog: getModel("PatientAccessLog", patientAccessLogSchema),
};
