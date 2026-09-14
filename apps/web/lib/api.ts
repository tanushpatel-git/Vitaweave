"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

// Files referenced by the API (e.g. uploaded report images) live on the API
// server, not the Next.js origin. Prefix with the API base URL so links open
// the actual file (https://.../uploads/reports/...) instead of a 404.
export function apiFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type Role = "TOP_ADMIN" | "HOSPITAL_ADMIN" | "HOD" | "DOCTOR" | "STAFF" | "PATIENT";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  doctor_id?: string;
  patient_id?: string;
  hospital_id?: string;
  department_id?: string;
}

export interface Department {
  id: string;
  hospital_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  hod_id: string | null;
  hod_name: string | null;
  doctor_count: number;
}

export interface ManagedDoctor {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  hospital_id: string;
  department_id: string | null;
  specialty: string | null;
  license_no: string | null;
  is_hod: boolean;
}

export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

export type AnswerType = "text" | "number" | "date" | "yes_no" | "multiple_choice" | "multiple_select" | "voice" | "text_voice";

export interface QuestionnaireQuestion {
  id: string;
  text: string;
  text_hi?: string | null;
  answer_type: AnswerType;
  required: boolean;
  options: string[];
  show_if_question: string | null;
  show_if_value: string | null;
  visit_type?: "all" | "first_visit" | "follow_up";
  order: number;
}

export interface DepartmentQuestionnaire {
  id: string | null;
  department_id: string;
  title: string | null;
  description: string | null;
  version: number;
  languages: string[];
  is_active: boolean;
  questions: QuestionnaireQuestion[];
}

export type SaveQuestionnairePayload = {
  title?: string | null;
  description?: string | null;
  is_active?: boolean;
  languages?: string[];
  questions?: Array<Omit<QuestionnaireQuestion, "id"> & { id?: string }>;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vitaweave_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("vitaweave_token", token);
  else localStorage.removeItem("vitaweave_token");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("vitaweave_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem("vitaweave_user");
    return null;
  }
}

export function setStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem("vitaweave_user", JSON.stringify(user));
  else localStorage.removeItem("vitaweave_user");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (withAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json() as Promise<T>;
}

export interface Doctor {
  id: string;
  full_name: string;
  email: string;
  specialty: string | null;
}

export interface Conversation {
  id: string;
  patient_id?: string;
  doctor_id?: string;
  doctor_name?: string;
  patient_name?: string;
  title: string | null;
  status: "open" | "closed" | "escalated";
  summary?: string | null;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: "patient" | "ai" | "doctor" | "system";
  content: string;
  safety_flags: Record<string, unknown>;
  created_at: string;
}

export interface PatientConversationSummary {
  patient: { id: string; full_name: string; custom_id: string; dob: string | null; sex: string | null; blood_type: string | null };
  conversation_count: number;
  message_count: number;
  latest_activity?: string;
  latest_patient_update: string;
  recent_concerns: Array<{ text: string; timestamp: string }>;
  known_allergies: string[];
  chronic_conditions: string[];
  active_medications: Array<{ name: string; dosage: string; duration?: string | null }>;
  clinical_note: string;
}

export interface PatientSummaryAppointment {
  _id: string;
  scheduled_for: string;
  department: string;
  department_id: string | null;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  doctor: { id: string; full_name: string } | null;
  screening: PreConsultationDetail | null;
}

export interface PatientDocumentInsight {
  id: string;
  title: string;
  type: string;
  date: string;
  file_url: string | null;
  uploaded_by: { id: string; full_name: string | null; role: string | null } | null;
  ai_status: "pending" | "processing" | "completed" | "failed" | "skipped";
  ai_classified_type: string | null;
  ai_summary: string | null;
  ai_findings: AiFinding[];
  flagged_findings: string[];
  extracted_points: string[];
  ai_extracted_at: string | null;
  ai_error: string | null;
}

export interface PatientClinicalSummary {
  patient: { id: string; full_name: string; custom_id: string; email?: string; abha_id?: string | null; dob: string | null; age?: number | null; sex: string | null; blood_type: string | null; contact_phone?: string | null; emergency_contact?: { name?: string | null; phone?: string | null; relation?: string | null } | null };
  consultation_count: number;
  appointment_count: number;
  report_count: number;
  latest_activity?: string;
  current_assessment: string;
  reported_symptoms: string[];
  recent_diagnoses: string[];
  latest_advice: string[];
  known_allergies: string[];
  chronic_conditions: string[];
  active_medications: Array<{ name: string; dosage: string; duration?: string | null }>;
  recent_reports: Array<{ title: string; type: string; date: string }>;
prescription_insights: Array<{ title: string; date: string; points: string[]; source: string; status: "completed" | "needs_review" | "failed" | "pending" }>;
  report_insights: Array<{ title: string; type: string; date: string; points: string[]; status: "completed" | "needs_review" | "failed" | "pending" }>;
  appointments: PatientSummaryAppointment[];
  document_insights: PatientDocumentInsight[];
  clinical_note: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  file_name: string;
  document_type: string | null;
  version: string | null;
  status: "pending" | "processing" | "active" | "error";
  created_at: string;
}

export interface AiConfig {
  system_prompt?: string;
  response_style?: string;
  language?: string;
  temperature: number;
  max_tokens: number;
  emergency_policy?: string;
}

export interface MLPrediction {
  model: string;
  n_features: number;
  predicted_class: number | string;
  class_index: number;
  classes: (number | string)[];
  probabilities: number[];
  probability_percent: number;
  positive_index: number | null;
  raw_score: number | null;
  source: string;
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    role: "DOCTOR" | "PATIENT";
    specialty?: string;
    licenseNo?: string;
    abha_id?: string;
    dob?: string;
    sex?: string;
    blood_type?: string;
    contact_phone?: string;
    emergency_contact?: { name: string; phone: string; relation: string };
    known_allergies?: string[];
    chronic_conditions?: string[];
  }) =>
    request<{ token: string; user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }, false),

  registerHospital: (payload: {
    email: string; password: string; fullName: string; role: "HOSPITAL";
    hospitalName: string; hospitalType: string; registrationNumber: string;
    phone: string; address: string; city: string; state: string; pincode: string;
    latitude: number; longitude: number; totalBeds: number; icuBeds: number; activeDoctors: number;
  }) => request<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: "POST", body: JSON.stringify(payload),
  }, false),

  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  // ----- Platform admin (TOP_ADMIN) -----
  adminListHospitals: () => request<{ hospitals: PlatformHospital[] }>("/api/admin/hospitals"),
  adminCreateHospital: (payload: {
    name: string; code?: string; hospitalType?: string; registrationNumber?: string; phone?: string;
    administratorName: string; adminEmail: string; adminPassword: string;
    address?: string; city?: string; state?: string; pincode?: string; latitude?: number; longitude?: number;
    totalBeds?: number; icuBeds?: number; activeDoctors?: number;
  }) => request<{ hospital: PlatformHospital; admin: { id: string; email: string; role: string; full_name: string } }>("/api/admin/hospitals", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateHospital: (id: string, payload: Partial<PlatformHospital>) =>
    request<{ hospital: PlatformHospital }>(`/api/admin/hospitals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminListUsers: (q?: string, role?: Role) =>
    request<{ users: Array<{ id: string; email: string; role: Role; full_name: string; is_active: boolean; hospital_id: string | null; department_id: string | null; created_at: string }> }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}${role ? `${q ? "&" : "?"}role=${role}` : ""}`),
  adminSetUserActive: (id: string, active: boolean) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) }),

  // ----- Hospital workspace (HOSPITAL_ADMIN / HOD / STAFF) -----
  getMyHospital: () => request<{ hospital: PlatformHospital }>("/api/hospitals/me"),
  updateMyHospital: (payload: Partial<PlatformHospital>) =>
    request<{ hospital: PlatformHospital }>("/api/hospitals/me", { method: "PATCH", body: JSON.stringify(payload) }),
  listMyDepartments: () => request<{ departments: Department[] }>("/api/hospitals/departments"),
  createDepartment: (payload: { name: string; code?: string; description?: string }) =>
    request<{ department: Department }>("/api/hospitals/departments", { method: "POST", body: JSON.stringify(payload) }),
  updateDepartment: (id: string, payload: { name?: string; code?: string; description?: string; hod_id?: string | null; is_active?: boolean }) =>
    request<{ department: Department }>(`/api/hospitals/departments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteDepartment: (id: string) =>
    request<{ ok: boolean }>(`/api/hospitals/departments/${id}`, { method: "DELETE" }),
  getDepartmentQuestionnaire: (id: string) =>
    request<{ questionnaire: DepartmentQuestionnaire }>(`/api/hospitals/departments/${id}/questionnaire`),
  saveDepartmentQuestionnaire: (id: string, payload: SaveQuestionnairePayload) =>
    request<{ questionnaire: DepartmentQuestionnaire }>(`/api/hospitals/departments/${id}/questionnaire`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listMyDoctors: () => request<{ doctors: ManagedDoctor[] }>("/api/hospitals/doctors"),
  createDoctor: (payload: { email: string; password: string; fullName: string; specialty?: string; licenseNo?: string; department_id?: string }) =>
    request<{ doctor: ManagedDoctor }>("/api/hospitals/doctors", { method: "POST", body: JSON.stringify(payload) }),
  updateDoctor: (id: string, payload: { department_id?: string | null; specialty?: string; license_no?: string; is_active?: boolean }) =>
    request<{ doctor: ManagedDoctor }>(`/api/hospitals/doctors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listMyStaff: () => request<{ staff: StaffMember[] }>("/api/hospitals/staff"),
  createStaff: (payload: { email: string; password: string; fullName: string; role?: string }) =>
    request<{ staff: StaffMember }>("/api/hospitals/staff", { method: "POST", body: JSON.stringify(payload) }),
  listMyPatients: () => request<{ patients: PatientProfile[] }>("/api/hospitals/patients"),

  me: () => request<{ user: AuthUser }>("/api/auth/me"),

  updateMyPatientProfile: (payload: {
    abha_id?: string;
    dob?: string;
    sex?: string;
    blood_type?: string;
    contact_phone?: string;
    emergency_contact?: { name: string; phone: string; relation: string };
    known_allergies?: string[];
    chronic_conditions?: string[];
  }) => request<{ patient: PatientProfile }>("/api/auth/patient-profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),

  getHospitalPatientAppointments: (patientId: string) =>
    request<{ patient: PatientProfile; appointments: HospitalAppointment[] }>(
      `/api/appointments/hospital/patient/${encodeURIComponent(patientId)}`
    ),

  uploadHospitalPatientReport: (patientId: string, file: File, payload: { title: string; type: string; summary?: string }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", payload.title);
    body.append("type", payload.type);
    if (payload.summary) body.append("summary", payload.summary);
    return request<{ report: Record<string, unknown> }>(`/api/appointments/hospital/patient/${encodeURIComponent(patientId)}/report`, { method: "POST", body });
  },

  getAppointmentOptions: () => request<{ hospitals: AppointmentHospital[]; departments: AppointmentDepartment[]; doctors: AppointmentDoctor[] }>("/api/appointments/options"),

  getMyAppointments: () => request<{ appointments: HospitalAppointment[] }>("/api/appointments/mine"),

  updateMyAppointment: (id: string, payload: { action: "cancel" | "reschedule"; scheduled_for?: string; department?: string; department_id?: string; reason?: string; doctor_id?: string }) =>
    request<{ appointment: HospitalAppointment }>(`/api/appointments/mine/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),

  getHospitalAppointments: () => request<{ appointments: HospitalAppointment[] }>("/api/appointments/hospital"),

  updateHospitalAppointment: (id: string, status: "confirmed" | "completed" | "cancelled") =>
    request<{ appointment: HospitalAppointment }>(`/api/appointments/hospital/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  getAppointmentScreening: (id: string) =>
    request<{ appointment: { _id: string; patient_name: string; department: string; scheduled_for: string; status: string }; screening: PreConsultationDetail | null }>(`/api/appointments/hospital/${encodeURIComponent(id)}/screening`),

  correctScreeningAnswer: (id: string, payload: { question_id: string; new_value: string | number | string[]; reason?: string }) =>
    request<{ corrected: ScreeningAnswer }>(`/api/appointments/hospital/${encodeURIComponent(id)}/screening/correct`, { method: "POST", body: JSON.stringify(payload) }),

  createAppointment: (payload: { scheduled_for: string; department?: string; department_id?: string; reason?: string; hospital_id?: string; doctor_id?: string }) =>
    request<{ appointment: HospitalAppointment }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getAppointmentQuestionnaire: (id: string) =>
    request<{ appointment: HospitalAppointment; questionnaire: AppointmentQuestionnaire | null; questions: ScreeningQuestion[]; screening: ScreeningSubmission | null }>(`/api/appointments/mine/${encodeURIComponent(id)}/questionnaire`),

  submitAppointmentScreening: (id: string, answers: Array<{ question_id: string; value: string | number | string[] }>) =>
    request<{ submission: ScreeningSubmission }>(`/api/appointments/mine/${encodeURIComponent(id)}/questionnaire/answers`, { method: "POST", body: JSON.stringify({ answers }) }),

  transcribeAppointmentScreeningAudio: (id: string, audioBlob: Blob, language = "en-IN") => {
    const body = new FormData();
    body.append("file", audioBlob, "screening_audio.webm");
    body.append("language", language);
    return request<{ transcript: string; status: string; source?: string }>(`/api/appointments/mine/${encodeURIComponent(id)}/transcribe`, { method: "POST", body });
  },

  startScreeningConversation: (id: string) =>
    request<{ session: ScreeningSession }>(`/api/appointments/mine/${encodeURIComponent(id)}/screening/start`),

  sendScreeningMessage: (id: string, payload: { question_id: string; answer: string }) =>
    request<ScreeningMessageResponse>(`/api/appointments/mine/${encodeURIComponent(id)}/screening/message`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  finalizeScreeningConversation: (id: string) =>
    request<ScreeningMessageResponse>(`/api/appointments/mine/${encodeURIComponent(id)}/screening/message`, {
      method: "POST",
      body: JSON.stringify({ question_id: "", answer: "", finalize: true }),
    }),

  uploadMyPrescription: (file: File, title: string, summary?: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", title);
    if (summary) body.append("summary", summary);
    return request<{ report: Record<string, unknown> }>("/api/appointments/patient/prescriptions", { method: "POST", body });
  },

  listDoctors: () => request<{ doctors: Doctor[] }>("/api/doctors"),

  listConversations: () =>
    request<{ conversations: Conversation[] }>("/api/conversations"),

  getConversation: (id: string) =>
    request<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${id}`
    ),

  getPatientConversationSummary: (patientId: string) =>
    request<{ summary: PatientConversationSummary }>(`/api/conversations/doctor/patients/${patientId}/summary`),

  getPatientClinicalSummary: (patientId: string) =>
    request<{ summary: PatientClinicalSummary }>(`/api/case-history/patients/${patientId}/clinical-summary`),

  getPatientHealthJourney: (patientId: string, refresh = false) =>
    request<PatientHealthJourney>(`/api/medical-documents/patient/${patientId}/health-journey${refresh ? "?refresh=1" : ""}`),

  createConversation: (doctorId: string, title?: string) =>
    request<{ conversation: Conversation }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ doctorId, title }),
    }),

  sendMessage: (id: string, content: string) =>
    request<{
      message: Message;
      sources: Array<{ documentId: string; title: string; content: string }>;
      emergency: boolean;
    }>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  listDocuments: () =>
    request<{ documents: DocumentRow[] }>("/api/documents"),

  uploadDocument: (file: File, title?: string, documentType?: string, version?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (documentType) form.append("documentType", documentType);
    if (version) form.append("version", version);
    return request<{ document: DocumentRow; chunks: number }>("/api/documents", {
      method: "POST",
      body: form,
    });
  },

  deleteDocument: (id: string) =>
    request<{ deleted: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),

  getAiConfig: () => request<{ config: AiConfig | null }>("/api/ai-config"),

  updateAiConfig: (cfg: Partial<AiConfig>) =>
    request<{ config: AiConfig }>("/api/ai-config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),

  // Server-side prediction from the actual trained models (via Next proxy
  // /api/ml/[model] -> services/ml FastAPI -> ml-models/*.pkl).
  predictML: (model: string, features: number[]) =>
    fetch(`/api/ml/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(
          res.status,
          (data as { error?: string }).error ?? `ML predict failed (${res.status})`
        );
      }
      return data as MLPrediction;
    }),

  // Smart Digital Patient Case History API
  searchPatients: (q?: string) =>
    request<{ patients: PatientProfile[] }>(`/api/case-history/patients/search${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  getPatientProfile: (id: string) =>
    request<{
      patient: PatientProfile;
      stats: { total_consultations: number; active_medications: number; total_reports: number };
    }>(`/api/case-history/patients/${id}/profile`),

  getPatientTimeline: (id: string) =>
    request<{
      patient_id: string;
      total_events: number;
      timeline: TimelineEvent[];
      active_medications: MedicationRecord[];
    }>(`/api/case-history/patients/${id}/timeline`),

  createConsultationWithConsent: (payload: {
    patient_id: string;
    doctor_id?: string;
    patient_consent: boolean;
    doctor_consent: boolean;
    notes?: string;
  }) =>
    request<{
      consultation: { _id: string; patient_id: string; doctor_id: string; status: string; date: string };
      consent: { _id: string; type: string; granted_at: string; patient_consent: boolean; doctor_consent: boolean };
    }>("/api/case-history/consultations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  saveCaseSheet: (
    consultationId: string,
    payload: {
      symptoms: string[];
      previous_diseases_mentioned?: string[];
      allergies?: string[];
      diagnosis?: string | null;
      doctors_advice: string[];
      medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
      follow_up_required: boolean;
      follow_up_notes?: string | null;
      raw_transcript?: string;
      audio_duration?: number;
    }
  ) =>
    request<{
      success: boolean;
      case_sheet: CaseSheet;
      saved_medications: MedicationRecord[];
      allergy_conflicts: Array<{ medication: string; allergy: string; severity: string; message: string }>;
    }>(`/api/case-history/consultations/${consultationId}/case-sheet`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadPatientReport: (payload: {
    patient_id: string;
    type: string;
    title: string;
    summary?: string;
    flagged_findings?: string[];
    date?: string;
    file_url?: string;
  }) =>
    request<{ report: Record<string, unknown> }>("/api/case-history/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),


  getEmergencyDataset: (id: string, reason?: string) =>
    request<EmergencyDataset>(
      `/api/case-history/patients/${id}/emergency${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`
    ),

  linkAbhaId: (id: string, abha_id?: string) =>
    request<{ success: boolean; patient_id: string; abha_id: string; verified_with_abdm: boolean }>(
      `/api/case-history/patients/${id}/abha`,
      {
        method: "POST",
        body: JSON.stringify({ abha_id }),
      }
    ),

  extractCaseSheet: (transcript: string, patient_context?: Record<string, unknown>) =>
    request<CaseSheetExtractionResult>("/api/case-history/ai/extract", {
      method: "POST",
      body: JSON.stringify({ transcript, patient_context }),
    }),

  transcribeAudioFile: (audioBlob: Blob, language = "en-IN", patientName?: string) => {
    const form = new FormData();
    form.append("file", audioBlob, "consultation_audio.webm");
    form.append("language", language);
    if (patientName) form.append("patient_name", patientName);
    return request<{ transcript: string; status: string; source?: string }>(
      "/api/case-history/ai/transcribe-audio",
      {
        method: "POST",
        body: form,
      }
    );
  },

  // ----- AI Medical Document System (hospital upload → AI extract → doctor view) -----
  uploadMedicalReport: (patientId: string, file: File, payload: { title: string; type?: MedicalReportType; summary?: string; date?: string }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", payload.title);
    body.append("type", payload.type || "General");
    if (payload.summary) body.append("summary", payload.summary);
    if (payload.date) body.append("date", payload.date);
    return request<{ report: MedicalReport }>(
      `/api/medical-documents/patient/${encodeURIComponent(patientId)}/upload`,
      { method: "POST", body }
    );
  },

  getPatientMedicalReports: (patientId: string) =>
    request<{ patient: MedicalDocumentPatient; reports: MedicalReport[] }>(
      `/api/medical-documents/patient/${encodeURIComponent(patientId)}`
    ),

  getDoctorPatientOverview: (patientId: string) =>
    request<MedicalDocumentOverview>(
      `/api/medical-documents/patient/${encodeURIComponent(patientId)}/overview`
    ),

  getMedicalReport: (id: string) =>
    request<{ report: MedicalReport }>(`/api/medical-documents/${id}`),

  reprocessMedicalReport: (id: string) =>
    request<{ report: MedicalReport }>(`/api/medical-documents/${id}/reprocess`, { method: "POST" }),

  updateMedicalReport: (id: string, payload: Partial<MedicalReport>) =>
    request<{ report: MedicalReport }>(`/api/medical-documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteMedicalReport: (id: string) =>
    request<void>(`/api/medical-documents/${id}`, { method: "DELETE" }),
};

export interface PatientProfile {
  id: string;
  custom_id: string;
  abha_id: string | null;
  full_name: string;
  email: string;
  dob: string | null;
  sex: string | null;
  blood_type: string | null;
  contact_phone?: string | null;
  emergency_contact?: {
    name?: string | null;
    phone?: string | null;
    relation?: string | null;
  } | null;
  known_allergies: string[];
  chronic_conditions: string[];
  createdAt?: string;
}

export interface HospitalAppointment {
  _id: string;
  scheduled_for: string;
  department: string;
  department_id: string | null;
  reason: string | null;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  hospital?: AppointmentHospital | null;
  doctor?: AppointmentDoctor | null;
  patient?: { id: string; custom_id: string; full_name: string } | null;
  pre_consultation?: { completed: boolean; answer_count: number; version: number };
}

export interface PreConsultationDetail {
  completed: boolean;
  version: number;
  visit_number?: number | null;
  summary?: PreConsultationSummary | null;
  answers: ScreeningAnswer[];
  conversation?: ScreeningConversationEntry[];
  follow_ups?: ScreeningFollowUp[];
  facts?: ScreeningFact[];
  plan?: Array<{ type: string; rule?: string | null; question_id: string; question_text: string; created_at?: string }>;
  corrections?: Array<{
    question_id: string;
    question_text: string;
    ai_value: string | number | string[];
    doctor_value: string | number | string[];
    reason: string | null;
    by_name: string | null;
    at: string;
  }>;
}

export interface PreConsultationSummary {
  narrative: string | null;
  sections?: Record<string, string> | null;
  source?: string;
}

export interface AppointmentHospital { id: string; name: string; location?: string; }
export interface AppointmentDepartment { id: string; hospital_id: string; name: string; }
export interface AppointmentDoctor { id: string; full_name: string; specialty: string | null; department_id?: string | null; hospital_id?: string | null; }

export interface AppointmentQuestionnaire {
  id: string | null;
  department_id: string | null;
  title: string | null;
  description: string | null;
  version: number;
  languages: string[];
}

export type ScreeningQuestion = QuestionnaireQuestion;

export interface ScreeningAnswer {
  question_id: string;
  question_text: string;
  answer_type: AnswerType;
  category?: string;
  value: string | number | string[] | null;
  value_original?: string | number | string[] | null;
  translated?: boolean;
  language?: string | null;
  confidence?: string;
  skipped?: boolean;
  not_known?: boolean;
  corrected?: boolean;
  correction?: ScreeningCorrection | null;
  fact_status?: string;
  detected?: Record<string, unknown> | null;
}

export interface ScreeningCorrection {
  value: string | number | string[];
  original_value?: string | number | string[];
  reason?: string | null;
  by_user_id?: string | null;
  by_name?: string | null;
  at?: string | null;
}

export interface ScreeningConversationEntry {
  role: "ai" | "patient";
  question_id?: string;
  text?: string;
  hi?: string;
  language?: string;
  clarification?: boolean;
  correction?: boolean;
  follow_up?: boolean;
  rule?: string | null;
  previous_value?: string | number | string[] | null;
  ts?: string;
}

export interface ScreeningFact {
  key: string;
  fact: string;
  value: string | number | boolean;
  question_id?: string | null;
  source: "patient" | "doctor";
  visit_id: string;
  recorded_at: string;
  status: "current" | "superseded" | "corrected";
  confidence?: string;
}

export interface ScreeningFollowUp {
  _id: string;
  text: string;
  text_hi: string | null;
  answer_type: AnswerType;
  category: string;
  order: number;
  _meta?: { rule?: string; step?: number };
}

export interface ScreeningSubmission {
  appointment_id: string;
  status: "draft" | "completed";
  version: number;
  answers: ScreeningAnswer[];
}

export interface BilingualText {
  en: string;
  hi: string;
}

export interface ScreeningConversationSummary {
  narrative: string | null;
  sections?: Record<string, string> | null;
  source?: string;
}

export interface PhrasedScreeningQuestion extends ScreeningQuestion {
  phrased?: BilingualText;
  rule?: string | null;
}

export interface ScreeningSession {
  status: "draft" | "completed";
  visit: { first_visit: boolean; number: number; previous_number?: number | null };
  greeting: BilingualText;
  next_question: PhrasedScreeningQuestion | null;
  answered_questions: string[];
  total_questions: number;
  answered_count: number;
  previous_visit: { number: number; completed_at: string | null; summary: string | null } | null;
  summary: ScreeningConversationSummary | null;
  facts?: ScreeningFact[];
  plan?: Array<{ type: string; rule?: string | null; question_id: string; question_text: string; created_at?: string }>;
}

export interface ConversationAnswered {
  question_id: string;
  question_text: string;
  answer_type: AnswerType;
  value: string | number | string[] | null;
  value_original: string | number | string[] | null;
  translated: boolean;
  language?: string | null;
}

export interface ConversationTurn {
  status?: string;
  visit?: { first_visit: boolean; number: number };
  total_questions?: number;
  answered_count?: number;
  answered?: ConversationAnswered | null;
  clarification?: BilingualText | null;
  next_question?: PhrasedScreeningQuestion | null;
  done?: boolean;
  completion?: BilingualText | null;
}

export interface ScreeningMessageResponse {
  turn: ConversationTurn;
  summary: ScreeningConversationSummary | null;
}

export interface PlatformHospital {
  _id?: string;
  id?: string;
  code: string;
  name: string;
  hospital_type?: string | null;
  registration_number?: string | null;
  administrator_name?: string | null;
  official_email?: string | null;
  phone?: string | null;
  location?: Record<string, string | number | null> | null;
  icu_total_beds?: number;
  general_total_beds?: number;
  active_doctors?: number;
  user_id?: string | null;
  created_at?: string;
}

export interface CaseSheet {
  _id?: string;
  consultation_id?: string;
  patient_id?: string;
  doctor_id?: string;
  symptoms: string[];
  previous_diseases_mentioned: string[];
  allergies: string[];
  diagnosis: string | null;
  doctors_advice: string[];
  medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  created_by_ai?: boolean;
  reviewed_by_doctor?: boolean;
  reviewed_at?: string;
}

export interface MedicationRecord {
  id: string;
  name: string;
  dosage: string;
  duration?: string;
  active: boolean;
  start_date: string;
  prescribed_by?: string;
}

export interface TimelineEvent {
  id: string;
  eventType: "CONSULTATION" | "REPORT" | "MEDICATION_REGIMEN" | "EMERGENCY_ACCESS";
  timestamp: string;
  title: string;
  doctor_name?: string;
  status?: string;
  transcript?: string;
  audio_duration?: number;
  case_sheet?: CaseSheet;
  report_type?: string;
  summary?: string;
  file_url?: string;
  flagged_findings?: string[];
  uploaded_by_name?: string;
  medications?: MedicationRecord[];
}

export interface EmergencyDataset {
  emergency_access_granted: boolean;
  audit_log_id: string;
  timestamp: string;
  patient: {
    id: string;
    abha_id: string;
    custom_id: string;
    full_name: string;
    dob: string | null;
    sex: string | null;
    blood_type: string;
    emergency_contact: {
      name: string;
      phone: string;
      relation: string;
    };
    critical_allergies: string[];
    chronic_conditions: string[];
    active_medications: Array<{
      name: string;
      dosage: string;
      duration: string;
    }>;
  };
}

export interface CaseSheetExtractionResult {
  symptoms: string[];
  previous_diseases_mentioned: string[];
  allergies: string[];
  diagnosis: string | null;
  doctors_advice: string[];
  medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  extracted_from?: string;
}

export type MedicalReportType =
  | "Blood" | "Urine" | "ECG" | "X-Ray" | "MRI" | "CT" | "Pathology"
  | "Prescription" | "Imaging" | "Discharge" | "General" | "Other";

export const MEDICAL_REPORT_TYPES: MedicalReportType[] = [
  "Blood", "Urine", "ECG", "X-Ray", "MRI", "CT", "Pathology",
  "Prescription", "Imaging", "Discharge", "General", "Other",
];

export interface AiFinding {
  name: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string;
}

export interface MedicalReport {
  id: string;
  patient_id: string;
  type: MedicalReportType;
  title: string;
  file_url: string | null;
  file_mimetype: string | null;
  date: string;
  created_at: string;
  uploaded_by: { id: string; full_name: string | null; role: string | null } | null;
  summary: string | null;
  extracted_points: string[];
  extraction_source: string | null;
  flagged_findings: string[];
  ai_status: "pending" | "processing" | "completed" | "failed" | "skipped";
  ai_classified_type: string | null;
  ai_summary: string | null;
  ai_findings: AiFinding[];
  ai_extracted_at: string | null;
  ai_error: string | null;
  disclaimer?: string;
}

export interface MedicalDocumentPatient {
  id: string;
  custom_id: string;
  abha_id?: string | null;
  full_name: string;
  dob: string | null;
  sex: string | null;
  blood_type: string | null;
  contact_phone?: string | null;
  known_allergies?: string[];
  chronic_conditions?: string[];
}

export interface MedicalDocumentOverview {
  patient: MedicalDocumentPatient;
  appointments: Array<{
    _id: string;
    scheduled_for: string;
    department: string;
    status: string;
    reason: string | null;
    doctor: { id: string; full_name: string } | null;
  }>;
  reports: MedicalReport[];
  ai_version: string;
}

export interface JourneyTrendReading {
  value: number;
  date: string;
  report_id: string;
}

export interface JourneyParameter {
  key: string;
  name: string;
  unit: string | null;
  flagged: boolean;
  trend: "up" | "down" | "stable";
  first_value: number;
  last_value: number;
  first_date: string;
  last_date: string;
  overall_change_pct: number | null;
  overall_change_label: string | null;
  readings: JourneyTrendReading[];
}

export interface JourneyTimelineItem {
  report_id: string;
  title: string;
  type: string;
  date: string;
}

export interface JourneyChangedParameter {
  key: string;
  name: string;
  change_pct: number | null;
  direction: "up" | "down" | "new";
  label: string;
}

export interface PatientHealthJourney {
  patient: {
    id: string;
    custom_id: string;
    full_name: string;
    dob: string | null;
    sex: string | null;
    blood_type: string | null;
    age: number | null;
  };
  journey: {
    stats: {
      reports: number;
      visits: number;
      first_report_date: string | null;
      last_report_date: string | null;
      tracked_parameters: number;
    };
    parameters: JourneyParameter[];
    timeline: JourneyTimelineItem[];
    summary: string | null;
    summary_error: string | null;
    generated_at: string | null;
    source_reports: string[];
  } | null;
  changed: {
    since_date: string | null;
    reports_added: Array<{ report_id: string; title: string; type: string; date: string }>;
    parameters: JourneyChangedParameter[];
  };
}

